// @ts-nocheck
/**
 * Course and Lesson Routes
 * 
 * This module contains all course and lesson related routes:
 * - /api/courses/* routes
 * - /api/lessons/* routes
 * - /api/course-assignments/* routes
 * - /api/course-progress/* routes
 * - /api/my-assigned-courses route
 */

import { Router, Request, Response } from 'express';
import type { Express } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq, and, or, sql, inArray, desc, asc, isNull } from 'drizzle-orm';
import { createHash, randomUUID } from 'crypto';
import { Readable } from 'stream';

import { db } from '../db';
import * as schema from '@shared/schema';
import { 
  lessons, 
  lessonScopeAssignments, 
  unitSubjects, 
  lessonQuizLinks,
  quizCollectionAssignments,
  quizCollections,
  lessonSlides,
  lessonPresentationVersions,
  quizCards,
  lessonContentVersions,
  courses,
  courseProgress,
  coursePurchases,
  courseAssignments,
  userCourseEnrollments,
  lessonProgress,
  quizGameResults,
  certificates,
  userCourseLessonProgress,
  courseReviews,
  quizGameProgress,
  userQuizProgress,
  gameResults,
  creditTransactions,
  creditUsageLogs,
  gammaCreditLedger,
  lessonAccessLogs,
  courseLessons,
  courseFrameworks,
  supportedLanguages,
  platformPricing,
  lessonTranslationJobs,
  lessonVersions,
  interOrgCourseAssignmentRules,
  lessonFeedbackRuns,
  lessonFeedbackItems,
} from '@shared/schema';
import {
  unlinkLessonParamsSchema,
  relinkLessonParamsSchema,
  relinkLessonBodySchema,
  relinkableLessonsParamsSchema,
  insertCourseAssignmentSchema,
} from '@shared/schema';
import {
  parseGammaSlidesRaw,
  type LearningAssetContract,
  LEARNING_ASSET_CONTRACT_VERSION,
} from '@shared/contentParsers';
import { resolveViewerSourceLessonMaterial } from '../services/sourceLessonViewerMaterialService';

import {
  storage,
  ADMIN_ROLES,
  INSTRUCTOR_ROLES,
  ALL_STAFF_ROLES,
  withSessionAuthMiddleware,
  getEffectiveOrganizationId,
  isTeacherOrAdmin,
  isAdmin,
  resolveEffectiveOrganization,
  type RequestWithEffectiveOrg,
  enforceOrgIsolation,
} from './sharedResources';

import { sendError, ErrorCode } from '../utils/errorResponses';
import { isFeatureEnabled, isOnPremMode } from '../featureFlags';

import { LessonService } from '../services/lessonService';
import { LessonDigestService } from '../services/lessonDigestService';
import {
  LessonStepGuideService,
  StepGuideVersionNotFoundError,
  summarizeStepGuideArtifacts,
} from '../services/lessonStepGuideService';
import { CourseService } from '../services/courseService';
import { CourseLessonService } from '../services/courseLessonService';
import { ShowcaseCourseService } from '../services/showcaseCourseService';
import { CourseAssignmentService } from '../services/courseAssignmentService';
import { CourseCompletionService } from '../services/courseCompletionService';
import { CertificateService } from '../services/certificateService';
import { LessonProgressService } from '../services/lessonProgressService';
import { LessonVersioningService } from '../services/lessonVersioningService';
import { JobQueueService } from '../services/jobQueueService';
import { PptxHtmlConverterService } from '../services/pptxHtmlConverterService';
import { DocumentExtractorService } from '../services/documentExtractor';
import { ContentCoachService } from '../services/contentCoachService';
import { lessonOrchestrationService } from '../services/lessonOrchestrationService';
import { CreditService } from '../services/creditService';
import { HybridCreditService } from '../services/hybridCreditService';
import { lessonGenerationPricingService } from '../services/lessonGenerationPricingService';
import { ObjectStorageService } from '../objectStorage';
import { PurchaseService } from '../services/purchaseService';
import { ReviewService } from '../services/reviewService';
import { healthReportPricingService } from '../services/healthReportPricingService';
import { CourseContextService } from '../services/courseContextService';
import { CourseVersioningService } from '../services/courseVersioningService';
import { AIService, validateAgainstSource } from '../ai/aiService';
import { markQuizzesAsOutdated } from './quizRoutes';
import { getUploadDir } from '../utils/uploadPaths';
import { resolveStoragePath } from '../utils/uploadPaths';
import { compressPPTX } from '../utils/pptxCompressor';
import { CourseTranslationOrchestrator } from '../services/courseTranslationOrchestrator';
import { ContentLanguageService } from '../services/contentLanguageService';
import { sanitizeTranslationWizardState } from '../services/translationWizardStateService';
import { buildTranslationRunState, selectPreferredTranslationJobForPolling } from '../services/translationRunStateService';
import { PptxTextTranslationService } from '../services/pptxTextTranslationService';
import { LessonPodcastService } from '../services/lessonPodcastService';
import { resolvePodcastScriptDownloadSelection, summarizePodcastArtifacts } from '../services/languageArtifactService';
import { AITranslationService } from '../services/aiTranslationService';
import { TranslationAnalyticsService } from '../services/translationAnalyticsService';
import { TranslationIndexService } from '../services/translationIndexService';
import { courseFrameworkAIService, normalizeBloomLevel, type BloomsLevel } from '../services/courseFrameworkAIService';
import { resolveRequestedLanguageCodeFromQuery } from '../services/languageAccessPolicy';
import { CourseTransferService } from '../services/courseTransferService';
import {
  buildSourceContract,
  getLessonSourceOptions,
  resolveLessonSourceSelection,
  type LessonSourceSelection,
} from '../services/lessonSourceContractService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const contentCoachService = new ContentCoachService();
const aiTranslationService = new AITranslationService();

type RelevanceCategory = "on_topic" | "possibly_off_topic" | "off_topic";
type RelevanceDecision = "pending" | "accepted" | "rejected" | "ignored" | "applied" | "stale";

type RelevanceAuditCandidate = {
  id?: string;
  title: string;
  reason: string;
  excerpt: string;
  category: RelevanceCategory;
  confidence: number;
  suggestedAction?: string | null;
  replacementText?: string | null;
  spanStart?: number | null;
  spanEnd?: number | null;
  defaultSelected?: boolean;
  itemHash?: string;
};

const FEEDBACK_DEFAULT_SELECT_CONFIDENCE = 0.82;

async function resolveSignedSourceAssetsForLesson(lesson: any, expiresInSeconds = 900): Promise<any[]> {
  const lessonSourceAssetRefs = Array.isArray(lesson?.metadata?.sourceAssets)
    ? lesson.metadata.sourceAssets
    : [];
  if (lessonSourceAssetRefs.length === 0) return [];

  const assetIds = Array.from(new Set(
    lessonSourceAssetRefs
      .map((asset: any) => String(asset?.assetId || "").trim())
      .filter(Boolean)
  ));
  if (assetIds.length === 0) return [];

  const objectStorageService = new ObjectStorageService();
  const assetRows = await db.query.courseSourceAssets.findMany({
    where: inArray(schema.courseSourceAssets.id, assetIds),
  });
  const refById = new Map(lessonSourceAssetRefs.map((ref: any) => [String(ref.assetId), ref]));

  return Promise.all(assetRows.map(async (asset: any) => {
    const ref = refById.get(String(asset.id)) || {};
    let signedUrl: string | null = null;
    try {
      signedUrl = await objectStorageService.getCourseSourceAssetSignedURL(asset.storageKey, expiresInSeconds);
    } catch (assetError) {
      console.warn(`[Routes] Failed to sign source asset ${asset.id}:`, assetError);
    }
    return {
      id: asset.id,
      assetId: asset.id,
      recommendedUse: ref.recommendedUse || "reference",
      caption: ref.caption || asset.caption,
      altText: ref.altText || asset.altText,
      pageOrSlide: ref.pageOrSlide || asset.pageOrSlide,
      assetType: asset.assetType,
      mimeType: asset.mimeType,
      signedUrl,
      containsEmbeddedText: asset.containsEmbeddedText || false,
    };
  }));
}

const normalizeFeedbackVersionRef = (raw: string, lessonId: string) => {
  const value = String(raw || "").trim();
  if (!value || value === "current" || value.startsWith("current-")) return `current:${lessonId}`;
  if (value === "initial" || value.startsWith("initial-")) return `initial:${lessonId}`;
  return `version:${value}`;
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const syncLessonSourceContentToFrameworkTopics = async (input: {
  lessonId: string;
  lessonTitle?: string | null;
  sourceContent: string;
  userUploadedContent?: boolean;
  reason: string;
}) => {
  const lessonId = String(input.lessonId || "").trim();
  if (!lessonId) return;

  const nextSourceContent = String(input.sourceContent ?? "");
  const normalizedLessonTitle = String(input.lessonTitle || "").toLowerCase().trim();
  const strictTopicMatch = isFeatureEnabled("CF_V2_ASSIGNMENT_ENFORCED");
  const topicRolesWithoutFallback = new Set(["overview", "key_takeaways", "key-takeaways", "keytakeaways"]);

  try {
    const links = await db
      .select({ courseId: courseLessons.courseId })
      .from(courseLessons)
      .where(eq(courseLessons.lessonId, lessonId));

    const uniqueCourseIds = Array.from(new Set(links.map((link) => String(link.courseId || "").trim()).filter(Boolean)));
    if (!uniqueCourseIds.length) return;

    const frameworks = await db
      .select({ id: courseFrameworks.id, topics: courseFrameworks.topics, courseId: courseFrameworks.courseId })
      .from(courseFrameworks)
      .where(inArray(courseFrameworks.courseId, uniqueCourseIds));

    for (const framework of frameworks) {
      const topics = Array.isArray(framework.topics) ? (framework.topics as any[]) : [];
      if (!topics.length) continue;

      let touchedCount = 0;
      const updatedTopics = topics.map((topic: any) => {
        if (!topic || typeof topic !== "object") return topic;

        const topicLessonId = String(topic.lessonId || "").trim();
        const topicRole = String(topic.role || "").toLowerCase().trim();
        const topicLabel = String(topic.name || topic.title || "").toLowerCase().trim();

        const matchedByLessonId = topicLessonId === lessonId;
        const allowTitleFallback = !strictTopicMatch && !topicRolesWithoutFallback.has(topicRole);
        const matchedByTitle = allowTitleFallback && !!normalizedLessonTitle && !!topicLabel && (
          normalizedLessonTitle === topicLabel ||
          normalizedLessonTitle.includes(topicLabel) ||
          topicLabel.includes(normalizedLessonTitle)
        );
        const shouldSync = matchedByLessonId || matchedByTitle;
        if (!shouldSync) return topic;

        const nextTopic = {
          ...topic,
          lessonId,
          sourceContent: nextSourceContent,
        };

        if (typeof input.userUploadedContent === "boolean") {
          nextTopic.userUploadedContent = input.userUploadedContent;
        }

        const sourceChanged = String(topic.sourceContent || "") !== nextSourceContent;
        const lessonBindingChanged = topicLessonId !== lessonId;
        const uploadFlagChanged = typeof input.userUploadedContent === "boolean"
          ? topic.userUploadedContent !== input.userUploadedContent
          : false;
        if (sourceChanged || lessonBindingChanged || uploadFlagChanged) {
          touchedCount += 1;
          console.log(
            `[Routes] Synced lesson source content to framework topic ` +
            `(reason=${input.reason}, framework=${framework.id}, topic=${topic.name || topic.title || "unnamed"}, ` +
            `matchedBy=${matchedByLessonId ? "lessonId" : "title"}, words=${nextSourceContent.split(/\s+/).filter(Boolean).length})`
          );
          return nextTopic;
        }

        return topic;
      });

      if (touchedCount > 0) {
        await db.update(courseFrameworks)
          .set({ topics: updatedTopics as any })
          .where(eq(courseFrameworks.id, framework.id));
        console.log(`[Routes] Updated framework ${framework.id} with synced source content for lesson ${lessonId} (${touchedCount} topics touched)`);
      }
    }
  } catch (error) {
    console.warn(`[Routes] Failed to sync lesson source content to framework topics (reason=${input.reason}, lesson=${lessonId})`, error);
  }
};

const normalizeRelevanceCategory = (value: any): RelevanceCategory => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "off_topic" || normalized === "off-topic") return "off_topic";
  if (normalized === "on_topic" || normalized === "on-topic") return "on_topic";
  return "possibly_off_topic";
};

const clampConfidence = (value: any) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0, Math.min(1, numeric));
};

const resolveVersionContentForFeedback = async (
  lessonId: string,
  selectedVersionIdRaw: string,
  lessonInputText: string
) => {
  const selectedVersionId = String(selectedVersionIdRaw || "").trim();
  const normalizedRef = normalizeFeedbackVersionRef(selectedVersionId, lessonId);
  const versionsAsc = await db
    .select({
      id: lessonContentVersions.id,
      versionNumber: lessonContentVersions.versionNumber,
      previousContent: lessonContentVersions.previousContent,
      newContent: lessonContentVersions.newContent,
      createdAt: lessonContentVersions.createdAt,
    })
    .from(lessonContentVersions)
    .where(eq(lessonContentVersions.lessonId, lessonId))
    .orderBy(asc(lessonContentVersions.createdAt), asc(lessonContentVersions.versionNumber));

  if (normalizedRef.startsWith("current:")) {
    return {
      contentVersionRef: normalizedRef,
      resolvedText: String(lessonInputText || ""),
      versionCreatedAt: null as Date | null,
    };
  }

  if (normalizedRef.startsWith("initial:")) {
    const first = versionsAsc[0];
    const initialText = first
      ? String(first.previousContent || "").trim() || String(first.newContent || "").trim() || String(lessonInputText || "")
      : String(lessonInputText || "");
    return {
      contentVersionRef: normalizedRef,
      resolvedText: initialText,
      versionCreatedAt: first?.createdAt || null,
    };
  }

  const versionId = normalizedRef.replace(/^version:/, "");
  const target = versionsAsc.find((version) => String(version.id) === versionId);
  if (!target) return null;
  return {
    contentVersionRef: normalizedRef,
    resolvedText: String(target.newContent || ""),
    versionCreatedAt: target.createdAt || null,
  };
};

const generateHeuristicRelevanceCandidates = (content: string): RelevanceAuditCandidate[] => {
  const lines = String(content || "").split("\n").map((line) => line.trim()).filter(Boolean);
  const candidates: RelevanceAuditCandidate[] = [];
  const patterns: Array<{ regex: RegExp; title: string; reason: string; category: RelevanceCategory; confidence: number }> = [
    {
      regex: /about this guide/i,
      title: "Document preface detected",
      reason: "Preface text often belongs to document metadata, not lesson outcomes.",
      category: "possibly_off_topic",
      confidence: 0.7,
    },
    {
      regex: /documentation conventions?/i,
      title: "Documentation conventions section detected",
      reason: "Documentation convention blocks are usually not instructional lesson content.",
      category: "off_topic",
      confidence: 0.88,
    },
    {
      regex: /beta eula|license agreement/i,
      title: "License/EULA reference detected",
      reason: "Legal/licensing boilerplate is usually not pertinent to lesson objectives.",
      category: "off_topic",
      confidence: 0.9,
    },
    {
      regex: /note:\s*note notice|tip:\s*tip notice/i,
      title: "Template boilerplate detected",
      reason: "Template note/tip placeholders can reduce relevance and clarity.",
      category: "off_topic",
      confidence: 0.84,
    },
  ];

  for (const line of lines.slice(0, 80)) {
    for (const pattern of patterns) {
      if (!pattern.regex.test(line)) continue;
      const spanStart = content.indexOf(line);
      const spanEnd = spanStart >= 0 ? spanStart + line.length : null;
      candidates.push({
        title: pattern.title,
        reason: pattern.reason,
        excerpt: line,
        category: pattern.category,
        confidence: pattern.confidence,
        suggestedAction: "remove",
        replacementText: "",
        spanStart,
        spanEnd,
        defaultSelected: pattern.category === "off_topic" && pattern.confidence >= FEEDBACK_DEFAULT_SELECT_CONFIDENCE,
      });
    }
  }

  return candidates;
};

const generateAIRelevanceCandidates = async (
  lessonTitle: string,
  content: string
): Promise<RelevanceAuditCandidate[]> => {
  const aiResult = await AIService.getActiveConfigWithError("text");
  if (!aiResult.success || !aiResult.service) return [];

  try {
    const { GoogleGenAI } = await import("@google/genai");
    const genAI = new GoogleGenAI({ apiKey: (aiResult.service as any).apiKey });
    const prompt = `You are an instructional quality auditor for lesson source content.
Return STRICT JSON only (no markdown).
Identify text spans that are likely not pertinent to the lesson title.

Lesson title:
${lessonTitle}

Content:
${content}

Rules:
- Return at most 12 candidates.
- Prefer precision over recall.
- For each candidate return:
  title, reason, excerpt, category(on_topic|possibly_off_topic|off_topic), confidence(0-1), suggestedAction(remove|rewrite|keep), replacementText(optional).
- Use exact excerpt text copied from content.
- Never invent excerpt text.
`;

    const response = await genAI.models.generateContent({
      model: (aiResult.service as any).modelName || "gemini-2.0-flash",
      contents: prompt,
    });
    const raw = String(response.text || "").trim();
    if (!raw) return [];
    const jsonStart = raw.indexOf("[");
    const jsonEnd = raw.lastIndexOf("]");
    if (jsonStart < 0 || jsonEnd <= jsonStart) return [];
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: any) => {
        const excerpt = String(item?.excerpt || "").trim();
        if (!excerpt) return null;
        const spanStart = content.indexOf(excerpt);
        const spanEnd = spanStart >= 0 ? spanStart + excerpt.length : null;
        const category = normalizeRelevanceCategory(item?.category);
        const confidence = clampConfidence(item?.confidence);
        return {
          title: String(item?.title || "Relevance candidate").trim() || "Relevance candidate",
          reason: String(item?.reason || "").trim(),
          excerpt,
          category,
          confidence,
          suggestedAction: String(item?.suggestedAction || "remove").trim().toLowerCase(),
          replacementText: item?.replacementText ? String(item.replacementText) : "",
          spanStart,
          spanEnd,
          defaultSelected: category === "off_topic" && confidence >= FEEDBACK_DEFAULT_SELECT_CONFIDENCE,
        } as RelevanceAuditCandidate;
      })
      .filter((item): item is RelevanceAuditCandidate => !!item)
      .slice(0, 12);
  } catch (error) {
    console.warn("[SourceFeedback] AI relevance audit fallback to heuristics:", error);
    return [];
  }
};

const MIN_SYNTHESIS_SOURCE_CHARS = 300;

type CourseSynthesisSource = {
  lessonId: string;
  title: string;
  topicOrder: number;
  description: string | null;
  content: string;
  sourceContract: ReturnType<typeof buildSourceContract>;
};

function normalizeSynthesisText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractSynthesisTokens(value: string): string[] {
  const stop = new Set([
    "about", "according", "across", "after", "among", "based", "below", "content", "course", "each",
    "from", "given", "lesson", "lessons", "overview", "summary", "takeaway", "takeaways", "that", "their",
    "there", "these", "this", "using", "which", "with", "without", "would", "your", "key", "concepts",
    "essential", "terms", "practical", "applications", "connections", "title", "description",
  ]);
  return Array.from(
    new Set(
      normalizeSynthesisText(value)
        .split(" ")
        .map((token) => token.trim())
        .filter((token) => token.length >= 5 && !stop.has(token))
    )
  );
}

function validateSynthesisGrounding(outputText: string, sourceCorpus: string): {
  isValid: boolean;
  reason: string;
  phraseConfidence: number;
  lexicalCoverage: number;
  missingTokens: string[];
} {
  const phraseValidation = validateAgainstSource(outputText, sourceCorpus);
  const outputTokens = extractSynthesisTokens(outputText);
  const sourceTokens = new Set(extractSynthesisTokens(sourceCorpus));
  const missingTokens = outputTokens.filter((token) => !sourceTokens.has(token));
  const lexicalCoverage = outputTokens.length === 0
    ? 1
    : (outputTokens.length - missingTokens.length) / outputTokens.length;
  const wordCount = outputText.split(/\s+/).filter(Boolean).length;
  const minPhrase = wordCount < 250 ? 0.5 : 0.42;
  const minLexical = wordCount < 250 ? 0.55 : 0.48;
  const isValid = phraseValidation.confidenceScore >= minPhrase && lexicalCoverage >= minLexical;

  return {
    isValid,
    reason: isValid
      ? "Grounding validation passed."
      : `Grounding validation failed (phraseConfidence=${phraseValidation.confidenceScore}, lexicalCoverage=${Number(lexicalCoverage.toFixed(2))})`,
    phraseConfidence: phraseValidation.confidenceScore,
    lexicalCoverage: Number(lexicalCoverage.toFixed(2)),
    missingTokens: missingTokens.slice(0, 12),
  };
}

function validateSynthesisStructure(
  outputText: string,
  expectedLessonCount: number,
  mode: "takeaways" | "overview"
): {
  isValid: boolean;
  reason: string;
  referencedLessonNumbers: number[];
  wordCount: number;
} {
  const wordCount = outputText.split(/\s+/).filter(Boolean).length;
  const matches = Array.from(outputText.matchAll(/\blesson\s+(\d+)\b/gi));
  const referencedLessonNumbers = Array.from(
    new Set(
      matches
        .map((match) => Number(match[1]))
        .filter((num) => Number.isFinite(num) && num > 0)
    )
  ).sort((a, b) => a - b);

  if (expectedLessonCount <= 0) {
    return {
      isValid: false,
      reason: "No content lessons were supplied for synthesis.",
      referencedLessonNumbers,
      wordCount,
    };
  }

  const minimumWords = mode === "takeaways" ? 220 : 140;
  if (wordCount < minimumWords) {
    return {
      isValid: false,
      reason: `Output is too short (${wordCount} words). Minimum required is ${minimumWords} words for ${mode}.`,
      referencedLessonNumbers,
      wordCount,
    };
  }

  const invalidNumbers = referencedLessonNumbers.filter((num) => num > expectedLessonCount);
  if (invalidNumbers.length > 0) {
    return {
      isValid: false,
      reason: `Output references non-existent lesson numbers (${invalidNumbers.join(", ")}), but only ${expectedLessonCount} content lesson(s) were provided.`,
      referencedLessonNumbers,
      wordCount,
    };
  }

  const expectedLessonNumbers = Array.from({ length: expectedLessonCount }, (_, idx) => idx + 1);
  const missingLessonNumbers = expectedLessonNumbers.filter((num) => !referencedLessonNumbers.includes(num));
  if (missingLessonNumbers.length > 0) {
    return {
      isValid: false,
      reason: `Output must cover every content lesson. Missing lesson references: ${missingLessonNumbers.join(", ")}.`,
      referencedLessonNumbers,
      wordCount,
    };
  }

  if (mode === "takeaways") {
    const normalized = outputText.toLowerCase();
    const requiredMarkers = ["key concepts", "essential terms", "practical applications", "connections across lessons"];
    const missingMarkers = requiredMarkers.filter((marker) => !normalized.includes(marker));
    if (missingMarkers.length > 0) {
      return {
        isValid: false,
        reason: `Output is missing required takeaways sections: ${missingMarkers.join(", ")}.`,
        referencedLessonNumbers,
        wordCount,
      };
    }
  }

  return {
    isValid: true,
    reason: "Structure validation passed.",
    referencedLessonNumbers,
    wordCount,
  };
}

function buildCourseSynthesisPrompt(params: {
  mode: "takeaways" | "overview";
  courseTitle: string;
  courseDescription: string | null;
  lessonSources: CourseSynthesisSource[];
  keyTakeawaysContent?: { title: string; description: string | null; content: string } | null;
  retryDirective?: string | null;
}) {
  const lessonCount = params.lessonSources.length;
  const lessonBlock = params.lessonSources
    .map((lesson, idx) => {
      const clipped = lesson.content.length > 12000 ? `${lesson.content.slice(0, 12000)}\n[TRUNCATED FOR PROMPT SIZE]` : lesson.content;
      return [
        `Lesson ${idx + 1}: ${lesson.title}`,
        `Description: ${lesson.description || "N/A"}`,
        `Source Used: ${lesson.sourceContract.label}`,
        `Source Timestamp: ${lesson.sourceContract.createdAt || "N/A"}`,
        `Content:`,
        clipped || "N/A",
      ].join("\n");
    })
    .join("\n---\n");

  const retryInstruction = params.retryDirective
    ? `\n\nSTRICT RETRY DIRECTIVE:\n${params.retryDirective}\nRegenerate with stricter adherence to the provided source content and lesson count.`
    : "";

  if (params.mode === "overview") {
    const keyTakeaways = params.keyTakeawaysContent
      ? [
          `Key Takeaways Lesson: ${params.keyTakeawaysContent.title}`,
          `Description: ${params.keyTakeawaysContent.description || "N/A"}`,
          `Content:`,
          params.keyTakeawaysContent.content,
        ].join("\n")
      : "Key Takeaways Lesson: N/A";

    return `You are creating a course overview based STRICTLY on the provided source content.

CRITICAL RULES:
- Use ONLY information explicitly stated in the provided lesson content.
- Never invent additional lessons, sections, frameworks, examples, or claims.
- This course has exactly ${lessonCount} content lesson(s). You must not reference Lesson numbers above ${lessonCount}.
- Every paragraph must be traceable to the provided lesson content.
- If information is absent, omit it.

Course Title: ${params.courseTitle}
Course Description: ${params.courseDescription || "N/A"}
Number of Content Lessons: ${lessonCount}

Content Lessons:
${lessonBlock}

${keyTakeaways}

Output requirements:
1. Brief course purpose introduction (1-2 sentences).
2. Summarize each of the ${lessonCount} content lessons (2-3 sentences each).
3. Summarize learner journey and expected outcomes.

Write plain text only (no markdown), target 400-800 words.${retryInstruction}`;
  }

  return `You are creating a Key Takeaways summary based STRICTLY on the provided source content.

CRITICAL RULES:
- Use ONLY information explicitly stated in the provided lesson content.
- Never invent additional lessons, sections, frameworks, examples, or claims.
- This course has exactly ${lessonCount} content lesson(s). You must not reference Lesson numbers above ${lessonCount}.
- Every takeaway must be traceable to the provided lesson content.
- If information is absent, omit it.

Course Title: ${params.courseTitle}
Course Description: ${params.courseDescription || "N/A"}
Number of Content Lessons: ${lessonCount}

Content Lessons:
${lessonBlock}

Output requirements:
1. Key Concepts by lesson (only what is explicitly present).
2. Essential Terms (only terms clearly defined in lesson content).
3. Practical Applications (only examples explicitly stated).
4. Connections Across Lessons (only explicit overlaps).

Write plain text only (no markdown), target 600-1200 words.${retryInstruction}`;
}

async function resolveCourseSynthesisSources(params: {
  organizationId: string;
  lessonLinks: Array<{ lessonId: string; topicOrder: number }>;
  lessonRecords: Array<{ id: string; title: string; description: string | null; inputText: string | null }>;
  userId: string;
}) {
  const lessonRecordById = new Map(params.lessonRecords.map((lesson) => [lesson.id, lesson]));
  const sources: CourseSynthesisSource[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const link of params.lessonLinks) {
    const lesson = lessonRecordById.get(link.lessonId);
    if (!lesson) {
      errors.push(`Lesson ${link.lessonId} could not be loaded.`);
      continue;
    }

    let resolved: any = null;
    let contentText = "";
    try {
      const sourceOptions = await getLessonSourceOptions({
        lessonId: lesson.id,
        organizationId: params.organizationId,
        includeManualTopic: false,
      });
      const selection = sourceOptions.defaultSelection || { sourceType: "sourcedb", versionRef: "current" };
      resolved = await resolveLessonSourceSelection({
        lessonId: lesson.id,
        organizationId: params.organizationId,
        selection,
        allowManualTopic: false,
      });
      contentText = String(resolved.content || "").trim();
    } catch (error: any) {
      warnings.push(`Source resolution fallback used for "${lesson.title}": ${error?.message || "unknown error"}`);
      contentText = String(lesson.inputText || "").trim();
      if (contentText) {
        resolved = {
          sourceType: "sourcedb",
          versionRef: "current",
          label: "Source DB - Current Version (Fallback)",
          languageCode: "en",
          createdAt: null,
          warning: "Fallback to lesson inputText due to source resolution failure.",
        };
      }
    }

    if (!contentText || contentText.length < MIN_SYNTHESIS_SOURCE_CHARS) {
      errors.push(
        `"${lesson.title}" has insufficient source content (${contentText.length} chars; minimum ${MIN_SYNTHESIS_SOURCE_CHARS}).`
      );
      continue;
    }

    const sourceContract = buildSourceContract({
      resolved: resolved,
      content: contentText,
      selectedAt: new Date().toISOString(),
      selectedBy: params.userId,
    });

    sources.push({
      lessonId: lesson.id,
      title: lesson.title || `Lesson ${link.topicOrder}`,
      topicOrder: link.topicOrder,
      description: lesson.description || null,
      content: contentText,
      sourceContract,
    });
  }

  return { sources, errors, warnings };
}

const router = Router();
const STEP_GUIDE_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

// Configure multer for memory storage (PPTX uploads)
// NOTE: 200MB limit is pre-compression - files >25MB will be compressed before storage
const pptxUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const originalName = (file.originalname || '').toLowerCase();
    if (file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
        originalName.endsWith('.pptx')) {
      cb(null, true);
    } else {
      cb(new Error('Only PPTX files are allowed'));
    }
  }
});

// Configure multer for document uploads (Word/PDF source material)
const documentUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'application/pdf'
    ];
    const originalName = (file.originalname || '').toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || 
        originalName.endsWith('.docx') ||
        originalName.endsWith('.doc') ||
        originalName.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only Word documents (.docx, .doc) and PDF files are allowed'));
    }
  }
});

// Configure multer for step-by-step guide uploads (Word/Markdown/Text)
const stepGuideUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: STEP_GUIDE_UPLOAD_MAX_BYTES,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
    ];
    const originalName = (file.originalname || '').toLowerCase();

    if (
      allowedTypes.includes(file.mimetype) ||
      originalName.endsWith('.docx') ||
      originalName.endsWith('.doc') ||
      originalName.endsWith('.md') ||
      originalName.endsWith('.markdown') ||
      originalName.endsWith('.txt')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only .docx, .doc, .md, .markdown, and .txt files are allowed'));
    }
  },
});

// Configure multer for video uploads (MP4 videos for lesson walkthroughs)
const videoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['video/mp4', 'video/mpeg'];
    const originalName = (file.originalname || '').toLowerCase();
    
    if (allowedTypes.includes(file.mimetype) || originalName.endsWith('.mp4')) {
      cb(null, true);
    } else {
      cb(new Error('Only MP4 video files are allowed'));
    }
  }
});

// Configure multer for podcast audio uploads (MP3 only to keep storage format consistent)
const podcastAudioUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3'];
    const originalName = (file.originalname || '').toLowerCase();
    if (
      allowedTypes.includes(file.mimetype) ||
      originalName.endsWith('.mp3')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only MP3 audio files are allowed'));
    }
  }
});

const COURSE_TRANSFER_UPLOAD_MAX_BYTES = undefined;

// Configure multer for course transfer package uploads (ZIP). Course transfer
// packages can exceed multiple GB because they may include all languages,
// versions, and binary artifacts, so disk/proxy capacity is the real boundary.
const courseTransferUpload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        const transferDir = path.join(os.tmpdir(), 'learnplay-course-transfer-uploads');
        await fs.promises.mkdir(transferDir, { recursive: true });
        cb(null, transferDir);
      } catch (error: any) {
        cb(error, '');
      }
    },
    filename: (_req, file, cb) => {
      const ext = String(path.extname(file.originalname || "") || ".zip").toLowerCase();
      const safeExt = ext === ".zip" ? ".zip" : ".zip";
      cb(null, `ct-${Date.now()}-${randomUUID()}${safeExt}`);
    },
  }),
  limits: {
    fileSize: COURSE_TRANSFER_UPLOAD_MAX_BYTES,
  },
  fileFilter: (_req, file, cb) => {
    const originalName = (file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();
    const isZipMime = mime === 'application/zip' || mime === 'application/x-zip-compressed';
    if (isZipMime || originalName.endsWith('.zip')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only .zip packages are allowed'));
  },
});

// Topic schema for 10-topic lesson structure
const topicSchema = z.object({
  position: z.number().min(1).max(10),
  title: z.string().trim().max(200),
  role: z.enum(["overview", "slide"])
});

// Validation schema for lesson creation
const createLessonRequestSchema = z.object({
  organizationId: z.string().min(1, "Organization ID is required"),
  title: z.string()
    .trim()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title must not exceed 200 characters"),
  description: z.string().trim().optional(),
  gradeLevel: z.string().optional(),
  department: z.string().optional(),
  subject: z.string().optional(),
  unit: z.string().optional(),
  generationMode: z.enum(["gemini-topics", "text-input", "document-upload"], {
    errorMap: () => ({ message: "Generation mode must be one of: gemini-topics, text-input, document-upload" })
  }),
  topics: z.array(topicSchema).max(10).optional(),
  mainTopic: z.string().optional(),
  subtopic1: z.string().optional(),
  subtopic2: z.string().optional(),
  inputText: z.string().optional(),
  themeId: z.string().optional(),
  generateImages: z.boolean().default(true),
  imageStyle: z.string().optional(),
  relatedQuizId: z.string().optional(),
}).superRefine((data, ctx) => {
  if (data.generationMode === "gemini-topics") {
    const hasTopicsArray = data.topics && data.topics.length > 0;
    const hasLegacyMainTopic = data.mainTopic?.trim();
    
    if (!hasTopicsArray && !hasLegacyMainTopic) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["topics"],
        message: "At least one topic is required for AI-generated lessons"
      });
    }
    
    if (hasTopicsArray) {
      const filledTopics = data.topics!.filter(t => t.title.trim().length > 0);
      if (filledTopics.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topics"],
          message: "At least 2 topics with titles are required for AI-generated lessons"
        });
      }
      
      const hasOverview = data.topics!.some(t => t.role === "overview" && t.title.trim().length > 0);
      if (!hasOverview) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["topics"],
          message: "An overview topic (position 1) with a title is required"
        });
      }
    }
  }
  
  if (data.generationMode === "text-input") {
    if (!data.inputText?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["inputText"],
        message: "Input text is required for text-based lessons"
      });
    } else {
      const allSlides = parseGammaSlidesRaw(data.inputText);
      
      if (allSlides.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputText"],
          message: "Content must have at least 2 slides separated by '---'"
        });
      } else if (!allSlides[0]?.title?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputText"],
          message: "The first slide (Overview) must have a title. Add a title to the section before the first '---' separator."
        });
      } else if (allSlides[0]?.keyPoints?.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputText"],
          message: "The first slide (Overview) must have at least 2 key point sentences below the title."
        });
      }
      
      const validSlides = allSlides.filter(s => s.title.length > 0);
      
      if (validSlides.length < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputText"],
          message: "At least 2 slides must have titles"
        });
      }
      
      if (validSlides.length > 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["inputText"],
          message: `Content has ${validSlides.length} slides with titles but maximum is 10`
        });
      }
      
      if (data.topics && data.topics.length > 0) {
        const nonEmptyTopics = data.topics.filter(t => t.title.trim().length > 0);
        
        const firstTopic = data.topics.find(t => t.position === 1);
        if (firstTopic && firstTopic.role !== "overview") {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["topics"],
            message: "The first topic (position 1) must have role 'overview'"
          });
        }
        
        if (nonEmptyTopics.length !== validSlides.length) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["topics"],
            message: `Topics count (${nonEmptyTopics.length}) doesn't match slide count (${validSlides.length})`
          });
        }
      }
    }
  }
});

// Zod schema for updating lesson progress
const updateProgressSchema = z.object({
  status: z.enum(["not_started", "in_progress", "completed"]).optional(),
  percentComplete: z.number().int().min(0).max(100).optional(),
  secondsSpent: z.number().int().min(0).optional(),
  lastCheckpoint: z.string().optional(),
});

// Zod schema for completing a lesson
const completeLessonSchema = z.object({
  secondsSpent: z.number().int().min(0).optional(),
});

// Helper function to check organization access for lessons
async function canAccessOrganization(userId: string, targetOrgId: string, session: any, resolvedEffectiveOrgId: string | null): Promise<boolean> {
  // In impersonation flows, effective organization can be valid even when
  // direct membership rows are not present for the acting admin account.
  if (resolvedEffectiveOrgId && targetOrgId === resolvedEffectiveOrgId) {
    return true;
  }

  if (session?.context) {
    const { effectiveRole, organizations, impersonatedOrganization } = session.context;
    
    if ((effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') && !impersonatedOrganization) {
      return true;
    }

    if ((effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') && impersonatedOrganization) {
      return impersonatedOrganization.orgId === targetOrgId;
    }
    
    return organizations.some((o: any) => o.orgId === targetOrgId);
  }
  
  const user = await storage.getUser(userId);
  if (user?.isSuperAdmin || user?.isCustSuper) {
    return true;
  }
  
  const roles = await storage.getUserRoles(userId);
  return roles.some(r => r.organizationId === targetOrgId);
}

async function isLessonLinkedToOrganizationCourses(lessonId: string, organizationId: string): Promise<boolean> {
  const linkedCourse = await db
    .select({ courseId: courseLessons.courseId })
    .from(courseLessons)
    .innerJoin(courses, eq(courseLessons.courseId, courses.id))
    .where(and(
      eq(courseLessons.lessonId, lessonId),
      eq(courses.organizationId, organizationId)
    ))
    .limit(1);

  return linkedCourse.length > 0;
}

// Helper function to load lesson for request
async function loadLessonForRequest(req: Request, res: Response, lessonId: string): Promise<any | null> {
  if (!req.session.userId) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  let hasTopAdminBypass = false;
  if (req.session.context) {
    const { effectiveRole, impersonatedOrganization } = req.session.context;
    hasTopAdminBypass = (effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') && !impersonatedOrganization;
  } else {
    const user = await storage.getUser(req.session.userId);
    hasTopAdminBypass = user?.isSuperAdmin || user?.isCustSuper || false;
  }

  // Fetch lesson first, then derive organizationId from it if not provided
  const [lesson] = await db
    .select()
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
    
  if (!lesson) {
    res.status(404).json({ error: "Lesson not found" });
    return null;
  }

  // Use provided organizationId or derive from lesson
  const organizationId = req.query.organizationId || req.body?.organizationId || lesson.organizationId;

  if (!hasTopAdminBypass && lesson.organizationId && organizationId !== lesson.organizationId) {
    const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    const resolvedEffectiveOrgId = effectiveResult?.organizationId || null;
    const hasAccess = await canAccessOrganization(req.session.userId, lesson.organizationId, req.session, resolvedEffectiveOrgId);
    if (!hasAccess) {
      if (resolvedEffectiveOrgId && resolvedEffectiveOrgId !== lesson.organizationId) {
        const linkedToEffectiveOrg = await isLessonLinkedToOrganizationCourses(lessonId, resolvedEffectiveOrgId);
        if (linkedToEffectiveOrg) {
          return lesson;
        }
      }
      const requestedOrgId = typeof organizationId === 'string' ? organizationId : null;
      if (requestedOrgId && requestedOrgId !== lesson.organizationId) {
        const hasRequestedOrgAccess = await canAccessOrganization(req.session.userId, requestedOrgId, req.session, resolvedEffectiveOrgId);
        if (hasRequestedOrgAccess) {
          const linkedIntoRequestedOrg = await isLessonLinkedToOrganizationCourses(lessonId, requestedOrgId);
          if (linkedIntoRequestedOrg) {
            return lesson;
          }
        }
      }

      // Check if lesson belongs to an open public course (showcase or active free public).
      const hasOpenPublicAccess = await ShowcaseCourseService.isOpenPublicLesson(lessonId);
      if (hasOpenPublicAccess) {
        // Open public lessons are accessible to all authenticated users.
        return lesson;
      }

      // Check if user has purchased a course containing this lesson
      const coursesWithLesson = await db.select({ courseId: courseLessons.courseId })
        .from(courseLessons)
        .where(eq(courseLessons.lessonId, lessonId));

      if (coursesWithLesson.length > 0) {
        const courseIds = coursesWithLesson.map(c => c.courseId);
        const [purchase] = await db.select()
          .from(coursePurchases)
          .where(and(
            eq(coursePurchases.userId, req.session.userId!),
            inArray(coursePurchases.courseId, courseIds),
            eq(coursePurchases.status, 'completed')
          ))
          .limit(1);
        
        if (purchase) {
          // User purchased a course with this lesson - grant access
          return lesson;
        }
      }

      res.status(403).json({ error: "Access denied: You do not have access to this lesson's organization" });
      return null;
    }
  }

  return lesson;
}

// Middleware: Require lesson organization access
async function requireLessonOrgAccess(req: Request, res: Response, next: any) {
  const lessonId = req.params.lessonId;
  if (!lessonId) {
    return res.status(400).json({ error: "Lesson ID required" });
  }

  const lesson = await loadLessonForRequest(req, res, lessonId);
  if (!lesson) {
    return;
  }

  (req as any).lesson = lesson;
  next();
}

// Middleware: Require lesson access AND admin/teacher role
async function requireLessonAdminAccess(req: Request, res: Response, next: any) {
  const lessonId = req.params.lessonId;
  if (!lessonId) {
    return res.status(400).json({ error: "Lesson ID required" });
  }

  const lesson = await loadLessonForRequest(req, res, lessonId);
  if (!lesson) {
    return;
  }

  const organizationId = lesson.organizationId;

  if (req.session.context) {
    const { effectiveRole, organizations } = req.session.context;
    
    if (effectiveRole === 'SuperAdmin' || effectiveRole === 'CustSuper') {
      (req as any).lesson = lesson;
      return next();
    }
    
    const org = organizations.find((o: any) => o.orgId === organizationId);
    
    if (org) {
      const hasPermission = org.roles.some((role: string) => ALL_STAFF_ROLES.includes(role));
      
      if (hasPermission) {
        (req as any).lesson = lesson;
        return next();
      }
    }
    
    return res.status(403).json({ 
      error: "Access denied", 
      message: "Only teachers and administrators can download or replace lesson files" 
    });
  }

  const user = req.session.userId ? await storage.getUser(req.session.userId) : null;
  
  if (user?.isSuperAdmin || user?.isCustSuper) {
    (req as any).lesson = lesson;
    return next();
  }
  
  const roles = await storage.getUserRoles(req.session.userId!, organizationId);
  const hasPermission = roles.some(role => ALL_STAFF_ROLES.includes(role.role));

  if (!hasPermission) {
    return res.status(403).json({ 
      error: "Access denied", 
      message: "Only teachers and administrators can download or replace lesson files" 
    });
  }

  (req as any).lesson = lesson;
  next();
}

function getOverviewLessonIds(courseLinks: Array<{ lessonId: string; topicOrder: number; lessonType?: string | null }>): Set<string> {
  if (!courseLinks.length) return new Set<string>();
  const explicitOverview = courseLinks
    .filter((l: any) => l.lessonType === "overview")
    .map((l: any) => l.lessonId);
  if (explicitOverview.length > 0) {
    return new Set(explicitOverview);
  }
  const minOrder = Math.min(...courseLinks.map((l: any) => l.topicOrder));
  return new Set(courseLinks.filter((l: any) => l.topicOrder === minOrder).map((l: any) => l.lessonId));
}

async function shouldIncludeDraftLanguageVariantsForUser(
  req: Request,
  organizationId?: string | null
): Promise<boolean> {
  const userId = req.session?.userId ? String(req.session.userId) : "";
  const orgId = String(organizationId || "").trim();
  if (!userId || !orgId) return false;

  const context = req.session?.context as any;
  if (context?.effectiveRole === "SuperAdmin") return true;
  if (Array.isArray(context?.organizations)) {
    const org = context.organizations.find((entry: any) => String(entry?.orgId || "") === orgId);
    if (org?.roles?.some((role: string) => ALL_STAFF_ROLES.includes(role))) {
      return true;
    }
  }

  const roles = await db
    .select({ role: schema.userOrganizationRoles.role })
    .from(schema.userOrganizationRoles)
    .where(and(
      eq(schema.userOrganizationRoles.userId, userId),
      eq(schema.userOrganizationRoles.organizationId, orgId),
    ));
  return roles.some((row) => ALL_STAFF_ROLES.includes(String(row.role || "")));
}

export async function canUserPlayLessonPodcast(
  req: Request,
  lessonId: string,
  options?: { allowPublicOverview?: boolean }
): Promise<{ allowed: boolean; reason?: string; isOverview?: boolean }> {
  const [lessonRow] = await db
    .select({ id: lessons.id, organizationId: lessons.organizationId, contentGroupId: lessons.contentGroupId })
    .from(lessons)
    .where(eq(lessons.id, lessonId))
    .limit(1);
  if (!lessonRow) return { allowed: false, reason: "Lesson not found" };

  const links = await db
    .select({
      courseId: courseLessons.courseId,
      lessonId: courseLessons.lessonId,
      topicOrder: courseLessons.topicOrder,
      lessonType: courseLessons.lessonType,
    })
    .from(courseLessons)
    .where(eq(courseLessons.lessonId, lessonId));

  const relatedCourseIds = Array.from(new Set(links.map((l) => l.courseId)));
  const overviewLessonIds = getOverviewLessonIds(links);
  const isOverview = overviewLessonIds.has(lessonId);
  const allowPublicOverview = options?.allowPublicOverview !== false;
  const userId = req.session?.userId || null;

  // Overview lesson podcasts are publicly playable unless caller opts out.
  if (isOverview) {
    if (!allowPublicOverview && !userId) {
      return { allowed: false, reason: "Authentication required for overview lesson podcast download.", isOverview: true };
    }
    return { allowed: true, isOverview: true };
  }

  // For non-overview lesson podcast playback, user must be authenticated and have access.
  if (!userId) {
    return { allowed: false, reason: "Authentication required for non-overview lesson podcast playback.", isOverview: false };
  }

  const staffRoles = await storage.getUserRoles(userId, lessonRow.organizationId);
  const isOrgStaff = staffRoles.some((role) => ALL_STAFF_ROLES.includes(role.role));
  if (isOrgStaff) {
    return { allowed: true, isOverview: false };
  }

  if (relatedCourseIds.length > 0) {
    const relatedCourseOrgs = await db
      .select({ organizationId: courses.organizationId })
      .from(courses)
      .where(inArray(courses.id, relatedCourseIds));
    const uniqueOrgIds = Array.from(new Set(relatedCourseOrgs.map((row) => row.organizationId).filter(Boolean)));
    for (const orgId of uniqueOrgIds) {
      const roles = await storage.getUserRoles(userId, orgId);
      if (roles.some((role) => ALL_STAFF_ROLES.includes(role.role))) {
        return { allowed: true, isOverview: false };
      }
    }
  }

  if (relatedCourseIds.length === 0 && lessonRow.contentGroupId) {
    const siblingLessons = await db
      .select({ lessonId: lessons.id })
      .from(lessons)
      .where(eq(lessons.contentGroupId, lessonRow.contentGroupId));
    const siblingLessonIds = siblingLessons.map((row) => row.lessonId).filter(Boolean);
    if (siblingLessonIds.length > 0) {
      const siblingCourseLinks = await db
        .select({ courseId: courseLessons.courseId })
        .from(courseLessons)
        .where(inArray(courseLessons.lessonId, siblingLessonIds));
      const siblingCourseIds = Array.from(new Set(siblingCourseLinks.map((row) => row.courseId)));
      relatedCourseIds.push(...siblingCourseIds);
    }
  }

  // Reuse centralized course visibility service.
  for (const courseId of relatedCourseIds) {
    const { CourseVisibilityService } = await import('../services/courseVisibilityService');
    const access = await CourseVisibilityService.checkCourseAccess(courseId, userId, req.session?.context || null);
    if (access.hasAccess) {
      return { allowed: true, isOverview: false };
    }
  }

  return { allowed: false, reason: "Enrollment or access is required for this lesson podcast.", isOverview: false };
}

// Middleware: Require organization access
async function requireOrgAccess(req: Request, res: Response, next: any) {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
  (req as RequestWithEffectiveOrg).effectiveOrganization = effectiveResult;
  
  const requestedOrgId = req.params.orgId || req.query.organizationId || req.body?.organizationId;
  
  if (req.session.context) {
    const { effectiveRole, organizations } = req.session.context;
    
    if (effectiveRole === 'SuperAdmin' && !effectiveResult.isImpersonation) {
      return next();
    }
    
    if (effectiveRole === 'SuperAdmin' && effectiveResult.isImpersonation) {
      if (!requestedOrgId) {
        return next();
      }
      if (requestedOrgId === effectiveResult.organizationId) {
        return next();
      }
    }
    
    if (organizations.some((o: any) => o.orgId === requestedOrgId || !requestedOrgId)) {
      return next();
    }
    
    return res.status(403).json({ error: "Access denied to this organization" });
  }
  
  const user = await storage.getUser(req.session.userId);
  if (user?.isSuperAdmin) {
    return next();
  }
  
  const userRoles = await storage.getUserRoles(req.session.userId);
  if (!requestedOrgId || userRoles.some(r => r.organizationId === requestedOrgId)) {
    return next();
  }
  
  return res.status(403).json({ error: "Access denied to this organization" });
}

// Helper function to sanitize filenames for Content-Disposition header
function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
}

function sanitizeFilenameSegment(value: string | null | undefined, fallback: string): string {
  const sanitized = sanitizeFilename(String(value || ''))
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
  return (sanitized || fallback).substring(0, 80);
}

function normalizeVersionToken(version: string | number | null | undefined, fallback: string = 'v1'): string {
  const raw = String(version ?? '').trim();
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
  if (!cleaned) return fallback;
  return /^v/i.test(cleaned) ? cleaned : `v${cleaned}`;
}

function buildLessonArtifactFilename(input: {
  courseTitle?: string | null;
  lessonTitle?: string | null;
  languageCode?: string | null;
  version?: string | number | null;
  extension: string;
}): string {
  const safeCourse = sanitizeFilenameSegment(input.courseTitle, 'course');
  const safeLesson = sanitizeFilenameSegment(input.lessonTitle, 'lesson');
  const safeLanguage = sanitizeFilenameSegment(String(input.languageCode || 'en').toUpperCase(), 'EN');
  const safeVersion = normalizeVersionToken(input.version);
  const ext = String(input.extension || 'bin').replace(/^\./, '').toLowerCase() || 'bin';
  return `${safeCourse}_${safeLesson}_${safeLanguage}_${safeVersion}.${ext}`;
}

async function getCourseTitleForLesson(lessonId: string): Promise<string | null> {
  const [courseLesson] = await db
    .select({ courseTitle: courses.title })
    .from(courseLessons)
    .innerJoin(courses, eq(courseLessons.courseId, courses.id))
    .where(eq(courseLessons.lessonId, lessonId))
    .limit(1);
  return courseLesson?.courseTitle ? String(courseLesson.courseTitle) : null;
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

type PodcastDebugEvent = {
  timestamp: string;
  source: "server" | "client";
  category: string;
  lessonId?: string;
  versionId?: string;
  languageCode?: string;
  route?: string;
  statusCode?: number;
  message?: string;
  details?: Record<string, any>;
  userId?: string;
};

const PODCAST_DEBUG_MAX_EVENTS = 2500;
const podcastDebugEvents: PodcastDebugEvent[] = [];

function pushPodcastDebugEvent(event: PodcastDebugEvent) {
  podcastDebugEvents.push({
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
  });
  if (podcastDebugEvents.length > PODCAST_DEBUG_MAX_EVENTS) {
    podcastDebugEvents.splice(0, podcastDebugEvents.length - PODCAST_DEBUG_MAX_EVENTS);
  }
}

function logLanguageConsumptionEvent(input: {
  route: string;
  organizationId?: string | null;
  userId?: string | null;
  resourceType: "course" | "lesson" | "podcast_manifest";
  resourceId: string;
  requestedLanguageCode?: string | null;
  languageResolution?: ReturnType<typeof ContentLanguageService.buildResolutionPayload>;
}) {
  const payload = {
    route: input.route,
    userId: input.userId || null,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    requestedLanguageCode: input.requestedLanguageCode || null,
    languageResolution: input.languageResolution || null,
    timestamp: new Date().toISOString(),
  };
  console.log("[LanguageConsumption]", JSON.stringify(payload));

  if (input.organizationId) {
    TranslationAnalyticsService.trackEvent({
      organizationId: input.organizationId,
      userId: input.userId || null,
      eventType: "content_view",
      resourceType: input.resourceType === "podcast_manifest" ? "podcast" : input.resourceType,
      resourceId: input.resourceId,
      languageCode: input.languageResolution?.resolvedLanguageCode || input.requestedLanguageCode || null,
      variantId: input.resourceId,
      contentGroupId: null,
      metadata: {
        route: input.route,
        reasonCode: input.languageResolution?.reasonCode || null,
        requestedLanguageCode: input.requestedLanguageCode || null,
        isFallback: input.languageResolution?.isFallback || false,
      },
      dedupeSeed: `${input.route}:${input.resourceId}:${input.requestedLanguageCode || ''}:${input.languageResolution?.resolvedLanguageCode || ''}`,
    }).catch((error) => {
      console.error("[LanguageConsumption] Failed to persist analytics event:", error?.message || error);
    });
  }
}

/**
 * Register course and lesson routes on the Express app
 */
export function registerCourseRoutes(app: Express): void {
  async function resolveOrganizationId(session: any, resourceHint?: { courseId?: string; assignmentId?: string }): Promise<string | null> {
    const sessionOrgId = getEffectiveOrganizationId(session);
    if (sessionOrgId) return sessionOrgId;

    if (resourceHint?.courseId) {
      const [course] = await db.select({ organizationId: schema.courses.organizationId })
        .from(schema.courses)
        .where(eq(schema.courses.id, resourceHint.courseId))
        .limit(1);
      if (course?.organizationId) return course.organizationId;
    }

    if (resourceHint?.assignmentId) {
      const [assignment] = await db.select({ organizationId: schema.courseAssignments.organizationId })
        .from(schema.courseAssignments)
        .where(eq(schema.courseAssignments.id, resourceHint.assignmentId))
        .limit(1);
      if (assignment?.organizationId) return assignment.organizationId;
    }

    if (session.userId) {
      const userOrgs = await db.select({ organizationId: schema.userOrganizationRoles.organizationId })
        .from(schema.userOrganizationRoles)
        .where(eq(schema.userOrganizationRoles.userId, session.userId))
        .limit(2);
      if (userOrgs.length === 1) return userOrgs[0].organizationId;
    }

    return null;
  }

  async function resolveInterOrgSourceOrganizationId(req: Request, courseId?: string): Promise<string | null> {
    const requestedCourseId = String(courseId || "").trim();
    if (!requestedCourseId) {
      return resolveOrganizationId(req.session);
    }

    const [sourceCourse] = await db
      .select({ organizationId: schema.courses.organizationId })
      .from(schema.courses)
      .where(eq(schema.courses.id, requestedCourseId))
      .limit(1);

    if (!sourceCourse?.organizationId) {
      return null;
    }

    const sessionOrgId = getEffectiveOrganizationId(req.session);
    if (!sessionOrgId || sessionOrgId === sourceCourse.organizationId) {
      return sourceCourse.organizationId;
    }

    const actor = req.session.userId ? await storage.getUser(req.session.userId) : null;
    const hasPlatformWideAccess = !!actor?.isSuperAdmin || (isOnPremMode() && !!actor?.isCustSuper);
    return hasPlatformWideAccess ? sourceCourse.organizationId : null;
  }

  // ==================== TRANSLATION PRICING (public, logged-in users) ====================

  app.get('/api/translation-pricing', async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const [pricing] = await db
        .select()
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);

      res.json({
        creditsPerLessonTranslation: pricing?.creditsPerLessonTranslation ?? 10,
        creditsPerQuizTranslation: pricing?.creditsPerQuizTranslation ?? 5,
        creditsPerTranslatedPptxGeneration: pricing?.creditsPerTranslatedPptxGeneration ?? 50,
      });
    } catch (error) {
      console.error("Translation pricing error:", error);
      res.status(500).json({ error: "Failed to fetch translation pricing" });
    }
  });

  // ==================== COURSE FRAMEWORK TRANSLATION ====================

  app.post('/api/courses/:id/translate', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { targetLanguageCode } = req.body;

      if (!targetLanguageCode) {
        return res.status(400).json({ error: 'targetLanguageCode is required' });
      }

      let organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        const [sourceCourse] = await db.select({ organizationId: courses.organizationId }).from(courses).where(eq(courses.id, id)).limit(1);
        if (!sourceCourse) {
          return res.status(404).json({ error: 'Source course not found' });
        }
        organizationId = sourceCourse.organizationId;
      }

      const result = await CourseTranslationOrchestrator.translateCourseFramework({
        sourceCourseId: id,
        targetLanguageCode,
        organizationId,
        initiatedBy: req.session.userId!,
      });

      await TranslationAnalyticsService.trackEvent({
        organizationId,
        userId: req.session.userId || null,
        eventType: "translation_start",
        resourceType: "course",
        resourceId: id,
        languageCode: targetLanguageCode,
        variantId: result.translatedCourseId || null,
        metadata: { source: "course_framework_translate", jobId: result.jobId },
        dedupeSeed: `${id}:${targetLanguageCode}:${result.jobId}`,
      });

      res.json(result);
    } catch (error: any) {
      console.error('Course framework translation error:', error);
      res.status(error.message?.includes('Insufficient credits') ? 402 : 500).json({ error: error.message || 'Failed to start translation' });
    }
  });

  app.get('/api/translation-jobs/:id', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const result = await CourseTranslationOrchestrator.getTranslationStatus(req.params.id);
      if (!result) {
        return res.status(404).json({ error: 'Translation job not found' });
      }
      res.json(result);
    } catch (error: any) {
      console.error('Translation job status error:', error);
      res.status(500).json({ error: 'Failed to fetch translation status' });
    }
  });

  // ==================== COURSE TRANSFER (EXPORT / IMPORT) ====================

  const resolveTransferOrganizationId = async (req: Request, courseIdHint?: string): Promise<string | null> => {
    const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
    if (effectiveOrg.organizationId) return effectiveOrg.organizationId;
    if (courseIdHint) {
      const [course] = await db
        .select({ organizationId: courses.organizationId })
        .from(courses)
        .where(eq(courses.id, courseIdHint))
        .limit(1);
      return course?.organizationId || null;
    }
    return null;
  };

  const parseJsonObjectField = <T extends Record<string, any>>(value: unknown): T | undefined => {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'object') return value as T;
    const raw = String(value || '').trim();
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as T;
      return undefined;
    } catch {
      return undefined;
    }
  };

  app.post('/api/courses/:id/export-preflight', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveTransferOrganizationId(req, req.params.id);
      if (!organizationId) {
        return res.status(403).json({ error: 'Unable to resolve organization context' });
      }

      const selectedArtifactPaths = Array.isArray((req.body || {}).selectedArtifactPaths)
        ? (req.body || {}).selectedArtifactPaths
        : undefined;

      const preflight = await CourseTransferService.buildExportPreflight({
        courseId: req.params.id,
        organizationId,
        selectedArtifactPaths,
      });
      res.json(preflight);
    } catch (error: any) {
      console.error('[CourseTransfer] Failed export preflight:', error);
      res.status(500).json({ error: error?.message || 'Failed to compute export preflight' });
    }
  });

  app.post('/api/courses/:id/export-job', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveTransferOrganizationId(req, req.params.id);
      if (!organizationId) {
        return res.status(403).json({ error: 'Unable to resolve organization context' });
      }

      const options = {
        includeArtifacts: (req.body || {}).includeArtifacts !== false,
        failOnMissingArtifacts: (req.body || {}).failOnMissingArtifacts !== false,
        selectedArtifactPaths: Array.isArray((req.body || {}).selectedArtifactPaths)
          ? (req.body || {}).selectedArtifactPaths
          : undefined,
      };

      const job = await CourseTransferService.startExportJob({
        courseId: req.params.id,
        organizationId,
        userId: req.session.userId!,
        options,
      });

      res.status(202).json({
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
      });
    } catch (error: any) {
      console.error('[CourseTransfer] Failed to start export job:', error);
      res.status(500).json({ error: error?.message || 'Failed to start export job' });
    }
  });

  app.post('/api/courses/:id/export', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const organizationId = await resolveTransferOrganizationId(req, req.params.id);
      if (!organizationId) {
        return res.status(403).json({ error: 'Unable to resolve organization context' });
      }
      const options = {
        includeArtifacts: (req.body || {}).includeArtifacts !== false,
        failOnMissingArtifacts: (req.body || {}).failOnMissingArtifacts !== false,
        selectedArtifactPaths: Array.isArray((req.body || {}).selectedArtifactPaths)
          ? (req.body || {}).selectedArtifactPaths
          : undefined,
      };
      const job = await CourseTransferService.startExportJob({
        courseId: req.params.id,
        organizationId,
        userId: req.session.userId!,
        options,
      });
      res.status(202).json({
        mode: 'async',
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
      });
    } catch (error: any) {
      console.error('[CourseTransfer] Export request failed:', error);
      res.status(500).json({ error: error?.message || 'Failed to export course' });
    }
  });

  app.get('/api/courses/export-jobs/:jobId', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    const job = CourseTransferService.getJob(req.params.jobId);
    if (!job || job.type !== 'export') {
      return res.status(404).json({ error: 'Export job not found' });
    }
    const organizationId = await resolveTransferOrganizationId(req, job.courseId);
    if (!organizationId || organizationId !== job.organizationId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(job);
  });

  app.get('/api/courses/export-jobs/:jobId/download', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    const job = CourseTransferService.getJob(req.params.jobId);
    if (!job || job.type !== 'export') {
      return res.status(404).json({ error: 'Export job not found' });
    }
    const organizationId = await resolveTransferOrganizationId(req, job.courseId);
    if (!organizationId || organizationId !== job.organizationId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (job.status !== 'completed' || !job.downloadPath) {
      return res.status(409).json({ error: 'Export job is not completed yet' });
    }
    const absolute = path.resolve(job.downloadPath);
    if (!fs.existsSync(absolute)) {
      return res.status(410).json({ error: 'Export package is no longer available' });
    }

    const [courseRow] = await db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, String(job.courseId || '')))
      .limit(1);
    const sanitizedTitle = String(courseRow?.title || 'course')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'course';
    const shortJob = String(req.params.jobId || '').slice(0, 8) || 'job';
    const fileName = `${sanitizedTitle}-exp-${shortJob}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    const stream = fs.createReadStream(absolute);
    stream.on('error', (error) => {
      console.error('[CourseTransfer] Export download stream error:', error);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to stream export package' });
      }
    });
    stream.pipe(res);
  });

  app.post('/api/courses/import-job', withSessionAuthMiddleware, isTeacherOrAdmin, courseTransferUpload.single('package'), async (req: Request, res: Response) => {
    try {
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      if (!effectiveOrg.organizationId) {
        return res.status(403).json({ error: 'Unable to resolve organization context' });
      }

      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (!uploadedFile?.path) {
        return res.status(400).json({ error: 'Missing package file (multipart field: package)' });
      }
      const optionsRaw = parseJsonObjectField<any>((req.body || {}).options) || {};
      const options = {
        mode: String(optionsRaw.mode || 'create_new') === 'merge_append_versions' ? 'merge_append_versions' : 'create_new',
        targetCourseId: optionsRaw.targetCourseId ? String(optionsRaw.targetCourseId) : null,
      } as const;

      const job = await CourseTransferService.startImportJob({
        zipPath: uploadedFile.path,
        organizationId: effectiveOrg.organizationId,
        userId: req.session.userId!,
        options,
      });

      res.status(202).json({
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
      });
    } catch (error: any) {
      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (uploadedFile?.path) {
        try { await fs.promises.unlink(uploadedFile.path); } catch {}
      }
      console.error('[CourseTransfer] Failed to start import job:', error);
      res.status(500).json({ error: error?.message || 'Failed to start import job' });
    }
  });

  app.post('/api/courses/import', withSessionAuthMiddleware, isTeacherOrAdmin, courseTransferUpload.single('package'), async (req: Request, res: Response) => {
    try {
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      if (!effectiveOrg.organizationId) {
        return res.status(403).json({ error: 'Unable to resolve organization context' });
      }

      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (!uploadedFile?.path) {
        return res.status(400).json({ error: 'Missing package file (multipart field: package)' });
      }
      const optionsRaw = parseJsonObjectField<any>((req.body || {}).options) || {};
      const options = {
        mode: String(optionsRaw.mode || 'create_new') === 'merge_append_versions' ? 'merge_append_versions' : 'create_new',
        targetCourseId: optionsRaw.targetCourseId ? String(optionsRaw.targetCourseId) : null,
      } as const;

      const job = await CourseTransferService.startImportJob({
        zipPath: uploadedFile.path,
        organizationId: effectiveOrg.organizationId,
        userId: req.session.userId!,
        options,
      });

      res.status(202).json({
        mode: 'async',
        jobId: job.id,
        status: job.status,
        phase: job.phase,
        progress: job.progress,
      });
    } catch (error: any) {
      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (uploadedFile?.path) {
        try { await fs.promises.unlink(uploadedFile.path); } catch {}
      }
      console.error('[CourseTransfer] Import request failed:', error);
      res.status(500).json({ error: error?.message || 'Failed to import course package' });
    }
  });

  app.post('/api/courses/import-analyze', withSessionAuthMiddleware, isTeacherOrAdmin, courseTransferUpload.single('package'), async (req: Request, res: Response) => {
    try {
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      if (!effectiveOrg.organizationId) {
        return res.status(403).json({ error: 'Unable to resolve organization context' });
      }

      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (!uploadedFile?.path) {
        return res.status(400).json({ error: 'Missing package file (multipart field: package)' });
      }

      const analysis = await CourseTransferService.analyzeImportPackage({
        zipPath: uploadedFile.path,
        organizationId: effectiveOrg.organizationId,
      });
      res.json(analysis);
    } catch (error: any) {
      console.error('[CourseTransfer] Import analyze failed:', error);
      res.status(500).json({ error: error?.message || 'Failed to analyze package' });
    } finally {
      const uploadedFile = (req as any).file as Express.Multer.File | undefined;
      if (uploadedFile?.path) {
        try { await fs.promises.unlink(uploadedFile.path); } catch {}
      }
    }
  });

  app.get('/api/courses/import-jobs/:jobId', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    const job = CourseTransferService.getJob(req.params.jobId);
    if (!job || job.type !== 'import') {
      return res.status(404).json({ error: 'Import job not found' });
    }
    const organizationId = await resolveTransferOrganizationId(req);
    if (!organizationId || organizationId !== job.organizationId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(job);
  });

  app.post('/api/courses/export-jobs/:jobId/cancel', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    const organizationId = await resolveTransferOrganizationId(req);
    if (!organizationId) {
      return res.status(403).json({ error: 'Unable to resolve organization context' });
    }
    const job = CourseTransferService.requestCancel(req.params.jobId, organizationId);
    if (!job || job.type !== 'export') {
      return res.status(404).json({ error: 'Export job not found' });
    }
    res.json(job);
  });

  app.post('/api/courses/import-jobs/:jobId/cancel', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    const organizationId = await resolveTransferOrganizationId(req);
    if (!organizationId) {
      return res.status(403).json({ error: 'Unable to resolve organization context' });
    }
    const job = CourseTransferService.requestCancel(req.params.jobId, organizationId);
    if (!job || job.type !== 'import') {
      return res.status(404).json({ error: 'Import job not found' });
    }
    res.json(job);
  });

  // ==================== COURSE CREATION ====================

  app.post('/api/courses', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { 
        title, description, category, difficultyLevel, 
        currency, price, isPaid, thumbnailUrl, thumbnailTempCourseId,
        visibility,
        topics,
        defaultLanguage,
      } = req.body;
      
      const userId = req.session.userId!;

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      if (!effectiveOrg.organizationId) {
        return res.status(403).json({ error: 'You must belong to an organization to create courses' });
      }

      const organizationId = effectiveOrg.organizationId;
      const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, organizationId)).limit(1);
      
      let effectiveVisibility: 'public' | 'org_only' = 'org_only';
      if (org?.type === 'elearning') {
        effectiveVisibility = visibility === 'public' ? 'public' : 'org_only';
      }

      let validCategoryId = null;
      if (category) {
        const [existingCategory] = await db
          .select()
          .from(schema.courseCategories)
          .where(
            and(
              eq(schema.courseCategories.id, category),
              eq(schema.courseCategories.organizationId, organizationId)
            )
          )
          .limit(1);
        
        validCategoryId = existingCategory ? category : null;
      }

      const course = await CourseService.createCourse({
        organizationId,
        title,
        description,
        categoryId: validCategoryId,
        difficultyLevel,
        currency,
        price: isPaid ? price : '0',
        visibility: effectiveVisibility,
        thumbnailUrl: null,
        createdBy: userId,
        isDefaultLanguage: defaultLanguage !== false,
      }, userId);

      if (topics && Array.isArray(topics) && topics.length > 0) {
        try {
          const sortedTopics = [...topics].sort((a: any, b: any) => {
            const aOrder = Number((a as any).order ?? (a as any).position ?? 0);
            const bOrder = Number((b as any).order ?? (b as any).position ?? 0);
            return aOrder - bOrder;
          });
          const normalizedTopics = sortedTopics.map((topic: any, index: number) => {
            const isFirst = index === 0;
            const isLast = index === sortedTopics.length - 1;
            let lessonType: 'overview' | 'content' | 'key_takeaways' = 'content';
            if (isFirst) lessonType = 'overview';
            else if (isLast) lessonType = 'key_takeaways';

            return {
              ...topic,
              order: index,
              position: index + 1,
              isOverview: isFirst,
              lessonType,
            };
          });

          const updateResult = await db.update(schema.courseFrameworks)
            .set({
              topics: normalizedTopics,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(schema.courseFrameworks.courseId, course.id),
                eq(schema.courseFrameworks.organizationId, organizationId)
              )
            )
            .returning({ id: schema.courseFrameworks.id });
          
          if (updateResult.length > 0) {
            console.log(`[Course Creation] Updated course framework with ${normalizedTopics.length} topics for course ${course.id}`);
          } else {
            console.warn(`[Course Creation] No framework found for course ${course.id}, inserting new one`);
            await db.insert(schema.courseFrameworks).values({
              courseId: course.id,
              organizationId,
              topics: normalizedTopics,
            });
            console.log(`[Course Creation] Created course framework with ${normalizedTopics.length} topics for course ${course.id}`);
          }
        } catch (frameworkError) {
          console.error('[Course Creation] Error updating course framework:', frameworkError);
        }
      }

      if (thumbnailUrl && thumbnailTempCourseId) {
        try {
          const objectStorageService = new ObjectStorageService();
          const tempPath = thumbnailUrl;
          const { uploadUrl: _, objectPath: finalPath } = await objectStorageService.getCourseThumbnailUploadURL(
            organizationId,
            course.id
          );

          const copied = await objectStorageService.copyObject(tempPath, finalPath);
          if (!copied) {
            throw new Error('Failed to copy temporary course thumbnail');
          }
          await objectStorageService.deleteObject(tempPath);
          
          await CourseService.updateCourse(course.id, { thumbnailUrl: finalPath }, organizationId);
          course.thumbnailUrl = finalPath;
          
        } catch (thumbnailError) {
          console.error('[Course Creation] Error moving thumbnail:', thumbnailError);
          await CourseService.updateCourse(course.id, { thumbnailUrl }, organizationId);
          course.thumbnailUrl = thumbnailUrl;
        }
      }

      res.json(course);
    } catch (error) {
      console.error('Error creating course:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== CORE COURSE LISTING ROUTES ====================

  // List courses with status filtering (for Course Builder admin page)
  app.get('/api/courses', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const {
        searchQuery,
        search,
        category,
        difficultyLevel,
        difficulty,
        departmentId,
        unitId,
        teamId,
        organizationId,
        currency,
        minPrice,
        maxPrice,
        status,
        visibility,
        completionStatus,
        limit = '20',
        offset = '0',
      } = req.query;

      const effectiveSearch = (search || searchQuery) as string;
      const effectiveDifficulty = (difficulty || difficultyLevel) as string;

      let isAdminUser = false;
      let userOrgId: string | undefined = undefined;
      let userId: string | undefined = undefined;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);

      if (req.session.context) {
        const { effectiveRole, impersonatedOrganization, primaryOrganization } = req.session.context;
        const normalizedRole = String(effectiveRole || '').toLowerCase().replace(/[_\s]/g, '');
        isAdminUser = ['orgadmin', 'superadmin', 'teacher', 'custsuper', 'trainer', 'teamlead', 'instructor'].includes(normalizedRole);
        userOrgId = effectiveOrg.organizationId || impersonatedOrganization?.orgId || primaryOrganization?.orgId;
        userId = req.session.userId;
      } else if (req.session.userId) {
        const userRoles = await storage.getUserRoles(req.session.userId);
        isAdminUser = userRoles.some((r: any) => ALL_STAFF_ROLES.includes(r.role));
        userOrgId = effectiveOrg.organizationId || (userRoles.length > 0 ? userRoles[0].organizationId : undefined);
        userId = req.session.userId;
      }
      
      const effectiveStatus = isAdminUser ? (status as any) : 'active';

      let userPreferredLanguage: string | undefined;
      let orgDefaultLanguage: string | undefined;

      if (userId) {
        const [userData] = await db.select({ preferredLanguage: schema.users.preferredLanguage }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
        userPreferredLanguage = userData?.preferredLanguage || 'en';
      }
      if (userOrgId) {
        const [orgData] = await db.select({ defaultLanguage: schema.organizations.defaultLanguage }).from(schema.organizations).where(eq(schema.organizations.id, userOrgId)).limit(1);
        orgDefaultLanguage = orgData?.defaultLanguage || 'en';
      }

      const { courses, total } = await CourseService.searchCourses({
        searchQuery: effectiveSearch,
        category: category as string,
        difficultyLevel: effectiveDifficulty,
        departmentId: departmentId as string,
        unitId: unitId as string,
        teamId: teamId as string,
        organizationId: isAdminUser ? (organizationId as string || userOrgId) : undefined,
        currency: currency as string,
        minPrice: minPrice as string,
        maxPrice: maxPrice as string,
        status: effectiveStatus,
        visibility: visibility as string,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        userPreferredLanguage,
        orgDefaultLanguage,
      });

      let assignedCourses: any[] = [];
      if (!isAdminUser && userId && userOrgId) {
        try {
          const assignments = await CourseAssignmentService.getCourseAssignmentsForUser(userId, userOrgId);
          
          if (assignments.length > 0) {
            const courseIdToDueDate = new Map<string, Date | null>();
            for (const assignment of assignments) {
              const existing = courseIdToDueDate.get(assignment.courseId);
              const assignmentDueDate = assignment.dueDate ? new Date(assignment.dueDate) : null;
              if (!courseIdToDueDate.has(assignment.courseId)) {
                courseIdToDueDate.set(assignment.courseId, assignmentDueDate);
              } else if (assignmentDueDate && (!existing || assignmentDueDate < existing)) {
                courseIdToDueDate.set(assignment.courseId, assignmentDueDate);
              }
            }
            
            const existingCourseIds = new Set(courses.map(c => c.id));
            const assignedCourseIds = Array.from(
              new Set(assignments.map(a => a.courseId).filter(id => !existingCourseIds.has(id)))
            );
            
            if (assignedCourseIds.length > 0) {
              const assignedCoursesData = await db
                .select()
                .from(schema.courses)
                .where(
                  and(
                    inArray(schema.courses.id, assignedCourseIds),
                    eq(schema.courses.status, 'active')
                  )
                );
              
              assignedCourses = assignedCoursesData.map(course => {
                const dueDate = courseIdToDueDate.get(course.id);
                const now = new Date();
                const daysUntilDue = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
                return {
                  ...course,
                  isAssigned: true,
                  dueDate: dueDate?.toISOString() || null,
                  daysUntilDue,
                };
              });
            }
          }
        } catch (error) {
          console.error('[Courses API] Error fetching assigned courses:', error);
        }
      }

      const combinedCourses = [...courses, ...assignedCourses];
      
      // Apply completion status filter for all authenticated users
      let filteredCourses = combinedCourses;
      if (userId && completionStatus) {
        const progressData = await db
          .select({
            courseId: schema.courseProgress.courseId,
            status: schema.courseProgress.status,
            percentComplete: schema.courseProgress.percentComplete,
          })
          .from(schema.courseProgress)
          .where(eq(schema.courseProgress.userId, userId));
        
        const progressMap = new Map(progressData.map(p => [p.courseId, p]));
        
        filteredCourses = combinedCourses.filter(course => {
          const progress = progressMap.get(course.id);
          const courseStatus = progress?.status || 'not_started';
          
          switch (completionStatus) {
            case 'completed':
              return courseStatus === 'completed';
            case 'in_progress':
              return courseStatus === 'in_progress';
            case 'not_started':
              return !progress || courseStatus === 'not_started';
            default:
              return true;
          }
        });
      }
      
      const filteredTotal = filteredCourses.length;
      
      const objectStorageService = new ObjectStorageService();
      const enrichedCourses = await Promise.all(filteredCourses.map(async (course) => {
        let thumbnailSignedUrl: string | undefined;
        const thumbnailPath = course.thumbnailUrl || course.imageUrl;
        
        if (thumbnailPath) {
          try {
            thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
              thumbnailPath,
              3600
            );
          } catch (error) {
            console.error(`[Courses API] Failed to get signed URL for thumbnail: ${thumbnailPath}`, error);
          }
        }
        
        return {
          ...course,
          thumbnailSignedUrl,
        };
      }));

      res.json({ courses: enrichedCourses, total: filteredTotal });
    } catch (error) {
      console.error('Error searching courses:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get course counts by status for org admin tabs
  app.get('/api/courses/counts', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const orgId = effectiveOrg.organizationId;

      if (!orgId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const statusCounts = await db
        .select({
          status: schema.courses.status,
          count: sql<number>`count(*)::int`,
        })
        .from(schema.courses)
        .where(and(
          eq(schema.courses.organizationId, orgId),
          or(
            eq(schema.courses.isDefaultLanguage, true),
            isNull(schema.courses.isDefaultLanguage)
          )
        ))
        .groupBy(schema.courses.status);

      const counts = {
        active: 0,
        inactive: 0,
        archived: 0,
        draft: 0,
      };

      for (const row of statusCounts) {
        if (row.status in counts) {
          counts[row.status as keyof typeof counts] = Number(row.count);
        }
      }

      res.json(counts);
    } catch (error) {
      console.error('Error getting course counts:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Get draft status for all courses in the organization
  app.get('/api/courses/drafts-status', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const orgId = effectiveOrg.organizationId;

      if (!orgId) {
        return res.json({}); // No organization, no drafts
      }

      // Create a map of courseId -> draft info
      const draftStatus: Record<string, { hasDraft: boolean; draft: any; isVersioningDraft?: boolean }> = {};

      // 1. NEW VERSIONING SYSTEM: Query courses with sourceVersionCourseId set and status='draft'
      const versioningDrafts = await db.query.courses.findMany({
        where: and(
          eq(courses.organizationId, orgId),
          eq(courses.status, 'draft'),
          sql`${courses.sourceVersionCourseId} IS NOT NULL`
        ),
      });

      for (const draft of versioningDrafts) {
        if (draft.sourceVersionCourseId) {
          // Get the original course info
          const originalCourse = await db.query.courses.findFirst({
            where: eq(courses.id, draft.sourceVersionCourseId),
          });

          draftStatus[draft.sourceVersionCourseId] = {
            hasDraft: true,
            isVersioningDraft: true,
            draft: {
              id: draft.id,
              originalCourseId: draft.sourceVersionCourseId,
              organizationId: draft.organizationId,
              title: draft.title,
              description: draft.description,
              thumbnailUrl: draft.thumbnailUrl,
              price: draft.price,
              currency: draft.currency,
              difficultyLevel: draft.difficultyLevel,
              estimatedDuration: draft.estimatedDuration,
              visibility: draft.visibility,
              createdBy: draft.createdBy,
              createdAt: draft.createdAt,
              updatedAt: draft.updatedAt,
              cloneMapping: draft.cloneMapping,
              originalCourseTitle: originalCourse?.title || 'Unknown Course',
              originalCourseStatus: originalCourse?.status || 'unknown',
            },
          };
        }
      }

      // 2. LEGACY: Query old courseDrafts table for backward compatibility
      try {
        const legacyDrafts = await db.query.courseDrafts.findMany({
          where: eq(schema.courseDrafts.organizationId, orgId),
          with: {
            originalCourse: {
              columns: {
                id: true,
                title: true,
                status: true,
              },
            },
          },
        });

        for (const draft of legacyDrafts) {
          // Don't overwrite if we already have a versioning draft for this course
          if (!draftStatus[draft.originalCourseId]) {
            draftStatus[draft.originalCourseId] = {
              hasDraft: true,
              isVersioningDraft: false,
              draft: {
                ...draft,
                originalCourseTitle: draft.originalCourse?.title || 'Unknown Course',
                originalCourseStatus: draft.originalCourse?.status || 'unknown',
              },
            };
          }
        }
      } catch (error) {
        // Legacy table might not exist or be empty - that's fine
        console.log('[CourseRoutes] Legacy courseDrafts query skipped:', (error as Error).message);
      }

      return res.json(draftStatus);
    } catch (error) {
      console.error('[CourseRoutes] Error fetching draft status:', error);
      return res.status(500).json({ error: 'Failed to fetch draft status' });
    }
  });

  // Delete course (soft-delete via archive for data integrity)
  app.delete('/api/courses/:id', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const userId = req.session.userId;
      
      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      let organizationId: string | undefined;
      if (req.session.context) {
        organizationId = req.session.context.impersonatedOrganization?.orgId || req.session.context.primaryOrganization?.orgId;
      } else {
        const userRoles = await storage.getUserRoles(userId);
        organizationId = userRoles.find(r => ALL_STAFF_ROLES.includes(r.role))?.organizationId;
      }

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await db
        .update(schema.courses)
        .set({ 
          status: 'archived',
          updatedAt: new Date(),
        })
        .where(eq(schema.courses.id, courseId));

      res.json({ success: true, message: 'Course has been deleted and moved to archive' });
    } catch (error) {
      console.error('Error deleting course:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Update course status (activate, deactivate, archive)
  app.patch('/api/courses/:id/status', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!['active', 'inactive', 'archived', 'draft'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status. Must be active, inactive, archived, or draft' });
      }

      let orgId: string | undefined;
      if (req.session.context) {
        orgId = req.session.context.impersonatedOrganization?.orgId || req.session.context.primaryOrganization?.orgId;
      } else {
        const userRoles = await storage.getUserRoles(userId);
        orgId = userRoles.find(r => ALL_STAFF_ROLES.includes(r.role))?.organizationId;
      }

      if (!orgId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, id))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (course.organizationId !== orgId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (status === 'active' && course.languageCode && course.languageCode !== 'en') {
        const courseLinkedLessons = await db
          .select({ 
            lessonId: schema.courseLessons.lessonId,
          })
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.courseId, id));

        if (courseLinkedLessons.length > 0) {
          const lessonIds = courseLinkedLessons.map(cl => cl.lessonId);
          const lessonsWithStatus = await db
            .select({ 
              id: schema.lessons.id,
              title: schema.lessons.title,
              translationStatus: schema.lessons.translationStatus,
              languageCode: schema.lessons.languageCode,
            })
            .from(schema.lessons)
            .where(inArray(schema.lessons.id, lessonIds));

          const unpublishedLessons = lessonsWithStatus.filter(
            l => l.translationStatus !== 'published'
          );

          if (unpublishedLessons.length > 0) {
            const unpublishedNames = unpublishedLessons.map(l => l.title).join(', ');
            return res.status(400).json({
              error: `Cannot set course to Active: ${unpublishedLessons.length} lesson(s) have unpublished translations: ${unpublishedNames}. All lesson translations must be published before activating the course.`,
              unpublishedLessons: unpublishedLessons.map(l => ({ id: l.id, title: l.title })),
            });
          }
        }
      }

      const [updated] = await db
        .update(schema.courses)
        .set({ 
          status,
          updatedAt: new Date(),
        })
        .where(eq(schema.courses.id, id))
        .returning();

      res.json(updated);
    } catch (error) {
      console.error('Error updating course status:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Assignable course list for organization management screens.
  // Kept outside /api/courses/:id so "assignable" cannot be interpreted as a course id.
  app.get("/api/organization/assignable-courses", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userOrgId = await resolveOrganizationId(req.session);
      if (!userOrgId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const result = await db
        .select({
          id: courses.id,
          title: courses.title,
          description: courses.description,
          thumbnailUrl: courses.thumbnailUrl,
          status: courses.status,
          visibility: courses.visibility,
        })
        .from(courses)
        .where(and(
          eq(courses.organizationId, userOrgId),
          sql`${courses.status} <> 'archived'`
        ));

      res.json(result);
    } catch (error: any) {
      console.error("[Courses] Error fetching assignable organization courses:", error);
      res.status(500).json({ error: error.message || "Failed to fetch assignable courses" });
    }
  });

  // Get single course by ID (for course detail pages)
  app.get('/api/courses/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;

      const course = await CourseService.getCourseWithDetails(id, userId, req.session?.context || null);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const [courseLangData] = await db
        .select({ 
          contentGroupId: courses.contentGroupId, 
          languageCode: courses.languageCode,
          organizationId: courses.organizationId,
        })
        .from(courses)
        .where(eq(courses.id, id))
        .limit(1);

      const requestedLanguageCode = resolveRequestedLanguageCodeFromQuery(
        req.query as Record<string, unknown>
      );
      const includeDraftVariantsForStaff = await shouldIncludeDraftLanguageVariantsForUser(
        req,
        courseLangData?.organizationId || null
      );
      const languageResolution = courseLangData?.contentGroupId
        ? await ContentLanguageService.resolveCourseVariantByFallback({
            contentGroupId: courseLangData.contentGroupId,
            requestedLanguage: requestedLanguageCode,
            userId: userId || null,
            organizationId: courseLangData.organizationId || getEffectiveOrganizationId(req.session) || null,
            sourceLanguage: courseLangData.languageCode || undefined,
            includeUnpublishedVariants: includeDraftVariantsForStaff,
          })
        : null;
      const preferredCourseId = languageResolution?.variantId && languageResolution.variantId !== id
        ? languageResolution.variantId
        : null;

      let thumbnailSignedUrl: string | undefined;
      const thumbnailPath = course.thumbnailUrl || course.imageUrl;
      if (thumbnailPath) {
        try {
          const objectStorageService = new ObjectStorageService();
          thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
            thumbnailPath,
            3600
          );
        } catch (error) {
          console.error('[Course API] Failed to get signed URL for thumbnail:', error);
        }
      }

      // Check if this is a showcase course (allows anonymous access without enrollment)
      const isShowcaseCourse = await ShowcaseCourseService.isShowcaseCourse(id);

      const languageResolutionPayload = ContentLanguageService.buildResolutionPayload(
        languageResolution,
        requestedLanguageCode
      );

      logLanguageConsumptionEvent({
        route: "/api/courses/:id",
        organizationId: courseLangData?.organizationId || null,
        userId: userId || null,
        resourceType: "course",
        resourceId: id,
        requestedLanguageCode,
        languageResolution: languageResolutionPayload,
      });

      res.json({
        ...course,
        thumbnailSignedUrl,
        isShowcaseCourse,
        contentGroupId: courseLangData?.contentGroupId || null,
        languageCode: courseLangData?.languageCode || null,
        preferredCourseId,
        languageResolution: languageResolutionPayload,
      });
    } catch (error) {
      console.error('Error getting course:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/courses/:id/podcast-manifest', async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const preferredLanguage = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const userId = req.session?.userId || null;
      const sessionContext = req.session?.context || null;

      const [course] = await db
        .select({
          id: courses.id,
          organizationId: courses.organizationId,
          visibility: courses.visibility,
          status: courses.status,
          contentGroupId: courses.contentGroupId,
          languageCode: courses.languageCode,
        })
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      await CourseService.syncCourseLessonOrderFromFramework(courseId);

      const links = await db
        .select({
          id: courseLessons.id,
          courseId: courseLessons.courseId,
          lessonId: courseLessons.lessonId,
          topicOrder: courseLessons.topicOrder,
          topicName: courseLessons.topicName,
          lessonType: courseLessons.lessonType,
        })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.topicOrder));

      const overviewLessonIds = getOverviewLessonIds(links as any);
      const lessonIds = links.map((l) => l.lessonId);
      const lessonRows = lessonIds.length > 0
        ? await db
          .select({
            id: lessons.id,
            title: lessons.title,
            metadata: lessons.metadata,
            languageCode: lessons.languageCode,
            contentGroupId: lessons.contentGroupId,
          })
          .from(lessons)
          .where(inArray(lessons.id, lessonIds))
        : [];
      const lessonById = new Map(lessonRows.map((l) => [l.id, l]));

      const includeDraftVariantsForStaff = await shouldIncludeDraftLanguageVariantsForUser(
        req,
        course.organizationId
      );
      const manifestLanguageResolution = course.contentGroupId
        ? await ContentLanguageService.resolveCourseVariantByFallback({
            contentGroupId: course.contentGroupId,
            requestedLanguage: preferredLanguage || null,
            userId,
            organizationId: course.organizationId,
            sourceLanguage: course.languageCode || undefined,
            includeUnpublishedVariants: includeDraftVariantsForStaff,
          })
        : null;

      const resolvedLessonIdByOriginal = new Map<string, string>();
      if (preferredLanguage) {
        const variantIds = new Set<string>();
        for (const link of links) {
          const lesson = lessonById.get(link.lessonId);
          if (!lesson?.contentGroupId) continue;
          const resolution = await ContentLanguageService.resolveLessonVariantByFallback({
            contentGroupId: lesson.contentGroupId,
            requestedLanguage: preferredLanguage,
            userId,
            organizationId: course.organizationId,
            sourceLanguage: lesson.languageCode || undefined,
            includeUnpublishedVariants: includeDraftVariantsForStaff,
          });
          if (resolution.variantId) {
            resolvedLessonIdByOriginal.set(link.lessonId, resolution.variantId);
            variantIds.add(resolution.variantId);
          }
        }

        if (variantIds.size > 0) {
          const variantRows = await db
            .select({
              id: lessons.id,
              title: lessons.title,
              metadata: lessons.metadata,
              languageCode: lessons.languageCode,
              contentGroupId: lessons.contentGroupId,
            })
            .from(lessons)
            .where(inArray(lessons.id, Array.from(variantIds)));
          for (const row of variantRows) {
            lessonById.set(row.id, row);
          }
        }
      }

      const { CourseVisibilityService } = await import('../services/courseVisibilityService');
      const access = await CourseVisibilityService.checkCourseAccess(courseId, userId, sessionContext);
      const hasCourseAccess = !!access?.hasAccess;

      const manifestItems = await Promise.all(
        links.map(async (link) => {
          const resolvedLessonId = resolvedLessonIdByOriginal.get(link.lessonId) || link.lessonId;
          const lesson = lessonById.get(resolvedLessonId) || lessonById.get(link.lessonId);
          if (!lesson) {
            return {
              lessonId: link.lessonId,
              resolvedLessonId: link.lessonId,
              topicOrder: link.topicOrder,
              topicName: link.topicName,
              title: "Unknown lesson",
              languageCode: preferredLanguage || null,
              isOverview: overviewLessonIds.has(link.lessonId),
              available: false,
              lockedReason: "Lesson record not found",
              url: null as string | null,
            };
          }

          const isOverview = overviewLessonIds.has(link.lessonId);
          const podcastMeta = LessonPodcastService.getMetadata(lesson as any);
          const signed = preferredLanguage
            ? await LessonPodcastService.getSignedUrlForLanguage(lesson as any, preferredLanguage)
            : await LessonPodcastService.getSignedUrlForVersion(lesson as any);
          const hasPodcast = !!signed.url;
          const available = isOverview || hasCourseAccess;
          const lockedReason = !available
            ? "Enroll to play this lesson podcast. Overview lesson podcasts are always free."
            : null;
          const completedVersions = LessonPodcastService.getCompletedVersions(podcastMeta);
          const availableLanguages = LessonPodcastService.getAvailableLanguages(podcastMeta);
          const versionSummaries = await Promise.all(
            completedVersions.map(async (v) => {
              const signedByVersion = available
                ? await LessonPodcastService.getSignedUrlForVersion(lesson as any, v.id)
                : { url: null };
              return {
                id: v.id,
                title: v.title || null,
                languageCode: v.languageCode || "en",
                createdAt: v.createdAt,
                url: available ? signedByVersion.url : null,
              };
            })
          );

          return {
            lessonId: link.lessonId,
            resolvedLessonId,
            topicOrder: link.topicOrder,
            topicName: link.topicName,
            title: lesson.title,
            isOverview,
            hasPodcast,
            available: available && hasPodcast,
            lockedReason: hasPodcast ? lockedReason : "No podcast generated yet",
            url: available ? signed.url : null,
            activeVersionId: podcastMeta.activeVersionId || null,
            languageCode: lesson.languageCode || "en",
            availableLanguages,
            versions: versionSummaries,
          };
        })
      );

      const manifestLanguageResolutionPayload = ContentLanguageService.buildResolutionPayload(
        manifestLanguageResolution,
        preferredLanguage || null
      );

      logLanguageConsumptionEvent({
        route: "/api/courses/:id/podcast-manifest",
        organizationId: course.organizationId,
        userId,
        resourceType: "podcast_manifest",
        resourceId: courseId,
        requestedLanguageCode: preferredLanguage || null,
        languageResolution: manifestLanguageResolutionPayload,
      });

      res.json({
        courseId,
        languageResolution: manifestLanguageResolutionPayload,
        hasCourseAccess,
        items: manifestItems,
      });
    } catch (error: any) {
      console.error("Get course podcast manifest error:", error);
      res.status(500).json({ error: error?.message || "Failed to load course podcast manifest" });
    }
  });

  // Update course details (title, description, visibility, etc.)
  app.patch('/api/courses/:id', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      let organizationId: string | undefined;
      if (req.session.context) {
        organizationId = req.session.context.impersonatedOrganization?.orgId || req.session.context.primaryOrganization?.orgId;
      } else {
        const userRoles = await storage.getUserRoles(userId);
        organizationId = userRoles.find(r => ALL_STAFF_ROLES.includes(r.role))?.organizationId;
      }

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      if ('visibility' in updates) {
        // All organizations can now set course visibility (unified org model)
        if (!['public', 'org_only'].includes(updates.visibility)) {
          updates.visibility = 'org_only';
        }
      }

      if ("unitId" in updates && updates.unitId !== null) {
        const [unit] = await db.select().from(schema.organizationUnits).where(
          and(
            eq(schema.organizationUnits.id, updates.unitId),
            eq(schema.organizationUnits.organizationId, organizationId)
          )
        ).limit(1);
        
        if (!unit) {
          return res.status(400).json({ 
            error: "Invalid unit - unit does not belong to this organization" 
          });
        }
      }

      const course = await CourseService.updateCourse(id, updates, organizationId);
      res.json(course);
    } catch (error) {
      console.error('Error updating course:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Validate course for publishing
  app.get('/api/courses/:id/validate-publish', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const userId = req.session.userId;
      const languageCode = req.query.languageCode ? String(req.query.languageCode).toLowerCase() : undefined;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      let organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        const [sourceCourse] = await db.select({ organizationId: schema.courses.organizationId }).from(schema.courses).where(eq(schema.courses.id, id)).limit(1);
        if (!sourceCourse) {
          return res.status(404).json({ error: 'Course not found' });
        }
        organizationId = sourceCourse.organizationId;
      }

      const validation = await CourseService.validateCourseForPublish(id, { targetLanguageCode: languageCode, skipAssignmentCheck: true });
      await TranslationAnalyticsService.trackEvent({
        organizationId,
        userId,
        eventType: "publish_readiness_check",
        resourceType: "course",
        resourceId: id,
        languageCode: languageCode || null,
        metadata: { isValid: validation.isValid, errors: validation.errors, warnings: validation.warnings },
        dedupeSeed: `${id}:${languageCode || "default"}:${validation.isValid}`,
      });
      res.json(validation);
    } catch (error) {
      console.error('Error validating course for publish:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Publish course (change status to active) - validates before publishing
  app.post('/api/courses/:id/publish', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { skipValidation } = req.body || {};
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      let organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        const [sourceCourse] = await db.select({ organizationId: schema.courses.organizationId }).from(schema.courses).where(eq(schema.courses.id, id)).limit(1);
        if (!sourceCourse) {
          return res.status(404).json({ error: 'Course not found' });
        }
        organizationId = sourceCourse.organizationId;
      }

      const [courseToPublish] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, id))
        .limit(1);

      if (courseToPublish && courseToPublish.languageCode && courseToPublish.languageCode !== 'en') {
        const courseLinkedLessons = await db
          .select({ 
            lessonId: schema.courseLessons.lessonId,
          })
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.courseId, id));

        if (courseLinkedLessons.length > 0) {
          const lessonIds = courseLinkedLessons.map(cl => cl.lessonId);
          const lessonsWithStatus = await db
            .select({ 
              id: schema.lessons.id,
              title: schema.lessons.title,
              translationStatus: schema.lessons.translationStatus,
              languageCode: schema.lessons.languageCode,
            })
            .from(schema.lessons)
            .where(inArray(schema.lessons.id, lessonIds));

          const unpublishedLessons = lessonsWithStatus.filter(
            l => l.translationStatus !== 'published'
          );

          if (unpublishedLessons.length > 0) {
            const unpublishedNames = unpublishedLessons.map(l => l.title).join(', ');
            return res.status(400).json({
              error: `Cannot set course to Active: ${unpublishedLessons.length} lesson(s) have unpublished translations: ${unpublishedNames}. All lesson translations must be published before activating the course.`,
              unpublishedLessons: unpublishedLessons.map(l => ({ id: l.id, title: l.title })),
            });
          }
        }
      }

      const result = await CourseService.publishCourse(id, organizationId, { skipAssignmentCheck: true });

      if (result.success) {
        await TranslationIndexService.enqueueForCourseMutation({
          courseId: id,
          organizationId,
          eventType: "publish",
          dedupeSeed: `route:${id}:${Date.now()}`,
        });
        await TranslationAnalyticsService.trackEvent({
          organizationId,
          userId,
          eventType: "publish_action",
          resourceType: "course",
          resourceId: id,
          languageCode: result.course?.languageCode || null,
          variantId: result.course?.id || id,
          contentGroupId: result.course?.contentGroupId || null,
          metadata: { source: "publish_route", skipValidation: skipValidation === true },
          dedupeSeed: `course-publish:${id}:${result.course?.updatedAt?.toISOString?.() || ''}`,
        });
      }
      
      if (!result.success) {
        return res.status(400).json({
          error: 'Course cannot be published',
          validation: result.validation,
        });
      }

      res.json({
        success: true,
        course: result.course,
        warnings: result.validation.warnings,
      });
    } catch (error) {
      console.error('Error publishing course:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Multi-language publish readiness check
  app.get('/api/courses/:id/publish-readiness', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, id))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const contentGroupId = course.contentGroupId || course.id;

      const variants = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.contentGroupId, contentGroupId));

      if (variants.length === 0) {
        variants.push(course);
      }

      const langCodes = variants.map(v => v.languageCode).filter((c): c is string => !!c);
      const langRows = langCodes.length > 0
        ? await db.select({ code: schema.supportedLanguages.code, name: schema.supportedLanguages.name })
            .from(schema.supportedLanguages)
            .where(inArray(schema.supportedLanguages.code, langCodes))
        : [];
      const languageNames: Record<string, string> = {};
      for (const row of langRows) {
        languageNames[row.code] = row.name;
      }

      const sourceVariant = variants.find(v => v.isDefaultLanguage) || variants[0];
      const sourceLanguage = sourceVariant.languageCode || 'en';

      const languages = await Promise.all(variants.map(async (variant) => {
        const courseLinkedLessons = await db
          .select({
            lessonId: schema.courseLessons.lessonId,
            lessonType: schema.courseLessons.lessonType,
            topicOrder: schema.courseLessons.topicOrder,
          })
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.courseId, variant.id))
          .orderBy(asc(schema.courseLessons.topicOrder));

        const isSource = variant.isDefaultLanguage === true;
        const issues: Array<{ lessonId: string; lessonTitle: string; missingAssets: string[] }> = [];
        const topicOrders = courseLinkedLessons.map((link) => Number(link.topicOrder || 0));
        const minTopicOrder = topicOrders.length ? Math.min(...topicOrders) : 0;
        const maxTopicOrder = topicOrders.length ? Math.max(...topicOrders) : 0;

        for (const cl of courseLinkedLessons) {
          const [lesson] = await db
            .select({
              id: schema.lessons.id,
              title: schema.lessons.title,
              storageKey: schema.lessons.storageKey,
              videoStorageKey: schema.lessons.videoStorageKey,
              translationStatus: schema.lessons.translationStatus,
            })
            .from(schema.lessons)
            .where(eq(schema.lessons.id, cl.lessonId))
            .limit(1);

          if (!lesson) continue;

          const missingAssets: string[] = [];

          if (!lesson.storageKey && !lesson.videoStorageKey) {
            missingAssets.push('PPTX or Video');
          }

          const [quizLink] = await db
            .select({ id: schema.lessonQuizLinks.id })
            .from(schema.lessonQuizLinks)
            .where(eq(schema.lessonQuizLinks.lessonId, lesson.id))
            .limit(1);

          const lessonType = cl.lessonType || (
            cl.topicOrder === minTopicOrder
              ? 'overview'
              : cl.topicOrder === maxTopicOrder && maxTopicOrder !== minTopicOrder
                ? 'key_takeaways'
                : 'content'
          );
          const isOverview = cl.topicOrder === minTopicOrder || lessonType === 'overview';
          const isKeyTakeaways = cl.topicOrder === maxTopicOrder || lessonType === 'key_takeaways';
          const requiresQuiz = !isOverview && !isKeyTakeaways;

          if (requiresQuiz && !quizLink) {
            missingAssets.push('Quiz');
          }

          if (!isSource && lesson.translationStatus !== 'published') {
            missingAssets.push('Translation not published');
          }

          if (missingAssets.length > 0) {
            issues.push({
              lessonId: lesson.id,
              lessonTitle: lesson.title,
              missingAssets,
            });
          }
        }

        const langCode = variant.languageCode || 'en';

        return {
          courseId: variant.id,
          languageCode: langCode,
          languageName: languageNames[langCode] || langCode.toUpperCase(),
          status: variant.status,
          isSource,
          ready: issues.length === 0 && courseLinkedLessons.length > 0,
          totalLessons: courseLinkedLessons.length,
          issues,
        };
      }));

      res.json({
        contentGroupId,
        sourceLanguage,
        languages,
      });
    } catch (error) {
      console.error('Error checking publish readiness:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Multi-language selective publishing
  app.post('/api/courses/:id/publish-languages', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { languageCodes } = req.body;

      if (!languageCodes || !Array.isArray(languageCodes) || languageCodes.length === 0) {
        return res.status(400).json({ error: 'languageCodes array is required' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, id))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const contentGroupId = course.contentGroupId || course.id;

      const variants = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.contentGroupId, contentGroupId));

      if (variants.length === 0) {
        variants.push(course);
      }

      const sourceVariant = variants.find(v => v.isDefaultLanguage) || variants[0];

      const published: string[] = [];
      const failed: Array<{ languageCode: string; reason: string }> = [];

      for (const langCode of languageCodes) {
        const variant = variants.find(v => v.languageCode === langCode);
        if (!variant) {
          failed.push({ languageCode: langCode, reason: 'Language variant not found' });
          continue;
        }

        if (variant.status === 'active') {
          published.push(langCode);
          continue;
        }

        const courseLinkedLessons = await db
          .select({ lessonId: schema.courseLessons.lessonId })
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.courseId, variant.id));

        if (courseLinkedLessons.length === 0) {
          failed.push({ languageCode: langCode, reason: 'No lessons linked to this course variant' });
          continue;
        }

        const isSource = variant.isDefaultLanguage === true;
        let allReady = true;
        const reasons: string[] = [];

        for (const cl of courseLinkedLessons) {
          const [lesson] = await db
            .select({
              id: schema.lessons.id,
              title: schema.lessons.title,
              storageKey: schema.lessons.storageKey,
              videoStorageKey: schema.lessons.videoStorageKey,
              translationStatus: schema.lessons.translationStatus,
            })
            .from(schema.lessons)
            .where(eq(schema.lessons.id, cl.lessonId))
            .limit(1);

          if (!lesson) continue;

          if (!lesson.storageKey && !lesson.videoStorageKey) {
            allReady = false;
            reasons.push(`${lesson.title}: Missing PPTX or Video`);
          }

          if (!isSource && lesson.translationStatus !== 'published') {
            allReady = false;
            reasons.push(`${lesson.title}: Translation not published`);
          }
        }

        if (!allReady) {
          failed.push({ languageCode: langCode, reason: reasons.join('; ') });
          continue;
        }

        await db
          .update(schema.courses)
          .set({ status: 'active', updatedAt: new Date() })
          .where(eq(schema.courses.id, variant.id));

        published.push(langCode);
      }

      res.json({ published, failed });
    } catch (error) {
      console.error('Error publishing languages:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Check translation publish readiness for a course
  app.get('/api/courses/:courseId/translation-publish-status', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const { languageCode } = req.query;

      if (!languageCode) {
        return res.status(400).json({ error: 'languageCode query parameter is required' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const courseLinkedLessons = await db
        .select({ 
          lessonId: schema.courseLessons.lessonId,
        })
        .from(schema.courseLessons)
        .where(eq(schema.courseLessons.courseId, courseId));

      if (courseLinkedLessons.length === 0) {
        return res.json({
          courseId,
          languageCode,
          totalLessons: 0,
          publishedLessons: 0,
          draftLessons: 0,
          isReadyToActivate: true,
          unpublishedLessons: [],
        });
      }

      const lessonIds = courseLinkedLessons.map(cl => cl.lessonId);
      const lessonsWithStatus = await db
        .select({ 
          id: schema.lessons.id,
          title: schema.lessons.title,
          translationStatus: schema.lessons.translationStatus,
          languageCode: schema.lessons.languageCode,
        })
        .from(schema.lessons)
        .where(inArray(schema.lessons.id, lessonIds));

      const publishedLessons = lessonsWithStatus.filter(l => l.translationStatus === 'published');
      const unpublishedLessons = lessonsWithStatus.filter(l => l.translationStatus !== 'published');

      res.json({
        courseId,
        languageCode,
        totalLessons: lessonsWithStatus.length,
        publishedLessons: publishedLessons.length,
        draftLessons: unpublishedLessons.length,
        isReadyToActivate: unpublishedLessons.length === 0,
        unpublishedLessons: unpublishedLessons.map(l => ({ id: l.id, title: l.title })),
      });
    } catch (error) {
      console.error('Error checking translation publish status:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== DRAFT VERSIONING ROUTES ====================

  // Create a draft copy of a course
  app.post('/api/courses/:id/create-draft', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const { notes } = req.body;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      let organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        organizationId = course.organizationId;
      } else if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Create the draft (full clone of course with all content)
      const draftCourse = await CourseVersioningService.createDraft({
        courseId,
        userId,
        notes,
      });

      // Invalidate relevant caches - the draft is now a new course record
      // This ensures the course list and draft status are refreshed
      console.log(`[CourseRoutes] Created draft course ${draftCourse.id} for original course ${courseId}`);

      res.status(201).json(draftCourse);
    } catch (error) {
      console.error('Error creating course draft:', error);
      const message = (error as Error).message;
      if (message === 'A draft already exists for this course') {
        return res.status(409).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  // Get the active draft for a course
  app.get('/api/courses/:id/draft', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      let organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        organizationId = course.organizationId;
      } else if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const draft = await CourseVersioningService.getDraft(courseId);

      res.json({
        hasDraft: draft !== null,
        draft,
      });
    } catch (error) {
      console.error('Error getting course draft:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Update a draft
  app.patch('/api/courses/:id/draft', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const userId = req.session.userId;
      const updates = req.body;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      let organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        organizationId = course.organizationId;
      } else if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const draft = await CourseVersioningService.getDraft(courseId);
      if (!draft) {
        return res.status(404).json({ error: 'No draft exists for this course' });
      }

      const updatedDraft = await CourseVersioningService.updateDraft(draft.id, updates);

      res.json(updatedDraft);
    } catch (error) {
      console.error('Error updating course draft:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Publish a draft to make it live
  // This migrates all learner data from the original course to the draft, then promotes the draft
  app.post('/api/courses/:id/publish-draft', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id: originalCourseId } = req.params;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      // Get the original course
      const [originalCourse] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, originalCourseId))
        .limit(1);

      if (!originalCourse) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (originalCourse.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Get the draft course (which has sourceVersionCourseId pointing to original)
      let draft = await CourseVersioningService.getDraft(originalCourseId);
      let actualOriginalCourseId = originalCourseId;
      
      // Dual-ID resolution: if no draft found by sourceVersionCourseId,
      // check if the passed ID is itself a versioning draft
      if (!draft && originalCourse.status === 'draft' && originalCourse.sourceVersionCourseId) {
        // The passed ID IS the draft itself - use it and get the real original course ID
        draft = originalCourse;
        actualOriginalCourseId = originalCourse.sourceVersionCourseId;
        console.log(`[CourseRoutes] Dual-ID resolution: ${originalCourseId} is itself a versioning draft, original is ${actualOriginalCourseId}`);
      }
      
      if (!draft) {
        return res.status(404).json({ error: 'No draft exists for this course' });
      }

      // Validate the DRAFT course before publishing (not the original)
      const validation = await CourseService.validateCourseForPublish(draft.id, { skipAssignmentCheck: true });
      if (!validation.isValid) {
        return res.status(400).json({
          error: 'Course cannot be published',
          canPublish: false,
          errors: validation.errors,
          warnings: validation.warnings,
        });
      }

      // Get the clone mapping from the draft
      const cloneMapping = draft.cloneMapping as {
        originalCourseId: string;
        lessonIdMap: Record<string, string>;
        quizIdMap: Record<string, string>;
        quizCardIdMap: Record<string, string>;
        courseLessonIdMap: Record<string, string>;
        filesMap: Array<{ original: string; cloned: string }>;
        clonedAt: string;
      } | null;

      console.log(`[CourseRoutes] Publishing draft ${draft.id} for course ${actualOriginalCourseId}`);
      console.log(`[CourseRoutes] Clone mapping: ${cloneMapping ? `${Object.keys(cloneMapping.lessonIdMap).length} lessons, ${Object.keys(cloneMapping.quizIdMap).length} quizzes` : 'none'}`);

      // Defensive check: warn if cloneMapping is missing (indicates potential issue)
      if (!cloneMapping || !cloneMapping.lessonIdMap || !cloneMapping.quizIdMap) {
        console.warn(`[CourseRoutes] WARNING: cloneMapping is incomplete - lesson/quiz ID remapping may be skipped`);
      }

      // ===== MIGRATION: Move all learner references from ORIGINAL to DRAFT =====

      // 1. Migrate courseProgress records
      const progressMigrated = await db.update(courseProgress)
        .set({ courseId: draft.id })
        .where(eq(courseProgress.courseId, actualOriginalCourseId));
      console.log(`[CourseRoutes] Migrated course progress records to draft course`);

      // 2. Migrate coursePurchases records
      const purchasesMigrated = await db.update(coursePurchases)
        .set({ courseId: draft.id })
        .where(eq(coursePurchases.courseId, actualOriginalCourseId));
      console.log(`[CourseRoutes] Migrated course purchases records to draft course`);

      // 3. Migrate courseAssignments records
      const assignmentsMigrated = await db.update(courseAssignments)
        .set({ courseId: draft.id })
        .where(eq(courseAssignments.courseId, actualOriginalCourseId));
      console.log(`[CourseRoutes] Migrated course assignments records to draft course`);

      // 4. Migrate userCourseEnrollments records
      const enrollmentsMigrated = await db.update(userCourseEnrollments)
        .set({ courseId: draft.id })
        .where(eq(userCourseEnrollments.courseId, actualOriginalCourseId));
      console.log(`[CourseRoutes] Migrated user course enrollments records to draft course`);

      // 5. Migrate lessonProgress records using lessonIdMap
      if (cloneMapping && cloneMapping.lessonIdMap) {
        for (const [originalLessonId, clonedLessonId] of Object.entries(cloneMapping.lessonIdMap)) {
          await db.update(lessonProgress)
            .set({ lessonId: clonedLessonId })
            .where(eq(lessonProgress.lessonId, originalLessonId));
        }
        console.log(`[CourseRoutes] Migrated ${Object.keys(cloneMapping.lessonIdMap).length} lesson progress mappings`);
      }

      // 6. Migrate quizGameResults records using quizIdMap
      if (cloneMapping && cloneMapping.quizIdMap) {
        for (const [originalQuizId, clonedQuizId] of Object.entries(cloneMapping.quizIdMap)) {
          await db.update(quizGameResults)
            .set({ collectionId: clonedQuizId })
            .where(eq(quizGameResults.collectionId, originalQuizId));
        }
        console.log(`[CourseRoutes] Migrated ${Object.keys(cloneMapping.quizIdMap).length} quiz game results mappings`);
      }

      // 7. Migrate certificates (courseId)
      await db.update(certificates)
        .set({ courseId: draft.id })
        .where(eq(certificates.courseId, actualOriginalCourseId));
      console.log(`[CourseRoutes] Migrated certificates records`);

      // 8. Migrate userCourseLessonProgress (courseId and lessonId)
      await db.update(userCourseLessonProgress)
        .set({ courseId: draft.id })
        .where(eq(userCourseLessonProgress.courseId, actualOriginalCourseId));
      if (cloneMapping && cloneMapping.lessonIdMap) {
        for (const [originalLessonId, clonedLessonId] of Object.entries(cloneMapping.lessonIdMap)) {
          await db.update(userCourseLessonProgress)
            .set({ lessonId: clonedLessonId })
            .where(eq(userCourseLessonProgress.lessonId, originalLessonId));
        }
      }
      console.log(`[CourseRoutes] Migrated userCourseLessonProgress records`);

      // 9. Migrate courseReviews
      await db.update(courseReviews)
        .set({ courseId: draft.id })
        .where(eq(courseReviews.courseId, actualOriginalCourseId));
      console.log(`[CourseRoutes] Migrated courseReviews records`);

      // 10. Migrate quizGameProgress using quizIdMap
      if (cloneMapping && cloneMapping.quizIdMap) {
        for (const [originalQuizId, clonedQuizId] of Object.entries(cloneMapping.quizIdMap)) {
          await db.update(quizGameProgress)
            .set({ collectionId: clonedQuizId })
            .where(eq(quizGameProgress.collectionId, originalQuizId));
        }
        console.log(`[CourseRoutes] Migrated quizGameProgress records`);
      }

      // 11. Migrate userQuizProgress using quizIdMap
      if (cloneMapping && cloneMapping.quizIdMap) {
        for (const [originalQuizId, clonedQuizId] of Object.entries(cloneMapping.quizIdMap)) {
          await db.update(userQuizProgress)
            .set({ collectionId: clonedQuizId })
            .where(eq(userQuizProgress.collectionId, originalQuizId));
        }
        console.log(`[CourseRoutes] Migrated userQuizProgress records`);
      }

      // 12. Migrate gameResults using quizIdMap
      if (cloneMapping && cloneMapping.quizIdMap) {
        for (const [originalQuizId, clonedQuizId] of Object.entries(cloneMapping.quizIdMap)) {
          await db.update(gameResults)
            .set({ collectionId: clonedQuizId })
            .where(eq(gameResults.collectionId, originalQuizId));
        }
        console.log(`[CourseRoutes] Migrated gameResults records`);
      }

      // 13. Migrate creditTransactions (lessonId and quizId)
      if (cloneMapping && cloneMapping.lessonIdMap) {
        for (const [originalLessonId, clonedLessonId] of Object.entries(cloneMapping.lessonIdMap)) {
          await db.update(creditTransactions)
            .set({ lessonId: clonedLessonId })
            .where(eq(creditTransactions.lessonId, originalLessonId));
        }
      }
      if (cloneMapping && cloneMapping.quizIdMap) {
        for (const [originalQuizId, clonedQuizId] of Object.entries(cloneMapping.quizIdMap)) {
          await db.update(creditTransactions)
            .set({ quizId: clonedQuizId })
            .where(eq(creditTransactions.quizId, originalQuizId));
        }
      }
      console.log(`[CourseRoutes] Migrated creditTransactions records`);

      // 14. Migrate creditUsageLogs
      if (cloneMapping && cloneMapping.lessonIdMap) {
        for (const [originalLessonId, clonedLessonId] of Object.entries(cloneMapping.lessonIdMap)) {
          await db.update(creditUsageLogs)
            .set({ lessonId: clonedLessonId })
            .where(eq(creditUsageLogs.lessonId, originalLessonId));
        }
        console.log(`[CourseRoutes] Migrated creditUsageLogs records`);
      }

      // 16. Migrate gammaCreditLedger
      if (cloneMapping && cloneMapping.lessonIdMap) {
        for (const [originalLessonId, clonedLessonId] of Object.entries(cloneMapping.lessonIdMap)) {
          await db.update(gammaCreditLedger)
            .set({ lessonId: clonedLessonId })
            .where(eq(gammaCreditLedger.lessonId, originalLessonId));
        }
        console.log(`[CourseRoutes] Migrated gammaCreditLedger records`);
      }

      // 17. Migrate lessonAccessLogs
      if (cloneMapping && cloneMapping.lessonIdMap) {
        for (const [originalLessonId, clonedLessonId] of Object.entries(cloneMapping.lessonIdMap)) {
          await db.update(lessonAccessLogs)
            .set({ lessonId: clonedLessonId })
            .where(eq(lessonAccessLogs.lessonId, originalLessonId));
        }
        console.log(`[CourseRoutes] Migrated lessonAccessLogs records`);
      }

      // ===== CLEANUP: Delete original course object storage files =====
      if (cloneMapping && cloneMapping.filesMap && cloneMapping.filesMap.length > 0) {
        const originalFileKeys = cloneMapping.filesMap.map(f => f.original);
        await CourseVersioningService.cleanupFiles(originalFileKeys);
        console.log(`[CourseRoutes] Cleaned up ${originalFileKeys.length} original object storage files`);
      }

      // ===== DELETE ORIGINAL COURSE (cascading deletes handle lessons/quizzes) =====
      console.log(`[CourseRoutes] Deleting original course ${actualOriginalCourseId}`);
      await db.delete(courses).where(eq(courses.id, actualOriginalCourseId));

      // ===== PROMOTE DRAFT TO ACTIVE COURSE =====
      // Remove "[DRAFT] " prefix, set status to 'active', clear sourceVersionCourseId
      const cleanTitle = draft.title.replace(/^\[DRAFT\]\s*/, '');
      
      const [publishedCourse] = await db.update(courses)
        .set({
          title: cleanTitle,
          status: 'active',
          sourceVersionCourseId: null,
          cloneMapping: null, // Clear the mapping after successful migration
          updatedAt: new Date(),
        })
        .where(eq(courses.id, draft.id))
        .returning();

      console.log(`[CourseRoutes] Draft ${draft.id} published as active course with title "${cleanTitle}"`);

      res.json({
        course: publishedCourse,
        message: 'Draft published successfully. All learner progress has been migrated.',
        migrationStats: {
          lessonsRemapped: cloneMapping ? Object.keys(cloneMapping.lessonIdMap).length : 0,
          quizzesRemapped: cloneMapping ? Object.keys(cloneMapping.quizIdMap).length : 0,
        },
      });
    } catch (error) {
      console.error('Error publishing course draft:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Discard a draft without publishing
  app.delete('/api/courses/:id/draft', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const organizationId = getEffectiveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const [course] = await db
        .select()
        .from(schema.courses)
        .where(eq(schema.courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      let draft = await CourseVersioningService.getDraft(courseId);
      
      // Dual-ID resolution: if no draft found by sourceVersionCourseId,
      // check if the passed ID is itself a versioning draft
      if (!draft && course.status === 'draft' && course.sourceVersionCourseId) {
        // The passed ID IS the draft itself
        draft = course;
        console.log(`[CourseRoutes] Dual-ID resolution: ${courseId} is itself a versioning draft`);
      }
      
      if (!draft) {
        return res.status(404).json({ error: 'No draft exists for this course' });
      }

      await CourseVersioningService.discardDraft(draft.id);

      res.json({ success: true });
    } catch (error) {
      console.error('Error discarding course draft:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== COURSE ASSIGNMENT ROUTES ====================

  app.post("/api/course-assignments", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session, { courseId: req.body.courseId });
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const rawTargets = Array.isArray(req.body.targets) ? req.body.targets : null;
      const payloads = rawTargets && rawTargets.length > 0
        ? rawTargets.map((target: any) => ({ ...req.body, ...target }))
        : [req.body];

      const seenTargetKeys = new Set<string>();
      const dedupedPayloads = payloads.filter((payload: any) => {
        const key = [
          payload.courseId,
          payload.targetOrganizationId || '',
          payload.assignmentScope || '',
          payload.unitId || '',
          payload.subjectId || '',
          payload.subUnitId || '',
          payload.teamId || '',
          payload.userId || '',
          payload.audience || '',
        ].join('::');
        if (seenTargetKeys.has(key)) return false;
        seenTargetKeys.add(key);
        return true;
      });

      const assignments: any[] = [];
      let autoPublishedAny = false;

      for (const payload of dedupedPayloads) {
        const { courseId, autoPublish = true, targetOrganizationId: bodyTargetOrgId } = payload;
        if (!courseId) {
          return res.status(400).json({ error: "courseId is required" });
        }

        if (bodyTargetOrgId && isOnPremMode()) {
          const autoPublish = payload.autoPublish !== false;
          const course = await db.query.courses.findFirst({
            where: eq(schema.courses.id, courseId),
          });
          if (!course) return res.status(404).json({ error: "Course not found" });
          if (course.visibility !== 'public') return res.status(403).json({ error: "Only public courses can be assigned cross-org" });
          if (course.status !== 'active' && !autoPublish) return res.status(400).json({ error: "Course must be published" });

          if (autoPublish) {
            const publishResult = await CourseService.publishCourse(courseId, course.organizationId, { skipAssignmentCheck: true });
            if (!publishResult.success) {
              return res.status(400).json({
                error: "Failed to publish course before cross-org assignment",
                validation: publishResult.validation,
              });
            }
          }

          const [rule] = await db.select().from(interOrgCourseAssignmentRules)
            .where(and(
              eq(interOrgCourseAssignmentRules.sourceOrganizationId, course.organizationId),
              eq(interOrgCourseAssignmentRules.targetOrganizationId, bodyTargetOrgId),
              eq(interOrgCourseAssignmentRules.enabled, true)
            ));
          if (!rule) return res.status(403).json({ error: "No active inter-org rule for this assignment" });

          const parseResult = insertCourseAssignmentSchema.safeParse({
            ...payload,
            organizationId: course.organizationId,
            targetOrganizationId: bodyTargetOrgId,
            assignedBy: userId,
          });

          if (!parseResult.success) {
            return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
          }

          const assignment = await CourseAssignmentService.upsertCourseAssignment(parseResult.data);
          assignments.push({ ...assignment, autoPublished: false });
          continue;
        }

        const course = await db.query.courses.findFirst({
          where: and(
            eq(schema.courses.id, courseId),
            eq(schema.courses.organizationId, organizationId)
          ),
        });

        if (!course) {
          return res.status(404).json({ error: "Course not found" });
        }

        let autoPublished = false;
        let shouldRepublishAfterAssignment = autoPublish;
        if (course.status !== 'active' && autoPublish) {
          const validation = await CourseService.validateCourseForPublish(courseId, { skipAssignmentCheck: true });

          if (!validation.isValid) {
            return res.status(400).json({
              error: "Course cannot be assigned because it is not published and has validation errors",
              validation: {
                isValid: false,
                errors: validation.errors,
                warnings: validation.warnings,
                lessonDetails: validation.lessonDetails,
              },
              message: "Please fix the following issues before assigning: " + validation.errors.join("; "),
            });
          }

          const publishResult = await CourseService.publishCourse(courseId, organizationId, { skipAssignmentCheck: true });
          if (publishResult.success) {
            autoPublished = true;
            autoPublishedAny = true;
            shouldRepublishAfterAssignment = false;
            console.log(`[CourseAssignments] Auto-published course ${courseId} during assignment`);
          } else {
            return res.status(400).json({
              error: "Failed to auto-publish course",
              validation: publishResult.validation,
            });
          }
        } else if (course.status !== 'active' && !autoPublish) {
          return res.status(400).json({
            error: "Course must be published before it can be assigned",
            courseStatus: course.status,
          });
        }

        const parseResult = insertCourseAssignmentSchema.safeParse({
          ...payload,
          organizationId,
          assignedBy: userId,
        });

        if (!parseResult.success) {
          return res.status(400).json({ error: "Invalid request data", details: parseResult.error.errors });
        }

        const assignment = await CourseAssignmentService.upsertCourseAssignment(parseResult.data);
        const linkedLessons = await db
          .select({ lessonId: schema.courseLessons.lessonId })
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.courseId, parseResult.data.courseId));

        if (linkedLessons.length > 0) {
          const lessonIds = linkedLessons.map(l => l.lessonId);
          await db
            .update(schema.lessons)
            .set({ isPublished: true })
            .where(inArray(schema.lessons.id, lessonIds));
        }

        if (shouldRepublishAfterAssignment) {
          const publishResult = await CourseService.publishCourse(courseId, organizationId, { skipAssignmentCheck: true });
          if (!publishResult.success) {
            return res.status(400).json({
              error: "Failed to publish latest course changes after assignment",
              validation: publishResult.validation,
            });
          }
          autoPublished = true;
          autoPublishedAny = true;
        }

        assignments.push({ ...assignment, autoPublished });
      }

      if (assignments.length === 1 && (!rawTargets || rawTargets.length <= 1)) {
        return res.status(201).json(assignments[0]);
      }

      return res.status(201).json({
        created: assignments.length,
        duplicateTargetsSkipped: payloads.length - dedupedPayloads.length,
        autoPublished: autoPublishedAny,
        assignments,
      });
    } catch (error: any) {
      console.error("[CourseAssignments] Error creating assignment:", error);
      res.status(500).json({ error: error.message || "Failed to create course assignment" });
    }
  });

  app.get("/api/course-assignments", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const assignments = await CourseAssignmentService.getCourseAssignmentsForOrgEnriched(organizationId);
      res.json(assignments);
    } catch (error: any) {
      console.error("[CourseAssignments] Error getting assignments:", error);
      res.status(500).json({ error: error.message || "Failed to get course assignments" });
    }
  });

  app.get("/api/course-assignments/user/:userId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const currentUserId = req.session.userId;
      if (!currentUserId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const { userId } = req.params;

      if (currentUserId !== userId) {
        const orgRoles = await storage.getUserRoles(currentUserId, organizationId);
        const hasAdminAccess = orgRoles.some((r: any) => 
          ADMIN_ROLES.includes(r.role) || INSTRUCTOR_ROLES.includes(r.role)
        );
        if (!hasAdminAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const assignments = await CourseAssignmentService.getCourseAssignmentsForUser(userId, organizationId);
      res.json(assignments);
    } catch (error: any) {
      console.error("[CourseAssignments] Error getting user assignments:", error);
      res.status(500).json({ error: error.message || "Failed to get user course assignments" });
    }
  });

  app.get("/api/course-assignments/course/:courseId", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session, { courseId: req.params.courseId });
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const { courseId } = req.params;

      const assignments = await CourseAssignmentService.getCourseAssignmentsForCourse(courseId, organizationId);
      res.json(assignments);
    } catch (error: any) {
      console.error("[CourseAssignments] Error getting course assignments:", error);
      res.status(500).json({ error: error.message || "Failed to get course assignments" });
    }
  });

  app.patch("/api/course-assignments/:id", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session, { assignmentId: req.params.id });
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const { id } = req.params;
      const updates = req.body;

      const updated = await CourseAssignmentService.updateCourseAssignment(id, organizationId, updates as any);

      if (!updated) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      res.json(updated);
    } catch (error: any) {
      console.error("[CourseAssignments] Error updating assignment:", error);
      res.status(500).json({ error: error.message || "Failed to update course assignment" });
    }
  });

  app.delete("/api/course-assignments/:id", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session, { assignmentId: req.params.id });
      if (!organizationId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const { id } = req.params;
      const deleted = await CourseAssignmentService.deleteCourseAssignment(id, organizationId);

      if (!deleted) {
        return res.status(404).json({ error: "Assignment not found" });
      }

      res.json({ success: true });
    } catch (error: any) {
      console.error("[CourseAssignments] Error deleting assignment:", error);
      res.status(500).json({ error: error.message || "Failed to delete course assignment" });
    }
  });

  app.get("/api/interorg/target-orgs", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      if (!isOnPremMode()) return res.status(404).json({ error: "Not available" });

      const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
      const userOrgId = await resolveInterOrgSourceOrganizationId(req, courseId);
      if (!userOrgId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const rules = await db
        .select({
          ruleId: interOrgCourseAssignmentRules.id,
          id: interOrgCourseAssignmentRules.targetOrganizationId,
          name: schema.organizations.name,
        })
        .from(interOrgCourseAssignmentRules)
        .innerJoin(schema.organizations, eq(interOrgCourseAssignmentRules.targetOrganizationId, schema.organizations.id))
        .where(and(
          eq(interOrgCourseAssignmentRules.sourceOrganizationId, userOrgId),
          eq(interOrgCourseAssignmentRules.enabled, true)
        ));

      res.json(rules);
    } catch (error: any) {
      console.error("[InterOrg] Error fetching target orgs:", error);
      res.status(500).json({ error: error.message || "Failed to fetch target orgs" });
    }
  });

  app.get("/api/interorg/target-orgs/:orgId/hierarchy", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      if (!isOnPremMode()) return res.status(404).json({ error: "Not available" });

      const courseId = typeof req.query.courseId === "string" ? req.query.courseId : undefined;
      const userOrgId = await resolveInterOrgSourceOrganizationId(req, courseId);
      if (!userOrgId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const { orgId } = req.params;

      const [rule] = await db
        .select()
        .from(interOrgCourseAssignmentRules)
        .where(and(
          eq(interOrgCourseAssignmentRules.sourceOrganizationId, userOrgId),
          eq(interOrgCourseAssignmentRules.targetOrganizationId, orgId),
          eq(interOrgCourseAssignmentRules.enabled, true)
        ));

      if (!rule) {
        return res.status(403).json({ error: "No active inter-org rule for this organization" });
      }

      const units = await db
        .select({ id: schema.organizationUnits.id, name: schema.organizationUnits.name })
        .from(schema.organizationUnits)
        .where(eq(schema.organizationUnits.organizationId, orgId));

      const unitIds = units.map(u => u.id);

      let subUnits: { id: string; name: string; unitId: string | null }[] = [];
      if (unitIds.length > 0) {
        subUnits = await db
          .select({ id: schema.organizationSubUnits.id, name: schema.organizationSubUnits.name, unitId: schema.organizationSubUnits.unitId })
          .from(schema.organizationSubUnits)
          .where(inArray(schema.organizationSubUnits.unitId, unitIds));
      }

      const subUnitIds = subUnits.map(s => s.id);

      let teams: { id: string; name: string; subUnitId: string | null }[] = [];
      if (subUnitIds.length > 0) {
        teams = await db
          .select({ id: schema.organizationTeams.id, name: schema.organizationTeams.name, subUnitId: schema.organizationTeams.subUnitId })
          .from(schema.organizationTeams)
          .where(inArray(schema.organizationTeams.subUnitId, subUnitIds));
      }

      const hierarchy = units.map(unit => ({
        id: unit.id,
        name: unit.name,
        subUnits: subUnits
          .filter(s => s.unitId === unit.id)
          .map(sub => ({
            id: sub.id,
            name: sub.name,
            teams: teams
              .filter(t => t.subUnitId === sub.id)
              .map(t => ({ id: t.id, name: t.name })),
          })),
      }));

      res.json({ units: hierarchy });
    } catch (error: any) {
      console.error("[InterOrg] Error fetching hierarchy:", error);
      res.status(500).json({ error: error.message || "Failed to fetch organization hierarchy" });
    }
  });

  app.get("/api/interorg/my-public-courses", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      if (!isOnPremMode()) return res.status(404).json({ error: "Not available" });

      const userOrgId = await resolveOrganizationId(req.session);
      if (!userOrgId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const result = await db
        .select({
          id: courses.id,
          title: courses.title,
          description: courses.description,
          thumbnailUrl: courses.thumbnailUrl,
          status: courses.status,
          visibility: courses.visibility,
        })
        .from(courses)
        .where(and(
          eq(courses.organizationId, userOrgId),
          eq(courses.status, "active"),
          eq(courses.visibility, "public")
        ));

      res.json(result);
    } catch (error: any) {
      console.error("[InterOrg] Error fetching public courses:", error);
      res.status(500).json({ error: error.message || "Failed to fetch public courses" });
    }
  });

  app.get("/api/interorg/target-orgs/:orgId/scope-courses", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      if (!isOnPremMode()) return res.status(404).json({ error: "Not available" });

      const userOrgId = await resolveOrganizationId(req.session);
      if (!userOrgId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const { orgId } = req.params;
      const { scopeType, scopeId } = req.query;

      if (!scopeType || !scopeId || typeof scopeType !== "string" || typeof scopeId !== "string") {
        return res.status(400).json({ error: "scopeType and scopeId query parameters are required" });
      }

      if (!["organization", "org", "department", "unit", "team"].includes(scopeType)) {
        return res.status(400).json({ error: "scopeType must be one of: organization, department, unit, team" });
      }

      const [rule] = await db
        .select()
        .from(interOrgCourseAssignmentRules)
        .where(and(
          eq(interOrgCourseAssignmentRules.sourceOrganizationId, userOrgId),
          eq(interOrgCourseAssignmentRules.targetOrganizationId, orgId),
          eq(interOrgCourseAssignmentRules.enabled, true)
        ));

      if (!rule) {
        return res.status(403).json({ error: "No active inter-org rule for this organization" });
      }

      let scopeCondition;
      if (scopeType === "organization" || scopeType === "org") {
        scopeCondition = or(
          eq(courseAssignments.assignmentScope, 'organization'),
          and(
            isNull(courseAssignments.unitId),
            isNull(courseAssignments.subUnitId),
            isNull(courseAssignments.teamId),
            isNull(courseAssignments.userId)
          )
        );
      } else if (scopeType === "department") {
        scopeCondition = eq(courseAssignments.unitId, scopeId);
      } else if (scopeType === "unit") {
        scopeCondition = eq(courseAssignments.subUnitId, scopeId);
      } else {
        scopeCondition = eq(courseAssignments.teamId, scopeId);
      }

      const rows = await db
        .select({
          assignmentId: courseAssignments.id,
          dueDate: courseAssignments.dueDate,
          mandatory: courseAssignments.mandatory,
          courseId: courses.id,
          courseTitle: courses.title,
          courseDescription: courses.description,
          courseThumbnailUrl: courses.thumbnailUrl,
          courseStatus: courses.status,
        })
        .from(courseAssignments)
        .innerJoin(courses, eq(courseAssignments.courseId, courses.id))
        .where(and(
          eq(courseAssignments.organizationId, userOrgId),
          eq(courseAssignments.targetOrganizationId, orgId),
          scopeCondition
        ));

      const result = rows.map(row => ({
        course: {
          id: row.courseId,
          title: row.courseTitle,
          description: row.courseDescription,
          thumbnailUrl: row.courseThumbnailUrl,
          status: row.courseStatus,
        },
        assignment: {
          id: row.assignmentId,
          dueDate: row.dueDate,
          mandatory: row.mandatory,
        },
      }));

      res.json({ courses: result });
    } catch (error: any) {
      console.error("[InterOrg] Error fetching scope courses:", error);
      res.status(500).json({ error: error.message || "Failed to fetch scope courses" });
    }
  });

  // ==================== COURSE PROGRESS ROUTES ====================

  app.get("/api/course-progress/:courseId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session, { courseId: req.params.courseId });
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const { courseId } = req.params;
      const progress = await CourseAssignmentService.getCourseProgress(userId, courseId, organizationId);
      res.json(progress);
    } catch (error: any) {
      console.error("[CourseProgress] Error getting course progress:", error);
      res.status(500).json({ error: error.message || "Failed to get course progress" });
    }
  });

  app.get("/api/my-assigned-courses", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const organizationId = await resolveOrganizationId(req.session);
      if (!organizationId) {
        return res.status(400).json({ error: "Organization context required" });
      }

      const coursesWithProgress = await CourseAssignmentService.getAssignedCoursesWithProgress(userId, organizationId);
      
      const preferredLanguage = await ContentLanguageService.resolveLanguage(userId, organizationId);
      
      const languageResolvedCourses = await Promise.all(coursesWithProgress.map(async (item: any) => {
        const courseData = item.course;
        if (!courseData) return item;
        
        const [courseRecord] = await db
          .select({ contentGroupId: courses.contentGroupId, languageCode: courses.languageCode })
          .from(courses)
          .where(eq(courses.id, courseData.id))
          .limit(1);
        
        if (!courseRecord?.contentGroupId) return item;
        
        if (courseRecord.languageCode === preferredLanguage) return item;
        
        const preferred = await ContentLanguageService.resolveCourseByLanguage(
          courseRecord.contentGroupId, 
          preferredLanguage
        );
        
        if (!preferred || preferred.id === courseData.id) return item;
        
        const [preferredCourse] = await db
          .select({
            id: courses.id,
            title: courses.title,
            description: courses.description,
            thumbnailUrl: courses.thumbnailUrl,
            price: courses.price,
            currency: courses.currency,
            status: courses.status,
            difficultyLevel: courses.difficultyLevel,
            estimatedDuration: courses.estimatedDuration,
          })
          .from(courses)
          .where(and(eq(courses.id, preferred.id), eq(courses.status, 'active')))
          .limit(1);
        
        if (!preferredCourse) return item;
        
        return {
          ...item,
          course: {
            ...courseData,
            ...preferredCourse,
          },
        };
      }));

      const objectStorageService = new ObjectStorageService();
      const enrichedCourses = await Promise.all(languageResolvedCourses.map(async (item: any) => {
        let thumbnailSignedUrl: string | undefined;
        const thumbnailPath = item.course?.thumbnailUrl;
        
        if (thumbnailPath) {
          try {
            thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
              thumbnailPath,
              3600
            );
          } catch (error) {
            console.error(`[Assigned Courses] Failed to get signed URL for thumbnail: ${thumbnailPath}`, error);
          }
        }
        
        return {
          ...item,
          course: {
            ...item.course,
            thumbnailSignedUrl,
          },
        };
      }));
      
      const orgIds = [...new Set(enrichedCourses.map((item: any) => item.course?.organizationId).filter(Boolean))];
      let orgNameMap = new Map<string, { name: string; logoUrl: string | null }>();
      if (orgIds.length > 0) {
        const orgsWithBranding = await db
          .select({
            id: schema.organizations.id,
            name: schema.organizations.name,
            logoUrl: schema.brandingThemes.logoUrl,
          })
          .from(schema.organizations)
          .leftJoin(schema.brandingThemes, eq(schema.brandingThemes.organizationId, schema.organizations.id))
          .where(inArray(schema.organizations.id, orgIds));
        for (const org of orgsWithBranding) {
          orgNameMap.set(org.id, { name: org.name, logoUrl: org.logoUrl || null });
        }
      }

      const finalCourses = enrichedCourses.map((item: any) => {
        const orgInfo = item.course?.organizationId ? orgNameMap.get(item.course.organizationId) : null;
        return {
          ...item,
          course: {
            ...item.course,
            organizationName: orgInfo?.name || null,
            organizationLogoUrl: orgInfo?.logoUrl || null,
          },
        };
      });
      
      res.json(finalCourses);
    } catch (error: any) {
      console.error("[CourseAssignments] Error getting assigned courses:", error);
      res.status(500).json({ error: error.message || "Failed to get assigned courses" });
    }
  });

  // ==================== COURSE-LESSON LINKING ROUTES ====================

  app.post('/api/courses/:courseId/lessons/:lessonId', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId, lessonId } = req.params;
      const digestVersionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const digestLanguageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const { topicName, topicOrder, replacePreviousLessonId, topicId } = req.body;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      let organizationId: string | undefined;
      if (req.session.context) {
        organizationId = req.session.context.impersonatedOrganization?.orgId || req.session.context.primaryOrganization?.orgId;
        if (!organizationId && req.session.context.organizations?.length) {
          organizationId = req.session.context.organizations[0].orgId;
        }
      }
      
      if (!organizationId) {
        const userRoles = await storage.getUserRoles(userId);
        organizationId = userRoles.find(r => ALL_STAFF_ROLES.includes(r.role))?.organizationId;
      }

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const linkedLesson = await CourseService.linkLessonToCourse(
        courseId,
        lessonId,
        topicName,
        topicOrder,
        organizationId,
        replacePreviousLessonId,
        topicId
      );

      res.json(linkedLesson);
    } catch (error) {
      const errorMessage = (error as Error).message;
      
      if (errorMessage.startsWith('FRAMEWORK_MISSING:')) {
        return res.status(400).json({ 
          error: 'Course framework not found. Please create course topics first using the AI wizard.' 
        });
      }
      
      if (errorMessage.startsWith('TOPIC_NOT_FOUND:')) {
        return res.status(400).json({ 
          error: errorMessage.replace('TOPIC_NOT_FOUND: ', '') 
        });
      }
      
      console.error('Error linking lesson to course:', error);
      res.status(500).json({ error: 'Failed to link lesson to course' });
    }
  });

  app.delete('/api/courses/:courseId/lessons/:lessonId', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const paramsValidation = unlinkLessonParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        return sendError(
          res,
          400,
          paramsValidation.error.errors.map(e => e.message).join(', '),
          ErrorCode.VALIDATION_ERROR
        );
      }
      
      const { courseId, lessonId } = paramsValidation.data;

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const result = await CourseLessonService.unlinkLesson(courseId, lessonId, organizationId);
      res.json(result);
    } catch (error) {
      console.error('Error unlinking lesson from course:', error);
      const message = (error as Error).message || 'Failed to unlink lesson from course';
      if (message.includes('cannot be removed from a course')) {
        return res.status(400).json({ error: message });
      }
      res.status(500).json({ error: message });
    }
  });

  app.patch('/api/courses/:courseId/lessons/:lessonId/type', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId, lessonId } = req.params;
      const lessonType = String(req.body?.lessonType || '').trim().toLowerCase();

      if (!['overview', 'content', 'key_takeaways'].includes(lessonType)) {
        return res.status(400).json({ error: 'lessonType must be overview, content, or key_takeaways' });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const course = await db.query.courses.findFirst({
        where: and(eq(schema.courses.id, courseId), eq(schema.courses.organizationId, organizationId)),
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      let existingLink = await db.query.courseLessons.findFirst({
        where: and(eq(courseLessons.courseId, courseId), eq(courseLessons.lessonId, lessonId)),
      });

      const frameworkForLinkRepair = await db.query.courseFrameworks.findFirst({
        where: eq(courseFrameworks.courseId, courseId),
      });
      const frameworkTopicsForLinkRepair = frameworkForLinkRepair && Array.isArray(frameworkForLinkRepair.topics)
        ? [...(frameworkForLinkRepair.topics as any[])]
        : [];
      const matchingFrameworkTopic = frameworkTopicsForLinkRepair.find((topic: any) => String(topic?.lessonId || '') === lessonId);

      if (!existingLink && matchingFrameworkTopic) {
        const [repairedLink] = await db.insert(courseLessons)
          .values({
            courseId,
            lessonId,
            topicId: matchingFrameworkTopic.id || null,
            topicName: matchingFrameworkTopic.name || '',
            topicOrder: Number(matchingFrameworkTopic.order || 0),
            lessonType: 'content',
          })
          .returning();
        existingLink = repairedLink;
      }

      if (!existingLink) {
        return res.status(404).json({ error: 'Lesson is not linked to this course' });
      }

      const result = await db.transaction(async (tx) => {
        if (lessonType === 'overview' || lessonType === 'key_takeaways') {
          await tx.update(courseLessons)
            .set({ lessonType: 'content' })
            .where(and(eq(courseLessons.courseId, courseId), eq(courseLessons.lessonType, lessonType)));
        }

        const [updatedLink] = await tx.update(courseLessons)
          .set({ lessonType })
          .where(and(eq(courseLessons.courseId, courseId), eq(courseLessons.lessonId, lessonId)))
          .returning();

        const framework = frameworkForLinkRepair
          ? await tx.query.courseFrameworks.findFirst({ where: eq(courseFrameworks.id, frameworkForLinkRepair.id) })
          : await tx.query.courseFrameworks.findFirst({ where: eq(courseFrameworks.courseId, courseId) });

        if (framework) {
          const topics = Array.isArray(framework.topics) ? [...(framework.topics as any[])] : [];
          const updatedTopics = topics.map((topic: any) => {
            const topicLessonId = String(topic?.lessonId || '').trim();
            const topicOrder = Number(topic?.order);
            const isTarget = topicLessonId === lessonId || topicOrder === Number(existingLink.topicOrder);
            const isSameStructuralType = lessonType !== 'content' && String(topic?.lessonType || '').toLowerCase() === lessonType;

            if (isSameStructuralType && !isTarget) {
              return {
                ...topic,
                lessonType: 'content',
                isOverview: false,
              };
            }

            if (isTarget) {
              return {
                ...topic,
                lessonType,
                isOverview: lessonType === 'overview',
              };
            }

            return topic;
          });

          await tx.update(courseFrameworks)
            .set({ topics: updatedTopics as any, updatedAt: new Date() })
            .where(eq(courseFrameworks.id, framework.id));
        }

        return updatedLink;
      });

      res.json({ success: true, lessonType, courseLesson: result });
    } catch (error) {
      console.error('Error updating course lesson type:', error);
      res.status(500).json({ error: (error as Error).message || 'Failed to update course lesson type' });
    }
  });

  app.post('/api/courses/:courseId/lessons/:lessonId/relink', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const paramsValidation = relinkLessonParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        return sendError(
          res,
          400,
          paramsValidation.error.errors.map(e => e.message).join(', '),
          ErrorCode.VALIDATION_ERROR
        );
      }
      
      const bodyValidation = relinkLessonBodySchema.safeParse(req.body);
      if (!bodyValidation.success) {
        return sendError(
          res,
          400,
          bodyValidation.error.errors.map(e => e.message).join(', '),
          ErrorCode.VALIDATION_ERROR
        );
      }
      
      const { courseId, lessonId } = paramsValidation.data;
      const { orderOverride } = bodyValidation.data;

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const result = await CourseLessonService.relinkLesson(courseId, lessonId, organizationId, orderOverride);
      res.json(result);
    } catch (error) {
      console.error('Error relinking lesson to course:', error);
      res.status(500).json({ error: (error as Error).message || 'Failed to relink lesson to course' });
    }
  });

  app.get('/api/courses/:courseId/relinkable-lessons', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const paramsValidation = relinkableLessonsParamsSchema.safeParse(req.params);
      if (!paramsValidation.success) {
        return sendError(
          res,
          400,
          paramsValidation.error.errors.map(e => e.message).join(', '),
          ErrorCode.VALIDATION_ERROR
        );
      }
      
      const { courseId } = paramsValidation.data;

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'Organization not found' });
      }

      const lessonsData = await CourseLessonService.getRelinkableLessons(courseId, organizationId);
      res.json({ lessons: lessonsData });
    } catch (error) {
      console.error('Error getting relinkable lessons:', error);
      res.status(500).json({ error: (error as Error).message || 'Failed to get relinkable lessons' });
    }
  });

  // ==================== COURSE FRAMEWORK ROUTES ====================

  app.get('/api/courses/:id/framework', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;

      const framework = await CourseService.getCourseFramework(courseId);

      if (!framework) {
        return res.status(404).json({ error: 'Course framework not found' });
      }

      res.json(framework);
    } catch (error) {
      console.error('Error getting course framework:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/courses/:courseId/framework/topics', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const name = String(req.body?.name || '').trim();
      const description = String(req.body?.description || '').trim();
      const createEmptyLesson = req.body?.createEmptyLesson === true;
      const normalizedName = name.toLowerCase();

      if (!name) {
        return res.status(400).json({ error: 'Topic name is required' });
      }
      if (normalizedName.includes('overview') || normalizedName.includes('takeaway')) {
        return res.status(400).json({
          error: 'Overview and key takeaways are structural lessons and cannot be added manually',
        });
      }

      const course = await db.query.courses.findFirst({
        where: eq(schema.courses.id, courseId),
      });
      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const effectiveOrgId = getEffectiveOrganizationId(req.session);
      if (course.organizationId !== effectiveOrgId) {
        return res.status(403).json({ error: 'You do not have permission to edit this course' });
      }

      if (createEmptyLesson) {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: 'Authentication required' });
        }

        const result = await CourseService.createEmptyLessonTopic({
          courseId,
          organizationId: effectiveOrgId,
          userId,
          name,
          description,
        });

        return res.status(201).json({
          success: true,
          topic: result.topic,
          lesson: result.lesson,
        });
      }

      const framework = await CourseService.getCourseFramework(courseId);
      if (!framework) {
        return res.status(404).json({ error: 'Course framework not found' });
      }

      const topics = Array.isArray(framework.topics) ? [...framework.topics as any[]] : [];
      topics.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));

      const keyTakeawaysIndex = topics.findIndex((topic: any) => {
        const lessonType = String(topic.lessonType || '').toLowerCase();
        const topicName = String(topic.name || '').toLowerCase();
        return lessonType === 'key_takeaways' || topicName.includes('key takeaway');
      });
      const insertOrder = keyTakeawaysIndex >= 0 ? keyTakeawaysIndex : topics.length;

      const newTopic = {
        id: randomUUID(),
        order: insertOrder,
        name,
        description,
        detailedSummary: '',
        isOverview: false,
        lessonType: 'content',
        userEditedName: true,
        userEditedDescription: description.length > 0,
        lessonId: null,
        learningObjectives: [],
        prerequisiteTopicIds: [],
        keyTerms: [],
        assessmentIdeas: [],
        estimatedDurationMinutes: undefined,
        sourceContent: '',
        sourceDocumentId: null,
        sourceSummary: '',
      };

      const baseIndexedTopics = topics.map((topic: any, idx: number) => ({ ...topic, order: idx }));
      const reindexedTopics = baseIndexedTopics.map((topic: any) => {
        if (topic.order >= insertOrder) {
          return { ...topic, order: topic.order + 1 };
        }
        return topic;
      });
      reindexedTopics.push(newTopic);
      reindexedTopics.sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));

      await db.update(courseFrameworks)
        .set({ topics: reindexedTopics as any })
        .where(eq(courseFrameworks.courseId, courseId));

      res.status(201).json({
        success: true,
        topic: newTopic,
      });
    } catch (error) {
      console.error('Error creating framework topic:', error);
      res.status(500).json({ error: (error as Error).message || 'Failed to create topic' });
    }
  });

  app.patch('/api/courses/:courseId/framework/reorder', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const { topicId, newOrder } = req.body;

      if (!topicId || typeof newOrder !== 'number') {
        return res.status(400).json({ error: 'topicId and newOrder are required' });
      }

      const course = await db.query.courses.findFirst({
        where: eq(schema.courses.id, courseId),
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      const effectiveOrgId = getEffectiveOrganizationId(req.session);
      
      if (course.organizationId !== effectiveOrgId) {
        return res.status(403).json({ error: 'You do not have permission to edit this course' });
      }

      const framework = await CourseService.getCourseFramework(courseId);
      
      if (!framework) {
        return res.status(404).json({ error: 'Course framework not found' });
      }

      const topics = (framework.topics || []) as Array<{ id?: string; order: number; name: string; lessonId: string | null; description?: string; lessonType?: string; isOverview?: boolean }>;

      const orderMatch = topicId.match(/^order:(\d+)$/);
      const orderToFind = orderMatch ? parseInt(orderMatch[1], 10) : null;
      
      const topicIndex = topics.findIndex(t => 
        t.id === topicId || 
        t.lessonId === topicId || 
        (orderToFind !== null && t.order === orderToFind)
      );
      
      if (topicIndex === -1) {
        return res.status(404).json({ error: 'Topic not found' });
      }

      const topic = topics[topicIndex];
      const oldOrder = topic.order;

      if (newOrder < 0 || newOrder >= topics.length) {
        return res.status(400).json({ error: `newOrder must be between 0 and ${topics.length - 1}`});
      }

      if (oldOrder === newOrder) {
        return res.json(framework);
      }

      topics.splice(topicIndex, 1);
      topics.splice(newOrder, 0, topic);
      
      topics.forEach((t, index) => {
        t.order = index;
      });

      await db.transaction(async (tx) => {
        await tx.update(schema.courseFrameworks)
          .set({
            topics: topics,
            updatedAt: new Date(),
          })
          .where(eq(schema.courseFrameworks.courseId, courseId));

        for (const t of topics) {
          if (!t.lessonId) continue;
          const topicLessonType = String((t as any).lessonType || '').toLowerCase();
          const lessonType: 'overview' | 'content' | 'key_takeaways' =
            topicLessonType === 'overview' || (t as any).isOverview === true
              ? 'overview'
              : topicLessonType === 'key_takeaways'
                ? 'key_takeaways'
                : 'content';
          await tx.update(courseLessons)
            .set({
              topicId: t.id || null,
              topicName: t.name,
              topicOrder: t.order,
              lessonType,
            })
            .where(and(eq(courseLessons.courseId, courseId), eq(courseLessons.lessonId, t.lessonId)));
        }
      });

      const updatedFramework = await CourseService.getCourseFramework(courseId);
      
      console.log(`[CourseFramework] Reordered topic ${topicId} in course ${courseId} from position ${oldOrder} to ${newOrder}`);
      
      res.json(updatedFramework);
    } catch (error) {
      console.error('Error reordering course framework:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/courses/:courseId/lessons/:lessonId/complete', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { courseId, lessonId } = req.params;
      const userId = req.session.user.id;

      const enrollment = await db.query.userCourseEnrollments.findFirst({
        where: and(
          eq(schema.userCourseEnrollments.userId, userId),
          eq(schema.userCourseEnrollments.courseId, courseId)
        ),
      });

      if (!enrollment) {
        return res.status(403).json({ error: 'User does not have access to this course' });
      }

      await CourseService.markLessonComplete(userId, courseId, lessonId);

      res.json({ success: true, message: 'Lesson marked as complete' });
    } catch (error) {
      console.error('Error marking lesson complete:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/courses/:courseId/quizzes', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;

      const { QuizCourseLinkerService } = await import('../services/quizCourseLinkerService');

      const quizzes = await QuizCourseLinkerService.getCourseQuizzes(courseId);

      res.json(quizzes);
    } catch (error) {
      console.error('Error getting course quizzes:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== DEMO LESSON ROUTES ====================

  app.get('/api/courses/:id/demo-lesson', async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const user = req.session.user;

      if (user) {
        const enrollment = await db.query.userCourseEnrollments.findFirst({
          where: and(
            eq(schema.userCourseEnrollments.userId, user.id),
            eq(schema.userCourseEnrollments.courseId, courseId)
          ),
        });

        if (enrollment) {
          return res.json({ hasPurchased: true, message: 'User has full access to course' });
        }
      }

      const demoLesson = await CourseService.getDemoLesson(courseId);

      if (!demoLesson) {
        return res.status(404).json({ error: 'No demo lesson available for this course' });
      }

      res.json({ hasPurchased: false, lesson: demoLesson });
    } catch (error) {
      console.error('Error getting demo lesson:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get('/api/courses/:courseId/lessons/:lessonId/demo', async (req: Request, res: Response) => {
    try {
      const { courseId, lessonId } = req.params;
      const digestVersionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const digestLanguageCode = req.query.languageCode ? String(req.query.languageCode).trim().toLowerCase() : undefined;
      const stepGuideVersionId = req.query.stepGuideVersionId ? String(req.query.stepGuideVersionId) : undefined;

      const course = await db.query.courses.findFirst({
        where: and(
          eq(schema.courses.id, courseId),
          eq(schema.courses.status, 'active')
        ),
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found or not published' });
      }

      const demoLesson = await CourseService.getDemoLesson(courseId);
      
      if (!demoLesson || demoLesson.id !== lessonId) {
        return res.status(403).json({ error: 'Only the first lesson is available as a demo' });
      }

      const lesson = await LessonService.getLessonById(lessonId, course.organizationId);
      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      let viewerUrl = null;
      let podcastUrl: string | null = null;
      let podcastState: any = null;
      let lessonDigest: any = null;
      let stepByStepGuide: any = null;
      let pptxUrl: string | null = null;
      let isLocalPptx: boolean = false;
      let conversionPending: boolean = false;
      let conversionStatus: 'ready' | 'pending' | 'failed' | 'unsupported' | null = null;
      let conversionError: string | null = null;
      let slideImages: { slideCount: number; urls: string[] } | undefined;
      if (lesson.generationStatus === 'completed') {
        try {
          const viewerResult = await LessonService.getViewerUrl(lessonId, course.organizationId);
          viewerUrl = viewerResult.viewerUrl;
          pptxUrl = viewerResult.pptxUrl;
          isLocalPptx = viewerResult.isLocalPptx;
          conversionPending = viewerResult.conversionPending;
          conversionStatus = viewerResult.conversionStatus;
          conversionError = viewerResult.conversionError || null;
          slideImages = viewerResult.slideImages;
        } catch (e) {
          console.log(`Demo lesson viewer URL not available: ${(e as Error).message}`);
        }
      }

      try {
        const meta = LessonPodcastService.getMetadata(lesson as any);
        const signed = await LessonPodcastService.getSignedUrlForVersion(lesson as any);
        podcastUrl = signed.url;
        podcastState = {
          ...LessonPodcastService.getPublicSafeState(meta),
          activeUrl: signed.url,
          activeVersion: signed.version ? { ...signed.version, storageKey: undefined } : null,
        };
      } catch (err) {
        console.error("Demo lesson podcast URL not available:", err);
      }
      try {
        lessonDigest = await LessonDigestService.getOrCreateDigest(lesson as any, {
          versionId: digestVersionId,
          languageCode: digestLanguageCode,
        });
      } catch (err) {
        console.error("Demo lesson digest not available:", err);
      }
      try {
        stepByStepGuide = await LessonStepGuideService.getGuide(lesson as any, {
          versionId: stepGuideVersionId,
          languageCode: digestLanguageCode,
        });
      } catch (err) {
        if (err instanceof StepGuideVersionNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        console.error("Demo step-by-step guide not available:", err);
      }

      res.json({
        lesson: {
          id: lesson.id,
          title: lesson.title,
          description: lesson.description,
          generationStatus: lesson.generationStatus,
          videoStorageKey: lesson.videoStorageKey,
          podcastUrl,
          isDemo: true,
        },
        viewerUrl,
        podcast: podcastState,
        lessonDigest,
        stepByStepGuide,
        pptxUrl,
        isLocalPptx,
        conversionPending,
        conversionStatus,
        conversionError,
        slideImages,
        courseId,
        courseName: course.title,
      });
    } catch (error) {
      console.error('Error getting demo lesson viewer:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== COURSE BUILDER ROUTES ====================

  app.post('/api/course-builder/generate-topics', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseTitle, courseDescription, difficultyLevel, category, numberOfTopics } = req.body;
      
      if (!courseTitle || !courseDescription || !difficultyLevel) {
        return res.status(400).json({ error: 'Course title, description, and difficulty level are required' });
      }

      const { courseTopicAIService } = await import('../services/courseTopicAIService');
      
      const generatedTopics = await courseTopicAIService.generateTopicsWithDescriptions({
        courseTitle,
        courseDescription,
        difficultyLevel,
        category: category || 'general',
        numberOfTopics: numberOfTopics || 8,
      });

      const formattedTopics = generatedTopics.map((topic: any, index: number) => ({
        id: randomUUID(),
        order: index,
        name: topic.name,
        description: topic.description,
        isOverview: topic.isOverview,
        userEditedName: false,
        userEditedDescription: false,
        lessonId: null,
      }));

      res.json({ topics: formattedTopics });
    } catch (error) {
      console.error('Error generating course topics:', error);
      res.status(500).json({ error: (error as Error).message || 'Failed to generate topics' });
    }
  });

  app.post('/api/course-builder/topics/regenerate-description', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseTitle, courseDescription, difficultyLevel, topic, siblingTopics } = req.body;
      
      if (!courseTitle || !courseDescription || !difficultyLevel || !topic) {
        return res.status(400).json({ error: 'Course context and topic are required' });
      }

      const { courseTopicAIService } = await import('../services/courseTopicAIService');
      
      const newDescription = await courseTopicAIService.regenerateSingleTopicDescription({
        courseTitle,
        courseDescription,
        difficultyLevel,
        topic,
        siblingTopics: siblingTopics || [],
      });

      res.json({ description: newDescription });
    } catch (error) {
      console.error('Error regenerating topic description:', error);
      res.status(500).json({ error: (error as Error).message || 'Failed to regenerate description' });
    }
  });

  app.post('/api/course-builder/topics/regenerate-all-descriptions', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseTitle, courseDescription, difficultyLevel, topics } = req.body;
      
      if (!courseTitle || !courseDescription || !difficultyLevel || !topics) {
        return res.status(400).json({ error: 'Course context and topics are required' });
      }

      const { courseTopicAIService } = await import('../services/courseTopicAIService');
      
      const descriptionsMap = await courseTopicAIService.regenerateAllDescriptions(
        courseTitle,
        courseDescription,
        difficultyLevel,
        topics
      );

      const descriptions: Record<string, string> = {};
      descriptionsMap.forEach((value: string, key: string) => {
        descriptions[key] = value;
      });

      res.json({ descriptions });
    } catch (error) {
      console.error('Error regenerating all descriptions:', error);
      res.status(500).json({ error: (error as Error).message || 'Failed to regenerate descriptions' });
    }
  });

  // ==================== COURSE THUMBNAIL UPLOAD ROUTES ====================

  app.post('/api/uploads/course-thumbnail', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;
      
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization found for user' });
      }

      const tempCourseId = randomUUID();

      const objectStorageService = new ObjectStorageService();
      const { uploadUrl, objectPath } = await objectStorageService.getCourseThumbnailUploadURL(
        organizationId,
        tempCourseId
      );

      console.log(`[Course Thumbnail Upload] Generated upload URL for organization ${organizationId}, temp course ID: ${tempCourseId}`);

      res.json({
        method: 'PUT',
        url: uploadUrl,
        objectPath,
        tempCourseId,
      });
    } catch (error) {
      console.error('Error generating course thumbnail upload URL:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/courses/:courseId/thumbnail-upload', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;
      
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization found for user' });
      }

      const course = await CourseService.getCourseById(courseId, organizationId);
      if (!course) {
        return res.status(404).json({ error: 'Course not found or you do not have access' });
      }

      const objectStorageService = new ObjectStorageService();
      const { uploadUrl, objectPath } = await objectStorageService.getCourseThumbnailUploadURL(
        organizationId,
        courseId
      );

      console.log(`[Course Thumbnail Update] Generated upload URL for course ${courseId}, organization ${organizationId}`);

      res.json({
        method: 'PUT',
        url: uploadUrl,
        objectPath,
        courseId,
      });
    } catch (error) {
      console.error('Error generating course thumbnail update URL:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.patch('/api/courses/:courseId/thumbnail', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const { thumbnailUrl } = req.body;

      if (!thumbnailUrl) {
        return res.status(400).json({ error: 'thumbnailUrl is required' });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'No organization found for user' });
      }

      const course = await CourseService.getCourseById(courseId, organizationId);
      if (!course) {
        return res.status(404).json({ error: 'Course not found or you do not have access' });
      }

      await db
        .update(schema.courses)
        .set({ thumbnailUrl })
        .where(eq(schema.courses.id, courseId));

      console.log(`[Course Thumbnail Update] Updated thumbnail for course ${courseId}`);

      res.json({ success: true, thumbnailUrl });
    } catch (error) {
      console.error('Error updating course thumbnail:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== MY COURSES ROUTE ====================

  app.get('/api/my-courses', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { limit = '20', offset = '0' } = req.query;

      const purchases = await PurchaseService.getUserPurchases(userId);

      // Filter out purchases where the course has been deleted
      const validPurchases = purchases.filter((purchase: any) => purchase.course !== null);

      // Batch fetch branding themes for all unique organization IDs
      const uniqueOrgIds = Array.from(new Set(validPurchases.map((p: any) => p.course?.organizationId).filter(Boolean)));
      const brandingThemeMap = new Map<string, any>();
      for (const orgId of uniqueOrgIds) {
        const theme = await storage.getBrandingThemeByOrgId(orgId);
        if (theme) {
          brandingThemeMap.set(orgId, theme);
        }
      }

      const objectStorageService = new ObjectStorageService();
      const enrichedPurchases = await Promise.all(validPurchases.map(async (purchase: any) => {
        let thumbnailSignedUrl: string | undefined;
        const thumbnailPath = purchase.course?.thumbnailUrl || purchase.course?.imageUrl;
        
        if (thumbnailPath) {
          try {
            thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
              thumbnailPath,
              3600
            );
          } catch (error) {
            console.error(`[My Courses] Failed to get signed URL for thumbnail: ${thumbnailPath}`, error);
          }
        }

        // Get branding theme for organization (orgName and logoUrl)
        const orgId = purchase.course?.organizationId;
        const brandingTheme = orgId ? brandingThemeMap.get(orgId) : null;
        const organizationName = brandingTheme?.orgName || null;
        const organizationLogoUrl = brandingTheme?.logoUrl || null;
        
        return {
          ...purchase,
          course: {
            ...purchase.course,
            thumbnailSignedUrl,
            organizationName,
            organizationLogoUrl,
          },
        };
      }));

      res.json({ purchases: enrichedPurchases, total: enrichedPurchases.length });
    } catch (error) {
      console.error('Error getting user courses:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.get("/api/courses/org-courses", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userOrgId = await resolveOrganizationId(req.session);
      if (!userOrgId) {
        return res.status(403).json({ error: "Organization context required" });
      }

      const result = await db
        .select({
          id: courses.id,
          title: courses.title,
          description: courses.description,
          thumbnailUrl: courses.thumbnailUrl,
          status: courses.status,
          visibility: courses.visibility,
        })
        .from(courses)
        .where(and(
          eq(courses.organizationId, userOrgId),
          sql`${courses.status} <> 'archived'`
        ));

      res.json(result);
    } catch (error: any) {
      console.error("[Courses] Error fetching org courses:", error);
      res.status(500).json({ error: error.message || "Failed to fetch org courses" });
    }
  });

  // Get user's public courses (purchased/enrolled across all organizations)
  app.get('/api/my-public-courses', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.user.id;
      const { search, category, difficulty, completionStatus } = req.query;

      // Get all purchases for this user
      const allPurchases = await PurchaseService.getUserPurchases(userId);
      
      // Filter out deleted courses and only include public courses (visibility = 'public')
      let publicPurchases = allPurchases.filter((purchase: any) => 
        purchase.course !== null && purchase.course?.visibility === 'public'
      );

      // Apply search filter
      if (search && typeof search === 'string' && search.trim()) {
        const searchLower = search.toLowerCase();
        publicPurchases = publicPurchases.filter((purchase: any) => 
          purchase.course?.title?.toLowerCase().includes(searchLower) ||
          purchase.course?.description?.toLowerCase().includes(searchLower)
        );
      }

      // Apply category filter (now uses categoryId which is a database ID)
      if (category && typeof category === 'string' && category.trim()) {
        publicPurchases = publicPurchases.filter((purchase: any) =>
          purchase.course?.categoryId === category
        );
      }

      // Apply difficulty filter
      if (difficulty && typeof difficulty === 'string' && difficulty.trim()) {
        publicPurchases = publicPurchases.filter((purchase: any) =>
          purchase.course?.difficultyLevel?.toLowerCase() === difficulty.toLowerCase()
        );
      }

      // Enrich with signed URLs and progress
      const objectStorageService = new ObjectStorageService();
      
      // Get course IDs to calculate progress in batch
      const courseIds = publicPurchases.map((p: any) => p.courseId);
      
      // Batch fetch branding themes for all unique organization IDs
      const uniqueOrgIds = Array.from(new Set(publicPurchases.map((p: any) => p.course?.organizationId).filter(Boolean)));
      const brandingThemeMap = new Map<string, any>();
      for (const orgId of uniqueOrgIds) {
        const theme = await storage.getBrandingThemeByOrgId(orgId);
        if (theme) {
          brandingThemeMap.set(orgId, theme);
        }
      }
      
      // Calculate progress using dual-mechanism logic (quiz passes + auto-complete + lesson progress)
      const progressResults = await CourseService.calculateCourseProgressBatch(courseIds, userId);
      
      const enrichedPurchases = await Promise.all(publicPurchases.map(async (purchase: any) => {
        let thumbnailSignedUrl: string | undefined;
        const thumbnailPath = purchase.course?.thumbnailUrl || purchase.course?.imageUrl;
        
        if (thumbnailPath) {
          try {
            thumbnailSignedUrl = await objectStorageService.getCourseThumbnailSignedURL(
              thumbnailPath,
              3600
            );
          } catch (error) {
            console.error(`[My Public Courses] Failed to get signed URL for thumbnail: ${thumbnailPath}`, error);
          }
        }

        // Get calculated progress from dual-mechanism
        const calculatedProgress = progressResults.get(purchase.courseId);
        
        // Get branding theme for organization (orgName and logoUrl)
        const orgId = purchase.course?.organizationId;
        const brandingTheme = orgId ? brandingThemeMap.get(orgId) : null;
        const organizationName = brandingTheme?.orgName || null;
        const organizationLogoUrl = brandingTheme?.logoUrl || null;
        
        return {
          ...purchase,
          course: {
            ...purchase.course,
            thumbnailSignedUrl,
            organizationName,
            organizationLogoUrl,
          },
          progress: {
            completedLessons: calculatedProgress?.completedLessons ?? 0,
            totalLessons: calculatedProgress?.totalLessons ?? 0,
            percentComplete: calculatedProgress?.percentComplete ?? 0,
            status: calculatedProgress?.status ?? 'not_started',
          },
        };
      }));

      // Apply completion status filter after enrichment
      let filteredPurchases = enrichedPurchases;
      if (completionStatus && typeof completionStatus === 'string' && completionStatus.trim()) {
        filteredPurchases = enrichedPurchases.filter((purchase: any) =>
          purchase.progress?.status === completionStatus
        );
      }

      res.json({ purchases: filteredPurchases, total: filteredPurchases.length });
    } catch (error) {
      console.error('Error getting user public courses:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/courses/:id/upgrade', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const { versionId, paymentIntentId } = req.body;
      const userId = req.session.user.id;

      const version = await db.query.courseVersions.findFirst({
        where: eq(schema.courseVersions.id, versionId),
      });

      if (!version) {
        return res.status(404).json({ error: 'Version not found' });
      }

      if (!version.upgradePrice) {
        return res.status(400).json({ error: 'No upgrade price set for this version' });
      }

      const purchase = await PurchaseService.purchaseUpgrade(
        userId,
        courseId,
        version.upgradePrice,
        version.upgradeCurrency || 'ZAR',
        paymentIntentId
      );

      res.json(purchase);
    } catch (error) {
      console.error('Error purchasing upgrade:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== COURSE REVIEWS ROUTES ====================

  /**
   * Get course reviews with pagination
   * Public endpoint - anyone can view reviews
   */
  app.get('/api/courses/:courseId/reviews', async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;

      const reviews = await ReviewService.getCourseReviews(courseId, {
        includeHidden: false,
      });

      res.json({ reviews, total: reviews.length });
    } catch (error) {
      console.error('Error getting course reviews:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  /**
   * Create a course review
   * User must have completed the course (purchased, enrolled, or assigned)
   */
  app.post('/api/courses/:courseId/reviews', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const { rating, comment, displayName: displayNameChoice } = req.body;
      const userId = req.session.userId || req.session.user?.id;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId || req.session.organizationId || null;

      if (!userId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Validate rating
      const numRating = parseFloat(rating);
      const validRating = (numRating % 0.5 === 0) && numRating >= 0.5 && numRating <= 5.0;
      if (!validRating) {
        return res.status(400).json({ error: 'Rating must be in half-star increments (0.5 to 5.0)' });
      }

      // Comment required for lower ratings
      if (numRating < 4.5 && (!comment || comment.trim().length === 0)) {
        return res.status(400).json({ error: 'Comment is required for ratings below 4.5 stars' });
      }

      // Check if user has access to this course (purchase, enrollment, or assignment)
      const hasPurchase = await db.query.coursePurchases.findFirst({
        where: and(
          eq(schema.coursePurchases.userId, userId),
          eq(schema.coursePurchases.courseId, courseId),
          eq(schema.coursePurchases.status, 'completed')
        ),
      });

      const hasEnrollment = await db.query.userCourseEnrollments.findFirst({
        where: and(
          eq(schema.userCourseEnrollments.userId, userId),
          eq(schema.userCourseEnrollments.courseId, courseId)
        ),
      });

      const hasAssignment = await db.query.courseAssignments.findFirst({
        where: eq(schema.courseAssignments.courseId, courseId),
      });

      if (!hasPurchase && !hasEnrollment && !hasAssignment) {
        return res.status(403).json({ error: 'You must have access to this course to rate it' });
      }

      // Get user for display name
      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Determine display name based on user choice: 'gamer_name' or 'real_name'
      const useGamerName = displayNameChoice === 'gamer_name';
      const displayName = useGamerName 
        ? user.gamerName 
        : (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.gamerName);

      const review = await ReviewService.createReview(
        userId,
        courseId,
        numRating.toString(),
        comment || '',
        displayName || user.gamerName || 'Anonymous',
        organizationId
      );

      res.json(review);
    } catch (error) {
      console.error('Error creating course review:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.post('/api/courses/:id/rate', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const { rating, comment, useGamerName } = req.body;
      const userId = req.session.user.id;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId || req.session.organizationId || null; // Reviewer's org for scoping

      const validRating = (rating % 0.5 === 0) && rating >= 0.5 && rating <= 5.0;
      if (!validRating) {
        return res.status(400).json({ error: 'Rating must be in half-star increments (0.5 to 5.0)' });
      }

      if (rating < 4.5 && (!comment || comment.trim().length === 0)) {
        return res.status(400).json({ error: 'Comment is required for ratings below 4.5 stars' });
      }

      const purchase = await db.query.coursePurchases.findFirst({
        where: and(
          eq(schema.coursePurchases.userId, userId),
          eq(schema.coursePurchases.courseId, courseId),
          eq(schema.coursePurchases.status, 'completed')
        ),
      });

      if (!purchase) {
        return res.status(403).json({ error: 'You must own this course to rate it' });
      }

      const user = await db.query.users.findFirst({
        where: eq(schema.users.id, userId),
      });

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      const displayName = useGamerName ? user.gamerName : (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.gamerName);

      const review = await ReviewService.createReview(
        userId,
        courseId,
        rating.toString(),
        comment || '',
        displayName || user.gamerName,
        organizationId // Store reviewer's org for visibility-scoped filtering
      );

      res.json(review);
    } catch (error) {
      console.error('Error creating course rating:', error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // ==================== COURSE CERTIFICATE ROUTES ====================

  app.get("/api/courses/:courseId/certificate-status", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { courseId } = req.params;

      console.log(`[CERTIFICATE-STATUS] Checking certificate eligibility for userId=${userId}, courseId=${courseId}`);
      
      const eligibility = await CourseCompletionService.checkCertificateEligibility(courseId, userId);
      
      console.log(`[CERTIFICATE-STATUS] Eligibility result:`, {
        isEligible: eligibility.isEligible,
        reason: eligibility.reason,
        totalQuizCount: eligibility.progress?.totalQuizCount,
        passedQuizCount: eligibility.progress?.passedQuizCount,
        allQuizzesPassed: eligibility.progress?.allQuizzesPassed,
        hasExistingCertificate: eligibility.progress?.hasExistingCertificate,
        quizDetailsCount: eligibility.progress?.quizDetails?.length,
      });

      res.json(eligibility);
    } catch (error: any) {
      console.error("Get course certificate status error:", error);
      res.status(500).json({ error: error.message || "Failed to check certificate eligibility" });
    }
  });

  app.post("/api/courses/:courseId/certificate", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      let organizationId = effectiveOrg.organizationId || req.session.organizationId;
      
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { courseId } = req.params;

      // For showcase courses or users without org context, get the course's organization
      if (!organizationId) {
        const [courseData] = await db.select({ organizationId: courses.organizationId })
          .from(courses)
          .where(eq(courses.id, courseId));
        
        if (!courseData) {
          return res.status(404).json({ error: "Course not found" });
        }
        organizationId = courseData.organizationId;
      }

      const eligibility = await CourseCompletionService.checkCertificateEligibility(courseId, userId);

      if (!eligibility.isEligible) {
        return res.status(400).json({
          error: eligibility.reason,
          progress: eligibility.progress,
          existingCertificateId: eligibility.existingCertificateId,
        });
      }

      const certificate = await CertificateService.issueCourseCompletionCertificate({
        courseId,
        userId,
        organizationId,
        xpEarned: 500,
      });

      res.json({
        success: true,
        message: "Congratulations! Your course completion certificate has been issued.",
        certificate,
      });
    } catch (error: any) {
      console.error("Issue course certificate error:", error);
      const statusCode = error.message?.includes("not found") ? 404 : 500;
      res.status(statusCode).json({ error: error.message || "Failed to issue course certificate" });
    }
  });

  app.get("/api/courses/:courseId/quiz-progress", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { courseId } = req.params;

      const progress = await CourseCompletionService.computeCourseQuizProgress(courseId, userId);

      if (!progress) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json(progress);
    } catch (error: any) {
      console.error("Get course quiz progress error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch quiz progress" });
    }
  });

  // ==================== LESSON ROUTES ====================

  app.post("/api/lessons", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const validationResult = createLessonRequestSchema.safeParse(req.body);
      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        return res.status(400).json({ 
          error: firstError.message,
          field: firstError.path.join('.')
        });
      }

      const validated = validationResult.data;

      let mainTopic = validated.mainTopic;
      let subtopic1 = validated.subtopic1;
      let subtopic2 = validated.subtopic2;
      
      if (validated.topics && validated.topics.length > 0) {
        const sortedTopics = [...validated.topics].sort((a, b) => a.position - b.position);
        if (sortedTopics[0]) mainTopic = sortedTopics[0].title;
        if (sortedTopics[1]) subtopic1 = sortedTopics[1].title;
        if (sortedTopics[2]) subtopic2 = sortedTopics[2].title;
      }

      const lesson = await LessonService.createLesson({
        organizationId: validated.organizationId,
        userId,
        title: validated.title,
        description: validated.description,
        gradeLevel: validated.gradeLevel,
        department: validated.department,
        subject: validated.subject,
        unit: validated.unit,
        generationMode: validated.generationMode,
        topics: validated.topics,
        mainTopic,
        subtopic1,
        subtopic2,
        inputText: validated.inputText,
        themeId: validated.themeId,
        generateImages: validated.generateImages,
        imageStyle: validated.imageStyle,
        relatedQuizId: validated.relatedQuizId,
      });

      res.json(lesson);
    } catch (error) {
      console.error("Create lesson error:", error);
      res.status(500).json({ error: "Failed to create lesson" });
    }
  });

  app.get("/api/lessons", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId, gradeLevel, department, subject, unit, generationStatus, isPublished, isArchived, quizId, search } = req.query;

      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const filters: any = {
        organizationId: organizationId as string
      };
      if (gradeLevel) filters.gradeLevel = gradeLevel as string;
      if (department) filters.department = department as string;
      if (subject) filters.subject = subject as string;
      if (unit) filters.unit = unit as string;
      if (generationStatus) filters.generationStatus = generationStatus as string;
      if (isPublished !== undefined) filters.isPublished = isPublished === "true";
      if (isArchived !== undefined) filters.isArchived = isArchived === "true";
      if (quizId) filters.relatedQuizId = quizId as string;
      if (search) filters.search = search as string;

      const lessonsData = await LessonService.listLessons(filters);

      const lessonIds = lessonsData.lessons.map((lesson: any) => lesson.id);

      let courseAssociations: Map<string, { courseId: string; courseTitle: string; topicOrder: number }> = new Map();
      if (lessonIds.length > 0) {
        const links = await db
          .select({
            lessonId: schema.courseLessons.lessonId,
            courseId: schema.courseLessons.courseId,
            courseTitle: schema.courses.title,
            topicOrder: schema.courseLessons.topicOrder,
          })
          .from(schema.courseLessons)
          .innerJoin(schema.courses, eq(schema.courseLessons.courseId, schema.courses.id))
          .where(inArray(schema.courseLessons.lessonId, lessonIds));

        for (const link of links) {
          courseAssociations.set(link.lessonId, {
            courseId: link.courseId,
            courseTitle: link.courseTitle,
            topicOrder: link.topicOrder,
          });
        }
      }

      const enrichedLessons = lessonsData.lessons.map((lesson: any) => ({
        ...lesson,
        linkedCourse: courseAssociations.get(lesson.id) || null,
      }));

      res.json({
        ...lessonsData,
        lessons: enrichedLessons,
      });
    } catch (error) {
      console.error("Get lessons error:", error);
      res.status(500).json({ error: "Failed to fetch lessons" });
    }
  });

  app.get("/api/lessons/assigned/:orgId", withSessionAuthMiddleware, enforceOrgIsolation(), requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { orgId } = req.params;
      const assignedLessons = await LessonService.getAssignedLessons(userId, orgId);

      res.json(assignedLessons);
    } catch (error) {
      console.error("Get assigned lessons error:", error);
      res.status(500).json({ error: "Failed to fetch assigned lessons" });
    }
  });

  app.get("/api/lessons/assigned", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { organizationId } = req.query;
      
      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const assignedLessons = await LessonService.getAssignedLessons(userId, organizationId);

      res.json(assignedLessons);
    } catch (error) {
      console.error("Get assigned lessons error:", error);
      res.status(500).json({ error: "Failed to fetch assigned lessons" });
    }
  });

  app.get("/api/lessons/:lessonId/course-context", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const digestVersionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const digestLanguageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;

      const effectiveLessonId = lesson.isDefaultLanguage === false && lesson.contentGroupId
        ? lesson.contentGroupId
        : lessonId;

      const [courseLesson] = await db
        .select({ courseId: courseLessons.courseId })
        .from(courseLessons)
        .where(eq(courseLessons.lessonId, effectiveLessonId))
        .limit(1);

      if (!courseLesson) {
        return res.status(404).json({ error: "No course association found for this lesson" });
      }

      res.json({ courseId: courseLesson.courseId });
    } catch (error) {
      console.error("Get lesson course-context error:", error);
      res.status(500).json({ error: "Failed to fetch course context" });
    }
  });

  app.get("/api/lessons/:lessonId", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      let lesson = (req as any).lesson;

      if (lesson.activeLessonVersionId) {
        try {
          const [activeVersion] = await db
            .select({
              lessonSnapshot: lessonVersions.lessonSnapshot,
              storageKey: lessonVersions.storageKey,
              title: lessonVersions.title,
              description: lessonVersions.description,
            })
            .from(lessonVersions)
            .where(eq(lessonVersions.id, lesson.activeLessonVersionId))
            .limit(1);

          if (activeVersion) {
            lesson = {
              ...lesson,
              title: activeVersion.title || lesson.title,
              description: activeVersion.description || lesson.description,
              storageKey: activeVersion.storageKey || lesson.storageKey,
            };
          }
        } catch (err) {
          console.error("Failed to resolve active version for lesson data:", err);
        }
      }

      // Enrich lesson with linked quiz data for badge display
      const linkedQuizzes = await db.select({
        quizId: lessonQuizLinks.quizId,
        isPrimary: lessonQuizLinks.isPrimary,
      })
        .from(lessonQuizLinks)
        .where(eq(lessonQuizLinks.lessonId, lessonId));

      let linkedQuizId: string | null = null;
      let linkedQuizName: string | null = null;
      
      if (linkedQuizzes.length > 0) {
        const primaryQuiz = linkedQuizzes.find(q => q.isPrimary);
        const displayQuiz = primaryQuiz || linkedQuizzes[0];
        linkedQuizId = displayQuiz?.quizId || null;
        
        // Fetch quiz name if we have a linked quiz
        if (linkedQuizId) {
          const quizCollection = await db.query.quizCollections.findFirst({
            where: eq(quizCollections.id, linkedQuizId),
            columns: { name: true },
          });
          linkedQuizName = quizCollection?.name || null;
        }
      }

      const [versionCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(lessonContentVersions)
        .where(eq(lessonContentVersions.lessonId, lessonId));

      const sourceAssets = await resolveSignedSourceAssetsForLesson(lesson);

      let resolvedLearningObjectives:
        | Array<{ id: string; objective: string; bloomLevel: BloomsLevel }>
        | undefined;
      const requestedCourseId = typeof req.query.courseId === "string" ? req.query.courseId.trim() : "";

      if (requestedCourseId) {
        const [courseLink] = await db
          .select({
            topicId: courseLessons.topicId,
            learningObjectives: courseLessons.learningObjectives,
          })
          .from(courseLessons)
          .where(and(eq(courseLessons.courseId, requestedCourseId), eq(courseLessons.lessonId, lessonId)))
          .limit(1);

        if (courseLink) {
          const [framework] = await db
            .select({ topics: courseFrameworks.topics })
            .from(courseFrameworks)
            .where(eq(courseFrameworks.courseId, requestedCourseId))
            .limit(1);

          const frameworkTopics = Array.isArray(framework?.topics) ? (framework!.topics as any[]) : [];
          const frameworkTopic = frameworkTopics.find((topic: any) => {
            const topicMatchesById = courseLink.topicId && String(topic?.id || "") === String(courseLink.topicId);
            const topicMatchesByLesson = String(topic?.lessonId || "") === String(lessonId);
            return topicMatchesById || topicMatchesByLesson;
          });

          const structuredFromFramework = Array.isArray(frameworkTopic?.learningObjectives)
            ? frameworkTopic.learningObjectives
                .map((item: any, index: number) => {
                  const objective = String(item?.objective || "").trim();
                  if (!objective) return null;
                  return {
                    id: String(item?.id || `obj-${index + 1}`),
                    objective,
                    bloomLevel: normalizeBloomLevel(item?.bloomLevel, "understand"),
                  };
                })
                .filter((item: any) => !!item)
            : [];

          if (structuredFromFramework.length > 0) {
            resolvedLearningObjectives = structuredFromFramework;
          } else if (Array.isArray(courseLink.learningObjectives) && courseLink.learningObjectives.length > 0) {
            resolvedLearningObjectives = courseLink.learningObjectives
              .map((value: any, index: number) => {
                const objective = String(value || "").trim();
                if (!objective) return null;
                return {
                  id: `obj-${index + 1}`,
                  objective,
                  bloomLevel: "understand" as BloomsLevel,
                };
              })
              .filter((item): item is { id: string; objective: string; bloomLevel: BloomsLevel } => !!item);
          }
        }
      }

      const enrichedLesson = {
        ...lesson,
        linkedQuizId,
        linkedQuizName,
        linkedQuizCount: linkedQuizzes.length,
        hasContentVersions: (versionCount?.count || 0) > 0,
        learningObjectives: resolvedLearningObjectives,
        sourceAssets,
      };

      res.json(enrichedLesson);
    } catch (error) {
      console.error("Get lesson error:", error);
      res.status(500).json({ error: "Failed to fetch lesson" });
    }
  });

  app.post("/api/lessons/:lessonId/objectives/generate", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId || null;
      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const keyTakeawaysGateReason = await getKeyTakeawaysWorkflowBlockingReason({
        lesson,
        lessonId,
        step: 'objectives',
      });
      if (keyTakeawaysGateReason) {
        return res.status(400).json({ error: keyTakeawaysGateReason });
      }
      const targetLevel = normalizeBloomLevel(req.body?.targetLevel, "understand");
      const selectedSource = (req.body?.sourceSelection || {
        sourceType: "sourcedb",
        versionRef: "current",
      }) as LessonSourceSelection;
      const resolvedSource = await resolveLessonSourceSelection({
        lessonId,
        organizationId: lesson.organizationId,
        selection: selectedSource,
        allowManualTopic: false,
      });
      const sourceText = String(resolvedSource.content || "").trim();

      if (!sourceText || sourceText.length < 300) {
        return res.status(400).json({
          error: "Insufficient source content",
          message: `Selected source ${resolvedSource.sourceType}/${resolvedSource.versionRef} must contain at least 300 characters for grounded objective generation.`,
        });
      }

      const generatedObjectives = await courseFrameworkAIService.generateLearningObjectives(
        lesson?.title || "Lesson",
        sourceText,
        targetLevel
      );

      const unique = Array.from(
        new Set(
          generatedObjectives
            .map((item) => String(item || "").trim())
            .filter((item) => item.length > 0)
        )
      );

      const structuredObjectives = unique.map((objective, index) => ({
        id: `ai-${Date.now()}-${index + 1}`,
        objective,
        bloomLevel: targetLevel,
      }));

      const usedSourceContract = buildSourceContract({
        resolved: resolvedSource,
        content: sourceText,
        selectedAt: new Date().toISOString(),
        selectedBy: userId,
      });

      const metadataPatch = {
        learningObjectivesLastGeneratedSource: usedSourceContract,
        learningObjectivesLastGeneratedAt: new Date().toISOString(),
      };

      await db
        .update(lessons)
        .set({
          metadata: sql`COALESCE(${lessons.metadata}, '{}'::jsonb) || ${JSON.stringify(metadataPatch)}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(lessons.id, lessonId));

      return res.json({
        success: true,
        targetLevel,
        objectives: structuredObjectives,
        usedSourceContract,
      });
    } catch (error: any) {
      console.error("Generate lesson objectives error:", error);
      return res.status(500).json({
        error: "Failed to generate learning objectives",
        message: error?.message || "AI objective generation failed.",
      });
    }
  });

  app.put("/api/lessons/:lessonId", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const {
        organizationId,
        title,
        description,
        gradeLevel,
        department,
        subject,
        unit,
        topics,
        mainTopic,
        subtopic1,
        subtopic2,
        inputText,
        themeId,
        generateImages,
        imageStyle,
        relatedQuizId,
        courseId,
        topicId,
        learningObjectives,
        learningObjectivesSourceContract,
      } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const updates: any = {};
      if (title !== undefined) updates.title = title;
      if (description !== undefined) updates.description = description;
      if (gradeLevel !== undefined) updates.gradeLevel = gradeLevel;
      if (department !== undefined) updates.department = department;
      if (subject !== undefined) updates.subject = subject;
      if (unit !== undefined) updates.unit = unit;
      if (topics !== undefined) updates.topics = topics;
      if (mainTopic !== undefined) updates.mainTopic = mainTopic;
      if (subtopic1 !== undefined) updates.subtopic1 = subtopic1;
      if (subtopic2 !== undefined) updates.subtopic2 = subtopic2;
      if (inputText !== undefined) updates.inputText = inputText;
      if (themeId !== undefined) updates.themeId = themeId;
      if (generateImages !== undefined) updates.generateImages = generateImages;
      if (imageStyle !== undefined) updates.imageStyle = imageStyle;
      if (relatedQuizId !== undefined) updates.relatedQuizId = relatedQuizId;

      const hasLessonFieldUpdates = Object.keys(updates).length > 0;
      const lesson = hasLessonFieldUpdates
        ? await LessonService.updateLesson(lessonId, organizationId, updates)
        : (req as any).lesson;

      if (Array.isArray(learningObjectives) && courseId) {
        const normalizedObjectives = learningObjectives
          .map((objective: any, index: number) => {
            const objectiveText = String(objective?.objective || "").trim();
            const bloomCandidate = String(objective?.bloomLevel || "").toLowerCase();
            const bloomLevel = ["remember", "understand", "apply", "analyze", "evaluate", "create"].includes(bloomCandidate)
              ? bloomCandidate
              : "understand";
            if (!objectiveText) return null;
            return {
              id: String(objective?.id || `obj-${index + 1}`),
              objective: objectiveText,
              bloomLevel,
            };
          })
          .filter(Boolean);

        const courseRecord = await db.query.courses.findFirst({
          where: and(eq(courses.id, String(courseId)), eq(courses.organizationId, organizationId)),
          columns: { id: true, organizationId: true },
        });
        if (!courseRecord) {
          return res.status(404).json({ error: "Course not found or outside organization scope." });
        }

        const [courseLink] = await db.select({
          id: courseLessons.id,
          topicId: courseLessons.topicId,
        })
          .from(courseLessons)
          .where(and(eq(courseLessons.courseId, String(courseId)), eq(courseLessons.lessonId, lessonId)))
          .limit(1);

        if (courseLink) {
          await db.update(courseLessons)
            .set({
              learningObjectives: normalizedObjectives.map((obj: any) => obj.objective),
            })
            .where(eq(courseLessons.id, courseLink.id));
        }

        const framework = await db.query.courseFrameworks.findFirst({
          where: eq(courseFrameworks.courseId, String(courseId)),
          columns: { id: true, topics: true },
        });
        if (framework) {
          const topicIdentifier = String(topicId || courseLink?.topicId || "");
          const frameworkTopics = Array.isArray(framework.topics) ? [...framework.topics as any[]] : [];
          const updatedTopics = frameworkTopics.map((topic: any) => {
            const topicMatchesById = topicIdentifier && String(topic?.id || "") === topicIdentifier;
            const topicMatchesByLesson = String(topic?.lessonId || "") === String(lessonId);
            if (!topicMatchesById && !topicMatchesByLesson) return topic;
            return {
              ...topic,
              learningObjectives: normalizedObjectives,
            };
          });
          await db.update(courseFrameworks)
            .set({ topics: updatedTopics as any })
            .where(eq(courseFrameworks.courseId, String(courseId)));
        }
      }

      if (learningObjectivesSourceContract && typeof learningObjectivesSourceContract === "object") {
        const metadataPatch = {
          learningObjectivesLastSavedSource: learningObjectivesSourceContract,
          learningObjectivesLastSavedAt: new Date().toISOString(),
          learningObjectivesLastSavedBy: userId,
        };
        await db
          .update(lessons)
          .set({
            metadata: sql`COALESCE(${lessons.metadata}, '{}'::jsonb) || ${JSON.stringify(metadataPatch)}::jsonb`,
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, lessonId));
      }

      if (inputText !== undefined) {
        const nextSourceContent = String(inputText || "").trim();
        await syncLessonSourceContentToFrameworkTopics({
          lessonId,
          lessonTitle: lesson?.title,
          sourceContent: nextSourceContent,
          userUploadedContent: nextSourceContent.length > 0,
          reason: "lesson_update_endpoint",
        });
      }

      if (description !== undefined) {
        setImmediate(async () => {
          try {
            const contentToHash = `${lesson.inputText || ''}|${description || ''}`;
            const currentHash = createHash('md5').update(contentToHash).digest('hex');
            
            if (lesson.lastFeedbackHash !== currentHash) {
              const feedback = await contentCoachService.getContentFeedback(lessonId, { forceRefresh: true });
              const newScore10 = parseFloat((feedback.overallScore / 10).toFixed(1));
              await db.update(lessons)
                .set({
                  previousScore10: lesson.contentScore10 || null,
                  contentScore10: String(newScore10),
                  lastFeedbackAt: new Date(),
                  lastFeedbackHash: currentHash,
                  feedbackReport: feedback,
                })
                .where(eq(lessons.id, lessonId));
              console.log(`[LessonFeedback] Auto-recalculated score for lesson ${lessonId}: ${newScore10}`);
            }
          } catch (e) {
            console.error('[LessonFeedback] Auto-recalculation failed:', e);
          }
        });
      }

      res.json(lesson);
    } catch (error) {
      console.error("Update lesson error:", error);
      res.status(500).json({ error: "Failed to update lesson" });
    }
  });

  app.post("/api/lessons/:lessonId/publish", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.publishLesson(lessonId, organizationId, userId);

      res.json(lesson);
    } catch (error) {
      console.error("Publish lesson error:", error);
      res.status(500).json({ error: "Failed to publish lesson" });
    }
  });

  app.post("/api/lessons/:lessonId/unpublish", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.unpublishLesson(lessonId, organizationId);

      res.json(lesson);
    } catch (error) {
      console.error("Unpublish lesson error:", error);
      res.status(500).json({ error: "Failed to unpublish lesson" });
    }
  });

  app.post("/api/lessons/:lessonId/archive", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId, deleteFiles } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.archiveLesson(lessonId, organizationId, deleteFiles === true);

      res.json(lesson);
    } catch (error) {
      console.error("Archive lesson error:", error);
      res.status(500).json({ error: "Failed to archive lesson" });
    }
  });

  app.post("/api/lessons/:lessonId/restore", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.restoreLesson(lessonId, organizationId);

      res.json(lesson);
    } catch (error) {
      console.error("Restore lesson error:", error);
      res.status(500).json({ error: "Failed to restore lesson" });
    }
  });

  app.delete("/api/lessons/:lessonId", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.query;

      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      await LessonService.deleteLesson(lessonId, organizationId);

      res.json({ message: "Lesson permanently deleted" });
    } catch (error) {
      console.error("Delete lesson error:", error);
      res.status(500).json({ error: "Failed to delete lesson" });
    }
  });

  app.get("/api/lessons/:lessonId/download", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.query;

      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      // Fetch lesson data
      const [lesson] = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, lessonId))
        .limit(1);

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      const courseTitle = await getCourseTitleForLesson(lessonId);
      const filename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: lesson.languageCode || 'en',
        version: lesson.currentSlideVersion && lesson.currentSlideVersion > 0 ? lesson.currentSlideVersion : 1,
        extension: 'pptx',
      });

      const result = await LessonService.getDownloadUrl(lessonId, organizationId, filename);

      res.json({ downloadUrl: result.downloadUrl, filename });
    } catch (error) {
      console.error("Get lesson download error:", error);
      res.status(500).json({ error: "Failed to get download URL" });
    }
  });

  app.get("/api/lessons/:lessonId/download-video", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.query;

      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.getLessonById(lessonId, organizationId as string);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      const courseTitle = await getCourseTitleForLesson(lessonId);
      const filename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: lesson.languageCode || 'en',
        version: lesson.currentSlideVersion && lesson.currentSlideVersion > 0 ? lesson.currentSlideVersion : 1,
        extension: 'mp4',
      });

      const downloadUrl = await LessonService.getVideoUrl(lessonId, organizationId as string, filename);

      if (!downloadUrl) {
        return res.status(404).json({ error: "No video available for this lesson" });
      }

      res.json({ downloadUrl, filename });
    } catch (error) {
      console.error("Get lesson video download error:", error);
      res.status(500).json({ error: "Failed to get video download URL" });
    }
  });

  app.get("/api/lessons/:lessonId/download-source-document", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.query;

      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      // Fetch lesson data
      const lesson = await LessonService.getLessonById(lessonId, organizationId as string);

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Check if lesson has a source document
      if (!lesson.sourceDocumentPath) {
        return res.status(404).json({ error: "No source document available for this lesson" });
      }

      // Generate signed URL for the source document
      const objectStorageService = new ObjectStorageService();
      const courseTitle = await getCourseTitleForLesson(lessonId);
      const pathParts = lesson.sourceDocumentPath.split('.');
      const rawExtension = pathParts.length > 1 ? pathParts[pathParts.length - 1] : 'docx';
      const extension = String(rawExtension || 'docx').replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'docx';
      const filename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: lesson.languageCode || 'en',
        version: lesson.currentSlideVersion && lesson.currentSlideVersion > 0 ? lesson.currentSlideVersion : 1,
        extension,
      });

      const signedUrl = await objectStorageService.getLessonPPTXSignedURL(
        lesson.sourceDocumentPath,
        900, // 15 minutes TTL
        { downloadFilename: filename }
      );

      res.json({ downloadUrl: signedUrl, filename });
    } catch (error) {
      console.error("Get lesson source document download error:", error);
      res.status(500).json({ error: "Failed to get source document download URL" });
    }
  });

  app.get("/api/lessons/:lessonId/export-content", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.query;

      if (!organizationId || typeof organizationId !== "string") {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.getLessonById(lessonId, organizationId as string);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      const slides = await db
        .select()
        .from(lessonSlides)
        .where(
          and(
            eq(lessonSlides.lessonId, lesson.id),
            eq(lessonSlides.version, lesson.currentSlideVersion || 1)
          )
        )
        .orderBy(asc(lessonSlides.slideIndex));

      let quizCollection: any = null;
      let quizCardsList: any[] = [];

      const quizLinks = await db
        .select()
        .from(lessonQuizLinks)
        .where(eq(lessonQuizLinks.lessonId, lesson.id));

      if (quizLinks.length > 0) {
        const collectionId = quizLinks[0].quizId;
        const [collection] = await db
          .select()
          .from(quizCollections)
          .where(eq(quizCollections.id, collectionId))
          .limit(1);

        if (collection) {
          quizCollection = collection;
          quizCardsList = await db
            .select()
            .from(quizCards)
            .where(eq(quizCards.collectionId, collectionId));
        }
      }

      const labelMap: Record<string, Record<string, string>> = {
        en: { description: 'Description', lessonContent: 'Lesson Content', slides: 'Slides', slide: 'Slide', speakerNotes: 'Speaker Notes' },
        af: { description: 'Beskrywing', lessonContent: 'Lesinhoud', slides: 'Skyfies', slide: 'Skyfie', speakerNotes: 'Sprekersnotas' },
        zu: { description: 'Incazelo', lessonContent: 'Okuqukethwe Kwesifundo', slides: 'Amaslayidi', slide: 'Islayidi', speakerNotes: 'Amanothi Omkhulumeli' },
        xh: { description: 'Inkcazelo', lessonContent: 'Umxholo Wesifundo', slides: 'Iislayidi', slide: 'Islayidi', speakerNotes: 'Amanqaku Omthethi' },
        fr: { description: 'Description', lessonContent: 'Contenu de la leçon', slides: 'Diapositives', slide: 'Diapositive', speakerNotes: 'Notes du présentateur' },
        pt: { description: 'Descrição', lessonContent: 'Conteúdo da Lição', slides: 'Slides', slide: 'Slide', speakerNotes: 'Notas do Apresentador' },
        sw: { description: 'Maelezo', lessonContent: 'Maudhui ya Somo', slides: 'Slaidi', slide: 'Slaidi', speakerNotes: 'Maelezo ya Mzungumzaji' },
        ar: { description: 'الوصف', lessonContent: 'محتوى الدرس', slides: 'الشرائح', slide: 'شريحة', speakerNotes: 'ملاحظات المتحدث' },
        nl: { description: 'Beschrijving', lessonContent: 'Lesinhoud', slides: 'Dia\'s', slide: 'Dia', speakerNotes: 'Sprekersnotities' },
      };
      const lang = lesson.languageCode || 'en';
      const labels = labelMap[lang] || labelMap['en'];

      const children: any[] = [];

      children.push(new Paragraph({
        text: lesson.title,
        heading: HeadingLevel.TITLE,
      }));

      children.push(new Paragraph({
        children: [
          new TextRun({ text: `Language: ${lesson.languageCode || 'en'}`, italics: true }),
        ],
      }));

      children.push(new Paragraph({ text: '' }));

      if (lesson.description) {
        children.push(new Paragraph({
          text: labels.description,
          heading: HeadingLevel.HEADING_1,
        }));
        children.push(new Paragraph({ text: lesson.description }));
        children.push(new Paragraph({ text: '' }));
      }

      if (lesson.inputText) {
        children.push(new Paragraph({
          text: labels.lessonContent,
          heading: HeadingLevel.HEADING_1,
        }));
        const paragraphs = lesson.inputText.split('\n').filter((p: string) => p.trim());
        for (const p of paragraphs) {
          children.push(new Paragraph({ text: p }));
        }
        children.push(new Paragraph({ text: '' }));
      }

      if (slides.length > 0) {
        children.push(new Paragraph({
          text: labels.slides,
          heading: HeadingLevel.HEADING_1,
        }));

        for (const slide of slides) {
          children.push(new Paragraph({
            text: `${labels.slide} ${slide.slideIndex + 1}: ${slide.title || 'Untitled'}`,
            heading: HeadingLevel.HEADING_2,
          }));

          if (slide.bullets && Array.isArray(slide.bullets)) {
            for (const bullet of slide.bullets) {
              children.push(new Paragraph({
                text: `• ${bullet}`,
              }));
            }
          }

          if (slide.speakerNotes) {
            children.push(new Paragraph({
              children: [
                new TextRun({ text: `${labels.speakerNotes}: `, bold: true }),
                new TextRun({ text: slide.speakerNotes, italics: true }),
              ],
            }));
          }

          children.push(new Paragraph({ text: '' }));
        }
      }

      if (quizCardsList.length > 0 && quizCollection) {
        children.push(new Paragraph({
          text: `Quiz: ${quizCollection.name}`,
          heading: HeadingLevel.HEADING_1,
        }));

        for (let i = 0; i < quizCardsList.length; i++) {
          const card = quizCardsList[i];
          children.push(new Paragraph({
            text: `Question ${i + 1}: ${card.question}`,
            heading: HeadingLevel.HEADING_3,
          }));

          const answers = [card.answer1, card.answer2, card.answer3, card.answer4, card.answer5, card.answer6].filter(Boolean);
          for (let j = 0; j < answers.length; j++) {
            const isCorrect = card.correctAnswerIndex === j + 1;
            children.push(new Paragraph({
              children: [
                new TextRun({ text: `${j + 1}. ${answers[j]}`, bold: isCorrect }),
                ...(isCorrect ? [new TextRun({ text: ' ✓ (correct)', bold: true })] : []),
              ],
            }));
          }

          children.push(new Paragraph({ text: '' }));
        }
      }

      const doc = new Document({
        sections: [{
          properties: {},
          children,
        }],
      });

      const buffer = await Packer.toBuffer(doc);

      const courseTitle = await getCourseTitleForLesson(lessonId);
      const filename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: lesson.languageCode || 'en',
        version: lesson.currentSlideVersion && lesson.currentSlideVersion > 0 ? lesson.currentSlideVersion : 1,
        extension: 'docx',
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.send(buffer);
    } catch (error) {
      console.error("Export lesson content to Word error:", error);
      res.status(500).json({ error: "Failed to export lesson content" });
    }
  });

  // Allow learners with course purchase to access presentation versions
  app.get("/api/lessons/:lessonId/presentation-versions", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const sourceLesson = lesson.contentGroupId
        ? await (async () => {
            const [defaultVariant] = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.contentGroupId, lesson.contentGroupId),
                  eq(lessons.organizationId, lesson.organizationId),
                  eq(lessons.isDefaultLanguage, true)
                )
              )
              .limit(1);
            return defaultVariant || lesson;
          })()
        : lesson;

      let selectedLesson = lesson;
      const requestedLanguageCode = String(req.query.languageCode || '').trim().toLowerCase();
      if (requestedLanguageCode && lesson.contentGroupId) {
        const includeDraftVariantsForStaff = await shouldIncludeDraftLanguageVariantsForUser(
          req,
          lesson.organizationId || getEffectiveOrganizationId(req.session) || null
        );
        const languageResolution = await ContentLanguageService.resolveLessonVariantByFallback({
          contentGroupId: lesson.contentGroupId,
          requestedLanguage: requestedLanguageCode,
          userId,
          organizationId: lesson.organizationId || getEffectiveOrganizationId(req.session) || null,
          sourceLanguage: sourceLesson.languageCode || undefined,
          includeUnpublishedVariants: includeDraftVariantsForStaff,
        });
        if (languageResolution?.variantId && languageResolution.variantId !== lesson.id) {
          const [resolvedLesson] = await db
            .select()
            .from(lessons)
            .where(eq(lessons.id, languageResolution.variantId))
            .limit(1);
          if (resolvedLesson) selectedLesson = resolvedLesson;
        }
      }

      const selectedResult = await LessonService.getPresentationVersions(selectedLesson.id, selectedLesson.organizationId);
      const useSourceFallback = selectedResult.versions.length === 0 && String(selectedLesson.id) !== String(sourceLesson.id);
      const resolvedLesson = useSourceFallback ? sourceLesson : selectedLesson;
      const result = useSourceFallback
        ? await LessonService.getPresentationVersions(sourceLesson.id, sourceLesson.organizationId)
        : selectedResult;

      const shouldPrefetchSlides = String(req.query.prefetchSlides || '').trim() === '1';
      if (shouldPrefetchSlides) {
        const prewarmLessonId = String(resolvedLesson.id);
        const prewarmOrgId = String(resolvedLesson.organizationId || '');
        if (prewarmLessonId && prewarmOrgId) {
          void LessonService.getViewerUrl(prewarmLessonId, prewarmOrgId)
            .then((viewerResult) => {
              if (viewerResult?.conversionPending) {
                console.log(`[PresentationVersions] Slide prewarm started for lesson ${prewarmLessonId}`);
              }
            })
            .catch((prewarmError) => {
              console.warn(`[PresentationVersions] Slide prewarm skipped for lesson ${prewarmLessonId}:`, prewarmError);
            });
        }
      }

      res.json({
        ...result,
        artifactResolution: {
          requestedLessonId: selectedLesson.id,
          resolvedLessonId: resolvedLesson.id,
          isFallback: useSourceFallback,
          requestedLanguageCode: requestedLanguageCode || null,
          resolvedLanguageCode: String(resolvedLesson.languageCode || "en").trim().toLowerCase() || "en",
        },
      });
    } catch (error) {
      console.error("Get presentation versions error:", error);
      res.status(500).json({ error: "Failed to get presentation versions" });
    }
  });

  // Allow learners with course purchase to download presentation versions
  app.get("/api/lessons/:lessonId/presentation-versions/:versionId/download", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId, versionId } = req.params;
      const lesson = (req as any).lesson;

      // Fetch presentation version to get version number
      const lessonLanguage = String(lesson.languageCode || 'en').trim().toLowerCase() || 'en';
      const [version] = await db
        .select()
        .from(lessonPresentationVersions)
        .where(
          and(
            eq(lessonPresentationVersions.id, versionId),
            eq(lessonPresentationVersions.lessonId, lessonId),
            sql`LOWER(COALESCE(${lessonPresentationVersions.languageCode}, 'en')) = ${lessonLanguage}`
          )
        );

      if (!version) {
        return res.status(404).json({ error: "Version not found" });
      }

      const courseTitle = await getCourseTitleForLesson(lessonId);
      const filename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: lesson.languageCode || 'en',
        version: version.version,
        extension: 'pptx',
      });

      const result = await LessonService.getVersionDownloadUrl(lessonId, versionId, lesson.organizationId, filename);

      res.json({ ...result, filename });
    } catch (error) {
      console.error("Get version download error:", error);
      res.status(500).json({ error: "Failed to get version download URL" });
    }
  });

  app.post("/api/lessons/:lessonId/presentation-versions/:versionId/set-active", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId, versionId } = req.params;
      const lesson = (req as any).lesson;
      const organizationId = lesson?.organizationId || (req.query.organizationId as string);

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const result = await LessonService.setActivePresentationVersion(lessonId, versionId, organizationId);

      res.json({
        message: "Presentation version activated",
        lesson: result.lesson,
        version: {
          id: result.version.id,
          version: result.version.version,
          storageKey: result.version.storageKey,
        },
      });
    } catch (error: any) {
      console.error("Set active presentation version error:", error);
      res.status(400).json({ error: error?.message || "Failed to activate presentation version" });
    }
  });

  // GET /api/lessons/:lessonId/translation-versions
  // Fetch translation version history (text, PPTX, and quiz versions)
  app.get("/api/lessons/:lessonId/translation-versions", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { languageCode } = req.query;
      const lesson = (req as any).lesson;

      // Fetch text versions
      const normalizedRequestedLanguage = languageCode
        ? String(languageCode).trim().toLowerCase()
        : '';
      const textConditions = [eq(schema.lessonVersions.lessonId, lessonId)];
      if (normalizedRequestedLanguage) {
        textConditions.push(sql`LOWER(COALESCE(${schema.lessonVersions.languageCode}, 'en')) = ${normalizedRequestedLanguage}`);
      }

      const textVersions = await db
        .select()
        .from(schema.lessonVersions)
        .where(and(...textConditions))
        .orderBy(desc(schema.lessonVersions.versionNumber));

      // Fetch PPTX versions
      const pptxConditions = [eq(schema.lessonPresentationVersions.lessonId, lessonId)];
      if (normalizedRequestedLanguage) {
        pptxConditions.push(sql`LOWER(COALESCE(${schema.lessonPresentationVersions.languageCode}, 'en')) = ${normalizedRequestedLanguage}`);
      }

      const pptxVersions = await db
        .select()
        .from(schema.lessonPresentationVersions)
        .where(and(...pptxConditions))
        .orderBy(desc(schema.lessonPresentationVersions.version));

      const latestPptxStorageKey = String((pptxVersions?.[0] as any)?.storageKey || '').trim();
      if (latestPptxStorageKey) {
        void PptxHtmlConverterService.convertPptxToSlides(latestPptxStorageKey)
          .catch((prewarmError) => {
            console.warn(`[TranslationVersions] Slide prewarm skipped for lesson ${lessonId}:`, prewarmError);
          });
      }

      // Fetch quiz versions
      const quizLinks = await db
        .select()
        .from(schema.lessonQuizLinks)
        .where(eq(schema.lessonQuizLinks.lessonId, lessonId));

      let quizVersions: any[] = [];
      for (const link of quizLinks) {
        const [quiz] = await db
          .select({ 
            languageCode: schema.quizCollections.languageCode, 
            name: schema.quizCollections.name 
          })
          .from(schema.quizCollections)
          .where(eq(schema.quizCollections.id, link.quizId))
          .limit(1);

        if (
          normalizedRequestedLanguage &&
          String(quiz?.languageCode || 'en').trim().toLowerCase() !== normalizedRequestedLanguage
        ) {
          continue;
        }

        const versions = await db
          .select()
          .from(schema.quizCollectionVersions)
          .where(eq(schema.quizCollectionVersions.collectionId, link.quizId))
          .orderBy(desc(schema.quizCollectionVersions.versionNumber));

        quizVersions.push({
          quizId: link.quizId,
          quizName: quiz?.name || 'Unknown',
          languageCode: quiz?.languageCode || 'en',
          versions,
        });
      }

      const podcastMeta = LessonPodcastService.getMetadata(lesson as any);
      const podcastVersions = (podcastMeta.versions || [])
        .filter((version: any) => version?.status === 'completed' || version?.status === 'failed')
        .map((version: any) => ({
          id: version.id,
          status: version.status,
          languageCode: version.languageCode || lesson.languageCode || 'en',
          sourceType: version.sourceType || 'sourcedb',
          scriptId: version.scriptId || null,
          title: version.title || null,
          createdAt: version.createdAt || null,
          updatedAt: version.updatedAt || null,
        }))
        .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());

      const lessonContentHistory = await db
        .select()
        .from(schema.lessonContentVersions)
        .where(eq(schema.lessonContentVersions.lessonId, lessonId))
        .orderBy(desc(schema.lessonContentVersions.createdAt));

      const sourceDocVersions = lessonContentHistory
        .filter((version: any) => String(version?.source || '') === 'word_upload')
        .map((version: any) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          languageCode: lesson.languageCode || 'en',
          changeDescription: version.changeDescription || null,
          createdAt: version.createdAt || null,
          sourceDocumentPath: (version as any)?.metadata?.sourceDocumentPath || null,
          originalFilename: (version as any)?.metadata?.originalFilename || null,
        }));

      res.json({
        lessonId,
        languageCode: languageCode || null,
        textVersions,
        pptxVersions,
        quizVersions,
        podcastVersions,
        sourceDocVersions,
      });
    } catch (error) {
      console.error("Get translation versions error:", error);
      res.status(500).json({ error: "Failed to get translation versions" });
    }
  });

  // GET /api/lessons/:sourceLessonId/translation-wizard-state
  // Query translation jobs for a source lesson to resume from saved state
  app.get("/api/lessons/:sourceLessonId/translation-wizard-state", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { sourceLessonId } = req.params;
      const { targetLanguageCode, organizationId } = req.query;

      if (!organizationId) {
        return res.status(400).json({ error: "organizationId query parameter is required" });
      }

      if (!sourceLessonId) {
        return res.status(400).json({ error: "sourceLessonId is required" });
      }

      const userId = req.session.userId;
      const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const resolvedEffectiveOrgId = effectiveResult?.organizationId || null;
      const hasOrgAccess = await canAccessOrganization(userId, organizationId as string, req.session, resolvedEffectiveOrgId);
      if (!hasOrgAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const sourceLesson = await loadLessonForRequest(req, res, sourceLessonId);
      if (!sourceLesson) {
        return;
      }

      if (sourceLesson.organizationId !== organizationId) {
        const linkedIntoRequestedOrg = await isLessonLinkedToOrganizationCourses(sourceLessonId, organizationId as string);
        if (!linkedIntoRequestedOrg) {
          return res.status(403).json({ error: "Access denied: lesson is not available in requested organization scope" });
        }
      }

      // Build conditions for querying lessonTranslationJobs
      const conditions = [
        eq(schema.lessonTranslationJobs.sourceLessonId, sourceLessonId),
        eq(schema.lessonTranslationJobs.organizationId, organizationId as string),
      ];

      if (targetLanguageCode) {
        conditions.push(eq(schema.lessonTranslationJobs.targetLanguageCode, targetLanguageCode as string));
      }

      // Query jobs, ordered by most recent first
      const jobs = await db
        .select()
        .from(schema.lessonTranslationJobs)
        .where(and(...conditions))
        .orderBy(desc(schema.lessonTranslationJobs.createdAt))
        .limit(10);

      // Keep all recent jobs returned by query so remediation can always resume,
      // including previously failed/cancelled runs that still block readiness.
      // For target-language polling, prefer active jobs first, then latest by createdAt.
      const jobsToReturn = targetLanguageCode
        ? (jobs.length ? [selectPreferredTranslationJobForPolling(jobs)].filter(Boolean) : [])
        : jobs;

      const sourceLinkedQuizzes = await db
        .select({ quizId: schema.lessonQuizLinks.quizId })
        .from(schema.lessonQuizLinks)
        .where(eq(schema.lessonQuizLinks.lessonId, sourceLessonId));
      const sourcePodcastMeta = LessonPodcastService.getMetadata(sourceLesson as any);
      const sourcePodcastScripts = Array.isArray((sourcePodcastMeta as any)?.scripts) ? (sourcePodcastMeta as any).scripts : [];
      const sourcePodcastVersions = LessonPodcastService.getCompletedVersions(sourcePodcastMeta);
      const sourceContentVersions = await db
        .select({
          id: schema.lessonContentVersions.id,
          source: schema.lessonContentVersions.source,
          newContent: schema.lessonContentVersions.newContent,
          metadata: schema.lessonContentVersions.metadata,
        })
        .from(schema.lessonContentVersions)
        .where(eq(schema.lessonContentVersions.lessonId, sourceLessonId));
      const sourceContentVersionsById = new Map(sourceContentVersions.map((row) => [String(row.id), row]));

      const sourcePptxVersions = await db
        .select({
          id: schema.lessonPresentationVersions.id,
          storageKey: schema.lessonPresentationVersions.storageKey,
          gammaCardId: schema.lessonPresentationVersions.gammaCardId,
        })
        .from(schema.lessonPresentationVersions)
        .where(eq(schema.lessonPresentationVersions.lessonId, sourceLessonId));
      const sourcePptxVersionsById = new Map(sourcePptxVersions.map((row) => [String(row.id), row]));

      const hashString = (value: string) => createHash("md5").update(value).digest("hex").substring(0, 32);

      const computeStaleMap = async (translationPackage: any) => {
        const contracts = translationPackage?.sourceContracts && typeof translationPackage.sourceContracts === "object"
          ? translationPackage.sourceContracts
          : {};
        const stale: Record<string, { stale: boolean; reason?: string }> = {};

        const sourceDbContract = contracts?.sourceDb || {};
        const sourceDbSelectedVersionId = String(sourceDbContract?.selectedVersionId || "").trim();
        const sourceDbHash = (() => {
          if (sourceDbSelectedVersionId && sourceDbSelectedVersionId !== "current") {
            const selectedVersion = sourceContentVersionsById.get(sourceDbSelectedVersionId);
            const selectedVersionText = String(selectedVersion?.newContent || "").trim();
            if (!selectedVersion || !selectedVersionText) {
              return null;
            }
            return hashString(selectedVersionText);
          }
          return hashString(String(sourceLesson?.inputText || ""));
        })();

        const sourceWordContract = contracts?.wordDocs || {};
        const sourceWordSelectedVersionId = String(sourceWordContract?.selectedVersionId || "").trim();
        const hasCurrentWordSource = !!String(sourceLesson?.sourceDocumentPath || "").trim()
          || sourceContentVersions.some((version: any) => {
            const sourceDocumentPath = String((version as any)?.metadata?.sourceDocumentPath || "").trim();
            return String(version?.source || "") === "word_upload" && !!sourceDocumentPath;
          });
        const sourceWordHash = (() => {
          if (sourceWordSelectedVersionId && sourceWordSelectedVersionId !== "current") {
            const selectedVersion = sourceContentVersionsById.get(sourceWordSelectedVersionId);
            const sourceDocumentPath = String((selectedVersion as any)?.metadata?.sourceDocumentPath || "").trim();
            if (!selectedVersion || String(selectedVersion?.source || "") !== "word_upload" || !sourceDocumentPath) {
              return null;
            }
            return hashString(sourceDocumentPath);
          }
          if (!hasCurrentWordSource) return null;
          return hashString(String(sourceLesson?.sourceDocumentPath || ""));
        })();

        const sourcePptxContract = contracts?.pptx || {};
        const sourcePptxSelectedVersionId = String(sourcePptxContract?.selectedVersionId || "").trim();
        const sourcePptxHash = (() => {
          if (sourcePptxSelectedVersionId && sourcePptxSelectedVersionId !== "current") {
            const selectedVersion = sourcePptxVersionsById.get(sourcePptxSelectedVersionId);
            if (!selectedVersion) return null;
            return hashString(String(selectedVersion.storageKey || selectedVersion.gammaCardId || "pptx"));
          }
          return hashString(String(sourceLesson?.storageKey || sourceLesson?.gammaCardId || ""));
        })();

        const sourceQuizContract = contracts?.quiz || {};
        const sourceQuizSelectedVersionId = String(sourceQuizContract?.selectedVersionId || "").trim();
        const sourceQuizHash = (() => {
          if (sourceQuizSelectedVersionId) {
            const selectedQuizIds = sourceQuizSelectedVersionId.split(",").map((id: string) => id.trim()).filter(Boolean).sort();
            if (selectedQuizIds.length > 0) {
              return hashString(selectedQuizIds.join("|"));
            }
          }
          return hashString(sourceLinkedQuizzes.map((q: any) => String(q.quizId)).sort().join("|"));
        })();

        const activeScript = sourcePodcastScripts.find((s: any) => String(s.id) === String((sourcePodcastMeta as any)?.activeScriptId || "")) || sourcePodcastScripts[0];
        const sourcePodcastScriptContract = contracts?.podcastScript || {};
        const sourcePodcastScriptSelectedVersionId = String(sourcePodcastScriptContract?.selectedVersionId || "").trim();
        const sourcePodcastScriptHash = (() => {
          if (sourcePodcastScriptSelectedVersionId && sourcePodcastScriptSelectedVersionId !== "current") {
            const selectedScript = sourcePodcastScripts.find((script: any) =>
              String(script?.id || "").trim() === sourcePodcastScriptSelectedVersionId
            );
            if (!selectedScript) return null;
            return hashString(String(selectedScript?.text || selectedScript?.id || ""));
          }
          return hashString(String(activeScript?.text || activeScript?.id || ""));
        })();

        const activeAudio = sourcePodcastVersions.find((v: any) => String(v.id) === String(sourcePodcastMeta?.activeVersionId || "")) || sourcePodcastVersions[0];
        const sourcePodcastAudioContract = contracts?.podcastAudio || {};
        const sourcePodcastAudioSelectedVersionId = String(sourcePodcastAudioContract?.selectedVersionId || "").trim();
        const sourcePodcastAudioHash = (() => {
          if (sourcePodcastAudioSelectedVersionId && sourcePodcastAudioSelectedVersionId !== "current") {
            const selectedAudio = sourcePodcastVersions.find((version: any) =>
              String(version?.id || "").trim() === sourcePodcastAudioSelectedVersionId
            );
            if (!selectedAudio) return null;
            return hashString(String(selectedAudio?.storageKey || selectedAudio?.scriptId || selectedAudio?.id || ""));
          }
          return hashString(String(activeAudio?.storageKey || activeAudio?.scriptId || activeAudio?.id || ""));
        })();

        const contractsToCurrent: Record<string, string | null> = {
          sourceDb: sourceDbHash,
          wordDocs: sourceWordHash,
          pptx: sourcePptxHash,
          quiz: sourceQuizHash,
          podcastScript: sourcePodcastScriptHash,
          podcastAudio: sourcePodcastAudioHash,
          digest: sourceDbHash,
          stepGuide: sourceDbHash,
        };

        for (const [asset, currentHash] of Object.entries(contractsToCurrent)) {
          const contractHash = contracts?.[asset]?.sourceVersionHash;
          if (!contractHash) continue;
          if (asset === "wordDocs" && !hasCurrentWordSource && sourceWordSelectedVersionId === "current") {
            stale[asset] = { stale: false };
            continue;
          }
          if (!currentHash) {
            stale[asset] = { stale: true, reason: "Selected source version no longer exists." };
            continue;
          }
          const normalizedContractHash = String(contractHash);
          const normalizedCurrentHash = String(currentHash);
          const legacySourceHash = hashString(normalizedCurrentHash);
          const isFresh = normalizedContractHash === normalizedCurrentHash
            || ((asset === "digest" || asset === "stepGuide") && normalizedContractHash === legacySourceHash);
          if (!isFresh) {
            stale[asset] = { stale: true, reason: "Source changed after translation." };
          } else {
            stale[asset] = { stale: false };
          }
        }

        return stale;
      };

      const buildArtifactActionPlan = (params: {
        normalizedAssetStatuses: Record<string, string>;
        staleMap: Record<string, { stale: boolean; reason?: string }>;
        currentStep?: string | null;
        jobStatus?: string | null;
      }) => {
        const { normalizedAssetStatuses, staleMap, currentStep, jobStatus } = params;
        const entries: Array<{
          asset: string;
          status: string;
          stale: boolean;
          isBlocking: boolean;
          actionKey: string;
          actionLabel: string;
          actionHint: string;
          targetStep: "select_language" | "translate_content" | "review_edit" | "podcast" | "pptx" | "complete";
          severity: "info" | "warning" | "error";
        }> = [];

        const normalizedStatus = String(jobStatus || "").trim().toLowerCase();
        const normalizedStep = String(currentStep || "").trim().toLowerCase();
        const isJobActive = normalizedStatus === "translating"
          || normalizedStatus === "pending"
          || normalizedStep === "translating"
          || normalizedStep === "pptx_generating";
        const staleAssets = Object.entries(staleMap || {})
          .filter(([_, payload]) => payload?.stale === true)
          .map(([asset]) => asset);

        for (const asset of staleAssets) {
          entries.push({
            asset,
            status: "stale",
            stale: true,
            isBlocking: true,
            actionKey: "refresh_source",
            actionLabel: "Refresh From Latest Source",
            actionHint: "Source changed after this translation. Run remediation for this language again.",
            targetStep: "select_language",
            severity: "warning",
          });
        }

        for (const [asset, statusRaw] of Object.entries(normalizedAssetStatuses || {})) {
          const status = String(statusRaw || "");
          const stale = staleAssets.includes(asset);
          if (stale) continue;
          if (status === "completed" || status === "skipped" || status === "deferred_optional") continue;

          if (status === "failed" || status === "cancelled") {
            entries.push({
              asset,
              status,
              stale: false,
              isBlocking: true,
              actionKey: "retry_failed_only",
              actionLabel: "Retry Failed Artifacts",
              actionHint: "Retry only failed/cancelled artifacts for this translation run.",
              targetStep: "review_edit",
              severity: "error",
            });
            continue;
          }

          if (asset === "pptx" && (status === "queued" || status === "processing" || status === "pending")) {
            entries.push({
              asset,
              status,
              stale: false,
              isBlocking: true,
              actionKey: "go_to_pptx",
              actionLabel: "Open PPTX Step",
              actionHint: "Continue in PPTX step to upload or generate the translated presentation.",
              targetStep: "pptx",
              severity: "warning",
            });
            continue;
          }

          if ((asset === "podcastScript" || asset === "podcastAudio") && (status === "queued" || status === "processing" || status === "pending")) {
            entries.push({
              asset,
              status,
              stale: false,
              isBlocking: false,
              actionKey: "go_to_podcast",
              actionLabel: "Open Podcast Step",
              actionHint: "Continue in podcast step to complete optional podcast remediation.",
              targetStep: "podcast",
              severity: "info",
            });
            continue;
          }

          if (status === "queued" || status === "processing" || status === "pending") {
            entries.push({
              asset,
              status,
              stale: false,
              isBlocking: !isJobActive,
              actionKey: isJobActive ? "wait_for_processing" : "restart_remediation",
              actionLabel: isJobActive ? "Refresh Status" : "Run Remediation Again",
              actionHint: isJobActive
                ? "Translation is still processing. Refresh status or wait for completion."
                : "Artifact is not completed. Start remediation run for this artifact.",
              targetStep: isJobActive ? "translate_content" : "select_language",
              severity: isJobActive ? "info" : "warning",
            });
          }
        }

        const deduped = new Map<string, typeof entries[number]>();
        for (const entry of entries) {
          const key = `${entry.asset}:${entry.actionKey}`;
          if (!deduped.has(key)) deduped.set(key, entry);
        }
        return Array.from(deduped.values());
      };

      // Enrich each job with translated lesson data
      const enrichedJobs = await Promise.all(
        jobsToReturn.map(async (job) => {
          let translatedLesson = null;
          if (job.lessonId) {
            const [lesson] = await db
              .select({
                id: schema.lessons.id,
                title: schema.lessons.title,
                generationStatus: schema.lessons.generationStatus,
                translationStatus: schema.lessons.translationStatus,
                storageKey: schema.lessons.storageKey,
                inputText: schema.lessons.inputText,
                metadata: schema.lessons.metadata,
              })
              .from(schema.lessons)
              .where(eq(schema.lessons.id, job.lessonId))
              .limit(1);
            translatedLesson = lesson || null;
          }
          const translationPackage = translatedLesson?.metadata && typeof translatedLesson.metadata === "object"
            ? (translatedLesson.metadata as any).translationPackage || null
            : null;
          const rawAssets = translationPackage?.assets && typeof translationPackage.assets === "object"
            ? translationPackage.assets
            : {};
          const normalizedAssetStatuses = Object.fromEntries(
            Object.entries(rawAssets).map(([asset, status]) => {
              const rawStatus = String(status || "");
              const assetError = String((translationPackage?.errors || {})[asset] || "").toLowerCase();
              if (rawStatus === "pending") return [asset, "queued"];
              if (rawStatus === "failed" && assetError.includes("cancelled by user")) return [asset, "cancelled"];
              return [asset, rawStatus];
            })
          );
          const staleMap = await computeStaleMap(translationPackage);
          const totalAssets = Object.keys(normalizedAssetStatuses).length;
          const completedAssets = Object.values(normalizedAssetStatuses).filter((status: any) =>
            status === "completed" || status === "skipped" || status === "deferred_optional"
          ).length;
          const failedAssets = Object.values(normalizedAssetStatuses).filter((status: any) => status === "failed" || status === "cancelled").length;
          const processingAssets = Object.values(normalizedAssetStatuses).filter((status: any) => status === "processing" || status === "queued").length;
          const artifactActionPlan = buildArtifactActionPlan({
            normalizedAssetStatuses,
            staleMap,
            currentStep: job.currentStep,
            jobStatus: job.status,
          });
          const runState = buildTranslationRunState({
            jobStatus: job.status,
            currentStep: job.currentStep,
            normalizedAssetStatuses,
            blockingActionCount: artifactActionPlan.filter((item) => item.isBlocking).length,
          });
          return {
            ...job,
            runState,
            translatedLesson,
            translationPackage: translationPackage
              ? {
                  ...translationPackage,
                  assets: normalizedAssetStatuses,
                  staleMap,
                }
              : null,
            artifactActionPlan,
            progressByArtifact: {
              total: totalAssets,
              completed: completedAssets,
              failed: failedAssets,
              processing: processingAssets,
            },
          };
        })
      );

      res.json({
        jobs: enrichedJobs,
      });
    } catch (error) {
      console.error("Get translation wizard state error:", error);
      res.status(500).json({ error: "Failed to get translation wizard state" });
    }
  });

  // POST /api/lessons/:sourceLessonId/translation-wizard-state
  // Persist wizard resume state server-side for cross-browser/device consistency.
  app.post("/api/lessons/:sourceLessonId/translation-wizard-state", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      if (!req.session.userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const userId = req.session.userId;
      const { sourceLessonId } = z.object({
        sourceLessonId: z.string().min(1),
      }).parse(req.params);
      const body = z.object({
        organizationId: z.string().min(1),
        targetLanguageCode: z.string().min(2).max(16).optional(),
        translationJobId: z.string().optional().nullable(),
        translatedLessonId: z.string().optional().nullable(),
        wizardState: z.record(z.string(), z.any()),
      }).parse(req.body);
      const requestedOrganizationId = String(body.organizationId || "").trim();
      const targetLanguageCode = String(body.targetLanguageCode || "").trim().toLowerCase();
      const translationJobId = String(body.translationJobId || "").trim();
      const translatedLessonId = String(body.translatedLessonId || "").trim();
      const wizardStateInput = body.wizardState && typeof body.wizardState === "object"
        ? body.wizardState
        : null;

      if (!requestedOrganizationId) {
        return res.status(400).json({ error: "organizationId is required" });
      }
      if (!sourceLessonId) {
        return res.status(400).json({ error: "sourceLessonId is required" });
      }
      if (!wizardStateInput) {
        return res.status(400).json({ error: "wizardState is required" });
      }

      const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const resolvedEffectiveOrgId = effectiveResult?.organizationId || null;
      const hasOrgAccess = await canAccessOrganization(userId, requestedOrganizationId, req.session, resolvedEffectiveOrgId);
      if (!hasOrgAccess) {
        return res.status(403).json({ error: "Access denied" });
      }

      const sourceLesson = await loadLessonForRequest(req, res, sourceLessonId);
      if (!sourceLesson) {
        return;
      }

      if (sourceLesson.organizationId !== requestedOrganizationId) {
        const linkedIntoRequestedOrg = await isLessonLinkedToOrganizationCourses(sourceLessonId, requestedOrganizationId);
        if (!linkedIntoRequestedOrg) {
          return res.status(403).json({ error: "Access denied: lesson is not available in requested organization scope" });
        }
      }

      const jobConditions = [
        eq(schema.lessonTranslationJobs.sourceLessonId, sourceLessonId),
        eq(schema.lessonTranslationJobs.organizationId, requestedOrganizationId),
      ];

      if (translationJobId) {
        jobConditions.push(eq(schema.lessonTranslationJobs.id, translationJobId));
      } else if (targetLanguageCode) {
        jobConditions.push(eq(schema.lessonTranslationJobs.targetLanguageCode, targetLanguageCode));
      } else {
        return res.status(400).json({ error: "translationJobId or targetLanguageCode is required" });
      }

      const [job] = await db
        .select()
        .from(schema.lessonTranslationJobs)
        .where(and(...jobConditions))
        .orderBy(desc(schema.lessonTranslationJobs.createdAt))
        .limit(1);

      if (!job) {
        return res.status(404).json({ error: "Translation job not found" });
      }
      if (targetLanguageCode && String(job.targetLanguageCode || "").toLowerCase() !== targetLanguageCode) {
        return res.status(400).json({ error: "targetLanguageCode does not match the translation job language" });
      }

      const resolvedTranslatedLessonId = translatedLessonId || String(job.lessonId || "");
      if (!resolvedTranslatedLessonId) {
        return res.status(400).json({ error: "Unable to resolve translated lesson for this job" });
      }

      const [translatedLesson] = await db
        .select({ id: schema.lessons.id, metadata: schema.lessons.metadata, organizationId: schema.lessons.organizationId })
        .from(schema.lessons)
        .where(eq(schema.lessons.id, resolvedTranslatedLessonId))
        .limit(1);

      if (!translatedLesson) {
        return res.status(404).json({ error: "Translated lesson not found" });
      }
      if (String(translatedLesson.organizationId || "") !== requestedOrganizationId) {
        return res.status(403).json({ error: "Organization mismatch for translated lesson" });
      }

      const sanitizedWizardState = sanitizeTranslationWizardState({
        input: wizardStateInput,
        userId,
        translatedLessonId: resolvedTranslatedLessonId,
        fallbackTargetLanguageCode: job.targetLanguageCode || null,
      });

      const metadata = translatedLesson.metadata && typeof translatedLesson.metadata === "object"
        ? { ...(translatedLesson.metadata as any) }
        : {};
      const translationPackage = metadata.translationPackage && typeof metadata.translationPackage === "object"
        ? { ...(metadata.translationPackage as any) }
        : {};
      metadata.translationPackage = {
        ...translationPackage,
        wizardState: sanitizedWizardState,
      };

      await db
        .update(schema.lessons)
        .set({ metadata, updatedAt: new Date() })
        .where(eq(schema.lessons.id, translatedLesson.id));

      return res.json({ ok: true, wizardState: sanitizedWizardState });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: "Invalid request payload", details: error.issues });
      }
      console.error("Persist translation wizard state error:", error);
      return res.status(500).json({ error: "Failed to persist translation wizard state" });
    }
  });

  app.post("/api/lessons/:lessonId/translation-funnel-event", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const userId = req.session?.userId ? String(req.session.userId) : null;
      const requestedOrganizationId = String(req.query?.organizationId || req.body?.organizationId || "").trim();
      const organizationId = String(lesson?.organizationId || "");
      if (!organizationId) {
        return res.status(400).json({ error: "Lesson has no organization context" });
      }
      if (requestedOrganizationId && requestedOrganizationId !== organizationId) {
        return res.status(403).json({ error: "Organization mismatch for translation funnel event" });
      }

      const eventName = String(req.body?.eventName || "").trim().toLowerCase();
      if (!eventName) {
        return res.status(400).json({ error: "eventName is required" });
      }
      const eventStep = String(req.body?.step || "").trim().toLowerCase() || null;
      const eventSubStep = String(req.body?.subStep || "").trim().toLowerCase() || null;
      const targetLanguageCode = String(req.body?.targetLanguageCode || lesson?.languageCode || "").trim().toLowerCase() || null;
      const translatedLessonId = String(req.body?.translatedLessonId || "").trim() || null;
      const translationJobId = String(req.body?.translationJobId || "").trim() || null;
      const metadata = req.body?.metadata && typeof req.body.metadata === "object" ? req.body.metadata : {};
      const dedupeSeed = String(req.body?.dedupeSeed || "").trim() || `translation-funnel:${eventName}:${translatedLessonId || lesson.id}:${eventStep || "none"}:${eventSubStep || "none"}:${targetLanguageCode || "none"}:${new Date().toISOString().slice(0, 16)}`;

      console.log("[TranslationFunnelEvent]", JSON.stringify({
        lessonId: lesson.id,
        organizationId,
        userId,
        eventName,
        step: eventStep,
        subStep: eventSubStep,
        targetLanguageCode,
        translatedLessonId,
        translationJobId,
        metadata,
        occurredAt: new Date().toISOString(),
      }));

      await TranslationAnalyticsService.trackEvent({
        organizationId,
        userId,
        eventType: "content_view",
        resourceType: "lesson",
        resourceId: translatedLessonId || lesson.id,
        languageCode: targetLanguageCode,
        variantId: translatedLessonId || lesson.id,
        contentGroupId: lesson.contentGroupId || lesson.id,
        metadata: {
          route: "translation-wizard",
          eventName,
          step: eventStep,
          subStep: eventSubStep,
          translationJobId,
          ...metadata,
        },
        dedupeSeed,
      });

      return res.json({ ok: true });
    } catch (error: any) {
      console.error("Track translation funnel event error:", error);
      return res.status(500).json({ error: error?.message || "Failed to track translation funnel event" });
    }
  });

  app.get("/api/lessons/:lessonId/viewer", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const baseLesson = (req as any).lesson;
      let lesson = baseLesson;
      const requestedLanguageCode = req.query.languageCode ? String(req.query.languageCode).trim().toLowerCase() : null;
      const requestedPodcastVersionId = req.query.podcastVersionId ? String(req.query.podcastVersionId).trim() : null;
      const digestVersionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const stepGuideVersionId = req.query.stepGuideVersionId ? String(req.query.stepGuideVersionId) : undefined;
      const digestLanguageCode = req.query.languageCode ? String(req.query.languageCode).trim().toLowerCase() : undefined;
      const languageResolution = lesson?.contentGroupId
        ? await (async () => {
            const includeDraftVariantsForStaff = await shouldIncludeDraftLanguageVariantsForUser(
              req,
              lesson.organizationId || getEffectiveOrganizationId(req.session) || null
            );
            return ContentLanguageService.resolveLessonVariantByFallback({
              contentGroupId: lesson.contentGroupId,
              requestedLanguage: requestedLanguageCode,
              userId,
              organizationId: lesson.organizationId || getEffectiveOrganizationId(req.session) || null,
              sourceLanguage: lesson.languageCode || undefined,
              includeUnpublishedVariants: includeDraftVariantsForStaff,
            });
          })()
        : null;

      if (languageResolution?.variantId && languageResolution.variantId !== lesson.id) {
        const [resolvedLesson] = await db
          .select()
          .from(lessons)
          .where(eq(lessons.id, languageResolution.variantId))
          .limit(1);
        if (resolvedLesson) {
          lesson = resolvedLesson;
        }
      }
      const selectedLesson = lesson;
      const selectedLanguageCode = String(
        requestedLanguageCode ||
        selectedLesson.languageCode ||
        "en"
      ).trim().toLowerCase() || "en";

      const sourceLesson = selectedLesson.contentGroupId
        ? await (async () => {
            const [defaultVariant] = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.contentGroupId, selectedLesson.contentGroupId),
                  eq(lessons.organizationId, selectedLesson.organizationId),
                  eq(lessons.isDefaultLanguage, true)
                )
              )
              .limit(1);
            return defaultVariant || baseLesson || selectedLesson;
          })()
        : (baseLesson || selectedLesson);

      const sourceLanguageCode = String(sourceLesson.languageCode || "en").trim().toLowerCase() || "en";

      const hasDigestSectionsForLanguage = (metadata: unknown, languageCode?: string | null): boolean => {
        const byKey = (metadata as any)?.lessonDigestV1?.byKey;
        if (!byKey || typeof byKey !== "object") return false;
        const normalizedLanguageCode = String(languageCode || "").trim().toLowerCase();
        const entries = Object.values(byKey) as any[];
        if (!normalizedLanguageCode) {
          return entries.some((entry) => Array.isArray(entry?.sections) && entry.sections.length > 0);
        }
        return entries.some((entry) =>
          String(entry?.languageCode || "").trim().toLowerCase() === normalizedLanguageCode &&
          Array.isArray(entry?.sections) &&
          entry.sections.length > 0
        );
      };

      const resolvePresentationState = async (candidateLesson: any): Promise<{
        activeStorageKey: string | null;
        resolvedVideoStorageKey: string | null;
        hasPptx: boolean;
        hasGammaSlides: boolean;
        hasVideo: boolean;
      }> => {
        if (!candidateLesson) {
          return {
            activeStorageKey: null,
            resolvedVideoStorageKey: null,
            hasPptx: false,
            hasGammaSlides: false,
            hasVideo: false,
          };
        }

        let activeStorageKey: string | null = null;
        let resolvedVideoStorageKey: string | null = candidateLesson.videoStorageKey || null;
        if (candidateLesson.activeLessonVersionId) {
          try {
            const [activeVersion] = await db
              .select({
                storageKey: lessonVersions.storageKey,
                videoStorageKey: lessonVersions.videoStorageKey,
              })
              .from(lessonVersions)
              .where(eq(lessonVersions.id, candidateLesson.activeLessonVersionId))
              .limit(1);
            if (activeVersion?.storageKey) activeStorageKey = activeVersion.storageKey;
            if (activeVersion?.videoStorageKey) resolvedVideoStorageKey = activeVersion.videoStorageKey;
          } catch (err) {
            console.error("Failed to resolve active lesson version state:", err);
          }
        }
        const hasPptx = !!activeStorageKey || !!candidateLesson.storageKey;
        return {
          activeStorageKey,
          resolvedVideoStorageKey,
          hasPptx,
          hasGammaSlides: !!candidateLesson.gammaCardId,
          hasVideo: !!resolvedVideoStorageKey,
        };
      };

      const [selectedPresentationState, sourcePresentationState] = await Promise.all([
        resolvePresentationState(selectedLesson),
        String(sourceLesson.id) === String(selectedLesson.id)
          ? Promise.resolve(null)
          : resolvePresentationState(sourceLesson),
      ]);

      const sourcePresentation = sourcePresentationState || selectedPresentationState;
      const presentationLesson = selectedPresentationState.hasPptx
        ? selectedLesson
        : (sourcePresentation.hasPptx ? sourceLesson : selectedLesson);
      const presentationState = selectedPresentationState.hasPptx
        ? selectedPresentationState
        : sourcePresentation;

      const videoLesson = selectedPresentationState.hasVideo
        ? selectedLesson
        : (sourcePresentation.hasVideo ? sourceLesson : selectedLesson);
      const videoState = selectedPresentationState.hasVideo
        ? selectedPresentationState
        : sourcePresentation;

      const selectedDigestExists = hasDigestSectionsForLanguage(selectedLesson.metadata, selectedLanguageCode);
      const digestUnavailableForRequestedLanguage = !!requestedLanguageCode && !selectedDigestExists;
      const digestLesson = selectedDigestExists ? selectedLesson : sourceLesson;
      const effectiveDigestLanguageCode = selectedDigestExists
        ? (selectedLanguageCode || digestLanguageCode || sourceLanguageCode)
        : (sourceLanguageCode || digestLanguageCode || selectedLanguageCode);

      const selectedStepGuideSummary = summarizeStepGuideArtifacts(selectedLesson?.metadata, selectedLanguageCode, { allowFallback: false });
      const stepGuideUnavailableForRequestedLanguage = !!requestedLanguageCode && !selectedStepGuideSummary.hasStepGuide;
      const stepGuideLesson = selectedStepGuideSummary.hasStepGuide ? selectedLesson : sourceLesson;
      const effectiveStepGuideLanguageCode = selectedStepGuideSummary.hasStepGuide
        ? selectedLanguageCode
        : sourceLanguageCode;

      let viewerUrl: string | null = null;
      let videoUrl: string | null = null;
      let pptxUrl: string | null = null;
      let isLocalPptx: boolean = false;
      let conversionPending: boolean = false;
      let conversionStatus: 'ready' | 'pending' | 'failed' | 'unsupported' | null = null;
      let conversionError: string | null = null;
      
      const hasVideo = selectedPresentationState.hasVideo || sourcePresentation.hasVideo;
      const hasPPTX = selectedPresentationState.hasPptx || sourcePresentation.hasPptx;
      const hasGammaSlides = presentationState.hasGammaSlides;
      
      if (hasVideo) {
        try {
          videoUrl = await LessonService.getVideoUrl(videoLesson.id, videoLesson.organizationId);
        } catch (err) {
          console.error("Failed to get video URL:", err);
        }
      }
      
      let slideImages: { slideCount: number; urls: string[] } | undefined;
      let podcast: any = null;
      let lessonDigest: any = null;
      let stepByStepGuide: any = null;
      let podcastArtifactUsesSelectedLesson = false;
      if (hasPPTX) {
        try {
          const viewerResult = await LessonService.getViewerUrl(presentationLesson.id, presentationLesson.organizationId, {
            storageKeyOverride: presentationState.activeStorageKey,
          });
          viewerUrl = viewerResult.viewerUrl;
          pptxUrl = viewerResult.pptxUrl;
          isLocalPptx = viewerResult.isLocalPptx;
          conversionPending = viewerResult.conversionPending;
          conversionStatus = viewerResult.conversionStatus;
          conversionError = viewerResult.conversionError || null;
          slideImages = viewerResult.slideImages;
        } catch (err) {
          console.error("Failed to get viewer URL:", err);
        }
      }

      const sourceAssets = await resolveSignedSourceAssetsForLesson(selectedLesson);
      const sourceLessonContent = resolveViewerSourceLessonMaterial({
        lesson: selectedLesson,
        sourceAssets,
      });
      const hasNativeSourceLessonContent = Boolean(sourceLessonContent?.sections?.length);

      try {
        const selectedPodcastSummary = summarizePodcastArtifacts(selectedLesson?.metadata, selectedLanguageCode);
        const selectedPodcastMeta = LessonPodcastService.getMetadata(selectedLesson);
        const selectedPodcastJobStatus = String(selectedPodcastMeta.currentJob?.status || "").trim().toLowerCase();
        const selectedPodcastHasLanguageWork =
          selectedPodcastSummary.hasPodcast
          || selectedPodcastSummary.hasPodcastScript
          || selectedPodcastJobStatus === "processing";
        podcastArtifactUsesSelectedLesson = selectedPodcastHasLanguageWork;
        const podcastLesson = selectedPodcastHasLanguageWork ? selectedLesson : sourceLesson;
        const podcastLanguageCode = selectedPodcastHasLanguageWork ? selectedLanguageCode : sourceLanguageCode;
        const podcastMeta = LessonPodcastService.getMetadata(podcastLesson);
        const signed = requestedPodcastVersionId && !requestedLanguageCode
          ? await LessonPodcastService.getSignedUrlForVersion(podcastLesson, requestedPodcastVersionId)
          : await LessonPodcastService.getSignedUrlForLanguage(
              podcastLesson,
              podcastLanguageCode,
              requestedPodcastVersionId || undefined
            );
        podcast = {
          ...LessonPodcastService.getPublicSafeState(podcastMeta),
          activeUrl: signed.url,
          activeVersion: signed.version
            ? { ...signed.version, storageKey: undefined }
            : null,
        };
      } catch (err) {
        console.error("Failed to resolve lesson podcast state:", err);
      }
      try {
        const cachedDigestAvailable = hasDigestSectionsForLanguage(digestLesson?.metadata, effectiveDigestLanguageCode);
        if (!hasNativeSourceLessonContent || cachedDigestAvailable || digestVersionId) {
          lessonDigest = await LessonDigestService.getOrCreateDigest(digestLesson as any, {
            versionId: digestVersionId,
            languageCode: effectiveDigestLanguageCode,
          });
        }
      } catch (err) {
        console.error("Failed to resolve lesson digest:", err);
      }
      try {
        stepByStepGuide = await LessonStepGuideService.getGuide(stepGuideLesson as any, {
          versionId: stepGuideVersionId,
          languageCode: effectiveStepGuideLanguageCode,
        });
      } catch (err) {
        if (err instanceof StepGuideVersionNotFoundError) {
          return res.status(404).json({ error: err.message });
        }
        console.error("Failed to resolve step-by-step guide:", err);
      }

      const lessonLanguageResolutionPayload = ContentLanguageService.buildResolutionPayload(
        languageResolution,
        requestedLanguageCode
      );
      logLanguageConsumptionEvent({
        route: "/api/lessons/:lessonId/viewer",
        organizationId: selectedLesson.organizationId,
        userId: req.session?.userId || null,
        resourceType: "lesson",
        resourceId: selectedLesson.id,
        requestedLanguageCode,
        languageResolution: lessonLanguageResolutionPayload,
      });

      res.json({ 
        viewerUrl, 
        videoUrl,
        pptxUrl,
        isLocalPptx,
        conversionPending,
        conversionStatus,
        conversionError,
        slideImages,
        hasVideo,
        hasPPTX,
        hasGammaSlides,
        podcast,
        lessonDigest,
        stepByStepGuide,
        sourceLessonContent,
        lesson: {
          ...selectedLesson,
          sourceAssets,
        },
        artifactResolution: {
          selectedLanguageCode,
          sourceLanguageCode,
          pptx: {
            requestedLessonId: selectedLesson.id,
            resolvedLessonId: presentationLesson.id,
            isFallback: String(presentationLesson.id) !== String(selectedLesson.id),
          },
          video: {
            requestedLessonId: selectedLesson.id,
            resolvedLessonId: videoLesson.id,
            isFallback: String(videoLesson.id) !== String(selectedLesson.id),
          },
          podcast: {
            requestedLessonId: selectedLesson.id,
            resolvedLessonId: podcastArtifactUsesSelectedLesson ? selectedLesson.id : sourceLesson.id,
            isFallback: !podcastArtifactUsesSelectedLesson,
          },
          digest: {
            requestedLessonId: selectedLesson.id,
            resolvedLessonId: digestLesson.id,
            isFallback: !digestUnavailableForRequestedLanguage && String(digestLesson.id) !== String(selectedLesson.id),
            isUnavailableForRequestedLanguage: digestUnavailableForRequestedLanguage,
            languageCode: effectiveDigestLanguageCode,
          },
          stepGuide: {
            requestedLessonId: selectedLesson.id,
            resolvedLessonId: stepGuideLesson.id,
            isFallback: !stepGuideUnavailableForRequestedLanguage && String(stepGuideLesson.id) !== String(selectedLesson.id),
            isUnavailableForRequestedLanguage: stepGuideUnavailableForRequestedLanguage,
            languageCode: effectiveStepGuideLanguageCode,
          },
        },
        languageResolution: lessonLanguageResolutionPayload,
      });
    } catch (error) {
      console.error("Get lesson viewer error:", error);
      res.status(500).json({ error: "Failed to get viewer URL" });
    }
  });

  app.get("/api/lessons/:lessonId/digest", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const keyTakeawaysGateReason = await getKeyTakeawaysWorkflowBlockingReason({
        lesson,
        lessonId: String(lesson.id),
        step: 'digest',
      });
      if (keyTakeawaysGateReason) {
        return res.status(400).json({ error: keyTakeawaysGateReason });
      }
      const versionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const digest = await LessonDigestService.getOrCreateDigest(lesson, {
        versionId,
        languageCode,
      });
      res.json({ lessonId: lesson.id, digest });
    } catch (error: any) {
      console.error("Get lesson digest error:", error);
      res.status(500).json({ error: error?.message || "Failed to load lesson digest" });
    }
  });

  app.post("/api/lessons/:lessonId/digest/regenerate", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const keyTakeawaysGateReason = await getKeyTakeawaysWorkflowBlockingReason({
        lesson,
        lessonId: String(lesson.id),
        step: 'digest',
      });
      if (keyTakeawaysGateReason) {
        return res.status(400).json({ error: keyTakeawaysGateReason });
      }
      const versionId = req.body?.versionId ? String(req.body.versionId) : undefined;
      const languageCode = req.body?.languageCode ? String(req.body.languageCode) : undefined;
      const digest = await LessonDigestService.regenerateDigest(lesson, {
        versionId,
        languageCode,
      });
      res.json({
        lessonId: lesson.id,
        message: "Lesson digest regenerated.",
        digest,
      });
    } catch (error: any) {
      console.error("Regenerate lesson digest error:", error);
      res.status(400).json({ error: error?.message || "Failed to regenerate lesson digest" });
    }
  });

  app.get("/api/lessons/:lessonId/digest/metrics", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const metrics = LessonDigestService.getDigestMetrics(lesson);
      res.json({ lessonId: lesson.id, metrics });
    } catch (error: any) {
      console.error("Get lesson digest metrics error:", error);
      res.status(500).json({ error: error?.message || "Failed to load lesson digest metrics" });
    }
  });

  app.get("/api/lessons/:lessonId/step-guide", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const versionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const guide = await LessonStepGuideService.getGuide(lesson, {
        versionId,
        languageCode,
      });
      res.json({ lessonId: lesson.id, guide });
    } catch (error: any) {
      if (error instanceof StepGuideVersionNotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      console.error("Get step-by-step guide error:", error);
      res.status(500).json({ error: error?.message || "Failed to load step-by-step guide" });
    }
  });

  app.get("/api/lessons/:lessonId/step-guide/state", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const requestedLanguageCode = String(languageCode || lesson.languageCode || "en").trim().toLowerCase();
      const selectedState = await LessonStepGuideService.getGuideState(lesson, { languageCode: requestedLanguageCode });
      const sourceLesson = lesson.contentGroupId
        ? await (async () => {
            const [defaultVariant] = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.contentGroupId, lesson.contentGroupId),
                  eq(lessons.organizationId, lesson.organizationId),
                  eq(lessons.isDefaultLanguage, true)
                )
              )
              .limit(1);
            return defaultVariant || lesson;
          })()
        : lesson;

      let state = selectedState;
      let resolvedLesson = lesson;
      let usedFallback = false;
      if ((selectedState?.versions?.length || 0) === 0 && String(sourceLesson.id) !== String(lesson.id)) {
        const fallbackLanguageCode = String(sourceLesson.languageCode || "en").trim().toLowerCase();
        state = await LessonStepGuideService.getGuideState(sourceLesson, { languageCode: fallbackLanguageCode });
        resolvedLesson = sourceLesson;
        usedFallback = true;
      }

      res.json({
        lessonId: resolvedLesson.id,
        ...state,
        artifactResolution: {
          requestedLessonId: lesson.id,
          resolvedLessonId: resolvedLesson.id,
          isFallback: usedFallback,
          requestedLanguageCode,
          resolvedLanguageCode: String(state?.languageCode || resolvedLesson.languageCode || "en").trim().toLowerCase() || "en",
        },
      });
    } catch (error: any) {
      console.error("Get step-by-step guide state error:", error);
      res.status(500).json({ error: error?.message || "Failed to load step-by-step guide state" });
    }
  });

  app.post(
    "/api/lessons/:lessonId/step-guide/upload",
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      stepGuideUpload.single("guideFile")(req, res, (err: any) => {
        if (err) {
          console.error("Multer step guide upload error:", err);
          if (String(err?.message || "").includes("Only .docx")) {
            return res.status(415).json({ error: err.message });
          }
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(413).json({
              error: `Guide file exceeds ${Math.floor(STEP_GUIDE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB upload limit.`,
            });
          }
          return res.status(400).json({ error: "Step-by-step guide upload failed" });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const lesson = (req as any).lesson;
        const userId = req.session?.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No guide file uploaded." });
        }

        const languageCode = String(req.body?.languageCode || req.query?.languageCode || lesson.languageCode || "en").trim().toLowerCase();
        const result = await LessonStepGuideService.uploadGuide({
          lesson,
          languageCode,
          mimeType: req.file.mimetype,
          originalFilename: req.file.originalname || "guide",
          buffer: req.file.buffer,
          uploadedBy: String(userId),
        });

        return res.json({
          success: true,
          lessonId: lesson.id,
          languageCode: result.languageCode,
          versionId: result.versionId,
          stepCount: result.payload.steps.length,
          summary: result.payload.summary || null,
        });
      } catch (error: any) {
        console.error("Upload step-by-step guide error:", error);
        const message = String(error?.message || "");
        if (message.includes("timed out")) {
          return res.status(422).json({ error: message || "Guide parsing timed out." });
        }
        if (message.includes("too short")) {
          return res.status(422).json({ error: message });
        }
        return res.status(500).json({ error: message || "Failed to upload step-by-step guide." });
      }
    }
  );

  app.post("/api/lessons/:lessonId/step-guide/set-active", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const versionId = String(req.body?.versionId || "").trim();
      const languageCode = String(req.body?.languageCode || lesson.languageCode || "en").trim().toLowerCase();
      if (!versionId) {
        return res.status(400).json({ error: "versionId is required" });
      }
      await LessonStepGuideService.setActiveVersion({
        lesson,
        versionId,
        languageCode,
      });
      res.json({ success: true, lessonId: lesson.id, versionId, languageCode });
    } catch (error: any) {
      if (error instanceof StepGuideVersionNotFoundError) {
        return res.status(404).json({ error: error.message });
      }
      console.error("Set active step-by-step guide error:", error);
      if (String(error?.message || "").includes("No step-by-step guide versions found")) {
        return res.status(400).json({ error: error?.message || "Failed to set active step-by-step guide version" });
      }
      res.status(500).json({ error: error?.message || "Failed to set active step-by-step guide version" });
    }
  });

  app.post("/api/podcast-debug/events", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session?.userId ? String(req.session.userId) : undefined;
      const events = Array.isArray(req.body?.events) ? req.body.events : [];
      for (const raw of events.slice(0, 200)) {
        pushPodcastDebugEvent({
          timestamp: String(raw?.timestamp || new Date().toISOString()),
          source: "client",
          category: String(raw?.category || "unknown"),
          lessonId: raw?.lessonId ? String(raw.lessonId) : undefined,
          versionId: raw?.versionId ? String(raw.versionId) : undefined,
          languageCode: raw?.languageCode ? String(raw.languageCode) : undefined,
          route: raw?.route ? String(raw.route) : undefined,
          statusCode: Number.isFinite(Number(raw?.statusCode)) ? Number(raw.statusCode) : undefined,
          message: raw?.message ? String(raw.message) : undefined,
          details: raw?.details && typeof raw.details === "object" ? raw.details : undefined,
          userId,
        });
      }
      res.json({ ok: true, accepted: Math.min(events.length, 200) });
    } catch (error: any) {
      console.error("Podcast debug ingest error:", error);
      res.status(500).json({ error: error?.message || "Failed to ingest podcast debug events" });
    }
  });

  app.get("/api/podcast-debug/events", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const lessonId = String(req.query.lessonId || "").trim();
      const source = String(req.query.source || "").trim().toLowerCase();
      const limit = Math.max(1, Math.min(1000, Number(req.query.limit || 300)));
      let filtered = podcastDebugEvents.slice();
      if (lessonId) filtered = filtered.filter((event) => String(event.lessonId || "") === lessonId);
      if (source) filtered = filtered.filter((event) => String(event.source || "").toLowerCase() === source);
      const events = filtered.slice(-limit);
      const categoryCounts: Record<string, number> = {};
      for (const event of events) {
        const key = String(event.category || "unknown");
        categoryCounts[key] = (categoryCounts[key] || 0) + 1;
      }
      res.json({
        totalStored: podcastDebugEvents.length,
        totalReturned: events.length,
        categoryCounts,
        events,
      });
    } catch (error: any) {
      console.error("Podcast debug fetch error:", error);
      res.status(500).json({ error: error?.message || "Failed to fetch podcast debug events" });
    }
  });

  app.delete("/api/podcast-debug/events", withSessionAuthMiddleware, isTeacherOrAdmin, async (_req: Request, res: Response) => {
    podcastDebugEvents.splice(0, podcastDebugEvents.length);
    res.json({ ok: true, message: "Podcast debug events cleared." });
  });

  app.get("/api/podcast/voices", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const voices = await LessonPodcastService.listVoices();
      res.json({ voices });
    } catch (error: any) {
      console.error("List podcast voices error:", error);
      res.status(500).json({ error: error?.message || "Failed to load voice options" });
    }
  });

  async function validatePodcastVoiceSelection(voiceId: string, guestVoiceId?: string): Promise<void> {
    const voices = await LessonPodcastService.listVoices();
    const allowed = new Set((voices || []).map((v: any) => String(v.voiceId || "").trim()).filter(Boolean));
    if (!allowed.has(String(voiceId || "").trim())) {
      throw new Error("Selected host voice is not available from ElevenLabs.");
    }
    if (guestVoiceId && !allowed.has(String(guestVoiceId || "").trim())) {
      throw new Error("Selected guest voice is not available from ElevenLabs.");
    }
  }

  app.get("/api/podcast/subscription-usage", withSessionAuthMiddleware, isAdmin, async (req: Request, res: Response) => {
    try {
      const usage = await LessonPodcastService.getSubscriptionUsage();
      res.json({ usage });
    } catch (error: any) {
      console.error("Podcast subscription usage error:", error);
      res.status(500).json({ error: error?.message || "Failed to load ElevenLabs usage" });
    }
  });

  app.get("/api/lessons/:lessonId/podcast/state", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const requestedLanguageCode = req.query.languageCode ? String(req.query.languageCode).trim().toLowerCase() : null;
      const requestedCourseId = String(req.query?.courseId || "").trim();
      let courseTitle = "";
      if (requestedCourseId) {
        const courseRow = await db
          .select({ title: courses.title })
          .from(courses)
          .where(
            and(
              eq(courses.id, requestedCourseId),
              eq(courses.organizationId, lesson.organizationId)
            )
          )
          .limit(1);
        courseTitle = String(courseRow?.[0]?.title || "").trim();
      }
      const sourceLesson = lesson.contentGroupId
        ? await (async () => {
            const [defaultVariant] = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.contentGroupId, lesson.contentGroupId),
                  eq(lessons.organizationId, lesson.organizationId),
                  eq(lessons.isDefaultLanguage, true)
                )
              )
              .limit(1);
            return defaultVariant || lesson;
          })()
        : lesson;

      const selectedLanguageCode = String(requestedLanguageCode || lesson.languageCode || "en").trim().toLowerCase() || "en";
      const selectedPodcastSummary = summarizePodcastArtifacts(lesson?.metadata, selectedLanguageCode);
      const selectedPodcastMeta = LessonPodcastService.getMetadata(lesson);
      const selectedPodcastJobStatus = String(selectedPodcastMeta.currentJob?.status || "").trim().toLowerCase();
      const selectedPodcastHasLanguageWork =
        selectedPodcastSummary.hasPodcast
        || selectedPodcastSummary.hasPodcastScript
        || selectedPodcastJobStatus === "processing";
      const podcastLesson = selectedPodcastHasLanguageWork ? lesson : sourceLesson;
      const podcastLanguageCode = selectedPodcastHasLanguageWork
        ? selectedLanguageCode
        : (String(sourceLesson.languageCode || "en").trim().toLowerCase() || "en");

      const meta = LessonPodcastService.getMetadata(podcastLesson);
      const signed = await LessonPodcastService.getSignedUrlForLanguage(podcastLesson, podcastLanguageCode);
      const subscriptionUsage = await LessonPodcastService.getSubscriptionUsage();
      const availableLanguages = LessonPodcastService.getAvailableLanguages(meta);
      const sourcePreviews = await LessonPodcastService.getSourcePreview(podcastLesson);
      const hasWordSourceMaterial = Array.isArray((meta as any)?.sourceMaterials) &&
        (meta as any).sourceMaterials.some((item: any) => item?.sourceType === "word");
      const hasTranscript = Boolean(String(podcastLesson.transcriptKey || "").trim()) || podcastLesson.transcriptStatus === "completed";
      const estimateSources = {
        sourcedb: !!podcastLesson.inputText,
        word: hasWordSourceMaterial || !!podcastLesson.sourceDocumentPath,
        pptx: !!podcastLesson.storageKey || !!podcastLesson.gammaCardId || !!podcastLesson.presentationVersionId || !!podcastLesson.slideContentHash || hasTranscript,
      };
      res.json({
        lessonId: podcastLesson.id,
        lessonTitle: podcastLesson.title || "",
        courseTitle,
        languageCode: podcastLanguageCode,
        sourceAvailability: estimateSources,
        sourcePreviews,
        suggestedFocusTopic: podcastLesson.title || "",
        subscriptionUsage,
        availableLanguages,
        ...LessonPodcastService.getPublicSafeState(meta),
        activeUrl: signed.url,
        activeVersion: signed.version ? { ...signed.version, storageKey: undefined } : null,
        artifactResolution: {
          requestedLessonId: lesson.id,
          resolvedLessonId: podcastLesson.id,
          isFallback: String(podcastLesson.id) !== String(lesson.id),
          requestedLanguageCode: requestedLanguageCode || null,
          resolvedLanguageCode: podcastLanguageCode,
        },
      });
    } catch (error: any) {
      console.error("Get podcast state error:", error);
      res.status(500).json({ error: error?.message || "Failed to load podcast state" });
    }
  });

  app.get("/api/lessons/:lessonId/podcast/scripts/:scriptId", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const scriptId = String(req.params.scriptId || "");
      if (!scriptId) return res.status(400).json({ error: "scriptId is required." });
      const meta = LessonPodcastService.getMetadata(lesson);
      const script = (meta.scripts || []).find((item: any) => item.id === scriptId);
      if (!script) return res.status(404).json({ error: "Script not found." });
      return res.json({
        id: script.id,
        createdAt: script.createdAt,
        updatedAt: script.updatedAt,
        sourceType: script.sourceType,
        sourceMaterialId: script.sourceMaterialId || null,
        format: script.format,
        duration: script.duration,
        focusTopic: script.focusTopic,
        languageCode: script.languageCode || "en",
        voiceId: script.voiceId,
        guestVoiceId: script.guestVoiceId,
        hostDisplayName: script.hostDisplayName || null,
        guestDisplayName: script.guestDisplayName || null,
        estimatedCharacters: script.estimatedCharacters,
        estimatedLpcCost: script.estimatedLpcCost,
        sourceScriptId: script.sourceScriptId,
        text: script.text || "",
        scriptSegments: Array.isArray(script.scriptSegments) ? script.scriptSegments : [],
        aiRawResponse: script.aiRawResponse || null,
        aiRequestPayload: script.aiRequestPayload || null,
      });
    } catch (error: any) {
      console.error("Get podcast script detail error:", error);
      return res.status(500).json({ error: error?.message || "Failed to load podcast script detail." });
    }
  });

  app.post(
    "/api/lessons/:lessonId/podcast/source-upload",
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      documentUpload.single("sourceFile")(req, res, (err: any) => {
        if (err) {
          console.error("Multer podcast source upload error:", err);
          if (String(err.message || '').startsWith("Only Word documents")) {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ error: "File too large for current runtime stream handling. Retry upload." });
          }
          return res.status(500).json({ error: "Podcast source upload failed" });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const lesson = (req as any).lesson;
        const userId = req.session?.userId;
        if (!userId) return res.status(401).json({ error: "Authentication required" });
        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No source file uploaded." });
        }

        const { source, metadata } = await LessonPodcastService.uploadWordSourceMaterial({
          lesson,
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          originalFilename: req.file.originalname,
          uploadedBy: userId,
        });
        const refreshedLesson = await LessonPodcastService.getLesson(lesson.id);
        const previews = refreshedLesson
          ? await LessonPodcastService.getSourcePreview(refreshedLesson)
          : await LessonPodcastService.getSourcePreview(lesson);

        return res.json({
          success: true,
          source: {
            id: source.id,
            sourceType: source.sourceType,
            version: source.version,
            originalFilename: source.originalFilename,
            mimeType: source.mimeType,
            wordCount: source.wordCount,
            createdAt: source.createdAt,
          },
          sourcePreviews: previews,
          state: LessonPodcastService.getPublicSafeState(metadata),
        });
      } catch (error: any) {
        console.error("Upload podcast source material error:", error);
        return res.status(400).json({ error: error?.message || "Failed to upload podcast source material." });
      }
    }
  );

  app.get("/api/lessons/:lessonId/podcast/audit/:artifactId/download", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const artifactId = String(req.params.artifactId || "");
      if (!artifactId) return res.status(400).json({ error: "artifactId is required." });
      const meta = LessonPodcastService.getMetadata(lesson);
      const artifact = LessonPodcastService.getAuditArtifact(meta, artifactId);
      if (!artifact) return res.status(404).json({ error: "Audit artifact not found." });

      const absolutePath = LessonPodcastService.resolveAuditArtifactPath(artifact);
      if (!fs.existsSync(absolutePath)) {
        return res.status(404).json({ error: "Audit artifact file no longer exists on disk." });
      }
      const filename = `${artifact.stage}-${artifact.id}${artifact.artifactType === "audio/mp3" ? ".mp3" : ".json"}`;
      res.setHeader("Content-Type", artifact.artifactType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      return res.sendFile(absolutePath);
    } catch (error: any) {
      console.error("Download podcast audit artifact error:", error);
      return res.status(500).json({ error: error?.message || "Failed to download podcast audit artifact." });
    }
  });

  app.post("/api/lessons/:lessonId/podcast/translate", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const userId = req.session?.userId;
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const targetLanguageCode = String(req.body?.targetLanguageCode || "").trim().toLowerCase();
      const previewOnly = req.body?.previewOnly === true || String(req.body?.previewOnly || "").toLowerCase() === "true";
      const sourceLessonId = req.body?.sourceLessonId ? String(req.body.sourceLessonId).trim() : undefined;
      const sourceScriptId = req.body?.sourceScriptId ? String(req.body.sourceScriptId) : undefined;
      const sourceVersionId = req.body?.sourceVersionId ? String(req.body.sourceVersionId) : undefined;
      const sourceMaterialId = req.body?.sourceMaterialId ? String(req.body.sourceMaterialId) : undefined;
      const requestedSourceLanguageCode = req.body?.sourceLanguageCode
        ? String(req.body.sourceLanguageCode).trim().toLowerCase()
        : undefined;
      const voiceId = String(req.body?.voiceId || "").trim();
      const guestVoiceId = req.body?.guestVoiceId ? String(req.body.guestVoiceId).trim() : undefined;
      const requestedFormat = req.body?.format ? String(req.body.format).trim() : "";
      const format = requestedFormat ? requestedFormat as "bulletin" | "conversation" : undefined;
      const requestedDuration = req.body?.duration ? String(req.body.duration).trim() : "";
      const duration = requestedDuration ? requestedDuration as "short" | "default" | "long" : undefined;
      const title = req.body?.title ? String(req.body.title) : undefined;
      const focusTopic = req.body?.focusTopic ? String(req.body.focusTopic) : undefined;
      const notes = req.body?.notes ? String(req.body.notes) : undefined;
      const scriptText = req.body?.scriptText ? String(req.body.scriptText) : undefined;
      const hostDisplayName = req.body?.hostDisplayName ? String(req.body.hostDisplayName).trim() : undefined;
      const guestDisplayName = req.body?.guestDisplayName ? String(req.body.guestDisplayName).trim() : undefined;
      const integrationContext = req.body?.integrationContext && typeof req.body.integrationContext === "object"
        ? req.body.integrationContext
        : {};
      const orchestrationCorrelationId = String(integrationContext?.orchestrationCorrelationId || "").trim() || `podcast-translate-${randomUUID()}`;

      if (!targetLanguageCode) {
        return res.status(400).json({ error: "targetLanguageCode is required." });
      }
      if (!voiceId) {
        return res.status(400).json({ error: "voiceId is required." });
      }
      if (format && !["bulletin", "conversation"].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Use bulletin or conversation." });
      }
      if (duration && !["short", "default", "long"].includes(duration)) {
        return res.status(400).json({ error: "Invalid duration. Use short, default, or long." });
      }

      let sourceLessonForScript = lesson;
      if (sourceLessonId && sourceLessonId !== lesson.id) {
        const [requestedSourceLesson] = await db
          .select()
          .from(schema.lessons)
          .where(eq(schema.lessons.id, sourceLessonId))
          .limit(1);
        if (!requestedSourceLesson) {
          return res.status(404).json({ error: "sourceLessonId not found." });
        }
        if (requestedSourceLesson.organizationId !== lesson.organizationId) {
          return res.status(403).json({ error: "sourceLessonId must belong to the same organization." });
        }
        sourceLessonForScript = requestedSourceLesson as any;
      }

      const meta = LessonPodcastService.getMetadata(sourceLessonForScript as any);
      const scripts = Array.isArray((meta as any).scripts) ? (meta as any).scripts : [];
      const completed = LessonPodcastService.getCompletedVersions(meta);
      const sourceLanguageCode = requestedSourceLanguageCode || String(sourceLessonForScript.languageCode || "en").toLowerCase();

      let sourceScript: any | undefined = sourceScriptId
        ? scripts.find((s: any) => s.id === sourceScriptId)
        : undefined;
      if (!sourceScript && sourceVersionId) {
        const sourceVersion = completed.find((v) => v.id === sourceVersionId);
        if (sourceVersion?.scriptId) {
          sourceScript = scripts.find((s: any) => s.id === sourceVersion.scriptId);
        }
      }
      if (!sourceScript) {
        const latestFromLanguage = completed.find(
          (v) => (v.languageCode || "en").toLowerCase() === sourceLanguageCode && v.scriptId
        );
        if (latestFromLanguage?.scriptId) {
          sourceScript = scripts.find((s: any) => s.id === latestFromLanguage.scriptId);
        }
      }
      if (!sourceScript) {
        const latestAnyVersionWithScript = completed.find((v) => !!v.scriptId);
        if (latestAnyVersionWithScript?.scriptId) {
          sourceScript = scripts.find((s: any) => s.id === latestAnyVersionWithScript.scriptId);
        }
      }
      if (!sourceScript) {
        sourceScript = scripts.find(
          (s: any) => String(s?.languageCode || "en").toLowerCase() === sourceLanguageCode && !!s?.text
        );
      }
      if (!sourceScript?.text) {
        return res.status(400).json({
          error: `No source podcast script found for '${sourceLanguageCode}'. Generate a podcast in that language first before translating.`,
        });
      }

      const resolvedFormat = (format || sourceScript.format || "bulletin") as "bulletin" | "conversation";
      const resolvedDuration = (duration || sourceScript.duration || "default") as "short" | "default" | "long";
      const resolvedSourceType = sourceScript.sourceType || "sourcedb";
      const resolvedSourceMaterialId = sourceMaterialId || sourceScript.sourceMaterialId;
      const resolvedFocusTopic = focusTopic || sourceScript.focusTopic || lesson.title || undefined;
      const resolvedTitle = title || `${lesson.title} (${targetLanguageCode})`;
      const resolvedGuestVoiceId = resolvedFormat === "conversation"
        ? (guestVoiceId || sourceScript.guestVoiceId)
        : undefined;
      if (resolvedFormat === "conversation" && !resolvedGuestVoiceId) {
        return res.status(400).json({ error: "guestVoiceId is required for conversation format." });
      }
      if (resolvedFormat === "conversation" && resolvedGuestVoiceId === voiceId) {
        return res.status(400).json({ error: "Host and guest voices must be different for conversation format." });
      }
      await validatePodcastVoiceSelection(voiceId, resolvedFormat === "conversation" ? resolvedGuestVoiceId : undefined);
      const translationJobIdFromContext = String(integrationContext?.translationJobId || "").trim() || null;
      const translatedLessonIdFromContext = String(integrationContext?.translatedLessonId || "").trim() || lesson.id;

      console.log("[TranslationPodcastBridge]", JSON.stringify({
        stage: previewOnly ? "preview_requested" : "generation_requested",
        lessonId: lesson.id,
        sourceLessonId: sourceLessonForScript.id,
        organizationId: lesson.organizationId,
        userId,
        targetLanguageCode,
        sourceLanguageCode,
        translationJobId: translationJobIdFromContext,
        translatedLessonId: translatedLessonIdFromContext,
        orchestrationCorrelationId,
      }));

      if (previewOnly) {
        const translatedScriptText = await aiTranslationService.translateText(
          String(sourceScript.text),
          targetLanguageCode,
          sourceLanguageCode,
          "Podcast script translation"
        );
        const { script } = await LessonPodcastService.buildScriptDraft({
          lesson,
          sourceType: resolvedSourceType,
          sourceMaterialId: resolvedSourceMaterialId,
          format: resolvedFormat,
          duration: resolvedDuration,
          focusTopic: resolvedFocusTopic,
          voiceId,
          guestVoiceId: resolvedGuestVoiceId,
          hostDisplayName,
          guestDisplayName: resolvedFormat === "conversation" ? guestDisplayName : undefined,
          languageCode: targetLanguageCode,
          sourceScriptId: sourceScript.id,
          scriptTextOverride: translatedScriptText,
        });
        const metadata = await LessonPodcastService.saveDraft({
          lesson,
          sourceType: script.sourceType as any,
          sourceMaterialId: resolvedSourceMaterialId,
          currentStep: 3,
          format: (script.format as any) || resolvedFormat,
          duration: (script.duration as any) || resolvedDuration,
          focusTopic: script.focusTopic || resolvedFocusTopic,
          voiceId,
          guestVoiceId: resolvedGuestVoiceId,
          hostDisplayName,
          guestDisplayName: resolvedFormat === "conversation" ? guestDisplayName : undefined,
          title: resolvedTitle,
          notes,
          scriptId: script.id,
          estimatedCharacters: script.estimatedCharacters,
          estimatedLpcCost: script.estimatedLpcCost,
        });

        return res.json({
          success: true,
          previewPrepared: true,
          languageCode: targetLanguageCode,
          scriptId: script.id,
          scriptText: script.text,
          message: "Translated podcast script prepared. Review and edit before generation.",
          orchestrationCorrelationId,
          state: LessonPodcastService.getPublicSafeState(metadata),
        });
      }

      const existingMetadata = LessonPodcastService.getMetadata(lesson);
      if (existingMetadata.currentJob?.status === "processing") {
        return res.status(409).json({ error: "Another podcast generation job is currently processing. Please wait for it to finish." });
      }

      const versionId = randomUUID();
      const now = new Date().toISOString();
      const metadata = {
        ...existingMetadata,
        currentJob: {
          status: "processing" as const,
          startedAt: now,
          updatedAt: now,
          requestedBy: userId,
          versionId,
          errorMessage: "Preparing translated script...",
        },
        draft: existingMetadata.draft
          ? {
              ...existingMetadata.draft,
              sourceType: resolvedSourceType as any,
              sourceMaterialId: resolvedSourceMaterialId,
              currentStep: 5,
              format: resolvedFormat as any,
              duration: resolvedDuration as any,
              focusTopic: resolvedFocusTopic,
              voiceId,
              guestVoiceId: resolvedGuestVoiceId,
              hostDisplayName,
              guestDisplayName: resolvedFormat === "conversation" ? guestDisplayName : undefined,
              title: resolvedTitle,
              notes,
              status: "processing" as const,
              updatedAt: now,
            }
          : existingMetadata.draft,
      };
      await LessonPodcastService.saveMetadata(lesson, metadata as any);

      setImmediate(async () => {
        try {
          const freshLesson = await LessonPodcastService.getLesson(lesson.id);
          if (!freshLesson) return;

          const translatedScriptText = scriptText && scriptText.trim().length > 0
            ? scriptText
            : await aiTranslationService.translateText(
              String(sourceScript.text),
              targetLanguageCode,
              sourceLanguageCode,
              "Podcast script translation"
            );
          const { script } = await LessonPodcastService.buildScriptDraft({
            lesson: freshLesson,
            sourceType: resolvedSourceType,
            sourceMaterialId: resolvedSourceMaterialId,
            format: resolvedFormat,
            duration: resolvedDuration,
            focusTopic: resolvedFocusTopic,
            voiceId,
            guestVoiceId: resolvedGuestVoiceId,
            hostDisplayName,
            guestDisplayName: resolvedFormat === "conversation" ? guestDisplayName : undefined,
            languageCode: targetLanguageCode,
            sourceScriptId: sourceScript.id,
            scriptTextOverride: translatedScriptText,
          });

          const generated = await LessonPodcastService.beginGeneration({
            lesson: freshLesson,
            requestedBy: userId,
            sourceType: script.sourceType,
            sourceMaterialId: resolvedSourceMaterialId,
            format: (script.format as any) || resolvedFormat,
            duration: (script.duration as any) || resolvedDuration,
            focusTopic: script.focusTopic || resolvedFocusTopic,
            scriptId: script.id,
            scriptText: script.text,
            voiceId,
            guestVoiceId: resolvedGuestVoiceId,
            hostDisplayName,
            guestDisplayName: resolvedFormat === "conversation" ? guestDisplayName : undefined,
            title: resolvedTitle,
            notes,
            languageCode: targetLanguageCode,
            versionId,
          } as any);
          console.log("[TranslationPodcastBridge]", JSON.stringify({
            stage: "generation_started",
            lessonId: lesson.id,
            organizationId: lesson.organizationId,
            userId,
            targetLanguageCode,
            sourceLanguageCode,
            translationJobId: translationJobIdFromContext,
            translatedLessonId: translatedLessonIdFromContext,
            podcastVersionId: generated?.versionId || versionId,
            orchestrationCorrelationId,
          }));
          await TranslationAnalyticsService.trackEvent({
            organizationId: lesson.organizationId,
            userId,
            eventType: "translation_success",
            resourceType: "podcast",
            resourceId: lesson.id,
            languageCode: targetLanguageCode,
            variantId: lesson.id,
            contentGroupId: lesson.contentGroupId || null,
            metadata: {
              source: "podcast_translate_route_async",
              stage: "generation_started",
              translationJobId: translationJobIdFromContext,
              translatedLessonId: translatedLessonIdFromContext,
              podcastVersionId: generated?.versionId || versionId,
              orchestrationCorrelationId,
            },
            dedupeSeed: `podcast-translate-started:${versionId}`,
          });
        } catch (kickoffError: any) {
          try {
            const freshLesson = await LessonPodcastService.getLesson(lesson.id);
            if (!freshLesson) return;
            const failMeta = LessonPodcastService.getMetadata(freshLesson);
            failMeta.currentJob = {
              status: "failed",
              updatedAt: new Date().toISOString(),
              versionId,
              errorMessage: kickoffError?.message || "Failed to start translated podcast generation.",
            };
            if (failMeta.draft) {
              failMeta.draft = {
                ...failMeta.draft,
                currentStep: 5,
                status: "failed",
                updatedAt: new Date().toISOString(),
              };
            }
            await LessonPodcastService.saveMetadata(freshLesson, failMeta);
          } catch (metadataError) {
            console.error("Translate podcast kickoff metadata update error:", metadataError);
          }
          try {
            await TranslationAnalyticsService.trackEvent({
              organizationId: lesson.organizationId,
              userId,
              eventType: "translation_fail",
              resourceType: "podcast",
              resourceId: lesson.id,
              languageCode: targetLanguageCode,
              variantId: lesson.id,
              contentGroupId: lesson.contentGroupId || null,
              metadata: {
                source: "podcast_translate_route_async",
                stage: "generation_kickoff_failed",
                translationJobId: translationJobIdFromContext,
                translatedLessonId: translatedLessonIdFromContext,
                orchestrationCorrelationId,
                errorMessage: kickoffError?.message || "unknown",
              },
              dedupeSeed: `podcast-translate-fail:${versionId}`,
            });
          } catch (analyticsError: any) {
            console.error("Translate podcast async analytics error:", analyticsError?.message || analyticsError);
          }
          console.error("Translate podcast async kickoff error:", kickoffError);
        }
      });

      await TranslationAnalyticsService.trackEvent({
        organizationId: lesson.organizationId,
        userId,
        eventType: "translation_start",
        resourceType: "podcast",
        resourceId: lesson.id,
        languageCode: targetLanguageCode,
        variantId: lesson.id,
        contentGroupId: lesson.contentGroupId || null,
        metadata: {
          source: "podcast_translate_route",
          stage: "queued",
          previewOnly: false,
          translationJobId: translationJobIdFromContext,
          translatedLessonId: translatedLessonIdFromContext,
          orchestrationCorrelationId,
        },
        dedupeSeed: `podcast-translate-queued:${versionId}`,
      });

      res.status(202).json({
        success: true,
        versionId,
        languageCode: targetLanguageCode,
        message: "Translated podcast generation queued. Script translation and audio generation are running in the background.",
        orchestrationCorrelationId,
        state: LessonPodcastService.getPublicSafeState(metadata),
      });
    } catch (error: any) {
      console.error("Translate podcast generation error:", error);
      res.status(400).json({ error: error?.message || "Failed to translate podcast" });
    }
  });

  app.post("/api/lessons/:lessonId/podcast/estimate", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const sourceType = String(req.body?.sourceType || "sourcedb") as "sourcedb" | "word" | "pptx";
      const sourceMaterialId = req.body?.sourceMaterialId ? String(req.body.sourceMaterialId) : undefined;
      const scriptText = req.body?.scriptText ? String(req.body.scriptText) : undefined;
      const format = String(req.body?.format || "bulletin") as "bulletin" | "conversation";
      if (!["sourcedb", "word", "pptx"].includes(sourceType)) {
        return res.status(400).json({ error: "Invalid sourceType. Use sourcedb, word, or pptx." });
      }
      const estimate = await LessonPodcastService.computeEstimate(lesson, sourceType, scriptText, sourceMaterialId, format);
      res.json(estimate);
    } catch (error: any) {
      console.error("Estimate podcast generation error:", error);
      res.status(400).json({ error: error?.message || "Failed to estimate podcast generation cost" });
    }
  });

  app.post("/api/lessons/:lessonId/podcast/script-preview", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const sourceType = String(req.body?.sourceType || "sourcedb") as "sourcedb" | "word" | "pptx";
      const sourceMaterialId = req.body?.sourceMaterialId ? String(req.body.sourceMaterialId) : undefined;
      const format = String(req.body?.format || "bulletin") as "bulletin" | "conversation";
      const duration = String(req.body?.duration || "default") as "short" | "default" | "long";
      const focusTopic = req.body?.focusTopic ? String(req.body.focusTopic) : undefined;
      const voiceId = String(req.body?.voiceId || "").trim();
      const guestVoiceId = req.body?.guestVoiceId ? String(req.body.guestVoiceId).trim() : undefined;
      const voiceName = req.body?.voiceName ? String(req.body.voiceName) : undefined;
      const guestVoiceName = req.body?.guestVoiceName ? String(req.body.guestVoiceName) : undefined;
      const hostDisplayName = req.body?.hostDisplayName ? String(req.body.hostDisplayName).trim() : undefined;
      const guestDisplayName = req.body?.guestDisplayName ? String(req.body.guestDisplayName).trim() : undefined;
      const scriptText = req.body?.scriptText ? String(req.body.scriptText) : undefined;

      if (!["sourcedb", "word", "pptx"].includes(sourceType)) {
        return res.status(400).json({ error: "Invalid sourceType. Use sourcedb, word, or pptx." });
      }
      if (!["bulletin", "conversation"].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Use bulletin or conversation." });
      }
      if (!["short", "default", "long"].includes(duration)) {
        return res.status(400).json({ error: "Invalid duration. Use short, default, or long." });
      }
      if (!voiceId) {
        return res.status(400).json({ error: "voiceId is required." });
      }
      if (format === "conversation" && !guestVoiceId) {
        return res.status(400).json({ error: "guestVoiceId is required for conversation format." });
      }
      if (format === "conversation" && guestVoiceId === voiceId) {
        return res.status(400).json({ error: "Host and guest voices must be different for conversation format." });
      }
      await validatePodcastVoiceSelection(voiceId, format === "conversation" ? guestVoiceId : undefined);

      const { script } = await LessonPodcastService.buildScriptDraft({
        lesson,
        sourceType,
        sourceMaterialId,
        format,
        duration,
        focusTopic,
        voiceId,
        guestVoiceId,
        voiceName,
        guestVoiceName,
        hostDisplayName,
        guestDisplayName,
        scriptTextOverride: scriptText,
      });

      res.json({
        scriptId: script.id,
        scriptText: script.text,
        estimatedCharacters: script.estimatedCharacters,
        estimatedLpcCost: script.estimatedLpcCost,
        estimatedDurationSec: Math.max(10, Math.round(script.estimatedCharacters / 15)),
      });
    } catch (error: any) {
      console.error("Build podcast script preview error:", error);
      res.status(400).json({ error: error?.message || "Failed to build podcast script preview" });
    }
  });

  app.post("/api/lessons/:lessonId/podcast/draft", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const draftId = req.body?.draftId ? String(req.body.draftId).trim() : undefined;
      const createNewDraft = req.body?.createNewDraft === true || String(req.body?.createNewDraft || "").toLowerCase() === "true";
      const sourceType = String(req.body?.sourceType || "sourcedb") as "sourcedb" | "word" | "pptx";
      const sourceMaterialId = req.body?.sourceMaterialId ? String(req.body.sourceMaterialId) : undefined;
      const currentStep = req.body?.currentStep !== undefined ? Number(req.body.currentStep) : undefined;
      const format = String(req.body?.format || "bulletin") as "bulletin" | "conversation";
      const duration = String(req.body?.duration || "default") as "short" | "default" | "long";
      const focusTopic = req.body?.focusTopic ? String(req.body.focusTopic) : undefined;
      const scriptId = req.body?.scriptId ? String(req.body.scriptId) : undefined;
      const scriptText = req.body?.scriptText ? String(req.body.scriptText) : undefined;
      const voiceId = req.body?.voiceId ? String(req.body.voiceId).trim() : undefined;
      const guestVoiceId = req.body?.guestVoiceId ? String(req.body.guestVoiceId).trim() : undefined;
      const voiceName = req.body?.voiceName ? String(req.body.voiceName) : undefined;
      const guestVoiceName = req.body?.guestVoiceName ? String(req.body.guestVoiceName) : undefined;
      const hostDisplayName = req.body?.hostDisplayName ? String(req.body.hostDisplayName).trim() : undefined;
      const guestDisplayName = req.body?.guestDisplayName ? String(req.body.guestDisplayName).trim() : undefined;
      const title = req.body?.title ? String(req.body.title) : undefined;
      const notes = req.body?.notes ? String(req.body.notes) : undefined;
      if (!["sourcedb", "word", "pptx"].includes(sourceType)) {
        return res.status(400).json({ error: "Invalid sourceType. Use sourcedb, word, or pptx." });
      }
      if (!["bulletin", "conversation"].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Use bulletin or conversation." });
      }
      if (!["short", "default", "long"].includes(duration)) {
        return res.status(400).json({ error: "Invalid duration. Use short, default, or long." });
      }
      if ((currentStep ?? 1) >= 2 && format === "conversation" && voiceId && !guestVoiceId) {
        return res.status(400).json({ error: "guestVoiceId is required for conversation format." });
      }
      if (currentStep !== undefined && (!Number.isFinite(currentStep) || currentStep < 1 || currentStep > 5)) {
        return res.status(400).json({ error: "currentStep must be between 1 and 5." });
      }

      let estimate: { estimatedCharacters: number; estimatedLpcCost: number; estimatedDurationSec: number } = {
        estimatedCharacters: 0,
        estimatedLpcCost: 0,
        estimatedDurationSec: 0,
      };
      try {
        estimate = await LessonPodcastService.computeEstimate(lesson, sourceType, scriptText, sourceMaterialId, format);
      } catch {
        // Draft save should not fail when source extraction isn't ready yet.
        if (scriptText && scriptText.trim().length >= 30) {
          const pricing = await LessonPodcastService.getPodcastPricingConfig();
          estimate = LessonPodcastService.estimateFromScript(scriptText, { mode: format, pricing });
        }
      }
      const metadata = await LessonPodcastService.saveDraft({
        lesson,
        draftId,
        createNewDraft,
        sourceType,
        sourceMaterialId,
        currentStep,
        format,
        duration,
        focusTopic,
        voiceId,
        guestVoiceId,
        voiceName,
        guestVoiceName,
        hostDisplayName,
        guestDisplayName,
        title,
        notes,
        scriptId,
        scriptText,
        estimatedCharacters: estimate.estimatedCharacters,
        estimatedLpcCost: estimate.estimatedLpcCost,
      });

      res.json({
        success: true,
        state: LessonPodcastService.getPublicSafeState(metadata),
      });
    } catch (error: any) {
      console.error("Save podcast draft error:", error);
      res.status(400).json({ error: error?.message || "Failed to save podcast draft" });
    }
  });

  app.get("/api/lessons/:lessonId/podcast/drafts", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const meta = LessonPodcastService.getMetadata(lesson);
      const safe = LessonPodcastService.getPublicSafeState(meta);
      return res.json({
        success: true,
        drafts: safe.drafts || [],
        selectedDraftId: safe.draft?.id || null,
      });
    } catch (error: any) {
      console.error("List podcast drafts error:", error);
      return res.status(400).json({ error: error?.message || "Failed to list podcast drafts." });
    }
  });

  app.post("/api/lessons/:lessonId/podcast/draft/select", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const draftId = String(req.body?.draftId || "").trim();
      if (!draftId) return res.status(400).json({ error: "draftId is required." });
      const metadata = await LessonPodcastService.selectDraft({ lesson, draftId });
      return res.json({
        success: true,
        state: LessonPodcastService.getPublicSafeState(metadata),
      });
    } catch (error: any) {
      console.error("Select podcast draft error:", error);
      return res.status(400).json({ error: error?.message || "Failed to select podcast draft." });
    }
  });

  app.delete("/api/lessons/:lessonId/podcast/draft/:draftId", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const draftId = String(req.params?.draftId || "").trim();
      if (!draftId) return res.status(400).json({ error: "draftId is required." });
      const metadata = await LessonPodcastService.deleteDraft({ lesson, draftId });
      return res.json({
        success: true,
        state: LessonPodcastService.getPublicSafeState(metadata),
      });
    } catch (error: any) {
      console.error("Delete podcast draft error:", error);
      return res.status(400).json({ error: error?.message || "Failed to delete podcast draft." });
    }
  });

  app.post("/api/lessons/:lessonId/podcast/generate", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const sourceType = String(req.body?.sourceType || "sourcedb") as "sourcedb" | "word" | "pptx";
      const sourceMaterialId = req.body?.sourceMaterialId ? String(req.body.sourceMaterialId) : undefined;
      const format = String(req.body?.format || "bulletin") as "bulletin" | "conversation";
      const duration = String(req.body?.duration || "default") as "short" | "default" | "long";
      const focusTopic = req.body?.focusTopic ? String(req.body.focusTopic) : undefined;
      const scriptId = req.body?.scriptId ? String(req.body.scriptId) : undefined;
      const scriptText = req.body?.scriptText ? String(req.body.scriptText) : undefined;
      const voiceId = String(req.body?.voiceId || "").trim();
      const guestVoiceId = req.body?.guestVoiceId ? String(req.body.guestVoiceId).trim() : undefined;
      const voiceName = req.body?.voiceName ? String(req.body.voiceName) : undefined;
      const guestVoiceName = req.body?.guestVoiceName ? String(req.body.guestVoiceName) : undefined;
      const hostDisplayName = req.body?.hostDisplayName ? String(req.body.hostDisplayName).trim() : undefined;
      const guestDisplayName = req.body?.guestDisplayName ? String(req.body.guestDisplayName).trim() : undefined;
      const title = req.body?.title ? String(req.body.title) : undefined;
      const notes = req.body?.notes ? String(req.body.notes) : undefined;
      const userId = req.session?.userId;

      if (!userId) return res.status(401).json({ error: "Authentication required" });
      if (!voiceId) return res.status(400).json({ error: "voiceId is required." });
      if (!["sourcedb", "word", "pptx"].includes(sourceType)) {
        return res.status(400).json({ error: "Invalid sourceType. Use sourcedb, word, or pptx." });
      }
      if (!["bulletin", "conversation"].includes(format)) {
        return res.status(400).json({ error: "Invalid format. Use bulletin or conversation." });
      }
      if (!["short", "default", "long"].includes(duration)) {
        return res.status(400).json({ error: "Invalid duration. Use short, default, or long." });
      }
      if (format === "conversation" && !guestVoiceId) {
        return res.status(400).json({ error: "guestVoiceId is required for conversation format." });
      }
      if (format === "conversation" && guestVoiceId === voiceId) {
        return res.status(400).json({ error: "Host and guest voices must be different for conversation format." });
      }
      await validatePodcastVoiceSelection(voiceId, format === "conversation" ? guestVoiceId : undefined);

      const { versionId, metadata } = await LessonPodcastService.beginGeneration({
        lesson,
        requestedBy: userId,
        sourceType,
        sourceMaterialId,
        format,
        duration,
        focusTopic,
        scriptId,
        scriptText,
        voiceId,
        guestVoiceId,
        voiceName,
        guestVoiceName,
        hostDisplayName,
        guestDisplayName,
        title,
        notes,
      });

      await TranslationIndexService.enqueue({
        organizationId: lesson.organizationId,
        entityType: "podcast",
        entityId: lesson.id,
        eventType: "set_active",
        languageCode: (metadata as any)?.podcast?.activeLanguageCode || lesson.languageCode || "en",
        contentGroupId: lesson.contentGroupId || null,
        dedupeSeed: `podcast-generate:${versionId}`,
        payload: { versionId },
      });

      await TranslationAnalyticsService.trackEvent({
        organizationId: lesson.organizationId,
        userId,
        eventType: "translation_start",
        resourceType: "podcast",
        resourceId: lesson.id,
        languageCode: lesson.languageCode || "en",
        variantId: versionId,
        contentGroupId: lesson.contentGroupId || null,
        metadata: { source: "podcast_generate" },
        dedupeSeed: `podcast-generate:${versionId}`,
      });

      res.json({
        success: true,
        versionId,
        message: "Podcast generation started in the background.",
        state: LessonPodcastService.getPublicSafeState(metadata),
      });
    } catch (error: any) {
      console.error("Start podcast generation error:", error);
      res.status(400).json({ error: error?.message || "Failed to start podcast generation" });
    }
  });

  app.post("/api/lessons/:lessonId/podcast/active-version", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const lesson = (req as any).lesson;
      const versionId = String(req.body?.versionId || "").trim();
      if (!versionId) return res.status(400).json({ error: "versionId is required." });
      const metadata = await LessonPodcastService.setActiveVersion(lesson, versionId);
      const found = (metadata.versions || []).find((version: any) => String(version?.id || "") === versionId) || { languageCode: lesson.languageCode || "en" };
      const signed = await LessonPodcastService.getSignedUrlForVersion(lesson, versionId);
      await TranslationIndexService.enqueue({
        organizationId: lesson.organizationId,
        entityType: "podcast",
        entityId: lesson.id,
        eventType: "set_active",
        languageCode: found.languageCode || lesson.languageCode || "en",
        contentGroupId: lesson.contentGroupId || null,
        dedupeSeed: `podcast-set-active:${versionId}`,
        payload: { versionId },
      });
      await TranslationAnalyticsService.trackEvent({
        organizationId: lesson.organizationId,
        userId: req.session?.userId || null,
        eventType: "podcast_set_active",
        resourceType: "podcast",
        resourceId: lesson.id,
        languageCode: found.languageCode || lesson.languageCode || "en",
        variantId: versionId,
        contentGroupId: lesson.contentGroupId || null,
        metadata: { source: "podcast_active_version" },
        dedupeSeed: `podcast-set-active:${versionId}`,
      });
      res.json({
        success: true,
        state: LessonPodcastService.getPublicSafeState(metadata),
        activeUrl: signed.url,
      });
    } catch (error: any) {
      console.error("Set active podcast version error:", error);
      res.status(400).json({ error: error?.message || "Failed to activate podcast version" });
    }
  });

  app.post(
    "/api/lessons/:lessonId/podcast/replace",
    requireLessonAdminAccess,
    podcastAudioUpload.single("audio"),
    async (req: Request, res: Response) => {
      try {
        const lesson = (req as any).lesson;
        const userId = req.session?.userId;
        if (!userId) return res.status(401).json({ error: "Authentication required" });
        if (!req.file || !req.file.buffer) return res.status(400).json({ error: "Audio file is required." });

        const metadata = await LessonPodcastService.replaceWithUploadedAudio({
          lesson,
          buffer: req.file.buffer,
          requestedBy: userId,
          filename: req.file.originalname,
          title: req.body?.title ? String(req.body.title) : undefined,
        });

        const signed = await LessonPodcastService.getSignedUrlForVersion(lesson);
        res.json({
          success: true,
          state: LessonPodcastService.getPublicSafeState(metadata),
          activeUrl: signed.url,
        });
      } catch (error: any) {
        console.error("Replace podcast audio error:", error);
        res.status(400).json({ error: error?.message || "Failed to replace podcast audio" });
      }
    }
  );

  // Auth-optional playback endpoint:
  // - Overview lesson podcast: always free for everyone
  // - Other lessons: requires course access/enrollment
  app.get("/api/lessons/:lessonId/podcast/playback", async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const permission = await canUserPlayLessonPodcast(req, lessonId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason || "Podcast playback not allowed." });
      }

      const lesson = await LessonPodcastService.getLesson(lessonId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const versionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      let effectiveLesson = lesson;
      const normalizedLanguageCode = String(languageCode || "").trim().toLowerCase() || null;
      if (normalizedLanguageCode && lesson.contentGroupId) {
        const includeDraftVariantsForStaff = await shouldIncludeDraftLanguageVariantsForUser(
          req,
          lesson.organizationId || null
        );
        const fallback = await ContentLanguageService.resolveLessonVariantByFallback({
          contentGroupId: lesson.contentGroupId,
          requestedLanguage: normalizedLanguageCode,
          userId: req.session?.userId || null,
          organizationId: lesson.organizationId || null,
          sourceLanguage: lesson.languageCode || undefined,
          includeUnpublishedVariants: includeDraftVariantsForStaff,
        });
        if (fallback?.variantId && fallback.variantId !== lesson.id) {
          const variantLesson = await LessonPodcastService.getLesson(String(fallback.variantId));
          if (variantLesson) effectiveLesson = variantLesson;
        }
      }

      let resolvedVersion = LessonPodcastService.resolveVersionForPlayback(effectiveLesson, { versionId, languageCode: normalizedLanguageCode || undefined });
      resolvedVersion = await LessonPodcastService.ensureHlsForPlayback(effectiveLesson, { versionId, languageCode: normalizedLanguageCode || undefined }) || resolvedVersion;
      const hlsReady = !!resolvedVersion
        && resolvedVersion.hlsPackagingStatus === "ready"
        && !!resolveStoragePath(resolvedVersion.storageKey || "")
        && fs.existsSync(path.join(path.dirname(resolveStoragePath(resolvedVersion.storageKey || "") || ""), "hls", "index.m3u8"));
      const signed = normalizedLanguageCode
        ? await LessonPodcastService.getSignedUrlForLanguage(effectiveLesson, normalizedLanguageCode, versionId)
        : await LessonPodcastService.getSignedUrlForVersion(effectiveLesson, versionId);
      if (!hlsReady && !signed.url) {
        return res.status(404).json({ error: "No playable podcast available for this lesson." });
      }
      const hlsUrl = hlsReady
        ? `/api/lessons/${effectiveLesson.id}/podcast/hls/${encodeURIComponent(resolvedVersion.id)}/index.m3u8${(() => {
            const params = new URLSearchParams();
            if (normalizedLanguageCode) params.set("languageCode", normalizedLanguageCode);
            return params.toString() ? `?${params.toString()}` : "";
          })()}`
        : null;
      pushPodcastDebugEvent({
        source: "server",
        category: "playback_resolved",
        lessonId: effectiveLesson.id,
        versionId: resolvedVersion?.id || versionId,
        languageCode: normalizedLanguageCode || resolvedVersion?.languageCode,
        route: "podcast/playback",
        statusCode: 200,
        details: {
          playbackType: hlsUrl ? "hls" : "mp3",
          hasHls: Boolean(hlsUrl),
          hasSignedUrl: Boolean(signed.url),
          userAgent: req.headers["user-agent"] || null,
        },
      });
      await TranslationAnalyticsService.trackEvent({
        organizationId: effectiveLesson.organizationId,
        userId: req.session?.userId || null,
        eventType: "podcast_play",
        resourceType: "podcast",
        resourceId: effectiveLesson.id,
        languageCode: normalizedLanguageCode || resolvedVersion?.languageCode || signed.version?.languageCode || effectiveLesson.languageCode || "en",
        variantId: resolvedVersion?.id || signed.version?.id || null,
        contentGroupId: effectiveLesson.contentGroupId || null,
        metadata: {
          route: "podcast/playback",
          playbackType: hlsUrl ? "hls" : "mp3",
        },
        dedupeSeed: `podcast-playback:${lessonId}:${resolvedVersion?.id || signed.version?.id || "none"}:${new Date().toISOString().slice(0, 16)}`,
      });
      return res.json({
        lessonId: effectiveLesson.id,
        isOverviewFree: permission.isOverview === true,
        playbackType: hlsUrl ? "hls" : "mp3",
        hlsUrl,
        mp3Url: hlsUrl ? null : `/api/lessons/${effectiveLesson.id}/podcast/stream${(() => {
          const params = new URLSearchParams();
          if (resolvedVersion?.id) params.set("versionId", resolvedVersion.id);
          else if (versionId) params.set("versionId", versionId);
          if (normalizedLanguageCode) params.set("languageCode", normalizedLanguageCode);
          return params.toString() ? `?${params.toString()}` : "";
        })()}`,
        url: hlsUrl || `/api/lessons/${effectiveLesson.id}/podcast/stream${(() => {
          const params = new URLSearchParams();
          if (resolvedVersion?.id) params.set("versionId", resolvedVersion.id);
          else if (versionId) params.set("versionId", versionId);
          if (normalizedLanguageCode) params.set("languageCode", normalizedLanguageCode);
          return params.toString() ? `?${params.toString()}` : "";
        })()}`,
        signedUrl: signed.url || null,
        hlsErrorMessage: resolvedVersion?.hlsErrorMessage || null,
        version: (resolvedVersion || signed.version) ? { ...(resolvedVersion || signed.version), storageKey: undefined } : null,
      });
    } catch (error: any) {
      pushPodcastDebugEvent({
        source: "server",
        category: "playback_error",
        lessonId: req.params.lessonId,
        route: "podcast/playback",
        statusCode: 500,
        message: String(error?.message || "unknown"),
        details: {
          query: req.query,
          userAgent: req.headers["user-agent"] || null,
        },
      });
      console.error("Podcast playback endpoint error:", error);
      res.status(500).json({ error: error?.message || "Failed to get podcast playback URL" });
    }
  });

  app.get("/api/lessons/:lessonId/podcast/hls/:versionId/:fileName", async (req: Request, res: Response) => {
    try {
      const { lessonId, versionId } = req.params;
      const requestedFile = String(req.params.fileName || "").trim();
      if (!requestedFile) return res.status(400).json({ error: "Missing HLS file name." });

      const permission = await canUserPlayLessonPodcast(req, lessonId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason || "Podcast playback not allowed." });
      }

      const lesson = await LessonPodcastService.getLesson(lessonId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const version = LessonPodcastService.resolveVersionForPlayback(lesson, { versionId, languageCode });
      if (!version || version.status !== "completed") {
        return res.status(404).json({ error: "Podcast version not found." });
      }
      const safeName = path.basename(requestedFile);
      if (safeName !== requestedFile) {
        return res.status(400).json({ error: "Invalid HLS file path." });
      }
      const resolvedAudioPath = resolveStoragePath(version.storageKey || "");
      if (!resolvedAudioPath) {
        return res.status(404).json({ error: "Podcast file unavailable." });
      }
      const manifestDir = path.join(path.dirname(resolvedAudioPath), "hls");
      const fullPath = path.join(manifestDir, safeName);
      const normalizedManifestDir = path.resolve(manifestDir);
      const normalizedPath = path.resolve(fullPath);
      if (!normalizedPath.startsWith(normalizedManifestDir + path.sep) && normalizedPath !== normalizedManifestDir) {
        return res.status(400).json({ error: "Invalid HLS file path." });
      }
      if (!fs.existsSync(normalizedPath)) {
        return res.status(404).json({ error: "HLS asset not found." });
      }

      const extension = path.extname(safeName).toLowerCase();
      if (extension === ".m3u8") {
        res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      } else if (extension === ".ts") {
        res.setHeader("Content-Type", "video/mp2t");
      } else if (extension === ".m4s") {
        res.setHeader("Content-Type", "video/iso.segment");
      } else if (extension === ".mp4") {
        res.setHeader("Content-Type", "audio/mp4");
      } else if (extension === ".aac") {
        res.setHeader("Content-Type", "audio/aac");
      } else {
        res.setHeader("Content-Type", "application/octet-stream");
      }
      res.setHeader("Cache-Control", "private, max-age=60");
      pushPodcastDebugEvent({
        source: "server",
        category: "hls_asset_served",
        lessonId,
        versionId,
        languageCode: languageCode || undefined,
        route: "podcast/hls",
        statusCode: 200,
        details: {
          fileName: safeName,
          ext: extension,
          userAgent: req.headers["user-agent"] || null,
        },
      });
      return res.sendFile(normalizedPath);
    } catch (error: any) {
      pushPodcastDebugEvent({
        source: "server",
        category: "hls_asset_error",
        lessonId: req.params.lessonId,
        versionId: req.params.versionId,
        route: "podcast/hls",
        statusCode: 500,
        message: String(error?.message || "unknown"),
        details: {
          fileName: req.params.fileName,
          query: req.query,
          userAgent: req.headers["user-agent"] || null,
        },
      });
      console.error("Podcast HLS endpoint error:", error);
      return res.status(500).json({ error: error?.message || "Failed to serve podcast HLS asset." });
    }
  });

  app.get("/api/lessons/:lessonId/podcast/stream", async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const permission = await canUserPlayLessonPodcast(req, lessonId);
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason || "Podcast playback not allowed." });
      }

      const lesson = await LessonPodcastService.getLesson(lessonId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const versionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const signed = languageCode
        ? await LessonPodcastService.getSignedUrlForLanguage(lesson, languageCode, versionId)
        : await LessonPodcastService.getSignedUrlForVersion(lesson, versionId);
      if (!signed.url || !signed.version) {
        return res.status(404).json({ error: "No playable podcast available for this lesson." });
      }

      const trySetHeader = (name: string, value: string | null | undefined) => {
        if (value) res.setHeader(name, value);
      };

      const resolvedPath = resolveStoragePath(signed.version.storageKey || "");
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const stat = await fs.promises.stat(resolvedPath);
        const total = stat.size;
        const rangeHeader = typeof req.headers.range === "string" ? req.headers.range : null;

        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Cache-Control", "private, no-cache");

        if (rangeHeader) {
          const parsedRange = parseSingleByteRangeHeader(rangeHeader, total);
          if ("error" in parsedRange) {
            pushPodcastDebugEvent({
              source: "server",
              category: "stream_range_invalid",
              lessonId,
              versionId: signed.version.id,
              languageCode: languageCode || undefined,
              route: "podcast/stream",
              statusCode: 416,
              details: {
                range: rangeHeader,
                totalBytes: total,
                userAgent: req.headers["user-agent"] || null,
              },
            });
            res.status(416);
            res.setHeader("Content-Range", `bytes */${total}`);
            return res.end();
          }
          const start = parsedRange.start;
          const end = parsedRange.end;
          const chunkSize = (end - start) + 1;
          res.status(206);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
          res.setHeader("Content-Length", String(chunkSize));
          const stream = fs.createReadStream(resolvedPath, { start, end });
          pushPodcastDebugEvent({
            source: "server",
            category: "stream_range_served",
            lessonId,
            versionId: signed.version.id,
            languageCode: languageCode || undefined,
            route: "podcast/stream",
            statusCode: 206,
            details: {
              range: rangeHeader,
              start,
              end,
              totalBytes: total,
              userAgent: req.headers["user-agent"] || null,
            },
          });
          stream.on("error", () => {
            if (!res.headersSent) {
              res.status(500).json({ error: "Failed to stream podcast file." });
            }
          });
          stream.pipe(res);
          return;
        }

        res.setHeader("Content-Length", String(total));
        pushPodcastDebugEvent({
          source: "server",
          category: "stream_full_served",
          lessonId,
          versionId: signed.version.id,
          languageCode: languageCode || undefined,
          route: "podcast/stream",
          statusCode: 200,
          details: {
            totalBytes: total,
            userAgent: req.headers["user-agent"] || null,
          },
        });
        const stream = fs.createReadStream(resolvedPath);
        stream.on("error", () => {
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to stream podcast file." });
          }
        });
        stream.pipe(res);
        return;
      }

      const upstreamHeaders: Record<string, string> = {};
      if (typeof req.headers.range === "string" && req.headers.range.trim()) {
        upstreamHeaders.Range = req.headers.range;
      }

      const upstream = await fetch(signed.url, {
        method: "GET",
        headers: upstreamHeaders,
        redirect: "follow",
      });

      if (!upstream.ok && upstream.status !== 206) {
        pushPodcastDebugEvent({
          source: "server",
          category: "stream_upstream_error",
          lessonId,
          versionId: signed.version.id,
          languageCode: languageCode || undefined,
          route: "podcast/stream",
          statusCode: upstream.status,
          details: {
            upstreamStatus: upstream.status,
            range: req.headers.range || null,
            userAgent: req.headers["user-agent"] || null,
          },
        });
        return res.status(upstream.status).json({ error: "Failed to stream podcast file." });
      }

      res.status(upstream.status);
      trySetHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
      trySetHeader("Content-Length", upstream.headers.get("content-length"));
      trySetHeader("Accept-Ranges", upstream.headers.get("accept-ranges") || "bytes");
      trySetHeader("Content-Range", upstream.headers.get("content-range"));
      trySetHeader("Cache-Control", upstream.headers.get("cache-control"));
      trySetHeader("ETag", upstream.headers.get("etag"));
      trySetHeader("Last-Modified", upstream.headers.get("last-modified"));

      if (!upstream.body) {
        pushPodcastDebugEvent({
          source: "server",
          category: "stream_upstream_empty_body",
          lessonId,
          versionId: signed.version.id,
          languageCode: languageCode || undefined,
          route: "podcast/stream",
          statusCode: upstream.status,
          details: {
            range: req.headers.range || null,
            userAgent: req.headers["user-agent"] || null,
          },
        });
        return res.end();
      }

      pushPodcastDebugEvent({
        source: "server",
        category: "stream_upstream_served",
        lessonId,
        versionId: signed.version.id,
        languageCode: languageCode || undefined,
        route: "podcast/stream",
        statusCode: upstream.status,
        details: {
          range: req.headers.range || null,
          upstreamContentRange: upstream.headers.get("content-range"),
          upstreamAcceptRanges: upstream.headers.get("accept-ranges"),
          userAgent: req.headers["user-agent"] || null,
        },
      });

      const upstreamBody = Readable.fromWeb(upstream.body as any);
      upstreamBody.on("error", () => {
        if (!res.headersSent) {
          res.status(500).json({ error: "Failed to stream podcast file." });
        }
      });
      upstreamBody.pipe(res);
    } catch (error: any) {
      pushPodcastDebugEvent({
        source: "server",
        category: "stream_error",
        lessonId: req.params.lessonId,
        route: "podcast/stream",
        statusCode: 500,
        message: String(error?.message || "unknown"),
        details: {
          query: req.query,
          range: req.headers.range || null,
          userAgent: req.headers["user-agent"] || null,
        },
      });
      console.error("Podcast stream endpoint error:", error);
      res.status(500).json({ error: error?.message || "Failed to stream podcast" });
    }
  });

  app.get("/api/lessons/:lessonId/podcast/download", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const permission = await canUserPlayLessonPodcast(req, lessonId, { allowPublicOverview: false });
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason || "Podcast download not allowed." });
      }

      const lesson = await LessonPodcastService.getLesson(lessonId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const versionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const courseTitle = await getCourseTitleForLesson(lessonId);
      const effectiveLanguage = languageCode || lesson.languageCode || "en";
      const versionTokenFromId = (versionId || "").trim() ? String(versionId).trim().slice(0, 8) : null;
      const preferredFilename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: effectiveLanguage,
        version: normalizeVersionToken(versionTokenFromId || '1'),
        extension: 'mp3',
      });
      const signed = languageCode
        ? await LessonPodcastService.getSignedUrlForLanguage(lesson, languageCode, versionId, preferredFilename)
        : await LessonPodcastService.getSignedUrlForVersion(lesson, versionId, preferredFilename);
      if (!signed.url || !signed.version) {
        return res.status(404).json({ error: "No downloadable podcast available for this lesson." });
      }

      const signedVersionToken = signed.version?.id ? String(signed.version.id).slice(0, 8) : '1';
      const filename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: languageCode || signed.version.languageCode || lesson.languageCode || "en",
        version: normalizeVersionToken(signedVersionToken),
        extension: 'mp3',
      });
      const resolvedPath = resolveStoragePath(signed.version.storageKey || "");
      if (resolvedPath && fs.existsSync(resolvedPath)) {
        const stat = await fs.promises.stat(resolvedPath);
        res.setHeader("Content-Type", "audio/mpeg");
        res.setHeader("Content-Length", String(stat.size));
        res.setHeader("Cache-Control", "private, no-cache");
        res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
        await TranslationAnalyticsService.trackEvent({
          organizationId: lesson.organizationId,
          userId: req.session?.userId || null,
          eventType: "podcast_download",
          resourceType: "podcast",
          resourceId: lessonId,
          languageCode: languageCode || signed.version.languageCode || lesson.languageCode || "en",
          variantId: signed.version.id,
          contentGroupId: lesson.contentGroupId || null,
          metadata: { route: "podcast/download", source: "local-file" },
          dedupeSeed: `podcast-download:${lessonId}:${signed.version.id}:${new Date().toISOString().slice(0, 16)}`,
        });
        const stream = fs.createReadStream(resolvedPath);
        stream.on("error", () => {
          if (!res.headersSent) {
            res.status(500).json({ error: "Failed to stream podcast file." });
          }
        });
        stream.pipe(res);
        return;
      }
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      await TranslationAnalyticsService.trackEvent({
        organizationId: lesson.organizationId,
        userId: req.session?.userId || null,
        eventType: "podcast_download",
        resourceType: "podcast",
        resourceId: lessonId,
        languageCode: languageCode || signed.version.languageCode || lesson.languageCode || "en",
        variantId: signed.version.id,
        contentGroupId: lesson.contentGroupId || null,
        metadata: { route: "podcast/download", source: "signed-url-redirect" },
        dedupeSeed: `podcast-download:${lessonId}:${signed.version.id}:${new Date().toISOString().slice(0, 16)}:redirect`,
      });
      return res.redirect(signed.url);
    } catch (error: any) {
      console.error("Podcast download endpoint error:", error);
      res.status(500).json({ error: error?.message || "Failed to download podcast" });
    }
  });

  app.get("/api/lessons/:lessonId/podcast/script/download", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const permission = await canUserPlayLessonPodcast(req, lessonId, { allowPublicOverview: false });
      if (!permission.allowed) {
        return res.status(403).json({ error: permission.reason || "Podcast script download not allowed." });
      }

      const lesson = await LessonPodcastService.getLesson(lessonId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });
      const versionId = req.query.versionId ? String(req.query.versionId) : undefined;
      const languageCode = req.query.languageCode ? String(req.query.languageCode) : undefined;
      const meta = LessonPodcastService.getMetadata(lesson);
      const selection = resolvePodcastScriptDownloadSelection(meta, {
        versionId,
        languageCode,
      });
      if (!selection.scriptText) {
        return res.status(404).json({ error: selection.reason || "No script text found for selected podcast version." });
      }

      const lang = selection.languageCode || languageCode || lesson.languageCode || "en";
      const versionSuffix = String(selection.versionId || versionId || "script").slice(0, 8);
      const courseTitle = await getCourseTitleForLesson(lessonId);
      const filename = buildLessonArtifactFilename({
        courseTitle,
        lessonTitle: lesson.title,
        languageCode: lang,
        version: normalizeVersionToken(versionSuffix),
        extension: 'txt',
      });
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
      return res.send(selection.scriptText);
    } catch (error: any) {
      console.error("Podcast script download endpoint error:", error);
      res.status(500).json({ error: error?.message || "Failed to download podcast script" });
    }
  });

  app.get("/api/lessons/:lessonId/quiz-params", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const organizationId = lesson.organizationId;
      const lessonType = await LessonService.getEffectiveCourseLessonType(lessonId);
      if (lessonType === 'overview') {
        return res.status(400).json({ error: "Quizzes are not allowed for overview lessons" });
      }

      // Get the PowerPoint transcript for quiz generation (prevents hallucinations)
      const transcript = await LessonService.getLessonTranscript(lessonId, organizationId);
      
      // Extract text content from transcript slides for quiz generation
      let transcriptText = "";
      let slideCount = 0;
      if (transcript && transcript.slides) {
        slideCount = transcript.slides.length;
        transcriptText = transcript.slides
          .map((slide: any, index: number) => {
            const slideText = slide.text || slide.content || slide.body || "";
            return `[Slide ${index + 1}]: ${slideText}`;
          })
          .join("\n\n");
      }

      // Check if lesson is part of a course - inherit course settings if so
      let courseContext: { 
        courseId?: string; 
        courseUnitId?: string; 
        courseSubUnitId?: string; 
        courseUnitName?: string;
        courseSubUnitName?: string;
        courseTitle?: string;
      } = {};
      
      const [courseLesson] = await db
        .select({
          courseId: schema.courseLessons.courseId,
          courseTitle: schema.courses.title,
        })
        .from(schema.courseLessons)
        .innerJoin(schema.courses, eq(schema.courseLessons.courseId, schema.courses.id))
        .where(eq(schema.courseLessons.lessonId, lessonId))
        .limit(1);
      
      if (courseLesson) {
        courseContext = {
          courseId: courseLesson.courseId,
          courseTitle: courseLesson.courseTitle,
        };
        
        // Get course scope from courseAssignments (single source of truth)
        const courseAssignment = await db.query.courseAssignments.findFirst({
          where: eq(schema.courseAssignments.courseId, courseLesson.courseId),
        });
        
        if (courseAssignment) {
          courseContext.courseUnitId = courseAssignment.unitId || undefined;
          courseContext.courseSubUnitId = courseAssignment.subUnitId || undefined;
          
          // Fetch unit names for course context (IDs → Names)
          if (courseAssignment.unitId) {
            const unit = await db.query.organizationUnits.findFirst({
              where: eq(schema.organizationUnits.id, courseAssignment.unitId),
            });
            if (unit) {
              courseContext.courseUnitName = unit.name;
            }
          }
          
          if (courseAssignment.subUnitId) {
            const subUnit = await db.query.organizationSubUnits.findFirst({
              where: eq(schema.organizationSubUnits.id, courseAssignment.subUnitId),
            });
            if (subUnit) {
              courseContext.courseSubUnitName = subUnit.name;
            }
          }
        }
        
        console.log(`[QuizParams] Lesson ${lessonId} is part of course ${courseLesson.courseId}, unit=${courseContext.courseUnitName}, subUnit=${courseContext.courseSubUnitName}`);
      }

      // Determine effective values: prefer lesson's department/unit, fallback to course unit names
      // lessons use department/unit (strings), courses use unitId/subUnitId (IDs)
      const effectiveDepartment = lesson.department || courseContext.courseUnitName || "";
      const effectiveUnit = lesson.unit || courseContext.courseSubUnitName || "";

      // Build quiz params from lesson data
      const quizParams = {
        // Primary topic from lesson title
        primaryTopic: lesson.title || "",
        // Description for context
        suggestedDescription: lesson.description || "",
        // Subtopics can be derived from lesson metadata
        subtopic1: "",
        subtopic2: "",
        // Quiz name suggestion
        suggestedQuizName: lesson.title ? `${lesson.title} Quiz` : "",
        // Source lesson reference
        sourceLessonId: lessonId,
        // Organization context
        organizationId: organizationId,
        // Grade/subject from lesson if available
        grade: lesson.gradeLevel || "",
        subject: lesson.subject || "",
        // Department/unit context (with course fallback) - string names for display
        department: effectiveDepartment,
        unit: effectiveUnit,
        // ID fields for QuizWizard form population (course IDs take precedence for inheritance)
        // gradeId maps to organizationUnits.id (department/grade)
        // subjectId/unitId maps to organizationSubUnits.id (subject/unit)
        gradeId: courseContext.courseUnitId || "",
        subjectId: courseContext.courseSubUnitId || "",
        unitId: courseContext.courseSubUnitId || "", // alias for backward compatibility
        // Course context for reference
        courseId: courseContext.courseId || "",
        courseTitle: courseContext.courseTitle || "",
        // CRITICAL: Transcript content for grounded quiz generation
        transcriptText: transcriptText,
        transcriptSlideCount: slideCount,
        hasTranscript: !!transcriptText,
        transcriptStatus: lesson.transcriptStatus || "none",
      };

      // Log for debugging
      console.log(`[QuizParams] Lesson ${lessonId}: transcript=${!!transcriptText} (${slideCount} slides, ${transcriptText.length} chars)`);

      res.json(quizParams);
    } catch (error) {
      console.error("Get lesson quiz params error:", error);
      res.status(500).json({ error: "Failed to get quiz parameters" });
    }
  });

  /**
   * GET /api/lessons/:lessonId/quiz-sources
   * Returns selectable lesson content sources for quiz generation.
   */
  app.get("/api/lessons/:lessonId/quiz-sources", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const sourceData = await getLessonSourceOptions({
        lessonId,
        organizationId: lesson.organizationId,
        includeManualTopic: true,
      });
      return res.json(sourceData);
    } catch (error: any) {
      console.error("Get lesson quiz sources error:", error);
      return res.status(500).json({ error: error?.message || "Failed to load quiz sources" });
    }
  });

  /**
   * GET /api/lessons/:lessonId/extracted-content
   * 
   * Returns extracted PPTX text content for manual quiz creation.
   * If no transcript exists, triggers extraction and returns result.
   * 
   * Response format:
   * {
   *   lessonId: string,
   *   lessonTitle: string,
   *   status: "completed" | "extracted" | "no_pptx" | "failed",
   *   message: string,
   *   content: {
   *     slides: Array<{slideNumber, title, body, notes}>,
   *     totalSlides: number,
   *     extractedAt: string
   *   } | null,
   *   formattedText: string | null  // Ready-to-use text for quiz generation
   * }
   */
  app.get("/api/lessons/:lessonId/extracted-content", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const organizationId = lesson.organizationId;

      // Get or extract the transcript
      const result = await LessonService.getOrExtractTranscript(lessonId, organizationId);

      // Format transcript into readable text for quiz generation
      let formattedText: string | null = null;
      if (result.transcript && result.transcript.slides) {
        const { PptxExtractor } = await import('../services/pptxExtractor');
        formattedText = PptxExtractor.formatForPrompt(result.transcript.slides, 8000);
      }

      res.json({
        lessonId,
        lessonTitle: lesson.title,
        status: result.status,
        message: result.message,
        content: result.transcript,
        formattedText
      });
    } catch (error: any) {
      console.error("Get lesson extracted content error:", error);
      res.status(500).json({ 
        error: "Failed to get extracted content",
        message: error.message 
      });
    }
  });

  // ==================== LESSON UPLOAD ROUTES ====================

  app.post("/api/lessons/:lessonId/upload", 
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      pptxUpload.single('pptxFile')(req, res, (err: any) => {
        if (err) {
          console.error("Multer upload error:", err);
          if (err.message === 'Only PPTX files are allowed') {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'File upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { lessonId } = req.params;
        const organizationId = req.query.organizationId as string;

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID required" });
        }

        const lesson = await LessonService.getLessonById(lessonId, organizationId);
        if (!lesson) {
          return res.status(404).json({ error: "Lesson not found" });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No file uploaded" });
        }

        // Compress PPTX images before storing to reduce storage costs
        let finalBuffer = req.file.buffer;
        let wasCompressed = false;
        const originalSizeMB = (req.file.buffer.length / 1024 / 1024).toFixed(2);
        const MIN_VALID_COMPRESSED_SIZE = 100 * 1024; // 100KB minimum for valid compressed output
        const tempInputPath = path.join(os.tmpdir(), `replace-upload-${Date.now()}.pptx`);
        let outputPathToCleanup: string | null = null;

        try {
          await fs.promises.writeFile(tempInputPath, req.file.buffer);
          
          const compressionResult = await compressPPTX(tempInputPath, {
            sizeThresholdMB: 25, // Compress files larger than 25MB - skip compression for smaller files
            imageQuality: 72,
            targetMaxSizeMB: 95,
          });
          
          if (compressionResult.compressed) {
            outputPathToCleanup = compressionResult.outputPath;
            const compressedBuffer = await fs.promises.readFile(compressionResult.outputPath);
            const compressedSizeMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
            
            // Validate compression output - reject suspiciously small files (likely corrupted)
            if (compressedBuffer.length < MIN_VALID_COMPRESSED_SIZE) {
              console.warn(`[Routes] Replace PPTX compression produced suspiciously small file (${compressedBuffer.length} bytes), using original`);
              finalBuffer = req.file.buffer;
              wasCompressed = false;
            } else {
              finalBuffer = compressedBuffer;
              wasCompressed = true;
              const savings = ((1 - compressionResult.compressionRatio) * 100).toFixed(1);
              console.log(`[Routes] Replace PPTX compressed: ${originalSizeMB}MB → ${compressedSizeMB}MB (${savings}% savings)`);
            }
          } else {
            console.log(`[Routes] Replace PPTX size OK (${originalSizeMB}MB) - no compression needed`);
          }
        } catch (compressionError) {
          console.error(`[Routes] Replace PPTX compression failed, using original:`, compressionError);
          finalBuffer = req.file.buffer;
          wasCompressed = false;
        } finally {
          // Always cleanup temp files
          try { await fs.promises.unlink(tempInputPath); } catch { /* ignore */ }
          if (outputPathToCleanup) {
            try { await fs.promises.unlink(outputPathToCleanup); } catch { /* ignore */ }
          }
        }

        const { lesson: updatedLesson } = await LessonService.storePPTX(lessonId, finalBuffer, userId, {
          isCompressed: wasCompressed,
          languageCode: lesson.languageCode || 'en',
          awaitSlidePreconvertMs: 12000,
        });

        // Always set generationStatus to 'completed' after successful PPTX upload
        // This ensures lesson viewer shows the PPTX correctly regardless of prior status
        if (lesson.generationStatus !== 'completed') {
          await db.update(lessons)
            .set({ 
              generationStatus: 'completed',
              updatedAt: new Date()
            })
            .where(eq(lessons.id, lessonId));
          console.log(`[Routes] Updated generationStatus to 'completed' for lesson ${lessonId} (was: ${lesson.generationStatus})`);
        }

        console.log(`[Routes] User ${userId} uploaded PPTX for lesson ${lessonId} (${req.file.size} bytes)`);

        // Mark linked quizzes as outdated since PPTX content has changed
        // This ensures quiz grounding is enforced - users must regenerate quizzes from new content
        try {
          const outdatedCount = await markQuizzesAsOutdated(lessonId);
          if (outdatedCount > 0) {
            console.log(`[Routes] Marked ${outdatedCount} linked quiz(es) as outdated after PPTX upload for lesson ${lessonId}`);
          }
        } catch (quizError) {
          console.error(`[Routes] Error marking quizzes as outdated for lesson ${lessonId}:`, quizError);
          // Don't fail the upload - quiz marking is non-critical
        }

        res.json({ 
          message: "PPTX uploaded successfully",
          lesson: updatedLesson
        });
      } catch (error: any) {
        console.error("Upload PPTX error:", error);
        res.status(500).json({ error: error?.message || "Failed to upload PPTX" });
      }
    }
  );

  app.post("/api/lessons/:lessonId/upload-video",
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      videoUpload.single('videoFile')(req, res, (err: any) => {
        if (err) {
          console.error("Multer video upload error:", err);
          if (err.message === 'Only MP4 video files are allowed') {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Video file too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'Video upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { lessonId } = req.params;
        const organizationId = req.query.organizationId as string;

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID required" });
        }

        const lesson = await LessonService.getLessonById(lessonId, organizationId);
        if (!lesson) {
          return res.status(404).json({ error: "Lesson not found" });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No video file uploaded" });
        }

        const updatedLesson = await LessonService.storeVideo(lessonId, req.file.buffer, req.file.size, userId);

        console.log(`[Routes] User ${userId} uploaded video for lesson ${lessonId} (${req.file.size} bytes)`);

        res.json({
          message: "Video uploaded successfully",
          lesson: updatedLesson
        });
      } catch (error: any) {
        console.error("Upload video error:", error);
        res.status(500).json({ error: error?.message || "Failed to upload video" });
      }
    }
  );

  // Upload PPTX file directly (for manual lesson creation, sets generationStatus to 'completed')
  app.post("/api/lessons/:lessonId/upload-pptx",
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      pptxUpload.single('pptxFile')(req, res, (err: any) => {
        if (err) {
          console.error("Multer PPTX upload error:", err);
          if (err.message === 'Only PPTX files are allowed') {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'PPTX upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { lessonId } = req.params;
        const organizationId = req.query.organizationId as string;

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID required" });
        }

        const lesson = await LessonService.getLessonById(lessonId, organizationId);
        if (!lesson) {
          return res.status(404).json({ error: "Lesson not found" });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No PPTX file uploaded" });
        }

        // Compress PPTX images before storing to reduce storage costs
        let finalBuffer = req.file.buffer;
        let wasCompressed = false;
        const originalSizeMB = (req.file.buffer.length / 1024 / 1024).toFixed(2);
        const MIN_VALID_COMPRESSED_SIZE = 100 * 1024; // 100KB minimum for valid compressed output
        const tempInputPath = path.join(os.tmpdir(), `upload-pptx-${Date.now()}.pptx`);
        let outputPathToCleanup: string | null = null;

        try {
          await fs.promises.writeFile(tempInputPath, req.file.buffer);
          
          const compressionResult = await compressPPTX(tempInputPath, {
            sizeThresholdMB: 25, // Compress files larger than 25MB - skip compression for smaller files
            imageQuality: 72,
            targetMaxSizeMB: 95,
          });
          
          if (compressionResult.compressed) {
            outputPathToCleanup = compressionResult.outputPath;
            const compressedBuffer = await fs.promises.readFile(compressionResult.outputPath);
            const compressedSizeMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);
            
            // Validate compression output - reject suspiciously small files (likely corrupted)
            if (compressedBuffer.length < MIN_VALID_COMPRESSED_SIZE) {
              console.warn(`[Routes] Upload PPTX compression produced suspiciously small file (${compressedBuffer.length} bytes), using original`);
              finalBuffer = req.file.buffer;
              wasCompressed = false;
            } else {
              finalBuffer = compressedBuffer;
              wasCompressed = true;
              const savings = ((1 - compressionResult.compressionRatio) * 100).toFixed(1);
              console.log(`[Routes] Upload PPTX compressed: ${originalSizeMB}MB → ${compressedSizeMB}MB (${savings}% savings)`);
            }
          } else {
            console.log(`[Routes] Upload PPTX size OK (${originalSizeMB}MB) - no compression needed`);
          }
        } catch (compressionError) {
          console.error(`[Routes] Upload PPTX compression failed, using original:`, compressionError);
          finalBuffer = req.file.buffer;
          wasCompressed = false;
        } finally {
          // Always cleanup temp files
          try { await fs.promises.unlink(tempInputPath); } catch { /* ignore */ }
          if (outputPathToCleanup) {
            try { await fs.promises.unlink(outputPathToCleanup); } catch { /* ignore */ }
          }
        }

        // Store PPTX to object storage and update lesson.storageKey
        const { lesson: updatedLesson } = await LessonService.storePPTX(lessonId, finalBuffer, userId, {
          isCompressed: wasCompressed,
          languageCode: lesson.languageCode || 'en',
          awaitSlidePreconvertMs: 12000,
        });

        // Set generationStatus to 'completed' if not already set or if it was failed (manual upload means content is ready)
        if (!updatedLesson.generationStatus || updatedLesson.generationStatus === 'pending' || updatedLesson.generationStatus === 'failed') {
          await db.update(lessons)
            .set({ 
              generationStatus: 'completed',
              updatedAt: new Date()
            })
            .where(eq(lessons.id, lessonId));
        }

        console.log(`[Routes] User ${userId} uploaded PPTX for lesson ${lessonId} via upload-pptx (${req.file.size} bytes)`);

        // Mark linked quizzes as outdated since PPTX content has changed
        try {
          const outdatedCount = await markQuizzesAsOutdated(lessonId);
          if (outdatedCount > 0) {
            console.log(`[Routes] Marked ${outdatedCount} linked quiz(es) as outdated after PPTX upload for lesson ${lessonId}`);
          }
        } catch (quizError) {
          console.error(`[Routes] Error marking quizzes as outdated for lesson ${lessonId}:`, quizError);
        }

        res.json({
          message: "PPTX uploaded successfully",
          lesson: { ...updatedLesson, generationStatus: 'completed' }
        });
      } catch (error: any) {
        console.error("Upload PPTX error:", error);
        res.status(500).json({ error: error?.message || "Failed to upload PPTX" });
      }
    }
  );

  app.post("/api/lessons/:lessonId/upload-translated-content",
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      documentUpload.single('document')(req, res, (err: any) => {
        if (err) {
          console.error("Multer translated content upload error:", err);
          if (String(err.message || '').startsWith('Only Word documents')) {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'Document upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { lessonId } = req.params;
        const organizationId = req.body?.organizationId || req.query.organizationId as string;

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID required" });
        }

        const lesson = await LessonService.getLessonById(lessonId, organizationId);
        if (!lesson) {
          return res.status(404).json({ error: "Lesson not found" });
        }

        if (lesson.translationStatus && lesson.translationStatus !== 'draft' && lesson.translationStatus !== 'published') {
          return res.status(400).json({ error: "Translated lesson is not editable in current status: " + lesson.translationStatus });
        }

        const jobs = await JobQueueService.getJobsForLesson(lessonId);
        const activeJob = jobs.find(j => j.status === 'pending' || j.status === 'claimed' || j.status === 'polling');
        if (activeJob) {
          return res.status(409).json({ error: "Cannot upload content while PPTX generation is in progress." });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No document file uploaded" });
        }

        const fileBuffer = req.file.buffer;

        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        const extractedText = result.value;

        const lines = extractedText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
        const newTitle = lines[0] || lesson.title;
        const newInputText = extractedText;

        await LessonVersioningService.createVersion({
          lessonId: lesson.id,
          organizationId: lesson.organizationId || organizationId,
          editedBy: userId,
          changeDescription: 'Uploaded translated Word document',
          currentLesson: lesson,
        });

        await db.update(schema.lessons)
          .set({
            inputText: newInputText,
            title: newTitle,
            translationStatus: 'draft',
            updatedAt: new Date(),
          })
          .where(eq(schema.lessons.id, lessonId));

        const objectStorageService = new ObjectStorageService();
        const langCode = lesson.languageCode || 'en';
        await objectStorageService.uploadSourceDocument(
          lesson.organizationId || organizationId,
          lessonId,
          fileBuffer,
          req.file.mimetype,
          req.file.originalname,
          langCode
        );

        console.log(`[Routes] User ${userId} uploaded translated content for lesson ${lessonId} (${fileBuffer.length} bytes, lang: ${langCode})`);

        try {
          await db.update(schema.lessonTranslationJobs)
            .set({ currentStep: 'content_uploaded', updatedAt: new Date() })
            .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
        } catch (stepErr) {
          console.warn(`[TranslationWizard] Failed to update step for lesson ${lessonId}:`, stepErr);
        }

        let detectedLanguage = 'en';
        try {
          detectedLanguage = await ContentLanguageService.detectDocumentLanguage(extractedText);
        } catch (detectErr) {
          console.warn('[Routes] Language detection failed for translated content, defaulting to en:', detectErr);
        }

        res.json({
          success: true,
          message: "Translated content uploaded successfully",
          lessonId: lessonId,
          detectedLanguage,
        });
      } catch (error) {
        console.error("Upload translated content error:", error);
        res.status(500).json({ error: "Failed to upload translated content" });
      }
    }
  );

  app.post("/api/lessons/:lessonId/upload-translated-pptx",
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      pptxUpload.single('file')(req, res, (err: any) => {
        if (err) {
          console.error("Multer translated PPTX upload error:", err);
          if (err.message === 'Only PPTX files are allowed') {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'PPTX upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { lessonId } = req.params;
        const organizationId = req.body?.organizationId || req.query.organizationId as string;

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID required" });
        }

        const lesson = (req as any).lesson;
        if (!lesson) {
          return res.status(404).json({ error: "Lesson not found" });
        }

        if (lesson.translationStatus && lesson.translationStatus !== 'draft' && lesson.translationStatus !== 'published') {
          return res.status(400).json({ error: "Translated lesson is not editable in current status: " + lesson.translationStatus });
        }

        const jobs = await JobQueueService.getJobsForLesson(lessonId);
        const activeJob = jobs.find(j => j.status === 'pending' || j.status === 'claimed' || j.status === 'polling');
        if (activeJob) {
          return res.status(409).json({ error: "Cannot upload PPTX while PPTX generation is in progress." });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No PPTX file uploaded" });
        }

        let finalBuffer = req.file.buffer;
        let wasCompressed = false;
        const originalSizeMB = (req.file.buffer.length / 1024 / 1024).toFixed(2);
        const MIN_VALID_COMPRESSED_SIZE = 100 * 1024;
        const tempInputPath = path.join(os.tmpdir(), `upload-translated-pptx-${Date.now()}.pptx`);
        let outputPathToCleanup: string | null = null;

        try {
          await fs.promises.writeFile(tempInputPath, req.file.buffer);

          const compressionResult = await compressPPTX(tempInputPath, {
            sizeThresholdMB: 25,
            imageQuality: 72,
            targetMaxSizeMB: 95,
          });

          if (compressionResult.compressed) {
            outputPathToCleanup = compressionResult.outputPath;
            const compressedBuffer = await fs.promises.readFile(compressionResult.outputPath);
            const compressedSizeMB = (compressedBuffer.length / 1024 / 1024).toFixed(2);

            if (compressedBuffer.length < MIN_VALID_COMPRESSED_SIZE) {
              console.warn(`[Routes] Translated PPTX compression produced suspiciously small file (${compressedBuffer.length} bytes), using original`);
              finalBuffer = req.file.buffer;
              wasCompressed = false;
            } else {
              finalBuffer = compressedBuffer;
              wasCompressed = true;
              const savings = ((1 - compressionResult.compressionRatio) * 100).toFixed(1);
              console.log(`[Routes] Translated PPTX compressed: ${originalSizeMB}MB → ${compressedSizeMB}MB (${savings}% savings)`);
            }
          } else {
            console.log(`[Routes] Translated PPTX size OK (${originalSizeMB}MB) - no compression needed`);
          }
        } catch (compressionError) {
          console.error(`[Routes] Translated PPTX compression failed, using original:`, compressionError);
          finalBuffer = req.file.buffer;
          wasCompressed = false;
        } finally {
          try { await fs.promises.unlink(tempInputPath); } catch { /* ignore */ }
          if (outputPathToCleanup) {
            try { await fs.promises.unlink(outputPathToCleanup); } catch { /* ignore */ }
          }
        }

        const langCode = lesson.languageCode || 'en';
        const storeResult = await LessonService.storePPTX(lessonId, finalBuffer, userId, {
          isGenerated: false,
          isCompressed: wasCompressed,
          languageCode: langCode,
          awaitSlidePreconvertMs: 12000,
        });

        await db.update(schema.lessons)
          .set({ translationStatus: 'draft', updatedAt: new Date() })
          .where(eq(schema.lessons.id, lessonId));

        console.log(`[Routes] User ${userId} uploaded translated PPTX for lesson ${lessonId} (v${storeResult.versionInfo.version}, lang: ${langCode}, ${req.file.size} bytes)`);

        try {
          await db.update(schema.lessonTranslationJobs)
            .set({ currentStep: 'pptx_uploaded', updatedAt: new Date() })
            .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
        } catch (stepErr) {
          console.warn(`[TranslationWizard] Failed to update step for lesson ${lessonId}:`, stepErr);
        }

        res.json({ success: true, version: storeResult.versionInfo.version, storageKey: storeResult.versionInfo.storageKey });
      } catch (error) {
        console.error("Upload translated PPTX error:", error);
        res.status(500).json({ error: "Failed to upload translated PPTX" });
      }
    }
  );

  app.post("/api/lessons/:lessonId/translate-source-pptx", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const organizationId = req.body?.organizationId || req.query.organizationId as string;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const translatedLesson = (req as any).lesson;
      if (!translatedLesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      if (translatedLesson.translationStatus && translatedLesson.translationStatus !== 'draft' && translatedLesson.translationStatus !== 'published') {
        return res.status(400).json({ error: "Translated lesson is not editable in current status: " + translatedLesson.translationStatus });
      }

      const [latestJob] = await db
        .select()
        .from(lessonTranslationJobs)
        .where(and(
          eq(lessonTranslationJobs.lessonId, lessonId),
          eq(lessonTranslationJobs.organizationId, organizationId),
        ))
        .orderBy(desc(lessonTranslationJobs.createdAt))
        .limit(1);

      const metadata = translatedLesson.metadata && typeof translatedLesson.metadata === 'object'
        ? translatedLesson.metadata as any
        : {};
      const packageSourceLessonId = String(metadata?.translationPackage?.sourceLessonId || '').trim() || null;
      let sourceLessonId = String(latestJob?.sourceLessonId || '').trim() || packageSourceLessonId;
      if (!sourceLessonId && translatedLesson.contentGroupId) {
        const [defaultLanguageLesson] = await db
          .select({ id: lessons.id })
          .from(lessons)
          .where(and(
            eq(lessons.contentGroupId, translatedLesson.contentGroupId),
            eq(lessons.organizationId, organizationId),
            eq(lessons.isDefaultLanguage, true),
          ))
          .limit(1);
        if (defaultLanguageLesson?.id && defaultLanguageLesson.id !== lessonId) {
          sourceLessonId = defaultLanguageLesson.id;
        }
      }
      if (!sourceLessonId && translatedLesson.contentGroupId) {
        const [fallbackSource] = await db
          .select({ id: lessons.id })
          .from(lessons)
          .where(and(
            eq(lessons.contentGroupId, translatedLesson.contentGroupId),
            eq(lessons.organizationId, organizationId),
            sql`${lessons.id} <> ${lessonId}`,
          ))
          .orderBy(desc(lessons.updatedAt))
          .limit(1);
        if (fallbackSource?.id) {
          sourceLessonId = fallbackSource.id;
        }
      }
      if (!sourceLessonId) {
        return res.status(400).json({ error: "Source lesson for this translation could not be determined." });
      }

      const [sourceLesson] = await db
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.id, sourceLessonId),
            eq(lessons.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!sourceLesson) {
        return res.status(404).json({ error: "Source lesson not found for translation." });
      }

      if (!sourceLesson.storageKey) {
        return res.status(400).json({ error: "Source lesson has no PPTX to translate." });
      }

      const objectStorageService = new ObjectStorageService();
      const sourcePptxBuffer = await objectStorageService.downloadLessonPPTXBuffer(sourceLesson.storageKey);

      const targetLanguageCode = translatedLesson.languageCode || 'en';
      const sourceLanguageCode = sourceLesson.languageCode || latestJob?.sourceLanguageCode || 'en';

      const translatedPptx = await PptxTextTranslationService.translatePptxText(
        sourcePptxBuffer,
        targetLanguageCode,
        sourceLanguageCode,
      );

      const storeResult = await LessonService.storePPTX(lessonId, translatedPptx.buffer, userId, {
        isGenerated: false,
        isCompressed: false,
        languageCode: targetLanguageCode,
        awaitSlidePreconvertMs: 12000,
      });

      await db.update(schema.lessons)
        .set({ translationStatus: 'draft', updatedAt: new Date() })
        .where(eq(schema.lessons.id, lessonId));

      try {
        await db.update(schema.lessonTranslationJobs)
          .set({ currentStep: 'pptx_uploaded', updatedAt: new Date() })
          .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
      } catch (stepErr) {
        console.warn(`[TranslationWizard] Failed to update step for lesson ${lessonId}:`, stepErr);
      }

      console.log(
        `[Routes] User ${userId} translated source PPTX for lesson ${lessonId} using in-place text translation (${translatedPptx.translatedNodes} nodes, ${translatedPptx.translatedFiles} files)`
      );

      res.json({
        success: true,
        version: storeResult.versionInfo.version,
        storageKey: storeResult.versionInfo.storageKey,
        translatedNodes: translatedPptx.translatedNodes,
        translatedFiles: translatedPptx.translatedFiles,
      });
    } catch (error) {
      console.error("Translate source PPTX error:", error);
      res.status(500).json({ error: "Failed to translate source PPTX" });
    }
  });

  app.post("/api/lessons/:lessonId/generate-translated-pptx", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId, themeId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = (req as any).lesson;
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      if (lesson.translationStatus && lesson.translationStatus !== 'draft' && lesson.translationStatus !== 'published') {
        return res.status(400).json({ error: "Translated lesson is not editable in current status: " + lesson.translationStatus });
      }

      if (!lesson.inputText) {
        return res.status(400).json({ error: "Lesson has no translated content to generate from. Please upload or translate content first." });
      }

      const { hasActive, activeJob } = await JobQueueService.hasActiveJobForUser(userId);
      if (hasActive && activeJob) {
        if (activeJob.lessonId !== lessonId) {
          return res.status(429).json({
            error: "Generation in progress",
            message: "You already have a lesson being generated. Please wait for it to complete or fail before starting a new generation.",
            activeJobId: activeJob.id,
            activeJobStatus: activeJob.status,
            activeLessonId: activeJob.lessonId,
          });
        } else {
          return res.json({
            success: true,
            job: activeJob,
            message: "Existing generation job found for this lesson",
          });
        }
      }

      const [pricing] = await db
        .select()
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);
      const creditsRequired = pricing?.creditsPerTranslatedPptxGeneration ?? 50;

      const preview = await HybridCreditService.previewDeduction({
        userId,
        organizationId,
        amount: creditsRequired,
      });

      if (!preview.canDeduct) {
        const totalAvailable = preview.userBalance + (preview.orgWalletEnabled && preview.userAuthorized ? preview.orgBalance : 0);
        return res.status(402).json({
          error: "Insufficient credits",
          message: `Translated PPTX generation requires ${creditsRequired} credits. You have ${totalAvailable} credits available.`,
          requiredCredits: creditsRequired,
          currentBalance: totalAvailable,
          reason: preview.reason,
        });
      }

      await db.update(schema.lessons)
        .set({ generationStatus: "pending", translationStatus: 'draft', updatedAt: new Date() })
        .where(eq(schema.lessons.id, lessonId));

      const job = await JobQueueService.createJobWithCleanup({
        organizationId,
        lessonId,
        metadata: {
          inputText: lesson.inputText,
          themeId: themeId || lesson.themeId || 'default-light',
          numCards: 10,
          generateImages: true,
          imageStyle: 'photorealistic',
          userId,
          isRegeneration: true,
          isTranslatedPptx: true,
        },
      });

      await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: creditsRequired,
        type: 'deduction',
        activityType: 'content_translation' as const,
        correlationId: `translated-pptx-gen-${lessonId}`,
        description: `Translated PPTX generation for lesson ${lessonId}`,
        metadata: { lessonId, isTranslatedPptx: true },
      });

      console.log(`[Routes] User ${userId} started translated PPTX generation for lesson ${lessonId} (${creditsRequired} credits charged)`);

      try {
        await db.update(schema.lessonTranslationJobs)
          .set({ currentStep: 'pptx_generating', updatedAt: new Date() })
          .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
      } catch (stepErr) {
        console.warn(`[TranslationWizard] Failed to update step for lesson ${lessonId}:`, stepErr);
      }

      res.json({ success: true, job, creditsCharged: creditsRequired });
    } catch (error) {
      console.error("Generate translated PPTX error:", error);
      res.status(500).json({ error: "Failed to start translated PPTX generation" });
    }
  });

  app.post("/api/lessons/:lessonId/supplement",
    requireLessonAdminAccess,
    (req: Request, res: Response, next: any) => {
      documentUpload.single('document')(req, res, (err: any) => {
        if (err) {
          console.error("Multer document upload error:", err);
          if (String(err.message || '').startsWith('Only Word documents')) {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'Document upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { lessonId } = req.params;
        const organizationId = req.query.organizationId as string;

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID required" });
        }

        const lesson = await LessonService.getLessonById(lessonId, organizationId);
        if (!lesson) {
          return res.status(404).json({ error: "Lesson not found" });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "No document file uploaded" });
        }

        // Capture old sourceDocumentPath BEFORE uploading new one (for cleanup)
        const oldSourceDocumentPath = lesson.sourceDocumentPath;

        const extractedContent = await DocumentExtractorService.extractTextFromDocx(req.file.buffer);
        
        // Upload document to Object Storage for persistent storage and versioning
        const objectStorageService = new ObjectStorageService();
        const sourceDocumentPath = await objectStorageService.uploadSourceDocument(
          organizationId,
          lessonId,
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
          lesson.languageCode || 'en'
        );
        
        console.log(`[Routes] Uploaded source document to Object Storage: ${sourceDocumentPath}`);
        
        const updatedLesson = await db.update(lessons)
          .set({
            inputText: extractedContent.text,
            sourceDocumentPath, // Store Object Storage path for retrieval
            lastFeedbackHash: null,
            feedbackReport: null,
            contentScore10: null,
          })
          .where(eq(lessons.id, lessonId))
          .returning();

        try {
          const [maxVersion] = await db
            .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
            .from(lessonContentVersions)
            .where(eq(lessonContentVersions.lessonId, lessonId));

          const nextVersionNumber = (maxVersion?.max || 0) + 1;

          await db.insert(lessonContentVersions).values({
            lessonId,
            versionNumber: nextVersionNumber,
            source: 'word_upload',
            changeDescription: `Uploaded Word document: ${req.file!.originalname} (${extractedContent.wordCount} words)`,
            previousContent: lesson.inputText,
            newContent: extractedContent.text,
            previousTitle: lesson.title,
            newTitle: lesson.title,
            previousDescription: lesson.description,
            newDescription: lesson.description,
            metadata: {
              sourceDocumentPath,
              originalFilename: req.file!.originalname,
              extractedWordCount: extractedContent.wordCount,
              mimetype: req.file!.mimetype,
              sourceDbVersion: true,
            },
            createdBy: userId,
          } as any);
        } catch (versionError) {
          console.error('[VersionTracking] Failed to record content version:', versionError);
        }

        // CLEANUP: Delete old source document from Object Storage after successful update
        // Only delete if old path exists and is different from new path
        if (oldSourceDocumentPath && oldSourceDocumentPath !== sourceDocumentPath) {
          try {
            const deleted = await objectStorageService.deleteObject(oldSourceDocumentPath);
            if (deleted) {
              console.log(`[Routes] Cleaned up old source document: ${oldSourceDocumentPath}`);
            } else {
              console.log(`[Routes] Old source document not found for cleanup: ${oldSourceDocumentPath}`);
            }
          } catch (cleanupError) {
            // Log but don't fail the request - cleanup is best-effort
            console.warn(`[Routes] Failed to cleanup old source document: ${oldSourceDocumentPath}`, cleanupError);
          }
        }

        console.log(`[Routes] User ${userId} uploaded Word supplement for lesson ${lessonId} (${extractedContent.wordCount} words)`);
        
        await syncLessonSourceContentToFrameworkTopics({
          lessonId,
          lessonTitle: lesson.title,
          sourceContent: extractedContent.text,
          userUploadedContent: true,
          reason: "word_upload",
        });

        const textPreview = extractedContent.text.length > 500 
          ? extractedContent.text.substring(0, 500) + '...'
          : extractedContent.text;

        let detectedLanguage = 'en';
        try {
          detectedLanguage = await ContentLanguageService.detectDocumentLanguage(extractedContent.text);
          if (detectedLanguage !== 'en' || !lesson.languageCode) {
            await db.update(lessons)
              .set({ languageCode: detectedLanguage })
              .where(eq(lessons.id, lessonId));
          }
        } catch (detectErr) {
          console.warn('[Routes] Language detection failed for supplement, defaulting to en:', detectErr);
        }

        res.json({
          success: true,
          lesson: updatedLesson[0],
          extractedWordCount: extractedContent.wordCount,
          extractedText: extractedContent.text,
          sourceDocumentPath,
          textPreview,
          detectedLanguage,
        });
      } catch (error) {
        console.error("Supplement document error:", error);
        res.status(500).json({ error: "Failed to process document" });
      }
    }
  );

  // ==================== LESSON SOURCE DOCUMENT ROUTES ====================

  /**
   * GET /api/lessons/:lessonId/source-document
   * Fetches source content for lesson authoring surfaces.
   *
   * Query:
   * - preferredSource=auto|sourcedb|word (default: auto)
   *   - auto: prefer Source DB (inputText), fallback to Word document extraction
   *   - sourcedb: require Source DB (inputText)
   *   - word: require uploaded Word source document extraction
   */
  app.get("/api/lessons/:lessonId/source-document", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const preferredSource = String(req.query.preferredSource || "auto").trim().toLowerCase();

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }
      if (!["auto", "sourcedb", "word"].includes(preferredSource)) {
        return res.status(400).json({ error: "Invalid preferredSource. Use auto, sourcedb, or word." });
      }

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      const hasInputText = !!(lesson.inputText && lesson.inputText.trim().length > 0);
      const hasWordDocument = !!lesson.sourceDocumentPath;

      const returnInputText = () => {
        if (!hasInputText) return false;
        const wordCount = lesson.inputText.split(/\s+/).filter(Boolean).length;
        console.log(`[Routes] Returning inputText content for lesson ${lessonId} (${wordCount} words, source: AI-improved or edited)`);
        res.json({
          success: true,
          hasSourceDocument: true,
          sourceDocumentPath: lesson.sourceDocumentPath || null,
          text: lesson.inputText,
          extractedWordCount: wordCount,
          source: 'inputText',
          languageCode: lesson.languageCode || "en",
          updatedAt: lesson.updatedAt || lesson.createdAt || new Date(),
        });
        return true;
      };

      const returnWordDocument = async () => {
        if (!hasWordDocument) {
          return res.status(404).json({
            error: "No source document found for this lesson",
            hasSourceDocument: false,
          });
        }

        const objectStorageService = new ObjectStorageService();
        try {
          const documentBuffer = await objectStorageService.downloadSourceDocument(lesson.sourceDocumentPath!);
          const extractedContent = await DocumentExtractorService.extractTextFromDocx(documentBuffer);

          console.log(`[Routes] Fetched source document content for lesson ${lessonId} (${extractedContent.wordCount} words, source: original document)`);

          return res.json({
            success: true,
            hasSourceDocument: true,
            sourceDocumentPath: lesson.sourceDocumentPath,
            text: extractedContent.text,
            extractedWordCount: extractedContent.wordCount,
            source: 'sourceDocument',
            languageCode: lesson.languageCode || "en",
            updatedAt: lesson.updatedAt || lesson.createdAt || new Date(),
          });
        } catch (downloadError: any) {
          console.error(`[Routes] Error downloading source document for lesson ${lessonId}:`, downloadError);
          return res.status(404).json({
            error: "Source document file not found or inaccessible",
            hasSourceDocument: false,
          });
        }
      };

      if (preferredSource === "sourcedb") {
        if (returnInputText()) return;
        return res.status(404).json({
          error: "No Source DB content found for this lesson",
          hasSourceDocument: hasWordDocument,
        });
      }

      if (preferredSource === "word") {
        return await returnWordDocument();
      }

      // auto mode: Source DB first, fallback to Word source
      if (returnInputText()) return;
      return await returnWordDocument();
    } catch (error) {
      console.error("Fetch source document error:", error);
      res.status(500).json({ error: "Failed to fetch source document content" });
    }
  });

  /**
   * PUT /api/lessons/:lessonId/source-document
   * Updates lesson Source DB content (inputText), records a new content version, and keeps latest as default.
   */
  app.put("/api/lessons/:lessonId/source-document", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const userId = req.session.userId;

      if (!userId) return res.status(401).json({ error: "Authentication required" });
      if (!organizationId) return res.status(400).json({ error: "Organization ID required" });

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const nextTextRaw = req.body?.text;
      const nextText = String(nextTextRaw ?? "").trim();
      if (!nextText) {
        return res.status(400).json({ error: "Source content text is required." });
      }
      if (nextText.length < 30) {
        return res.status(400).json({ error: "Source content is too short. Provide at least 30 characters." });
      }

      const previousText = String(lesson.inputText || "");
      if (nextText === previousText) {
        return res.json({
          success: true,
          unchanged: true,
          text: nextText,
          extractedWordCount: nextText.split(/\s+/).filter(Boolean).length,
          source: "inputText",
        });
      }

      const [maxVersion] = await db
        .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
        .from(lessonContentVersions)
        .where(eq(lessonContentVersions.lessonId, lessonId));
      const nextVersionNumber = (maxVersion?.max || 0) + 1;
      const now = new Date();
      const changeDescription = String(req.body?.changeDescription || "").trim() || "Manual Source DB content edit";

      await db.transaction(async (tx) => {
        await tx.update(lessons)
          .set({
            inputText: nextText,
            lastFeedbackHash: null,
            feedbackReport: null,
            contentScore10: null,
            previousScore10: null,
            lastFeedbackAt: null,
            updatedAt: now,
          })
          .where(eq(lessons.id, lessonId));

        await tx.insert(lessonContentVersions).values({
          lessonId,
          versionNumber: nextVersionNumber,
          source: "manual_edit",
          changeDescription,
          previousContent: previousText,
          newContent: nextText,
          previousTitle: lesson.title,
          newTitle: lesson.title,
          previousDescription: lesson.description,
          newDescription: lesson.description,
          metadata: {
            editor: "source_db_modal",
            editedAt: now.toISOString(),
          },
          createdBy: userId,
        } as any);
      });

      await syncLessonSourceContentToFrameworkTopics({
        lessonId,
        lessonTitle: lesson.title,
        sourceContent: nextText,
        userUploadedContent: true,
        reason: "manual_source_edit",
      });

      await TranslationIndexService.enqueueForLessonMutation({
        lessonId,
        organizationId,
        eventType: "set_current",
        dedupeSeed: `set-current:${lessonId}:manual-edit:${nextVersionNumber}`,
      });

      return res.json({
        success: true,
        lessonId,
        versionNumber: nextVersionNumber,
        text: nextText,
        extractedWordCount: nextText.split(/\s+/).filter(Boolean).length,
        source: "inputText",
      });
    } catch (error: any) {
      console.error("Update source document content error:", error);
      return res.status(500).json({ error: error?.message || "Failed to update source content" });
    }
  });

  /**
   * POST /api/lessons/:lessonId/source-document/set-current-version
   * Sets a selected source-content version as the active "current" content for this language lesson.
   * This is language-scoped because each language variant has its own lessonId/content history.
   */
  app.post("/api/lessons/:lessonId/source-document/set-current-version", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const userId = req.session.userId;

      if (!userId) return res.status(401).json({ error: "Authentication required" });
      if (!organizationId) return res.status(400).json({ error: "Organization ID required" });

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const targetVersionId = String(req.body?.versionId || "").trim();
      if (!targetVersionId) {
        return res.status(400).json({ error: "versionId is required." });
      }

      let targetText = "";
      let targetSource = "version_restore";
      let targetVersionNumber: number | null = null;

      if (targetVersionId === "current" || targetVersionId.startsWith("current-")) {
        return res.json({
          success: true,
          unchanged: true,
          lessonId,
          message: "Selected version is already current.",
        });
      }

      if (targetVersionId === "initial" || targetVersionId.startsWith("initial-")) {
        const versionsAsc = await db.select()
          .from(lessonContentVersions)
          .where(eq(lessonContentVersions.lessonId, lessonId))
          .orderBy(asc(lessonContentVersions.createdAt), asc(lessonContentVersions.versionNumber));

        if (versionsAsc.length > 0) {
          const first = versionsAsc[0];
          const firstPrevious = String(first.previousContent || "").trim();
          const firstNew = String(first.newContent || "").trim();
          targetText = firstPrevious || firstNew || String(lesson.inputText || "");
        } else {
          targetText = String(lesson.inputText || "");
        }
        targetSource = "initial_version_restore";
      } else {
        const [targetVersion] = await db.select()
          .from(lessonContentVersions)
          .where(and(
            eq(lessonContentVersions.id, targetVersionId),
            eq(lessonContentVersions.lessonId, lessonId),
          ))
          .limit(1);

        if (!targetVersion) {
          return res.status(404).json({ error: "Requested version not found for this lesson/language." });
        }

        targetText = String(targetVersion.newContent || "").trim();
        if (!targetText) {
          return res.status(400).json({ error: "Selected version has empty content and cannot be set as current." });
        }
        targetSource = "version_restore";
        targetVersionNumber = Number(targetVersion.versionNumber || 0);
      }

      if (!targetText) {
        return res.status(400).json({ error: "Resolved target content is empty and cannot be set as current." });
      }

      const previousText = String(lesson.inputText || "");
      if (previousText.trim() === targetText.trim()) {
        return res.json({
          success: true,
          unchanged: true,
          lessonId,
          message: "Selected version already matches current content.",
        });
      }

      const [maxVersion] = await db
        .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
        .from(lessonContentVersions)
        .where(eq(lessonContentVersions.lessonId, lessonId));
      const nextVersionNumber = (maxVersion?.max || 0) + 1;
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.update(lessons)
          .set({
            inputText: targetText,
            lastFeedbackHash: null,
            feedbackReport: null,
            contentScore10: null,
            previousScore10: null,
            lastFeedbackAt: null,
            updatedAt: now,
          })
          .where(eq(lessons.id, lessonId));

        await tx.insert(lessonContentVersions).values({
          lessonId,
          versionNumber: nextVersionNumber,
          source: targetSource,
          changeDescription: targetVersionNumber
            ? `Set v${targetVersionNumber} as current version`
            : "Set Initial version as current version",
          previousContent: previousText,
          newContent: targetText,
          previousTitle: lesson.title,
          newTitle: lesson.title,
          previousDescription: lesson.description,
          newDescription: lesson.description,
          metadata: {
            activatedVersionId: targetVersionId,
            activatedVersionNumber: targetVersionNumber,
            editor: "source_content_studio",
            activatedAt: now.toISOString(),
          },
          createdBy: userId,
        } as any);
      });

      await syncLessonSourceContentToFrameworkTopics({
        lessonId,
        lessonTitle: lesson.title,
        sourceContent: targetText,
        userUploadedContent: true,
        reason: "set_current_version",
      });

      await TranslationIndexService.enqueueForLessonMutation({
        lessonId,
        organizationId,
        eventType: "set_current",
        dedupeSeed: `set-current:${lessonId}:${targetVersionId}:${nextVersionNumber}`,
      });

      return res.json({
        success: true,
        lessonId,
        versionNumber: nextVersionNumber,
        source: "inputText",
        text: targetText,
        message: "Selected version is now the current version.",
      });
    } catch (error: any) {
      console.error("Set current source content version error:", error);
      return res.status(500).json({ error: error?.message || "Failed to set current source content version" });
    }
  });

  /**
   * POST /api/lessons/:lessonId/source-document/feedback-preview
   * Generates AI feedback for edited (even unsaved) source content.
   */
  const feedbackPreviewCache = new Map<string, { expiresAt: number; payload: any }>();
  const FEEDBACK_PREVIEW_CACHE_TTL_MS = Math.max(
    5_000,
    Math.min(180_000, Number(process.env.FEEDBACK_PREVIEW_CACHE_TTL_MS || 45_000))
  );
  const QUICK_PREVIEW_CHAR_BUDGET = Math.max(
    6_000,
    Math.min(24_000, Number(process.env.FEEDBACK_PREVIEW_QUICK_CHAR_BUDGET || 15_000))
  );
  const DEEP_PREVIEW_CHAR_BUDGET = Math.max(
    QUICK_PREVIEW_CHAR_BUDGET,
    Math.min(64_000, Number(process.env.FEEDBACK_PREVIEW_DEEP_CHAR_BUDGET || 30_000))
  );

  const compactFeedbackPreviewInput = (raw: string, mode: string): { text: string; truncated: boolean; originalChars: number } => {
    const value = String(raw || "");
    const originalChars = value.length;
    const budget = mode === "deep" ? DEEP_PREVIEW_CHAR_BUDGET : QUICK_PREVIEW_CHAR_BUDGET;
    if (originalChars <= budget) {
      return { text: value, truncated: false, originalChars };
    }

    const marker = "\n\n[... content condensed for preview responsiveness ...]\n\n";
    const head = Math.floor((budget - marker.length) * 0.65);
    const tail = Math.max(0, budget - marker.length - head);
    const compacted = `${value.slice(0, head)}${marker}${value.slice(Math.max(0, originalChars - tail))}`;
    return { text: compacted, truncated: true, originalChars };
  };

  app.post("/api/lessons/:lessonId/source-document/feedback-preview", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const requestStartedAt = Date.now();
      const correlationId = String(req.headers["x-correlation-id"] || "").trim() || `feedback-preview-${randomUUID()}`;
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const userId = req.session.userId;
      if (!organizationId) return res.status(400).json({ error: "Organization ID required" });
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const content = String(req.body?.text ?? "").trim();
      const mode = String(req.body?.mode || "quick").toLowerCase();
      const selectedVersionIdRaw = String(req.body?.selectedVersionId || "current");
      const compareBaseText = String(req.body?.compareBaseText ?? "").trim();
      if (!content) return res.status(400).json({ error: "Content text is required for feedback." });
      if (content.length < 30) return res.status(400).json({ error: "Content is too short for feedback analysis." });

      const contentHash = createHash('md5').update(content).digest('hex').substring(0, 32);
      const compareHash = compareBaseText
        ? createHash("md5").update(compareBaseText).digest("hex").substring(0, 16)
        : "none";
      const cacheKey = `${lessonId}|${mode}|${selectedVersionIdRaw}|${contentHash}|${compareHash}`;
      const cached = feedbackPreviewCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        console.log(
          `[FeedbackPreview] cache-hit lesson=${lessonId} user=${userId} mode=${mode} ` +
          `durationMs=${Date.now() - requestStartedAt} correlationId=${correlationId}`
        );
        return res.json({
          ...cached.payload,
          cached: true,
          correlationId,
        });
      }

      let promptContent = content;
      if (mode === "compare" && compareBaseText.length > 0) {
        promptContent = [
          "BASE VERSION:",
          compareBaseText,
          "",
          "COMPARE VERSION:",
          content,
          "",
          "Provide actionable feedback on what improved and what regressed."
        ].join("\n");
      } else {
        const compacted = compactFeedbackPreviewInput(content, mode);
        promptContent = compacted.text;
        if (compacted.truncated) {
          console.log(
            `[FeedbackPreview] compacted lesson=${lessonId} mode=${mode} ` +
            `originalChars=${compacted.originalChars} compactedChars=${promptContent.length} correlationId=${correlationId}`
          );
        }
      }

      const feedback = await contentCoachService.generatePreviewFeedback({
        title: lesson.title || "Lesson",
        description: lesson.description || "",
        detail: promptContent,
      });

      const improvements = Array.isArray((feedback as any).topImprovements)
        ? (feedback as any).topImprovements
        : [];

      const prioritizedActions = improvements
        .slice(0, mode === "deep" ? 5 : 3)
        .map((item: any) => ({
          id: item.id,
          priority: String(item.priority || "important"),
          title: String(item.title || "Improve content quality"),
          description: String(item.description || ""),
          effort: String(item.estimatedEffort || "medium"),
          impactScore: Number(item.impactScore || 0),
          category: String(item.category || "quality"),
          example: item.example ? String(item.example) : null,
        }));

      const weakestDimensions = Object.entries((feedback as any).rubric || {})
        .map(([key, value]: [string, any]) => ({
          key,
          name: String(value?.name || key),
          score: Number(value?.score || 0),
          whyItMatters: String(value?.feedback || ""),
          nextSteps: Array.isArray(value?.suggestions)
            ? value.suggestions.map((s: any) => String(s)).slice(0, mode === "deep" ? 3 : 2)
            : [],
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, mode === "deep" ? 3 : 2);

      const strengths = Array.isArray((feedback as any).strengths)
        ? (feedback as any).strengths.map((s: any) => String(s)).slice(0, mode === "deep" ? 5 : 3)
        : [];

      const selectedVersionContext = await resolveVersionContentForFeedback(
        lessonId,
        selectedVersionIdRaw,
        String(lesson.inputText || "")
      );
      const selectedVersionText = String(selectedVersionContext?.resolvedText || "").trim();
      const isFeedbackForSelectedPersistable = !!selectedVersionContext && selectedVersionText.length > 0 && content === selectedVersionText;
      const selectedVersionRef = selectedVersionContext?.contentVersionRef || normalizeFeedbackVersionRef(selectedVersionIdRaw, lessonId);
      const aiCandidates = await generateAIRelevanceCandidates(String(lesson.title || "Lesson"), content);
      const heuristicCandidates = generateHeuristicRelevanceCandidates(content);

      const dedupedCandidates: RelevanceAuditCandidate[] = [];
      const seen = new Set<string>();
      for (const candidate of [...aiCandidates, ...heuristicCandidates]) {
        const excerpt = String(candidate.excerpt || "").trim();
        if (!excerpt) continue;
        const category = normalizeRelevanceCategory(candidate.category);
        const confidence = clampConfidence(candidate.confidence);
        const candidateHash = createHash("sha256")
          .update(`${category}:${excerpt.toLowerCase()}:${candidate.title || ""}`)
          .digest("hex");
        if (seen.has(candidateHash)) continue;
        seen.add(candidateHash);
        dedupedCandidates.push({
          ...candidate,
          category,
          confidence,
          itemHash: candidateHash,
          defaultSelected: category === "off_topic" && confidence >= FEEDBACK_DEFAULT_SELECT_CONFIDENCE,
        });
      }

      const historicalRejectedRows = await db
        .select({ itemHash: lessonFeedbackItems.itemHash })
        .from(lessonFeedbackItems)
        .innerJoin(lessonFeedbackRuns, eq(lessonFeedbackRuns.id, lessonFeedbackItems.runId))
        .where(and(
          eq(lessonFeedbackItems.lessonId, lessonId),
          eq(lessonFeedbackItems.organizationId, organizationId),
          eq(lessonFeedbackRuns.contentVersionRef, selectedVersionRef),
          eq(lessonFeedbackRuns.contentHash, contentHash),
          inArray(lessonFeedbackItems.userDecision, ["rejected", "ignored"] as RelevanceDecision[]),
        ));
      const rejectedHashes = new Set(historicalRejectedRows.map((row) => String(row.itemHash || "")));
      const relevanceAudit = dedupedCandidates
        .filter((candidate) => !rejectedHashes.has(String(candidate.itemHash || "")))
        .slice(0, 16);

      // Persist feedback completion only when the analyzed text matches the current saved lesson content.
      // This ensures Course Lessons step state advances for real "Get Feedback" runs without marking
      // unsaved ad-hoc draft previews as the canonical lesson feedback result.
      if (isFeedbackForSelectedPersistable && selectedVersionRef.startsWith("current:")) {
        const overallScore = Number((feedback as any).overallScore || 0);
        const score10 = (Math.round(overallScore) / 10).toFixed(1);
        const currentHashShort = contentHash.slice(0, 16);

        await db
          .update(lessons)
          .set({
            contentScore10: score10,
            previousScore10: lesson.contentScore10 || null,
            lastFeedbackAt: new Date(),
            lastFeedbackHash: currentHashShort,
            feedbackReport: feedback,
            feedbackStatus: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, lessonId));
      }

      let feedbackRunId: string | null = null;
      let persistedRelevanceAudit: RelevanceAuditCandidate[] = relevanceAudit;
      if (isFeedbackForSelectedPersistable) {
        const [run] = await db.insert(lessonFeedbackRuns).values({
          lessonId,
          organizationId,
          languageCode: String(lesson.languageCode || "en"),
          contentVersionRef: selectedVersionRef,
          contentHash,
          feedbackMode: mode,
          score10: (Math.round(Number((feedback as any).overallScore || 0)) / 10).toFixed(1),
          summary: String((feedback as any).summary || ""),
          actionable: {
            overallScore: Number((feedback as any).overallScore || 0),
            qualityGrade: String((feedback as any).qualityGrade || "C"),
            strengths,
            prioritizedActions,
            weakestDimensions,
          },
          report: feedback,
          generatedBy: userId,
          metadata: {
            selectedVersionId: selectedVersionIdRaw,
            compareBaseProvided: !!compareBaseText,
            compareBaseHash: compareBaseText ? createHash("md5").update(compareBaseText).digest("hex").substring(0, 16) : null,
            persistedBecauseMatchedVersion: true,
          },
        } as any).returning({ id: lessonFeedbackRuns.id });
        feedbackRunId = run?.id || null;

        if (feedbackRunId && relevanceAudit.length > 0) {
          const insertedItems = await db.insert(lessonFeedbackItems).values(
            relevanceAudit.map((item, idx) => ({
              runId: feedbackRunId,
              lessonId,
              organizationId,
              languageCode: String(lesson.languageCode || "en"),
              itemIndex: idx + 1,
              itemHash: String(item.itemHash || ""),
              category: item.category,
              confidence: item.confidence.toFixed(4),
              title: item.title,
              reason: item.reason || null,
              excerpt: item.excerpt || null,
              spanStart: Number.isInteger(item.spanStart) ? item.spanStart : null,
              spanEnd: Number.isInteger(item.spanEnd) ? item.spanEnd : null,
              suggestedAction: item.suggestedAction || "remove",
              replacementText: item.replacementText || "",
              defaultSelected: !!item.defaultSelected,
              userDecision: "pending",
              metadata: {
                selectedVersionId: selectedVersionIdRaw,
              },
            }))
          ).returning({
            id: lessonFeedbackItems.id,
            itemHash: lessonFeedbackItems.itemHash,
            userDecision: lessonFeedbackItems.userDecision,
          });
          const insertedMap = new Map(insertedItems.map((item) => [String(item.itemHash), item]));
          persistedRelevanceAudit = relevanceAudit.map((item) => {
            const matched = insertedMap.get(String(item.itemHash || ""));
            return {
              ...item,
              id: matched?.id,
            };
          });
        }
      }

      const responsePayload = {
        success: true,
        report: feedback,
        actionable: {
          overallScore: Number((feedback as any).overallScore || 0),
          qualityGrade: String((feedback as any).qualityGrade || "C"),
          summary: String((feedback as any).summary || ""),
          strengths,
          prioritizedActions,
          weakestDimensions,
        },
        feedbackRunId,
        persistedForVersion: isFeedbackForSelectedPersistable,
        selectedVersionRef,
        relevanceAudit: persistedRelevanceAudit,
        correlationId,
      };

      feedbackPreviewCache.set(cacheKey, {
        payload: responsePayload,
        expiresAt: Date.now() + FEEDBACK_PREVIEW_CACHE_TTL_MS,
      });
      if (feedbackPreviewCache.size > 500) {
        const now = Date.now();
        for (const [key, entry] of feedbackPreviewCache.entries()) {
          if (entry.expiresAt <= now) feedbackPreviewCache.delete(key);
        }
      }

      console.log(
        `[FeedbackPreview] completed lesson=${lessonId} user=${userId} mode=${mode} persisted=${isFeedbackForSelectedPersistable} ` +
        `durationMs=${Date.now() - requestStartedAt} correlationId=${correlationId}`
      );
      return res.json(responsePayload);
    } catch (error: any) {
      console.error("Source document feedback preview error:", error);
      return res.status(500).json({ error: error?.message || "Failed to generate source content feedback" });
    }
  });

  /**
   * GET /api/lessons/:lessonId/source-document/feedback-latest
   * Returns latest persisted feedback run for a selected version reference.
   */
  app.get("/api/lessons/:lessonId/source-document/feedback-latest", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const selectedVersionIdRaw = String(req.query.selectedVersionId || "current");
      if (!organizationId) return res.status(400).json({ error: "Organization ID required" });

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const versionContext = await resolveVersionContentForFeedback(lessonId, selectedVersionIdRaw, String(lesson.inputText || ""));
      const selectedVersionRef = versionContext?.contentVersionRef || normalizeFeedbackVersionRef(selectedVersionIdRaw, lessonId);
      const expectedHash = createHash("md5").update(String(versionContext?.resolvedText || "")).digest("hex").substring(0, 32);

      const [latestRun] = await db
        .select()
        .from(lessonFeedbackRuns)
        .where(and(
          eq(lessonFeedbackRuns.lessonId, lessonId),
          eq(lessonFeedbackRuns.organizationId, organizationId),
          eq(lessonFeedbackRuns.contentVersionRef, selectedVersionRef),
        ))
        .orderBy(desc(lessonFeedbackRuns.generatedAt))
        .limit(1);

      if (!latestRun) {
        return res.json({
          success: true,
          run: null,
          items: [],
          selectedVersionRef,
          isStaleForSelectedVersion: false,
        });
      }

      const items = await db
        .select()
        .from(lessonFeedbackItems)
        .where(and(
          eq(lessonFeedbackItems.runId, latestRun.id),
          eq(lessonFeedbackItems.lessonId, lessonId),
          eq(lessonFeedbackItems.organizationId, organizationId),
        ))
        .orderBy(asc(lessonFeedbackItems.itemIndex));

      return res.json({
        success: true,
        run: latestRun,
        items,
        selectedVersionRef,
        isStaleForSelectedVersion: !!versionContext?.resolvedText && latestRun.contentHash !== expectedHash,
      });
    } catch (error: any) {
      console.error("Get latest source feedback run error:", error);
      return res.status(500).json({ error: error?.message || "Failed to fetch latest source feedback run" });
    }
  });

  /**
   * POST /api/lessons/:lessonId/source-document/feedback-item-decision
   * Stores explicit per-item user decisions without forcing content changes.
   */
  app.post("/api/lessons/:lessonId/source-document/feedback-item-decision", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const userId = req.session.userId;
      if (!organizationId) return res.status(400).json({ error: "Organization ID required" });
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const runId = String(req.body?.runId || "").trim();
      const itemId = String(req.body?.itemId || "").trim();
      const decision = String(req.body?.decision || "").trim().toLowerCase() as RelevanceDecision;
      const decisionReason = String(req.body?.decisionReason || "").trim();

      if (!runId || !itemId) {
        return res.status(400).json({ error: "runId and itemId are required." });
      }
      if (!["pending", "accepted", "rejected", "ignored", "applied", "stale"].includes(decision)) {
        return res.status(400).json({ error: "Invalid decision value." });
      }

      const [row] = await db
        .update(lessonFeedbackItems)
        .set({
          userDecision: decision,
          decisionReason: decisionReason || null,
          decidedAt: new Date(),
          decidedBy: userId,
          updatedAt: new Date(),
        } as any)
        .where(and(
          eq(lessonFeedbackItems.id, itemId),
          eq(lessonFeedbackItems.runId, runId),
          eq(lessonFeedbackItems.lessonId, lessonId),
          eq(lessonFeedbackItems.organizationId, organizationId),
        ))
        .returning({
          id: lessonFeedbackItems.id,
          userDecision: lessonFeedbackItems.userDecision,
          decidedAt: lessonFeedbackItems.decidedAt,
        });

      if (!row) return res.status(404).json({ error: "Feedback item not found." });
      return res.json({ success: true, item: row });
    } catch (error: any) {
      console.error("Save feedback item decision error:", error);
      return res.status(500).json({ error: error?.message || "Failed to save feedback item decision" });
    }
  });

  /**
   * POST /api/lessons/:lessonId/source-document/apply-feedback-selection
   * Applies only user-selected relevance items and creates a new source content version.
   */
  app.post("/api/lessons/:lessonId/source-document/apply-feedback-selection", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const userId = req.session.userId;
      if (!organizationId) return res.status(400).json({ error: "Organization ID required" });
      if (!userId) return res.status(401).json({ error: "Authentication required" });

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const runId = String(req.body?.runId || "").trim();
      const selectedItemIds = Array.isArray(req.body?.selectedItemIds)
        ? req.body.selectedItemIds.map((value: any) => String(value || "").trim()).filter(Boolean)
        : [];
      const selectedVersionIdRaw = String(req.body?.selectedVersionId || "current");
      const submittedText = String(req.body?.text || "").trim();

      if (!runId) return res.status(400).json({ error: "runId is required." });
      if (!submittedText || submittedText.length < 30) return res.status(400).json({ error: "Current source content text is required." });
      if (selectedItemIds.length === 0) return res.status(400).json({ error: "Select at least one relevance item to apply." });

      const [run] = await db
        .select()
        .from(lessonFeedbackRuns)
        .where(and(
          eq(lessonFeedbackRuns.id, runId),
          eq(lessonFeedbackRuns.lessonId, lessonId),
          eq(lessonFeedbackRuns.organizationId, organizationId),
        ))
        .limit(1);
      if (!run) return res.status(404).json({ error: "Feedback run not found." });

      const selectedVersionContext = await resolveVersionContentForFeedback(lessonId, selectedVersionIdRaw, String(lesson.inputText || ""));
      const selectedVersionRef = selectedVersionContext?.contentVersionRef || normalizeFeedbackVersionRef(selectedVersionIdRaw, lessonId);
      if (run.contentVersionRef !== selectedVersionRef) {
        return res.status(409).json({ error: "Feedback run does not match selected content version." });
      }

      const currentHash = createHash("md5").update(submittedText).digest("hex").substring(0, 32);
      if (run.contentHash !== currentHash) {
        return res.status(409).json({
          error: "Feedback is stale for current content.",
          message: "Source content changed after feedback generation. Please run Get Feedback again for this version.",
        });
      }

      const items = await db
        .select()
        .from(lessonFeedbackItems)
        .where(and(
          eq(lessonFeedbackItems.runId, runId),
          eq(lessonFeedbackItems.lessonId, lessonId),
          eq(lessonFeedbackItems.organizationId, organizationId),
          inArray(lessonFeedbackItems.id, selectedItemIds),
        ));

      if (items.length === 0) {
        return res.status(404).json({ error: "No selected feedback items found." });
      }

      let nextText = submittedText;
      const appliedItems: Array<{ id: string; title: string; excerpt: string }> = [];

      for (const item of items) {
        const excerpt = String(item.excerpt || "").trim();
        if (!excerpt) continue;
        const escapedExcerpt = escapeRegExp(excerpt);
        const regex = new RegExp(escapedExcerpt, "m");
        if (!regex.test(nextText)) continue;
        nextText = nextText.replace(regex, "").replace(/\n{3,}/g, "\n\n").trim();
        appliedItems.push({
          id: item.id,
          title: String(item.title || "Relevance fix"),
          excerpt,
        });
      }

      if (!appliedItems.length || nextText === submittedText) {
        return res.status(200).json({
          success: true,
          unchanged: true,
          message: "No matching excerpts were removed from current text.",
        });
      }

      const [maxVersion] = await db
        .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
        .from(lessonContentVersions)
        .where(eq(lessonContentVersions.lessonId, lessonId));
      const nextVersionNumber = (maxVersion?.max || 0) + 1;
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.update(lessons)
          .set({
            inputText: nextText,
            lastFeedbackHash: null,
            feedbackReport: null,
            contentScore10: null,
            previousScore10: null,
            lastFeedbackAt: null,
            updatedAt: now,
          })
          .where(eq(lessons.id, lessonId));

        await tx.insert(lessonContentVersions).values({
          lessonId,
          versionNumber: nextVersionNumber,
          source: "feedback_fix",
          changeDescription: `Applied ${appliedItems.length} relevance-audit selections`,
          previousContent: submittedText,
          newContent: nextText,
          previousTitle: lesson.title,
          newTitle: lesson.title,
          previousDescription: lesson.description,
          newDescription: lesson.description,
          metadata: {
            runId,
            selectedVersionId: selectedVersionIdRaw,
            selectedVersionRef,
            appliedItems,
            editor: "source_content_studio_relevance_selection",
            appliedAt: now.toISOString(),
          },
          createdBy: userId,
        } as any);

        await tx.update(lessonFeedbackRuns)
          .set({
            appliedAt: now,
            appliedBy: userId,
            updatedAt: now,
          } as any)
          .where(eq(lessonFeedbackRuns.id, runId));

        await tx.update(lessonFeedbackItems)
          .set({
            userDecision: "applied",
            decidedAt: now,
            decidedBy: userId,
            appliedAt: now,
            appliedBy: userId,
            updatedAt: now,
          } as any)
          .where(and(
            eq(lessonFeedbackItems.runId, runId),
            inArray(lessonFeedbackItems.id, appliedItems.map((row) => row.id)),
          ));
      });

      await syncLessonSourceContentToFrameworkTopics({
        lessonId,
        lessonTitle: lesson.title,
        sourceContent: nextText,
        userUploadedContent: true,
        reason: "apply_feedback_selection",
      });

      await TranslationIndexService.enqueueForLessonMutation({
        lessonId,
        organizationId,
        eventType: "set_current",
        dedupeSeed: `feedback-selection:${lessonId}:${runId}:${nextVersionNumber}`,
      });

      return res.json({
        success: true,
        lessonId,
        versionNumber: nextVersionNumber,
        text: nextText,
        extractedWordCount: nextText.split(/\s+/).filter(Boolean).length,
        source: "inputText",
        appliedCount: appliedItems.length,
        appliedItems,
        message: "Selected relevance actions applied and saved as a new content version.",
      });
    } catch (error: any) {
      console.error("Apply feedback selection error:", error);
      return res.status(500).json({ error: error?.message || "Failed to apply selected relevance actions" });
    }
  });

  /**
   * POST /api/lessons/:lessonId/source-document/apply-feedback-action
   * Applies a single actionable feedback recommendation to Source DB content and saves a new content version.
   */
  app.post("/api/lessons/:lessonId/source-document/apply-feedback-action", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;
      const userId = req.session.userId;

      if (!userId) return res.status(401).json({ error: "Authentication required" });
      if (!organizationId) return res.status(400).json({ error: "Organization ID required" });

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) return res.status(404).json({ error: "Lesson not found" });

      const text = String(req.body?.text ?? "").trim();
      const mode = String(req.body?.mode || "quick").toLowerCase();
      const compareBaseText = String(req.body?.compareBaseText ?? "").trim();
      const runId = String(req.body?.runId || "").trim();
      const selectedVersionId = String(req.body?.selectedVersionId || "").trim();
      const requestedActionId = String(req.body?.actionId || "").trim();
      const requestedActionIndex = Number(req.body?.actionIndex);
      const action = req.body?.action || {};

      let resolvedAction: any = action;
      if (runId) {
        const [feedbackRun] = await db
          .select({
            id: lessonFeedbackRuns.id,
            contentVersionRef: lessonFeedbackRuns.contentVersionRef,
            actionable: lessonFeedbackRuns.actionable,
          })
          .from(lessonFeedbackRuns)
          .where(and(
            eq(lessonFeedbackRuns.id, runId),
            eq(lessonFeedbackRuns.lessonId, lessonId),
            eq(lessonFeedbackRuns.organizationId, organizationId),
          ))
          .limit(1);

        if (!feedbackRun) {
          return res.status(404).json({ error: "Feedback run not found for this lesson." });
        }

        if (selectedVersionId) {
          const versionContext = await resolveVersionContentForFeedback(lessonId, selectedVersionId, String(lesson.inputText || ""));
          const selectedVersionRef = versionContext?.contentVersionRef || normalizeFeedbackVersionRef(selectedVersionId, lessonId);
          if (selectedVersionRef !== String(feedbackRun.contentVersionRef || "")) {
            return res.status(409).json({ error: "Feedback run does not match the selected content version. Please refresh feedback." });
          }
        }

        const runActions = Array.isArray((feedbackRun.actionable as any)?.prioritizedActions)
          ? ((feedbackRun.actionable as any).prioritizedActions as any[])
          : [];
        if (runActions.length > 0) {
          if (requestedActionId) {
            const byId = runActions.find((candidate) => String(candidate?.id || "").trim() === requestedActionId);
            if (byId) resolvedAction = byId;
          }
          if (!resolvedAction || !String(resolvedAction?.title || "").trim()) {
            if (Number.isFinite(requestedActionIndex) && requestedActionIndex >= 0 && requestedActionIndex < runActions.length) {
              resolvedAction = runActions[requestedActionIndex];
            }
          }
          if (!resolvedAction || !String(resolvedAction?.title || "").trim()) {
            const requestedTitle = String(action?.title || "").trim();
            if (requestedTitle) {
              const byTitle = runActions.find((candidate) => String(candidate?.title || "").trim() === requestedTitle);
              if (byTitle) resolvedAction = byTitle;
            }
          }
        }
      }

      const actionTitle = String(resolvedAction?.title || "").trim();
      const actionDescription = String(resolvedAction?.description || "").trim();
      const actionCategory = String(resolvedAction?.category || "").trim();
      const actionPriority = String(resolvedAction?.priority || "").trim();
      const actionExample = resolvedAction?.example ? String(resolvedAction.example).trim() : "";

      if (!text || text.length < 30) {
        return res.status(400).json({ error: "Source content text is required and must be at least 30 characters." });
      }
      if (!actionTitle) {
        return res.status(400).json({ error: "Action title is required." });
      }

      const aiResult = await AIService.getActiveConfigWithError("text");
      if (!aiResult.success || !aiResult.service) {
        return res.status(503).json({
          error: "AI service unavailable",
          message: aiResult.error?.message || "No active AI configuration found",
        });
      }

      const { GoogleGenAI } = await import("@google/genai");
      const genAI = new GoogleGenAI({ apiKey: (aiResult.service as any).apiKey });

      const modeInstruction = mode === "deep"
        ? "Apply a substantial, high-quality improvement for this action while preserving factual meaning."
        : "Apply a focused and concise improvement for this action.";

      const compareInstruction = mode === "compare" && compareBaseText
        ? `Use this base text as context for improvement direction:\n${compareBaseText}\n\n`
        : "";

      const prompt = `You are an expert instructional content editor for LearnPlay.

TASK:
Apply ONE specific improvement action to the lesson source content.

ACTION TITLE:
${actionTitle}

ACTION DESCRIPTION:
${actionDescription || "No additional description provided."}

ACTION CATEGORY:
${actionCategory || "quality"}

ACTION PRIORITY:
${actionPriority || "important"}

ACTION EXAMPLE:
${actionExample || "N/A"}

${compareInstruction}CONTENT TO IMPROVE:
${text}

RULES:
- Keep the same language as the original content.
- Do NOT invent facts, stats, names, or claims not implied by the original content.
- Preserve core meaning, lesson scope, and structure.
- Make edits directly in the content so this action is visibly addressed.
- Apply ONLY this one action. Do not apply other recommendations that are not explicitly part of this action.
- Keep formatting readable for long-form lesson source text.
- Return ONLY the improved content text (no commentary, no markdown fences).

QUALITY TARGET:
${modeInstruction}`;

      const response = await genAI.models.generateContent({
        model: (aiResult.service as any).modelName || "gemini-2.0-flash",
        contents: prompt,
      });

      const improvedText = String(response.text || "").trim();
      if (!improvedText) {
        return res.status(500).json({ error: "AI returned empty improved content." });
      }

      const previousText = String(lesson.inputText || "");
      if (previousText.trim() === improvedText.trim()) {
        return res.json({
          success: true,
          unchanged: true,
          text: improvedText,
          message: "No textual change produced for this action.",
        });
      }

      const [maxVersion] = await db
        .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
        .from(lessonContentVersions)
        .where(eq(lessonContentVersions.lessonId, lessonId));
      const nextVersionNumber = (maxVersion?.max || 0) + 1;
      const now = new Date();

      await db.transaction(async (tx) => {
        await tx.update(lessons)
          .set({
            inputText: improvedText,
            lastFeedbackHash: null,
            feedbackReport: null,
            contentScore10: null,
            previousScore10: null,
            lastFeedbackAt: null,
            updatedAt: now,
          })
          .where(eq(lessons.id, lessonId));

        await tx.insert(lessonContentVersions).values({
          lessonId,
          versionNumber: nextVersionNumber,
          source: "feedback_fix",
          changeDescription: `Feedback action applied: ${actionTitle}`,
          previousContent: previousText,
          newContent: improvedText,
          previousTitle: lesson.title,
          newTitle: lesson.title,
          previousDescription: lesson.description,
          newDescription: lesson.description,
          metadata: {
            action: {
              id: resolvedAction?.id || requestedActionId || null,
              title: actionTitle,
              description: actionDescription || null,
              category: actionCategory || null,
              priority: actionPriority || null,
              example: actionExample || null,
            },
            mode,
            editor: "source_content_studio_feedback_action",
            appliedAt: now.toISOString(),
            aiModel: (aiResult.service as any).modelName || "gemini-2.0-flash",
            semanticVersion: "V1.1",
            sourceVersionRole: "ai_enhanced",
            enhancementNotice: "AI applied a selected content improvement action. Review the before/after diff before relying on the enhanced version.",
          },
          createdBy: userId,
        } as any);
      });

      await syncLessonSourceContentToFrameworkTopics({
        lessonId,
        lessonTitle: lesson.title,
        sourceContent: improvedText,
        userUploadedContent: true,
        reason: "apply_feedback_action",
      });

      await TranslationIndexService.enqueueForLessonMutation({
        lessonId,
        organizationId,
        eventType: "set_current",
        dedupeSeed: `feedback-action:${lessonId}:${requestedActionId || actionTitle}:${nextVersionNumber}`,
      });

      return res.json({
        success: true,
        lessonId,
        versionNumber: nextVersionNumber,
        text: improvedText,
        extractedWordCount: improvedText.split(/\s+/).filter(Boolean).length,
        source: "inputText",
        message: "Action applied and saved as a new source-content version.",
      });
    } catch (error: any) {
      console.error("Apply source feedback action error:", error);
      return res.status(500).json({ error: error?.message || "Failed to apply feedback action" });
    }
  });

  /**
   * DELETE /api/lessons/:lessonId/source-document
   * Deletes the source content from a lesson (clears inputText and sourceDocumentPath).
   * Also removes the file from Object Storage if it exists.
   */
  app.delete("/api/lessons/:lessonId/source-document", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const organizationId = req.query.organizationId as string;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Delete the source document file from Object Storage if it exists
      if (lesson.sourceDocumentPath) {
        const objectStorageService = new ObjectStorageService();
        try {
          await objectStorageService.deleteObject(lesson.sourceDocumentPath);
          console.log(`[Routes] Deleted source document from Object Storage: ${lesson.sourceDocumentPath}`);
        } catch (deleteError: any) {
          console.warn(`[Routes] Failed to delete source document from storage (may already be deleted): ${deleteError.message}`);
        }
      }

      // Clear the inputText and sourceDocumentPath fields
      await db.update(lessons)
        .set({ 
          inputText: null,
          sourceDocumentPath: null,
          feedbackReport: null,
          contentScore10: null,
          previousScore10: null,
          lastFeedbackAt: null,
          lastFeedbackHash: null,
        })
        .where(eq(lessons.id, lessonId));

      await syncLessonSourceContentToFrameworkTopics({
        lessonId,
        lessonTitle: lesson.title,
        sourceContent: "",
        userUploadedContent: false,
        reason: "delete_source_content",
      });

      await TranslationIndexService.enqueueForLessonMutation({
        lessonId,
        organizationId,
        eventType: "set_current",
        dedupeSeed: `delete-source:${lessonId}:${Date.now()}`,
      });

      console.log(`[Routes] Cleared source content for lesson ${lessonId}`);

      res.json({
        success: true,
        message: "Source content deleted successfully",
        lessonId,
      });
    } catch (error) {
      console.error("Delete source document error:", error);
      res.status(500).json({ error: "Failed to delete source document content" });
    }
  });

  // ==================== LESSON QUIZ LINK ROUTES ====================

  app.post("/api/lessons/:lessonId/link-quiz", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId, quizId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      if (!quizId) {
        return res.status(400).json({ error: "Quiz ID required" });
      }

      const lesson = await LessonService.linkToQuiz(lessonId, quizId, organizationId);

      res.json(lesson);
    } catch (error: any) {
      console.error("Link lesson to quiz error:", error);
      const statusCode = error.statusCode || 500;
      const message = error.message || "Failed to link lesson to quiz";
      res.status(statusCode).json({ error: message });
    }
  });

  app.post("/api/lessons/:lessonId/unlink-quiz", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.unlinkFromQuiz(lessonId, organizationId);

      res.json(lesson);
    } catch (error) {
      console.error("Unlink lesson from quiz error:", error);
      res.status(500).json({ error: "Failed to unlink lesson from quiz" });
    }
  });

  app.get("/api/lessons/:lessonId/linked-quizzes", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const requestedLanguageCode = req.query.languageCode ? String(req.query.languageCode).trim().toLowerCase() : null;
      const includeResolution = String(req.query.includeResolution || "").trim() === "1";
      const sourceLesson = lesson.contentGroupId
        ? await (async () => {
            const [defaultVariant] = await db
              .select()
              .from(lessons)
              .where(
                and(
                  eq(lessons.contentGroupId, lesson.contentGroupId),
                  eq(lessons.organizationId, lesson.organizationId),
                  eq(lessons.isDefaultLanguage, true)
                )
              )
              .limit(1);
            return defaultVariant || lesson;
          })()
        : lesson;

      let linkedQuizzes = await LessonService.getLinkedQuizzes(lessonId);
      let resolvedLessonId = lesson.id;
      let isFallback = false;
      if (linkedQuizzes.length === 0 && String(sourceLesson.id) !== String(lesson.id)) {
        linkedQuizzes = await LessonService.getLinkedQuizzes(sourceLesson.id);
        if (linkedQuizzes.length > 0) {
          resolvedLessonId = sourceLesson.id;
          isFallback = true;
        }
      }

      if (includeResolution) {
        return res.json({
          quizzes: linkedQuizzes,
          artifactResolution: {
            requestedLessonId: lesson.id,
            resolvedLessonId,
            isFallback,
            requestedLanguageCode: requestedLanguageCode || null,
            resolvedLanguageCode: isFallback
              ? (String(sourceLesson.languageCode || "en").trim().toLowerCase() || "en")
              : (String(lesson.languageCode || "en").trim().toLowerCase() || "en"),
          },
        });
      }

      res.json(linkedQuizzes);
    } catch (error) {
      console.error("Get linked quizzes error:", error);
      res.status(500).json({ error: "Failed to fetch linked quizzes" });
    }
  });

  app.post("/api/lessons/:lessonId/linked-quizzes/:quizId/set-primary", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId, quizId } = req.params;
      if (!lessonId || !quizId) {
        return res.status(400).json({ error: "lessonId and quizId are required" });
      }

      const existing = await db
        .select({
          id: lessonQuizLinks.id,
        })
        .from(lessonQuizLinks)
        .where(
          and(
            eq(lessonQuizLinks.lessonId, lessonId),
            eq(lessonQuizLinks.quizId, quizId)
          )
        )
        .limit(1);

      if (!existing.length) {
        return res.status(404).json({ error: "Selected quiz is not linked to this lesson." });
      }

      await db.transaction(async (tx) => {
        await tx
          .update(lessonQuizLinks)
          .set({ isPrimary: false })
          .where(eq(lessonQuizLinks.lessonId, lessonId));

        await tx
          .update(lessonQuizLinks)
          .set({ isPrimary: true })
          .where(
            and(
              eq(lessonQuizLinks.lessonId, lessonId),
              eq(lessonQuizLinks.quizId, quizId)
            )
          );

        await tx
          .update(courseLessons)
          .set({ primaryQuizId: quizId })
          .where(eq(courseLessons.lessonId, lessonId));
      });

      const linkedQuizzes = await LessonService.getLinkedQuizzes(lessonId);
      return res.json({
        success: true,
        lessonId,
        quizId,
        linkedQuizzes,
      });
    } catch (error: any) {
      console.error("Set primary linked quiz error:", error);
      return res.status(500).json({ error: error?.message || "Failed to set primary linked quiz" });
    }
  });

  app.get("/api/lessons/:lessonId/capabilities", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const capabilities = await lessonOrchestrationService.getOrchestrationCapabilities(lessonId);

      res.json(capabilities);
    } catch (error) {
      console.error("Get orchestration capabilities error:", error);
      res.status(500).json({ error: "Failed to fetch orchestration capabilities" });
    }
  });

  app.post("/api/lessons/:lessonId/orchestrate", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { generateQuiz, generateCourse, quizQuestionsPerSlide, quizDifficulty, enhanceCourseTopics } = req.body;

      const result = await lessonOrchestrationService.orchestrateFromLesson(lessonId, {
        generateQuiz,
        generateCourse,
        quizQuestionsPerSlide,
        quizDifficulty,
        enhanceCourseTopics,
        userId,
      });

      res.json(result);
    } catch (error: any) {
      console.error("Orchestrate lesson error:", error);
      res.status(500).json({ error: error.message || "Failed to orchestrate lesson content" });
    }
  });

  // ==================== LESSON MANUAL/DOCUMENT UPLOAD ROUTES ====================

  app.post("/api/lessons/manual-upload",
    withSessionAuthMiddleware,
    (req: Request, res: Response, next: any) => {
      pptxUpload.single('pptxFile')(req, res, (err: any) => {
        if (err) {
          console.error("Multer upload error:", err);
          if (err.message === 'Only PPTX files are allowed') {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'File upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { title, description, organizationId, gradeLevel, department, subject, unit, slideCount } = req.body;

        if (!title) {
          return res.status(400).json({ error: "Title is required" });
        }

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID is required" });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "PPTX file is required" });
        }

        const lesson = await LessonService.createManualLesson(
          {
            title,
            description: description || undefined,
            userId,
            organizationId,
            gradeLevel: gradeLevel || undefined,
            department: department || undefined,
            subject: subject || undefined,
            unit: unit || undefined,
            slideCount: slideCount ? parseInt(slideCount, 10) : undefined,
          },
          req.file.buffer
        );

        console.log(`[Routes] User ${userId} created manual lesson ${lesson.id} (${req.file.size} bytes)`);

        res.status(201).json(lesson);
      } catch (error) {
        console.error("Manual lesson upload error:", error);
        res.status(500).json({ error: "Failed to create manual lesson" });
      }
    }
  );

  app.post("/api/lessons/source-document-upload",
    withSessionAuthMiddleware,
    (req: Request, res: Response, next: any) => {
      documentUpload.single('documentFile')(req, res, (err: any) => {
        if (err) {
          console.error("Multer source document upload error:", err);
          if (err.message === 'Only Word documents (.docx, .doc) and PDF files are allowed') {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'Document upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { title, description, organizationId, gradeLevel, department, subject, unit } = req.body;

        if (!title) {
          return res.status(400).json({ error: "Title is required" });
        }

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID is required" });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "Document file is required" });
        }

        const extractedContent = await DocumentExtractorService.extractText(
          req.file.buffer,
          req.file.mimetype
        );

        const lesson = await LessonService.createLesson({
          title,
          description: description || undefined,
          userId,
          organizationId,
          gradeLevel: gradeLevel || undefined,
          department: department || undefined,
          subject: subject || undefined,
          unit: unit || undefined,
          inputText: extractedContent.text,
          generationMode: 'document-upload',
        });

        const objectStorageService = new ObjectStorageService();
        const sourceDocumentPath = await objectStorageService.uploadSourceDocument(
          organizationId,
          lesson.id,
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
          lesson.languageCode || 'en'
        );

        const [updatedLesson] = await db
          .update(schema.lessons)
          .set({
            inputText: extractedContent.text,
            sourceDocumentPath,
            generationStatus: 'completed',
            contentStatus: 'completed',
            updatedAt: new Date(),
          })
          .where(eq(schema.lessons.id, lesson.id))
          .returning();

        try {
          await db.insert(lessonContentVersions).values({
            lessonId: lesson.id,
            versionNumber: 1,
            source: 'document_upload',
            changeDescription: `Uploaded source document: ${req.file.originalname} (${extractedContent.wordCount} words)`,
            previousContent: null,
            newContent: extractedContent.text,
            previousTitle: null,
            newTitle: title,
            previousDescription: null,
            newDescription: description || null,
            metadata: {
              sourceDocumentPath,
              originalFilename: req.file.originalname,
              extractedWordCount: extractedContent.wordCount,
              fileType: extractedContent.fileType,
              mimetype: req.file.mimetype,
            },
            createdBy: userId,
          } as any);
        } catch (versionError) {
          console.error('[VersionTracking] Failed to record source document upload version:', versionError);
        }

        await syncLessonSourceContentToFrameworkTopics({
          lessonId: lesson.id,
          lessonTitle: title,
          sourceContent: extractedContent.text,
          userUploadedContent: true,
          reason: "document_upload",
        });

        console.log(`[Routes] User ${userId} created source document lesson ${lesson.id} from ${req.file.originalname} (${extractedContent.wordCount} words)`);

        res.status(201).json({
          ...(updatedLesson || lesson),
          extractedWordCount: extractedContent.wordCount,
          extractedCharCount: extractedContent.text.length,
          sourceDocumentPath,
        });
      } catch (error: any) {
        console.error("Source document lesson upload error:", error);
        res.status(500).json({ error: error.message || "Failed to create lesson from source document" });
      }
    }
  );

  app.post("/api/lessons/document-upload",
    withSessionAuthMiddleware,
    (req: Request, res: Response, next: any) => {
      documentUpload.single('documentFile')(req, res, (err: any) => {
        if (err) {
          console.error("Multer document upload error:", err);
          if (String(err.message || '').startsWith('Only Word documents')) {
            return res.status(400).json({ error: err.message });
          }
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'File too large for current runtime stream handling. Retry upload.' });
          }
          return res.status(500).json({ error: 'File upload failed' });
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        const userId = req.session.userId;
        if (!userId) {
          return res.status(401).json({ error: "Authentication required" });
        }

        const { 
          title, 
          description, 
          organizationId, 
          gradeLevel, 
          department, 
          subject, 
          unit,
          themeId,
          generateImages,
          imageStyle,
          numCards
        } = req.body;

        if (!title) {
          return res.status(400).json({ error: "Title is required" });
        }

        if (!organizationId) {
          return res.status(400).json({ error: "Organization ID is required" });
        }

        if (!req.file || !req.file.buffer) {
          return res.status(400).json({ error: "Document file is required" });
        }

        console.log(`[Routes] Extracting text from document: ${req.file.originalname} (${req.file.mimetype}, ${req.file.size} bytes)`);

        const ESTIMATED_GAMMA_COST = 150;
        const creditInfo = await CreditService.getCreditBalance(userId, organizationId);
        if (creditInfo.balance < ESTIMATED_GAMMA_COST) {
          return res.status(402).json({ 
            error: "Insufficient credits",
            message: `Lesson generation requires approximately ${ESTIMATED_GAMMA_COST} credits. You have ${creditInfo.balance} credits available.`
          });
        }

        let extractedContent;
        try {
          extractedContent = await DocumentExtractorService.extractText(
            req.file.buffer,
            req.file.mimetype
          );
          console.log(`[Routes] Text extraction successful: ${extractedContent.wordCount} words, ${extractedContent.text.length} characters`);
        } catch (extractError: any) {
          console.error("[Routes] Text extraction failed:", extractError);
          return res.status(400).json({ 
            error: extractError.message || "Failed to extract text from document" 
          });
        }

        const lesson = await LessonService.createLesson({
          title,
          description: description || undefined,
          userId,
          organizationId,
          gradeLevel: gradeLevel || undefined,
          department: department || undefined,
          subject: subject || undefined,
          unit: unit || undefined,
          generationMode: 'document-upload',
        });

        console.log(`[Routes] Created lesson ${lesson.id} from document upload`);

        const objectStorageService = new ObjectStorageService();
        const sourceDocumentPath = await objectStorageService.uploadSourceDocument(
          organizationId,
          lesson.id,
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
          lesson.languageCode || 'en'
        );

        console.log(`[Routes] Uploaded source document to: ${sourceDocumentPath}`);

        await db
          .update(schema.lessons)
          .set({ sourceDocumentPath })
          .where(eq(schema.lessons.id, lesson.id));

        const generationParams = {
          inputText: extractedContent.text,
          themeId: themeId || 'default-light',
          numCards: numCards ? parseInt(numCards, 10) : 10,
          generateImages: generateImages === 'true' || generateImages === true,
          imageStyle: imageStyle || 'photorealistic',
          generationMode: 'document-upload',
          sourceDocumentPath,
        };
        const paramsKey = await LessonService.saveGenerationParams(lesson.id, organizationId, generationParams);

        const result = await db.transaction(async (tx) => {
          await tx
            .update(schema.lessons)
            .set({ generationParamsKey: paramsKey })
            .where(eq(schema.lessons.id, lesson.id));

          const job = await JobQueueService.createJob({
            organizationId,
            lessonId: lesson.id,
            metadata: {
              inputText: extractedContent.text,
              themeId: themeId || 'default-light',
              numCards: numCards ? parseInt(numCards, 10) : 10,
              generateImages: generateImages === 'true' || generateImages === true,
              imageStyle: imageStyle || 'photorealistic',
              userId,
              isFromDocument: true,
            },
          }, tx);

          return { success: true, job };
        });

        if (!result.success) {
          return res.status(402).json({ error: "Insufficient credits" });
        }

        console.log(`[Routes] Started generation for lesson ${lesson.id} from document (${extractedContent.wordCount} words)`);

        res.status(201).json({
          ...lesson,
          extractedWordCount: extractedContent.wordCount,
          extractedCharCount: extractedContent.text.length,
          sourceDocumentPath,
        });
      } catch (error: any) {
        console.error("Document upload error:", error);
        res.status(500).json({ 
          error: error.message || "Failed to create lesson from document" 
        });
      }
    }
  );

  // ==================== LESSON ASSIGNMENT ROUTES ====================

  app.post("/api/lessons/assign", withSessionAuthMiddleware, requireOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonIds, unitId, subjectId, organizationId, dueDate } = req.body;

      if (!lessonIds || !Array.isArray(lessonIds) || lessonIds.length === 0) {
        return res.status(400).json({ error: "Lesson IDs array required" });
      }

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      if (!unitId) {
        return res.status(400).json({ error: "unitId (department) required for scope-based assignments" });
      }

      const isGeneralAssignment = unitId === 'general' && (subjectId === 'general' || !subjectId);
      if (!isGeneralAssignment && unitId && subjectId) {
        const validCombination = await db.select()
          .from(unitSubjects)
          .where(
            and(
              eq(unitSubjects.unitId, unitId),
              eq(unitSubjects.subjectId, subjectId)
            )
          )
          .limit(1);
        
        if (validCombination.length === 0) {
          return res.status(400).json({ 
            error: `Invalid assignment: unit ${unitId} and subject ${subjectId} are not linked. Please ensure this subject is configured for this department/grade before assigning lessons.` 
          });
        }
      }

      const lessonRecords = await db
        .select({ id: lessons.id, organizationId: lessons.organizationId })
        .from(lessons)
        .where(inArray(lessons.id, lessonIds));

      if (lessonRecords.length !== lessonIds.length) {
        return res.status(404).json({ error: "One or more lessons not found" });
      }

      const invalidLessons = lessonRecords.filter(l => l.organizationId !== organizationId);
      if (invalidLessons.length > 0) {
        return res.status(403).json({ 
          error: `Cannot assign lessons from other organizations. Invalid lessons: ${invalidLessons.map(l => l.id).join(", ")}` 
        });
      }

      const scopeUnitId = isGeneralAssignment ? null : unitId;
      const scopeSubjectId = isGeneralAssignment ? null : subjectId;

      await db
        .update(lessons)
        .set({ isPublished: true })
        .where(inArray(lessons.id, lessonIds));

      const assignmentValues = lessonIds.map((lessonId: string) => ({
        lessonId,
        organizationId,
        unitId: scopeUnitId,
        subjectId: scopeSubjectId,
        assignedBy: userId,
        dueDate: dueDate ? new Date(dueDate) : null,
      }));

      const createdAssignments = await db
        .insert(lessonScopeAssignments)
        .values(assignmentValues)
        .onConflictDoNothing()
        .returning();

      const assignmentsCreated = createdAssignments.length;

      const allLinkedQuizzes = await db
        .select({ lessonId: lessonQuizLinks.lessonId, quizId: lessonQuizLinks.quizId })
        .from(lessonQuizLinks)
        .where(inArray(lessonQuizLinks.lessonId, lessonIds));

      let quizAssignmentsCreated = 0;

      if (allLinkedQuizzes.length > 0) {
        const uniqueCollectionIds = Array.from(new Set(allLinkedQuizzes.map(lq => lq.quizId)));
        
        const quizAssignmentValues = uniqueCollectionIds.map((collectionId: string) => ({
          collectionId,
          organizationId,
          unitId: scopeUnitId,
          subjectId: scopeSubjectId,
          availableTo: dueDate ? new Date(dueDate) : null,
        }));
        
        const createdQuizAssignments = await db
          .insert(quizCollectionAssignments)
          .values(quizAssignmentValues)
          .onConflictDoNothing()
          .returning();
        
        quizAssignmentsCreated = createdQuizAssignments.length;
      }

      res.json({
        success: true,
        message: `Created ${assignmentsCreated} lesson assignments and ${quizAssignmentsCreated} linked quiz assignments`,
        assignmentsCreated,
        quizAssignmentsCreated,
      });
    } catch (error) {
      console.error("Assign lessons error:", error);
      res.status(500).json({ error: "Failed to assign lessons" });
    }
  });

  app.delete("/api/lessons/assignments/:assignmentId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId!;
      const { assignmentId } = req.params;
      
      const [assignment] = await db
        .select()
        .from(lessonScopeAssignments)
        .where(eq(lessonScopeAssignments.id, assignmentId));
      
      if (!assignment) {
        return res.status(404).json({ error: "Assignment not found" });
      }
      
      const resolvedEffectiveOrgId = getEffectiveOrganizationId(req.session);
      const hasAccess = await canAccessOrganization(userId, assignment.organizationId, req.session, resolvedEffectiveOrgId);
      if (!hasAccess) {
        return res.status(403).json({ error: "Access denied: You cannot delete assignments from other organizations" });
      }
      
      await db.delete(lessonScopeAssignments).where(eq(lessonScopeAssignments.id, assignmentId));
      
      res.json({ success: true, message: "Lesson assignment deleted successfully" });
    } catch (error) {
      console.error("Delete lesson assignment error:", error);
      res.status(500).json({ error: "Failed to delete lesson assignment" });
    }
  });

  // ==================== LESSON GENERATION ROUTES ====================

  const generateForTopicSchema = z.object({
    courseId: z.string().uuid(),
    topicId: z.string(),
    existingLessonId: z.string().uuid(),
    organizationId: z.string().uuid(),
    inputText: z.string().optional(),
    themeId: z.string().optional(),
    generateImages: z.boolean().optional(),
    imageStyle: z.string().optional(),
  });

  app.post("/api/lessons/generate-for-topic", withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const parseResult = generateForTopicSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
      }

      const { courseId, topicId, existingLessonId, organizationId, inputText, themeId, generateImages, imageStyle } = parseResult.data;

      const lesson = await CourseService.generateLessonForTopic({
        courseId,
        topicId,
        existingLessonId,
        userId,
        organizationId,
        inputText,
        themeId,
        generateImages,
        imageStyle,
      });

      res.json(lesson);
    } catch (error: any) {
      const errorMessage = error?.message || "Unknown error";
      console.error("[generateForTopic] Error:", errorMessage);

      if (errorMessage.includes("MISSING_LESSON_ID")) {
        return res.status(400).json({ error: errorMessage });
      }
      if (errorMessage.includes("COURSE_NOT_FOUND")) {
        return res.status(404).json({ error: errorMessage });
      }
      if (errorMessage.includes("FRAMEWORK_MISSING")) {
        return res.status(400).json({ error: errorMessage });
      }
      if (errorMessage.includes("TOPIC_NOT_FOUND")) {
        return res.status(404).json({ error: errorMessage });
      }
      if (errorMessage.includes("LESSON_NOT_FOUND")) {
        return res.status(404).json({ error: errorMessage });
      }

      res.status(500).json({ error: "Failed to generate lesson for topic" });
    }
  });

  app.post("/api/lessons/:lessonId/generate", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId, inputText, themeId, numCards, imageStyle, generateImages, additionalInstructions } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      if (!inputText) {
        return res.status(400).json({ error: "Input text required" });
      }

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      const { hasActive, activeJob } = await JobQueueService.hasActiveJobForUser(userId);
      if (hasActive && activeJob) {
        try {
          await db
            .update(schema.lessons)
            .set({ 
              generationStatus: "failed",
              metadata: sql`jsonb_set(COALESCE(${schema.lessons.metadata}, '{}'::jsonb), '{errorMessage}', '"Generation blocked: Another lesson is already being generated. Please try again after it completes."'::jsonb)`
            })
            .where(eq(schema.lessons.id, lessonId));
          
          console.log(`[Generate 429 Rollback] Marked lesson ${lessonId} as failed`);
        } catch (rollbackError) {
          console.error(`[Generate 429 Rollback] Failed to rollback lesson ${lessonId}:`, rollbackError);
        }
        
        return res.status(429).json({
          error: "Generation in progress",
          message: "You already have a lesson being generated. Please wait for it to complete or fail before starting a new generation.",
          activeJobId: activeJob.id,
          activeJobStatus: activeJob.status,
          activeLessonId: activeJob.lessonId,
          rolledBack: true
        });
      }

      const isManualUpload = lesson.generationMode === "manual-upload";
      const isDocumentUpload = lesson.generationMode === "document-upload";
      const requiresCredits = !isManualUpload && !isDocumentUpload;
      
      if (requiresCredits) {
        const requiredCredits = await lessonGenerationPricingService.getRequiredCredits(generateImages);
        
        const preview = await HybridCreditService.previewDeduction({
          userId,
          organizationId,
          amount: requiredCredits
        });
        
        if (!preview.canDeduct) {
          const totalAvailable = preview.userBalance + (preview.orgWalletEnabled && preview.userAuthorized ? preview.orgBalance : 0);
          return res.status(402).json({ 
            error: "Insufficient credits",
            message: `Lesson generation ${generateImages ? "with images" : "without images"} requires at least ${requiredCredits} credits. You have ${totalAvailable} credits available.`,
            requiredCredits,
            currentBalance: totalAvailable,
            reason: preview.reason
          });
        }
      }

      const normalizedAdditionalInstructions = typeof additionalInstructions === "string"
        ? additionalInstructions.trim().slice(0, 5000)
        : "";

      const generationParams = {
        inputText,
        themeId: themeId || 'default-light',
        numCards: numCards || 10,
        generateImages: generateImages !== undefined ? generateImages : true,
        imageStyle: imageStyle || 'photorealistic',
        additionalInstructions: normalizedAdditionalInstructions,
      };
      const paramsKey = await LessonService.saveGenerationParams(lessonId, organizationId, generationParams);

      const result = await db.transaction(async (tx) => {
        await tx
          .update(schema.lessons)
          .set({
            generationStatus: "pending",
            inputText,
            themeId: themeId || 'default-light',
            metadata: sql`jsonb_set(COALESCE(${schema.lessons.metadata}, '{}'::jsonb), '{gammaAdditionalInstructions}', ${JSON.stringify(normalizedAdditionalInstructions)}::jsonb)`,
            generationParamsKey: paramsKey,
            updatedAt: new Date(),
          })
          .where(eq(schema.lessons.id, lessonId));

        const job = await JobQueueService.createJobWithCleanup({
          organizationId,
          lessonId,
          metadata: {
            inputText,
            themeId: themeId || 'default-light',
            numCards: numCards || 10,
            generateImages: generateImages !== undefined ? generateImages : true,
            imageStyle: imageStyle || 'photorealistic',
            additionalInstructions: normalizedAdditionalInstructions,
            userId,
          },
        }, tx);

        return { success: true, job };
      });

      if (lesson.isDefaultLanguage === false) {
        try {
          await db.update(schema.lessonTranslationJobs)
            .set({ currentStep: 'pptx_generating', updatedAt: new Date() })
            .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
        } catch (e) {
        }
      }

      res.json({ job: result.job, message: "Lesson generation started" });
    } catch (error) {
      console.error("Generate lesson error:", error);
      res.status(500).json({ error: "Failed to start lesson generation" });
    }
  });

  app.post("/api/lessons/:lessonId/regenerate", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId, inputText: requestInputText, themeId, numCards, generateImages, imageStyle, additionalInstructions } = req.body;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      const lesson = await LessonService.getLessonById(lessonId, organizationId);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      const { hasActive, activeJob } = await JobQueueService.hasActiveJobForUser(userId);
      if (hasActive && activeJob && activeJob.lessonId !== lessonId) {
        try {
          await db
            .update(schema.lessons)
            .set({ 
              generationStatus: "failed",
              metadata: sql`jsonb_set(COALESCE(${schema.lessons.metadata}, '{}'::jsonb), '{errorMessage}', '"Regeneration blocked: Another lesson is already being generated. Please try again after it completes."'::jsonb)`
            })
            .where(eq(schema.lessons.id, lessonId));
          
          console.log(`[Regenerate 429 Rollback] Marked lesson ${lessonId} as failed`);
        } catch (rollbackError) {
          console.error(`[Regenerate 429 Rollback] Failed to rollback lesson ${lessonId}:`, rollbackError);
        }
        
        return res.status(429).json({
          error: "Generation in progress",
          message: "You already have a lesson being generated. Please wait for it to complete or fail before starting a new generation.",
          activeJobId: activeJob.id,
          activeJobStatus: activeJob.status,
          activeLessonId: activeJob.lessonId,
          rolledBack: true
        });
      }

      let storedParams = null;
      if (lesson.generationParamsKey) {
        storedParams = await LessonService.getGenerationParams(lesson.generationParamsKey);
      }

      // Always prefer latest lesson source content unless caller explicitly overrides it.
      const inputText = requestInputText || lesson.inputText || storedParams?.inputText;
      const finalThemeId = themeId || storedParams?.themeId || lesson.themeId || "default-light";
      const finalNumCards = numCards || storedParams?.numCards || 10;
      const finalGenerateImages = generateImages !== undefined ? generateImages : (storedParams?.generateImages !== undefined ? storedParams.generateImages : true);
      const finalImageStyle = imageStyle || storedParams?.imageStyle || "photorealistic";
      const finalAdditionalInstructions = typeof additionalInstructions === "string"
        ? additionalInstructions.trim().slice(0, 5000)
        : (typeof storedParams?.additionalInstructions === "string" ? storedParams.additionalInstructions : "");
      
      if (!inputText) {
        return res.status(400).json({ error: "Input text required - no generation content found. Please provide content to generate the lesson" });
      }

      const requiredCredits = await lessonGenerationPricingService.getRequiredCredits(finalGenerateImages);
      
      const preview = await HybridCreditService.previewDeduction({
        userId,
        organizationId,
        amount: requiredCredits
      });
      
      if (!preview.canDeduct) {
        const totalAvailable = preview.userBalance + (preview.orgWalletEnabled && preview.userAuthorized ? preview.orgBalance : 0);
        return res.status(402).json({ 
          error: "Insufficient credits",
          message: `Lesson regeneration ${finalGenerateImages ? "with images" : "without images"} requires at least ${requiredCredits} credits. You have ${totalAvailable} credits available.`,
          requiredCredits,
          currentBalance: totalAvailable,
          reason: preview.reason
        });
      }

      const result = await db.transaction(async (tx) => {
        await tx
          .update(schema.lessons)
          .set({
            generationStatus: "pending",
            metadata: sql`jsonb_set(COALESCE(${schema.lessons.metadata}, '{}'::jsonb), '{gammaAdditionalInstructions}', ${JSON.stringify(finalAdditionalInstructions)}::jsonb)`,
            updatedAt: new Date(),
          })
          .where(eq(schema.lessons.id, lessonId));

        const isFromDocument = lesson.generationMode === "document-upload";

        const job = await JobQueueService.createJobWithCleanup({
          organizationId,
          lessonId,
          metadata: {
            inputText,
            themeId: finalThemeId,
            numCards: finalNumCards,
            generateImages: finalGenerateImages,
            imageStyle: finalImageStyle,
            additionalInstructions: finalAdditionalInstructions,
            userId,
            isRegeneration: true,
            isFromDocument,
          },
        }, tx);

        return { success: true, job };
      });

      if (lesson.isDefaultLanguage === false) {
        try {
          await db.update(schema.lessonTranslationJobs)
            .set({ currentStep: 'pptx_generating', updatedAt: new Date() })
            .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
        } catch (e) {
        }
      }

      res.json({ job: result.job, message: "Lesson regeneration started" });
    } catch (error) {
      console.error("Regenerate lesson error:", error);
      res.status(500).json({ error: "Failed to start lesson regeneration" });
    }
  });

  app.get("/api/lessons/:lessonId/translation-preflight", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const lesson = (req as any).lesson;
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      const requestedTargetLanguageCode = String(req.query.targetLanguageCode || "").trim().toLowerCase();
      const sourceLanguageCode = String(lesson.languageCode || "en").trim().toLowerCase() || "en";
      const targetLanguageCode = requestedTargetLanguageCode || sourceLanguageCode;

      const linkedQuizzes = await db
        .select({
          id: lessonQuizLinks.quizId,
          name: quizCollections.name,
          languageCode: quizCollections.languageCode,
          updatedAt: quizCollections.updatedAt,
        })
        .from(lessonQuizLinks)
        .leftJoin(quizCollections, eq(lessonQuizLinks.quizId, quizCollections.id))
        .where(eq(lessonQuizLinks.lessonId, lesson.id));

      const [pricing] = await db
        .select()
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);

      const lessonContentHistory = await db
        .select()
        .from(schema.lessonContentVersions)
        .where(eq(schema.lessonContentVersions.lessonId, lesson.id))
        .orderBy(desc(schema.lessonContentVersions.createdAt));

      const pptxHistory = await db
        .select()
        .from(schema.lessonPresentationVersions)
        .where(eq(schema.lessonPresentationVersions.lessonId, lesson.id))
        .orderBy(desc(schema.lessonPresentationVersions.createdAt));
      const sourceSlides = await db
        .select({ id: schema.lessonSlides.id })
        .from(schema.lessonSlides)
        .where(
          and(
            eq(schema.lessonSlides.lessonId, lesson.id),
            eq(schema.lessonSlides.version, lesson.currentSlideVersion || 1)
          )
        )
        .limit(1);

      const podcastMeta = LessonPodcastService.getMetadata(lesson);
      const podcastCompletedVersions = (podcastMeta.versions || []).filter((v: any) => v?.status === "completed");
      const podcastScripts = Array.isArray((podcastMeta as any)?.scripts) ? (podcastMeta as any).scripts : [];
      const wordSources = Array.isArray((podcastMeta as any)?.sourceMaterials)
        ? (podcastMeta as any).sourceMaterials.filter((item: any) =>
            item?.sourceType === "word" && String(item?.storageKey || "").trim()
          )
        : [];

      const currentSourceDbText = String(lesson.inputText || "").trim();
      const includeSourceDbDefault = currentSourceDbText.length > 0;
      const includeWordDocsDefault = !!String(lesson.sourceDocumentPath || "").trim()
        || wordSources.length > 0
        || lessonContentHistory.some((v: any) =>
          String(v?.source || "") === "word_upload"
          && !!String((v as any)?.metadata?.sourceDocumentPath || "").trim()
        );
      const includeQuizDefault = linkedQuizzes.length > 0;
      const includePodcastScriptDefault = podcastCompletedVersions.length > 0 || podcastScripts.length > 0;
      const includePptxDefault = !!lesson.storageKey || pptxHistory.length > 0 || sourceSlides.length > 0;

      const sourceDbVersions = [];
      if (includeSourceDbDefault) {
        sourceDbVersions.push({
          id: "current",
          label: "Source DB - Current Version (Active)",
          versionNumber: lesson.currentSlideVersion || null,
          createdAt: lesson.updatedAt || lesson.createdAt || new Date(),
          languageCode: lesson.languageCode || "en",
          wordCount: currentSourceDbText.split(/\s+/).filter(Boolean).length,
          isActive: true,
          contentHash: createHash("md5").update(currentSourceDbText).digest("hex").substring(0, 32),
        });
      }

      for (const version of lessonContentHistory) {
        const newContent = String((version as any)?.newContent || "").trim();
        if (!newContent) continue;
        sourceDbVersions.push({
          id: version.id,
          label: String(version?.source || "") === "word_upload"
            ? `Source DB - Word Upload Version ${version.versionNumber}`
            : `Source DB - Version ${version.versionNumber}`,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          languageCode: lesson.languageCode || "en",
          wordCount: newContent.split(/\s+/).filter(Boolean).length,
          isActive: false,
          contentHash: createHash("md5").update(newContent).digest("hex").substring(0, 32),
          source: version.source,
          changeDescription: version.changeDescription || null,
        });
      }

      const wordDocVersions = [];
      if (lesson.sourceDocumentPath) {
        wordDocVersions.push({
          id: "current",
          label: "Word source - Current (Active)",
          createdAt: lesson.updatedAt || lesson.createdAt || new Date(),
          languageCode: lesson.languageCode || "en",
          isActive: true,
          sourceDocumentPath: lesson.sourceDocumentPath,
          contentHash: createHash("md5").update(String(lesson.sourceDocumentPath)).digest("hex").substring(0, 32),
        });
      }
      for (const version of lessonContentHistory) {
        if (String(version?.source || "") !== "word_upload") continue;
        const metadata = (version as any)?.metadata || {};
        wordDocVersions.push({
          id: version.id,
          label: `Word source - Version ${version.versionNumber}`,
          versionNumber: version.versionNumber,
          createdAt: version.createdAt,
          languageCode: lesson.languageCode || "en",
          isActive: false,
          sourceDocumentPath: metadata?.sourceDocumentPath || null,
          originalFilename: metadata?.originalFilename || null,
          contentHash: createHash("md5")
            .update(String(metadata?.sourceDocumentPath || version.id))
            .digest("hex")
            .substring(0, 32),
        });
      }
      for (const source of wordSources) {
        wordDocVersions.push({
          id: String(source.id || randomUUID()),
          label: `Word source - ${source.title || source.fileName || "Source Material"}`,
          createdAt: source.updatedAt || source.createdAt || new Date(),
          languageCode: source.languageCode || lesson.languageCode || "en",
          isActive: false,
          sourceDocumentPath: source.storageKey || null,
          originalFilename: source.fileName || null,
          contentHash: createHash("md5")
            .update(String(source.storageKey || source.id || source.title || "word"))
            .digest("hex")
            .substring(0, 32),
        });
      }

      const pptxVersions = [];
      if (lesson.storageKey) {
        pptxVersions.push({
          id: "current",
          label: "PPTX - Current Version (Active)",
          version: lesson.currentSlideVersion || null,
          createdAt: lesson.updatedAt || lesson.createdAt || new Date(),
          languageCode: lesson.languageCode || "en",
          isActive: true,
          storageKey: lesson.storageKey || null,
          gammaCardId: lesson.gammaCardId || null,
          contentHash: createHash("md5")
            .update(String(lesson.storageKey || lesson.gammaCardId || "current-pptx"))
            .digest("hex")
            .substring(0, 32),
        });
      } else if (sourceSlides.length > 0) {
        pptxVersions.push({
          id: "current",
          label: "PPTX - Current Slides (Active)",
          version: lesson.currentSlideVersion || 1,
          createdAt: lesson.updatedAt || lesson.createdAt || new Date(),
          languageCode: lesson.languageCode || "en",
          isActive: true,
          storageKey: null,
          gammaCardId: lesson.gammaCardId || null,
          contentHash: createHash("md5")
            .update(`slides:${lesson.id}:${lesson.currentSlideVersion || 1}`)
            .digest("hex")
            .substring(0, 32),
        });
      }
      for (const version of pptxHistory) {
        pptxVersions.push({
          id: version.id,
          label: `PPTX - Version ${version.version}${version.storageKey === lesson.storageKey ? " (Active)" : ""}`,
          version: version.version,
          createdAt: version.createdAt,
          languageCode: version.languageCode || lesson.languageCode || "en",
          isActive: version.storageKey === lesson.storageKey,
          storageKey: version.storageKey,
          gammaCardId: version.gammaCardId || null,
          contentHash: createHash("md5").update(String(version.storageKey || version.gammaCardId || version.id)).digest("hex").substring(0, 32),
        });
      }

      const quizVersions = linkedQuizzes.map((quiz) => ({
        id: String(quiz.id),
        label: quiz.name ? `Quiz - ${quiz.name}` : `Quiz - ${quiz.id}`,
        createdAt: quiz.updatedAt || new Date(),
        languageCode: quiz.languageCode || lesson.languageCode || "en",
        isActive: true,
        contentHash: createHash("md5")
          .update(`${quiz.id}:${quiz.updatedAt ? new Date(quiz.updatedAt).toISOString() : "na"}`)
          .digest("hex")
          .substring(0, 32),
      }));

      const podcastScriptVersions = podcastScripts.map((script: any) => ({
        id: String(script.id || randomUUID()),
        label: script.title ? `Podcast script - ${script.title}` : "Podcast script",
        createdAt: script.updatedAt || script.createdAt || new Date(),
        languageCode: script.languageCode || lesson.languageCode || "en",
        isActive: String((podcastMeta as any)?.activeScriptId || "") === String(script.id || ""),
        sourceType: script.sourceType || "sourcedb",
        contentHash: createHash("md5").update(String(script.text || script.id || "")).digest("hex").substring(0, 32),
      }));

      const podcastAudioVersions = podcastCompletedVersions.map((version: any) => ({
        id: String(version.id || randomUUID()),
        label: version.title ? `Podcast audio - ${version.title}` : "Podcast audio",
        createdAt: version.updatedAt || version.createdAt || new Date(),
        languageCode: version.languageCode || lesson.languageCode || "en",
        isActive: String(podcastMeta?.activeVersionId || "") === String(version.id || ""),
        sourceType: version.sourceType || "sourcedb",
        contentHash: createHash("md5").update(String(version.storageKey || version.scriptId || version.id || "")).digest("hex").substring(0, 32),
      }));

      const stepGuideSummary = summarizeStepGuideArtifacts(lesson?.metadata, lesson?.languageCode || null);
      const sourceObjectiveLinks = await db
        .select({ learningObjectives: schema.courseLessons.learningObjectives })
        .from(schema.courseLessons)
        .where(eq(schema.courseLessons.lessonId, lesson.id));
      const hasObjectives = sourceObjectiveLinks.some((link: any) =>
        Array.isArray(link.learningObjectives) &&
        link.learningObjectives.some((objective: any) => String(objective || "").trim().length > 0)
      );
      const availability = {
        sourceDb: sourceDbVersions.length > 0,
        wordDocs: wordDocVersions.length > 0,
        quiz: quizVersions.length > 0,
        podcastScript: podcastScriptVersions.length > 0,
        podcastAudio: podcastAudioVersions.length > 0 && podcastScriptVersions.length > 0,
        pptx: pptxVersions.length > 0,
        objectives: hasObjectives,
        digest: sourceDbVersions.length > 0 || wordDocVersions.length > 0,
        stepGuide: stepGuideSummary.hasStepGuide,
      };

      const hasDigestSectionsForLanguage = (metadata: unknown, languageCode?: string | null): boolean => {
        const normalizedLanguage = String(languageCode || "").trim().toLowerCase();
        const metadataObj = metadata && typeof metadata === "object" ? metadata as any : {};
        const digestSections = Array.isArray(metadataObj?.digest?.sections) ? metadataObj.digest.sections : [];
        return digestSections.some((section: any) => {
          const sectionLanguage = String(section?.languageCode || metadataObj?.digest?.languageCode || "").trim().toLowerCase();
          const text = String(section?.content || section?.text || section?.summary || "").trim();
          return text && (!normalizedLanguage || !sectionLanguage || sectionLanguage === normalizedLanguage);
        });
      };

      const groupId = String(lesson.contentGroupId || lesson.id);
      let targetLesson: any = null;
      if (requestedTargetLanguageCode && requestedTargetLanguageCode !== sourceLanguageCode) {
        const [variant] = await db
          .select()
          .from(schema.lessons)
          .where(and(
            eq(schema.lessons.organizationId, lesson.organizationId),
            eq(schema.lessons.contentGroupId, groupId),
            sql`LOWER(COALESCE(${schema.lessons.languageCode}, '')) = ${requestedTargetLanguageCode}`
          ))
          .limit(1);
        targetLesson = variant || null;
      } else {
        targetLesson = lesson;
      }

      const targetQuizLinks = targetLesson
        ? await db
          .select({ id: lessonQuizLinks.quizId })
          .from(lessonQuizLinks)
          .where(eq(lessonQuizLinks.lessonId, targetLesson.id))
        : [];
      const targetObjectiveLinks = targetLesson
        ? await db
          .select({ learningObjectives: schema.courseLessons.learningObjectives })
          .from(schema.courseLessons)
          .where(eq(schema.courseLessons.lessonId, targetLesson.id))
        : [];
      const targetPodcastSummary = targetLesson
        ? summarizePodcastArtifacts(targetLesson.metadata, targetLanguageCode)
        : { hasPodcast: false, hasPodcastScript: false, activePodcastVersionId: null };
      const targetStepGuideSummary = targetLesson
        ? summarizeStepGuideArtifacts(targetLesson.metadata, targetLanguageCode)
        : { hasStepGuide: false, activeStepGuideVersionId: null };
      const targetCoverage = {
        lessonId: targetLesson?.id || null,
        languageCode: targetLanguageCode,
        hasTargetLesson: !!targetLesson,
        sourceDb: !!String(targetLesson?.inputText || "").trim(),
        wordDocs: !!String(targetLesson?.sourceDocumentPath || "").trim(),
        quiz: targetQuizLinks.length > 0 || !!targetLesson?.relatedQuizId,
        podcastScript: !!targetPodcastSummary.hasPodcastScript,
        podcastAudio: !!targetPodcastSummary.hasPodcast,
        pptx: !!targetLesson?.storageKey || !!targetLesson?.gammaCardId,
        objectives: targetObjectiveLinks.some((link: any) =>
          Array.isArray(link.learningObjectives) &&
          link.learningObjectives.some((objective: any) => String(objective || "").trim().length > 0)
        ),
        digest: targetLesson ? hasDigestSectionsForLanguage(targetLesson.metadata, targetLanguageCode) : false,
        stepGuide: !!targetStepGuideSummary.hasStepGuide,
      };

      const shouldIncludeMissing = (artifactKey: keyof typeof availability) =>
        availability[artifactKey] && (!requestedTargetLanguageCode || requestedTargetLanguageCode === sourceLanguageCode || !(targetCoverage as any)[artifactKey]);

      const blockers = [];
      if (!availability.sourceDb && !availability.wordDocs && !availability.quiz && !availability.podcastScript && !availability.pptx && !availability.objectives && !availability.digest) {
        blockers.push("No translatable artifacts found yet");
      }

      const creditsPerLesson = pricing?.creditsPerLessonTranslation ?? 10;
      const creditsPerQuiz = pricing?.creditsPerQuizTranslation ?? 5;

      const defaults = {
        includeSourceDb: shouldIncludeMissing("sourceDb"),
        includeWordDocs: shouldIncludeMissing("wordDocs"),
        includeQuiz: shouldIncludeMissing("quiz"),
        includePodcastScript: shouldIncludeMissing("podcastScript"),
        includePodcastAudio: false,
        includePptx: shouldIncludeMissing("pptx"),
        includeObjectives: shouldIncludeMissing("objectives"),
        includeDigest: shouldIncludeMissing("digest"),
        includeStepGuide: shouldIncludeMissing("stepGuide"),
        pptxMode: "translate_source" as const,
        selectedSourceContentVersionId: sourceDbVersions.find((v: any) => v.isActive)?.id || sourceDbVersions[0]?.id || "current",
        selectedWordDocVersionId: wordDocVersions.find((v: any) => v.isActive)?.id || wordDocVersions[0]?.id || "current",
        selectedPptxVersionId: pptxVersions.find((v: any) => v.isActive)?.id || pptxVersions[0]?.id || "current",
        selectedPodcastScriptVersionId: podcastScriptVersions.find((v: any) => v.isActive)?.id || podcastScriptVersions[0]?.id || null,
        selectedPodcastAudioVersionId: podcastAudioVersions.find((v: any) => v.isActive)?.id || podcastAudioVersions[0]?.id || null,
        selectedQuizIds: quizVersions.map((q: any) => q.id),
      };

      res.json({
        lessonId: lesson.id,
        languageCode: sourceLanguageCode,
        targetLanguageCode,
        translatableArtifactsFound: blockers.length === 0,
        blockers,
        availability,
        targetCoverage,
        defaults,
        artifacts: {
          sourceDb: { versions: sourceDbVersions },
          wordDocs: { versions: wordDocVersions },
          pptx: { versions: pptxVersions },
          quiz: { versions: quizVersions },
          podcastScript: { versions: podcastScriptVersions },
          podcastAudio: { versions: podcastAudioVersions },
          digest: {
            versions: availability.digest
              ? [{
                  id: "current",
                  label: "Lesson digest - regenerate in target language",
                  createdAt: lesson.updatedAt || lesson.createdAt || new Date(),
                  languageCode: lesson.languageCode || "en",
                  isActive: true,
                }]
              : [],
          },
          stepGuide: {
            versions: availability.stepGuide
              ? [{
                  id: "current",
                  label: "Step-by-step guide - translate active version",
                  createdAt: lesson.updatedAt || lesson.createdAt || new Date(),
                  languageCode: lesson.languageCode || "en",
                  isActive: true,
                }]
              : [],
          },
        },
        counts: {
          linkedQuizCount: linkedQuizzes.length,
          podcastVersionCount: podcastCompletedVersions.length,
          podcastScriptCount: podcastScripts.length,
          podcastWordSourceCount: wordSources.length,
        },
        pricing: {
          creditsPerLessonTranslation: creditsPerLesson,
          creditsPerQuizTranslation: creditsPerQuiz,
          creditsPerTranslatedPptxGeneration: pricing?.creditsPerTranslatedPptxGeneration ?? 50,
          estimatedSelectedDefaults: (availability.sourceDb || availability.wordDocs ? creditsPerLesson : 0)
            + (availability.quiz ? linkedQuizzes.length * creditsPerQuiz : 0),
        },
      });
    } catch (error) {
      console.error("Translation preflight error:", error);
      res.status(500).json({ error: "Failed to prepare translation preflight" });
    }
  });

  app.post("/api/lessons/:lessonId/translate", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId: requestedOrganizationId, targetLanguageCode } = req.body;
      const requestedOptions = req.body?.translationOptions || {};
      const requestedPodcastConfig = req.body?.podcastConfig || {};

      const translationOptions = {
        includeSourceDb: requestedOptions.includeSourceDb !== false,
        includeWordDocs: requestedOptions.includeWordDocs !== false,
        includeQuiz: requestedOptions.includeQuiz !== false,
        includePodcastScript: requestedOptions.includePodcastScript === true,
        includePodcastAudio: requestedOptions.includePodcastAudio === true,
        includePptx: requestedOptions.includePptx === true,
        includeObjectives: requestedOptions.includeObjectives === true,
        includeDigest: requestedOptions.includeDigest === true,
        includeStepGuide: requestedOptions.includeStepGuide ?? (requestedOptions.includeDigest === true),
        includePodcastInNextStep: requestedOptions.includePodcastInNextStep === true,
        pptxMode: requestedOptions.pptxMode === 'generate_new' ? 'generate_new' : 'translate_source',
        selectedSourceContentVersionId: requestedOptions.selectedSourceContentVersionId
          ? String(requestedOptions.selectedSourceContentVersionId)
          : 'current',
        selectedWordDocVersionId: requestedOptions.selectedWordDocVersionId
          ? String(requestedOptions.selectedWordDocVersionId)
          : 'current',
        selectedPptxVersionId: requestedOptions.selectedPptxVersionId
          ? String(requestedOptions.selectedPptxVersionId)
          : 'current',
        selectedPodcastScriptVersionId: requestedOptions.selectedPodcastScriptVersionId
          ? String(requestedOptions.selectedPodcastScriptVersionId)
          : null,
        selectedPodcastAudioVersionId: requestedOptions.selectedPodcastAudioVersionId
          ? String(requestedOptions.selectedPodcastAudioVersionId)
          : null,
        selectedQuizIds: Array.isArray(requestedOptions.selectedQuizIds)
          ? requestedOptions.selectedQuizIds.map((id: any) => String(id)).filter(Boolean)
          : [],
        targetLanguageByArtifact: requestedOptions.targetLanguageByArtifact && typeof requestedOptions.targetLanguageByArtifact === "object"
          ? requestedOptions.targetLanguageByArtifact
          : {},
        retranslateExistingTargetLanguage: requestedOptions.retranslateExistingTargetLanguage === true,
      };
      if ((translationOptions.includeWordDocs || translationOptions.includeObjectives) && (String((req as any)?.lesson?.inputText || "").trim() || (req as any)?.lesson?.storageKey)) {
        translationOptions.includeSourceDb = true;
      }
      const hasAnySelection = !!(
        translationOptions.includeSourceDb ||
        translationOptions.includeWordDocs ||
        translationOptions.includeQuiz ||
        translationOptions.includePodcastScript ||
        translationOptions.includePodcastAudio ||
        translationOptions.includePodcastInNextStep ||
        translationOptions.includePptx ||
        translationOptions.includeObjectives ||
        translationOptions.includeDigest ||
        translationOptions.includeStepGuide
      );
      if (!hasAnySelection) {
        return res.status(400).json({ error: "Select at least one artifact to translate." });
      }

      const podcastConfig = {
        sourceType: requestedPodcastConfig?.sourceType ? String(requestedPodcastConfig.sourceType) : undefined,
        sourceMaterialId: requestedPodcastConfig?.sourceMaterialId ? String(requestedPodcastConfig.sourceMaterialId) : undefined,
        voiceId: requestedPodcastConfig?.voiceId ? String(requestedPodcastConfig.voiceId) : undefined,
        guestVoiceId: requestedPodcastConfig?.guestVoiceId ? String(requestedPodcastConfig.guestVoiceId) : undefined,
        format: requestedPodcastConfig?.format ? String(requestedPodcastConfig.format) : undefined,
        duration: requestedPodcastConfig?.duration ? String(requestedPodcastConfig.duration) : undefined,
        hostDisplayName: requestedPodcastConfig?.hostDisplayName ? String(requestedPodcastConfig.hostDisplayName) : undefined,
        guestDisplayName: requestedPodcastConfig?.guestDisplayName ? String(requestedPodcastConfig.guestDisplayName) : undefined,
      };

      if (!targetLanguageCode) {
        return res.status(400).json({ error: "Target language code is required" });
      }

      const isSupportedLanguage = await ContentLanguageService.isLanguageSupported(targetLanguageCode);
      if (!isSupportedLanguage) {
        return res.status(400).json({ error: `Unsupported language code: ${targetLanguageCode}` });
      }

      const lesson = (req as any).lesson;
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      const organizationId = String(lesson.organizationId || "");
      if (!organizationId) {
        return res.status(400).json({ error: "Lesson has no organization context" });
      }
      if (requestedOrganizationId && String(requestedOrganizationId) !== organizationId) {
        return res.status(403).json({ error: "Organization mismatch for lesson translation request" });
      }

      const selectedTargetLanguages = Object.entries(translationOptions.targetLanguageByArtifact || {})
        .filter(([_, value]) => typeof value === "string" && value)
        .map(([key, value]) => ({ key, value: String(value).toLowerCase() }));
      const incompatibleLanguage = selectedTargetLanguages.find((entry) => entry.value !== String(targetLanguageCode).toLowerCase());
      if (incompatibleLanguage) {
        return res.status(400).json({
          error: `Selected target language for ${incompatibleLanguage.key} (${incompatibleLanguage.value}) is incompatible with this translation run. Use one target language per run.`,
        });
      }

      const groupId = lesson.contentGroupId || lesson.id;
      const [existingTranslation] = await db
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.contentGroupId, groupId),
            eq(lessons.languageCode, targetLanguageCode),
            eq(lessons.organizationId, organizationId)
          )
        )
        .limit(1);

      const allowRetranslateExisting = translationOptions.retranslateExistingTargetLanguage === true;
      if (existingTranslation) {
        if (existingTranslation.translationStatus === 'draft' && !allowRetranslateExisting) {
          return res.json({
            translatedLessonId: existingTranslation.id,
            translatedQuizIds: [],
            creditsCharged: 0,
            targetLanguageCode,
            message: "Existing draft translation found",
            translationOptions,
          });
        }
        if (!allowRetranslateExisting) {
          return res.status(409).json({ error: "Translation already exists for this language." });
        }
      }

      const [activeJob] = await db
        .select()
        .from(lessonTranslationJobs)
        .where(
          and(
            eq(lessonTranslationJobs.sourceLessonId, lessonId),
            eq(lessonTranslationJobs.organizationId, organizationId),
            eq(lessonTranslationJobs.targetLanguageCode, targetLanguageCode),
            eq(lessonTranslationJobs.status, 'translating')
          )
        )
        .limit(1);

      if (activeJob) {
        return res.status(429).json({
          error: "Translation already in progress for this lesson and language",
          jobId: activeJob.id,
          translatedLessonId: activeJob.lessonId,
          status: 'translating',
        });
      }

      const [pricing] = await db
        .select()
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);
      const creditsPerLesson = pricing?.creditsPerLessonTranslation ?? 10;
      const creditsPerQuiz = pricing?.creditsPerQuizTranslation ?? 5;

      const linkedQuizzes = await db
        .select()
        .from(lessonQuizLinks)
        .where(eq(lessonQuizLinks.lessonId, lessonId));

      const lessonContentHistory = await db
        .select()
        .from(schema.lessonContentVersions)
        .where(eq(schema.lessonContentVersions.lessonId, lessonId))
        .orderBy(desc(schema.lessonContentVersions.createdAt));

      const pptxHistory = await db
        .select()
        .from(schema.lessonPresentationVersions)
        .where(eq(schema.lessonPresentationVersions.lessonId, lessonId))
        .orderBy(desc(schema.lessonPresentationVersions.createdAt));

      const podcastMeta = LessonPodcastService.getMetadata(lesson);
      const podcastScripts = Array.isArray((podcastMeta as any)?.scripts) ? (podcastMeta as any).scripts : [];
      const podcastVersions = LessonPodcastService.getCompletedVersions(podcastMeta);
      const skipReasons: Record<string, string> = {};
      const wordSourceMaterials = Array.isArray((podcastMeta as any)?.sourceMaterials)
        ? (podcastMeta as any).sourceMaterials.filter((item: any) => item?.sourceType === "word" && String(item?.storageKey || "").trim())
        : [];
      const hasRealWordSource = !!String(lesson.sourceDocumentPath || "").trim()
        || lessonContentHistory.some((version: any) => {
          const sourceDocumentPath = String((version as any)?.metadata?.sourceDocumentPath || "").trim();
          return String(version?.source || "") === "word_upload" && !!sourceDocumentPath;
        })
        || wordSourceMaterials.length > 0;
      if (translationOptions.includeWordDocs && !hasRealWordSource) {
        translationOptions.includeWordDocs = false;
        skipReasons.wordDocs = "No Word source is available for this lesson.";
      }

      let selectedSourceDbText = String(lesson.inputText || "");
      let selectedSourceDbHash = selectedSourceDbText
        ? createHash("md5").update(selectedSourceDbText).digest("hex").substring(0, 32)
        : null;
      if (translationOptions.includeSourceDb && translationOptions.selectedSourceContentVersionId && translationOptions.selectedSourceContentVersionId !== "current") {
        const selectedVersion = lessonContentHistory.find((v: any) => String(v.id) === String(translationOptions.selectedSourceContentVersionId));
        const selectedVersionText = String((selectedVersion as any)?.newContent || "").trim();
        if (!selectedVersion || !selectedVersionText) {
          return res.status(400).json({ error: "Selected Source DB version is invalid for this lesson." });
        }
        selectedSourceDbText = selectedVersionText;
        selectedSourceDbHash = createHash("md5").update(selectedVersionText).digest("hex").substring(0, 32);
      }

      const selectedWordVersion = translationOptions.selectedWordDocVersionId && translationOptions.selectedWordDocVersionId !== "current"
        ? lessonContentHistory.find((v: any) => String(v.id) === String(translationOptions.selectedWordDocVersionId) && String(v.source || "") === "word_upload")
        : null;

      const selectedPptxVersion = translationOptions.selectedPptxVersionId && translationOptions.selectedPptxVersionId !== "current"
        ? pptxHistory.find((v: any) => String(v.id) === String(translationOptions.selectedPptxVersionId))
        : null;

      const selectedQuizIds = translationOptions.selectedQuizIds.length > 0
        ? translationOptions.selectedQuizIds.filter((id: string) => linkedQuizzes.some((q: any) => String(q.quizId) === id))
        : linkedQuizzes.map((q: any) => String(q.quizId));

      if (translationOptions.includeQuiz && selectedQuizIds.length === 0 && linkedQuizzes.length > 0) {
        return res.status(400).json({ error: "No valid quiz selection found for this lesson." });
      }
      if (translationOptions.includeQuiz && linkedQuizzes.length === 0) {
        translationOptions.includeQuiz = false;
        skipReasons.quiz = "No quizzes are linked to the source lesson.";
      }
      const hasAnySelectionAfterNormalization = !!(
        translationOptions.includeSourceDb ||
        translationOptions.includeWordDocs ||
        translationOptions.includeQuiz ||
        translationOptions.includePodcastScript ||
        translationOptions.includePodcastAudio ||
        translationOptions.includePodcastInNextStep ||
        translationOptions.includePptx ||
        translationOptions.includeObjectives ||
        translationOptions.includeDigest ||
        translationOptions.includeStepGuide
      );
      if (!hasAnySelectionAfterNormalization) {
        return res.status(400).json({ error: "Select at least one artifact to translate." });
      }

      const selectedPodcastScript = translationOptions.selectedPodcastScriptVersionId
        ? podcastScripts.find((s: any) => String(s.id) === String(translationOptions.selectedPodcastScriptVersionId))
        : podcastScripts[0] || null;
      const selectedPodcastAudio = translationOptions.selectedPodcastAudioVersionId
        ? podcastVersions.find((v: any) => String(v.id) === String(translationOptions.selectedPodcastAudioVersionId))
        : podcastVersions[0] || null;

      if (translationOptions.includePodcastScript && !selectedPodcastScript && podcastScripts.length > 0) {
        return res.status(400).json({ error: "Selected podcast script is not available." });
      }
      if (translationOptions.includePodcastAudio && !selectedPodcastAudio && podcastVersions.length > 0) {
        return res.status(400).json({ error: "Selected podcast audio source is not available." });
      }

      (translationOptions as any).selectedSourceDbText = selectedSourceDbText;
      (translationOptions as any).selectedSourceDbHash = selectedSourceDbHash;
      (translationOptions as any).selectedPptxStorageKey = selectedPptxVersion?.storageKey || lesson.storageKey || null;
      (translationOptions as any).selectedQuizIds = selectedQuizIds;
      (translationOptions as any).selectedPodcastScriptVersionId = selectedPodcastScript?.id || translationOptions.selectedPodcastScriptVersionId || null;
      (translationOptions as any).selectedPodcastAudioVersionId = selectedPodcastAudio?.id || translationOptions.selectedPodcastAudioVersionId || null;

      const totalCredits = (translationOptions.includeSourceDb || translationOptions.includeWordDocs ? creditsPerLesson : 0)
        + (translationOptions.includeQuiz ? (selectedQuizIds.length * creditsPerQuiz) : 0);

      const translationCorrelationId = `lesson-translation-${randomUUID()}`;
      if (totalCredits > 0) {
        const preview = await HybridCreditService.previewDeduction({
          userId,
          organizationId,
          amount: totalCredits,
        });

        if (!preview.canDeduct) {
          const totalAvailable = preview.userBalance + (preview.orgWalletEnabled && preview.userAuthorized ? preview.orgBalance : 0);
          return res.status(402).json({
            error: "Insufficient credits",
            message: `Lesson translation requires ${totalCredits} credits. You have ${totalAvailable} credits available.`,
            requiredCredits: totalCredits,
            currentBalance: totalAvailable,
            reason: preview.reason,
          });
        }

        await HybridCreditService.deductWithFallback({
          userId,
          organizationId,
          amount: totalCredits,
          type: 'deduction',
          activityType: 'content_translation' as const,
          correlationId: translationCorrelationId,
          description: `Lesson translation to ${targetLanguageCode}: ${totalCredits} credits`,
          metadata: { sourceLessonId: lessonId, targetLanguageCode, selectedQuizIds, selectedSourceContentVersionId: translationOptions.selectedSourceContentVersionId },
        });
      }

      if (existingTranslation && allowRetranslateExisting) {
        try {
          const existingMetadata = existingTranslation.metadata && typeof existingTranslation.metadata === "object"
            ? { ...(existingTranslation.metadata as any) }
            : {};
          const translationPackage = {
            sourceLessonId: lesson.id,
            sourceLanguageCode: lesson.languageCode || 'en',
            targetLanguageCode,
            chargeCorrelationId: translationCorrelationId,
            options: translationOptions,
            sourceContracts: {
              sourceDb: translationOptions.includeSourceDb ? {
                artifact: "sourceDb",
                selectedVersionId: translationOptions.selectedSourceContentVersionId || "current",
                sourceVersionHash: selectedSourceDbHash,
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              wordDocs: translationOptions.includeWordDocs ? {
                artifact: "wordDocs",
                selectedVersionId: translationOptions.selectedWordDocVersionId || "current",
                sourceVersionHash: createHash("md5")
                  .update(String(
                    selectedWordVersion
                      ? ((selectedWordVersion as any)?.metadata?.sourceDocumentPath || selectedWordVersion.id)
                      : (lesson.sourceDocumentPath || "")
                  ))
                  .digest("hex")
                  .substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              pptx: translationOptions.includePptx ? {
                artifact: "pptx",
                selectedVersionId: translationOptions.selectedPptxVersionId || "current",
                sourceVersionHash: createHash("md5")
                  .update(String(selectedPptxVersion?.storageKey || lesson.storageKey || selectedPptxVersion?.gammaCardId || lesson.gammaCardId || "pptx"))
                  .digest("hex")
                  .substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              quiz: translationOptions.includeQuiz ? {
                artifact: "quiz",
                selectedVersionId: selectedQuizIds.join(","),
                sourceVersionHash: createHash("md5").update(selectedQuizIds.join("|")).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              podcastScript: translationOptions.includePodcastScript ? {
                artifact: "podcastScript",
                selectedVersionId: selectedPodcastScript?.id || translationOptions.selectedPodcastScriptVersionId || "current",
                sourceVersionHash: createHash("md5").update(String(selectedPodcastScript?.text || selectedPodcastScript?.id || "podcast-script")).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              podcastAudio: translationOptions.includePodcastAudio ? {
                artifact: "podcastAudio",
                selectedVersionId: selectedPodcastAudio?.id || translationOptions.selectedPodcastAudioVersionId || "current",
                sourceVersionHash: createHash("md5").update(String(selectedPodcastAudio?.storageKey || selectedPodcastAudio?.scriptId || selectedPodcastAudio?.id || "podcast-audio")).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              digest: translationOptions.includeDigest ? {
                artifact: "digest",
                selectedVersionId: "current",
                sourceVersionHash: selectedSourceDbHash || createHash("md5").update(String(lesson.updatedAt || lesson.id)).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              stepGuide: translationOptions.includeStepGuide ? {
                artifact: "stepGuide",
                selectedVersionId: "current",
                sourceVersionHash: selectedSourceDbHash || createHash("md5").update(String(lesson.updatedAt || lesson.id)).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
            },
            podcastConfig,
            assets: {
              sourceDb: translationOptions.includeSourceDb ? 'queued' : 'skipped',
              wordDocs: translationOptions.includeWordDocs ? 'queued' : 'skipped',
              quiz: translationOptions.includeQuiz ? 'queued' : 'skipped',
              podcastScript: translationOptions.includePodcastScript ? 'queued' : (translationOptions.includePodcastInNextStep ? 'deferred_optional' : 'skipped'),
              podcastAudio: translationOptions.includePodcastAudio ? 'queued' : (translationOptions.includePodcastInNextStep ? 'deferred_optional' : 'skipped'),
              pptx: translationOptions.includePptx ? 'queued' : 'skipped',
              objectives: translationOptions.includeObjectives ? 'queued' : 'skipped',
              digest: translationOptions.includeDigest ? 'queued' : 'skipped',
              stepGuide: translationOptions.includeStepGuide ? 'queued' : 'skipped',
            },
            assetMessages: {
              sourceDb: translationOptions.includeSourceDb ? null : "Not selected for this run.",
              wordDocs: translationOptions.includeWordDocs ? null : (skipReasons.wordDocs || "Not selected for this run."),
              quiz: translationOptions.includeQuiz ? null : (skipReasons.quiz || "Not selected for this run."),
              podcastScript: translationOptions.includePodcastScript
                ? null
                : (translationOptions.includePodcastInNextStep ? "Deferred to optional podcast step." : "Not selected for this run."),
              podcastAudio: translationOptions.includePodcastAudio
                ? null
                : (translationOptions.includePodcastInNextStep ? "Deferred to optional podcast step." : "Not selected for this run."),
              pptx: translationOptions.includePptx ? null : "Not selected for this run.",
              objectives: translationOptions.includeObjectives ? null : "Not selected for this run.",
              digest: translationOptions.includeDigest ? null : "Not selected for this run.",
              stepGuide: translationOptions.includeStepGuide ? null : "Not selected for this run.",
            },
            translatedArtifacts: {},
            lastUpdatedAt: new Date().toISOString(),
          };

          existingMetadata.translationPackage = translationPackage;
          await db.update(schema.lessons)
            .set({
              metadata: existingMetadata,
              generationStatus: 'pending',
              sourceLanguageVersion: lesson.currentSlideVersion || existingTranslation.sourceLanguageVersion || 1,
              updatedAt: new Date(),
            })
            .where(eq(schema.lessons.id, existingTranslation.id));

          const existingLinkedQuizzes = await db
            .select({ quizId: lessonQuizLinks.quizId })
            .from(lessonQuizLinks)
            .where(eq(lessonQuizLinks.lessonId, existingTranslation.id));
          const translatedQuizIds = existingLinkedQuizzes.map((row: any) => String(row.quizId)).filter(Boolean);

          const jobRecord = await db.insert(lessonTranslationJobs).values({
            lessonId: existingTranslation.id,
            sourceLessonId: lessonId,
            organizationId,
            targetLanguageCode,
            sourceLanguageCode: lesson.languageCode || 'en',
            status: 'translating',
            currentStep: 'translating',
            creditsCharged: totalCredits,
            initiatedBy: userId,
            updatedAt: new Date(),
          }).returning();

          await TranslationIndexService.enqueueForLessonMutation({
            lessonId: existingTranslation.id,
            organizationId,
            eventType: "translate",
            dedupeSeed: `retranslate:${lessonId}:${targetLanguageCode}:${jobRecord[0]?.id || ''}`,
          });
          for (const translatedQuizId of translatedQuizIds) {
            await TranslationIndexService.enqueueForQuizMutation({
              quizId: translatedQuizId,
              organizationId,
              eventType: "translate",
              dedupeSeed: `retranslate-quiz:${translatedQuizId}:${jobRecord[0]?.id || ''}`,
            });
          }
          await TranslationAnalyticsService.trackEvent({
            organizationId,
            userId,
            eventType: "translation_start",
            resourceType: "lesson",
            resourceId: existingTranslation.id,
            languageCode: targetLanguageCode,
            variantId: existingTranslation.id,
            contentGroupId: groupId,
            metadata: {
              sourceLessonId: lessonId,
              translationJobId: jobRecord[0]?.id || null,
              selectedQuizCount: selectedQuizIds.length,
              includeDigest: translationOptions.includeDigest === true,
              includeStepGuide: translationOptions.includeStepGuide === true,
              mode: "retranslate_existing_target_language",
            },
            dedupeSeed: `lesson-retranslate:${jobRecord[0]?.id || existingTranslation.id}`,
          });
          console.log("[TranslationOrchestration]", JSON.stringify({
            stage: "translation_job_created",
            mode: "retranslate_existing_target_language",
            translationJobId: jobRecord[0]?.id || null,
            translationCorrelationId,
            sourceLessonId: lessonId,
            translatedLessonId: existingTranslation.id,
            organizationId,
            userId,
            targetLanguageCode,
            selectedArtifacts: Object.entries(translationOptions)
              .filter(([key, value]) => key.startsWith("include") && value === true)
              .map(([key]) => key),
          }));

          return res.json({
            translatedLessonId: existingTranslation.id,
            translatedQuizIds,
            creditsCharged: totalCredits,
            targetLanguageCode,
            jobId: jobRecord[0]?.id,
            status: 'translating',
            translationOptions,
            mode: 'retranslate_existing_target_language',
            message: "Re-translation started. AI translation is processing in the background.",
          });
        } catch (retranslateError) {
          console.error("Retranslate existing lesson setup failed, refunding credits:", retranslateError);
          if (totalCredits > 0) {
            try {
              await HybridCreditService.refundWithFallback({
                userId,
                organizationId,
                originalCorrelationId: translationCorrelationId,
                refundCorrelationId: `${translationCorrelationId}-refund`,
                reason: `Retranslation setup failed, refunding ${totalCredits} credits`,
                metadata: { sourceLessonId: lessonId, targetLanguageCode, failureReason: 'retranslation_setup_failed' },
              });
            } catch (refundErr) {
              console.error("Failed to refund credits after retranslation setup failure:", refundErr);
            }
          }
          return res.status(500).json({ error: "Failed to set up re-translation. Credits have been refunded." });
        }
      }

      let translatedLessonId: string;
      try {

      translatedLessonId = randomUUID();
      const [insertedTranslatedLesson] = await db.insert(schema.lessons).values({
        id: translatedLessonId,
        title: lesson.title,
        description: lesson.description,
        inputText: lesson.inputText,
        organizationId,
        createdBy: userId,
        isPublished: false,
        languageCode: targetLanguageCode,
        contentGroupId: groupId,
        isDefaultLanguage: false,
        sourceLanguageVersion: lesson.currentSlideVersion || 1,
        translationStatus: 'draft',
        gradeLevel: lesson.gradeLevel,
        department: lesson.department,
        subject: lesson.subject,
        unit: lesson.unit,
        generationMode: lesson.generationMode,
        generationStatus: 'pending',
        metadata: {
          ...(lesson.metadata && typeof lesson.metadata === "object" ? lesson.metadata : {}),
          translationPackage: {
            sourceLessonId: lesson.id,
            sourceLanguageCode: lesson.languageCode || 'en',
            targetLanguageCode,
            chargeCorrelationId: translationCorrelationId,
            options: translationOptions,
            sourceContracts: {
              sourceDb: translationOptions.includeSourceDb ? {
                artifact: "sourceDb",
                selectedVersionId: translationOptions.selectedSourceContentVersionId || "current",
                sourceVersionHash: selectedSourceDbHash,
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              wordDocs: translationOptions.includeWordDocs ? {
                artifact: "wordDocs",
                selectedVersionId: translationOptions.selectedWordDocVersionId || "current",
                sourceVersionHash: createHash("md5")
                  .update(String(
                    selectedWordVersion
                      ? ((selectedWordVersion as any)?.metadata?.sourceDocumentPath || selectedWordVersion.id)
                      : (lesson.sourceDocumentPath || "")
                  ))
                  .digest("hex")
                  .substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              pptx: translationOptions.includePptx ? {
                artifact: "pptx",
                selectedVersionId: translationOptions.selectedPptxVersionId || "current",
                sourceVersionHash: createHash("md5")
                  .update(String(selectedPptxVersion?.storageKey || lesson.storageKey || selectedPptxVersion?.gammaCardId || lesson.gammaCardId || "pptx"))
                  .digest("hex")
                  .substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              quiz: translationOptions.includeQuiz ? {
                artifact: "quiz",
                selectedVersionId: selectedQuizIds.join(","),
                sourceVersionHash: createHash("md5").update(selectedQuizIds.join("|")).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              podcastScript: translationOptions.includePodcastScript ? {
                artifact: "podcastScript",
                selectedVersionId: selectedPodcastScript?.id || translationOptions.selectedPodcastScriptVersionId || "current",
                sourceVersionHash: createHash("md5").update(String(selectedPodcastScript?.text || selectedPodcastScript?.id || "podcast-script")).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              podcastAudio: translationOptions.includePodcastAudio ? {
                artifact: "podcastAudio",
                selectedVersionId: selectedPodcastAudio?.id || translationOptions.selectedPodcastAudioVersionId || "current",
                sourceVersionHash: createHash("md5").update(String(selectedPodcastAudio?.storageKey || selectedPodcastAudio?.scriptId || selectedPodcastAudio?.id || "podcast-audio")).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              digest: translationOptions.includeDigest ? {
                artifact: "digest",
                selectedVersionId: "current",
                sourceVersionHash: selectedSourceDbHash || createHash("md5").update(String(lesson.updatedAt || lesson.id)).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
              stepGuide: translationOptions.includeStepGuide ? {
                artifact: "stepGuide",
                selectedVersionId: "current",
                sourceVersionHash: selectedSourceDbHash || createHash("md5").update(String(lesson.updatedAt || lesson.id)).digest("hex").substring(0, 32),
                sourceTimestamp: new Date().toISOString(),
                sourceLanguageCode: lesson.languageCode || "en",
              } : null,
            },
            podcastConfig,
            assets: {
              sourceDb: translationOptions.includeSourceDb ? 'queued' : 'skipped',
              wordDocs: translationOptions.includeWordDocs ? 'queued' : 'skipped',
              quiz: translationOptions.includeQuiz ? 'queued' : 'skipped',
              podcastScript: translationOptions.includePodcastScript ? 'queued' : (translationOptions.includePodcastInNextStep ? 'deferred_optional' : 'skipped'),
              podcastAudio: translationOptions.includePodcastAudio ? 'queued' : (translationOptions.includePodcastInNextStep ? 'deferred_optional' : 'skipped'),
              pptx: translationOptions.includePptx ? 'queued' : 'skipped',
              objectives: translationOptions.includeObjectives ? 'queued' : 'skipped',
              digest: translationOptions.includeDigest ? 'queued' : 'skipped',
              stepGuide: translationOptions.includeStepGuide ? 'queued' : 'skipped',
            },
            assetMessages: {
              sourceDb: translationOptions.includeSourceDb ? null : "Not selected for this run.",
              wordDocs: translationOptions.includeWordDocs ? null : (skipReasons.wordDocs || "Not selected for this run."),
              quiz: translationOptions.includeQuiz ? null : (skipReasons.quiz || "Not selected for this run."),
              podcastScript: translationOptions.includePodcastScript
                ? null
                : (translationOptions.includePodcastInNextStep ? "Deferred to optional podcast step." : "Not selected for this run."),
              podcastAudio: translationOptions.includePodcastAudio
                ? null
                : (translationOptions.includePodcastInNextStep ? "Deferred to optional podcast step." : "Not selected for this run."),
              pptx: translationOptions.includePptx ? null : "Not selected for this run.",
              objectives: translationOptions.includeObjectives ? null : "Not selected for this run.",
              digest: translationOptions.includeDigest ? null : "Not selected for this run.",
              stepGuide: translationOptions.includeStepGuide ? null : "Not selected for this run.",
            },
            translatedArtifacts: {},
            lastUpdatedAt: new Date().toISOString(),
          },
        },
      }).returning();

      if (String((insertedTranslatedLesson as any)?.storageKey || '').trim()) {
        await LessonVersioningService.createVersion({
          lessonId: translatedLessonId,
          organizationId,
          editedBy: userId,
          changeDescription: `Translation draft created for ${targetLanguageCode}`,
          currentLesson: insertedTranslatedLesson,
        });
      } else {
        console.log(`[TranslationOrchestration] Skipping initial lesson version snapshot for ${translatedLessonId} because storageKey is not yet available.`);
      }

      const translatedQuizIds: string[] = [];

      if (translationOptions.includeQuiz) {
        for (const link of linkedQuizzes.filter((q: any) => selectedQuizIds.includes(String(q.quizId)))) {
        const [quizCollection] = await db
          .select()
          .from(quizCollections)
          .where(eq(quizCollections.id, link.quizId))
          .limit(1);

        if (!quizCollection) continue;

        const sourceCards = await db
          .select()
          .from(quizCards)
          .where(eq(quizCards.collectionId, link.quizId))
          .orderBy(asc(quizCards.displayOrder));

        const translatedQuizId = randomUUID();
        await db.insert(quizCollections).values({
          id: translatedQuizId,
          organizationId: quizCollection.organizationId,
          subjectId: quizCollection.subjectId,
          createdBy: userId,
          name: quizCollection.name,
          description: quizCollection.description,
          totalCards: sourceCards.length,
          isActive: true,
          isPublic: quizCollection.isPublic,
          difficulty: quizCollection.difficulty,
          passPercentage: quizCollection.passPercentage,
          languageCode: targetLanguageCode,
          contentGroupId: quizCollection.contentGroupId || quizCollection.id,
          isDefaultLanguage: false,
          sourceLanguageVersion: quizCollection.sourceLanguageVersion || 1,
          translationStatus: 'draft',
        });

        if (sourceCards.length > 0) {
          await db.insert(quizCards).values(
            sourceCards.map((c) => ({
              id: randomUUID(),
              collectionId: translatedQuizId,
              questionType: c.questionType,
              question: c.question,
              answer1: c.answer1,
              answer2: c.answer2,
              answer3: c.answer3,
              answer4: c.answer4,
              answer5: c.answer5,
              answer6: c.answer6,
              correctAnswerIndex: c.correctAnswerIndex,
              matchPairs: c.matchPairs,
              correctAnswer: c.correctAnswer,
              displayOrder: c.displayOrder,
            }))
          );
        }

        await db.insert(lessonQuizLinks).values({
          id: randomUUID(),
          lessonId: translatedLessonId,
          quizId: translatedQuizId,
          isPrimary: link.isPrimary,
        }).onConflictDoNothing();

          translatedQuizIds.push(translatedQuizId);
        }
      }

      const sourceCourseLinks = await db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.lessonId, lessonId));

      for (const courseLink of sourceCourseLinks) {
        const [sourceCourse] = await db
          .select()
          .from(courses)
          .where(eq(courses.id, courseLink.courseId))
          .limit(1);

        if (!sourceCourse) continue;

        const courseGroupId = sourceCourse.contentGroupId || sourceCourse.id;
        const [translatedCourse] = await db
          .select()
          .from(courses)
          .where(
            and(
              eq(courses.contentGroupId, courseGroupId),
              eq(courses.languageCode, targetLanguageCode)
            )
          )
          .limit(1);

        if (translatedCourse) {
          await db.insert(courseLessons).values({
            id: randomUUID(),
            courseId: translatedCourse.id,
            lessonId: translatedLessonId,
            topicId: courseLink.topicId,
            topicOrder: courseLink.topicOrder,
            topicName: courseLink.topicName,
            primaryQuizId: translatedQuizIds.length > 0 ? translatedQuizIds[0] : null,
            learningObjectives: courseLink.learningObjectives,
            lessonDetail: courseLink.lessonDetail,
            realWorldExample: courseLink.realWorldExample,
            lessonType: courseLink.lessonType,
          }).onConflictDoNothing();
        }
      }

	      const jobRecord = await db.insert(lessonTranslationJobs).values({
        lessonId: translatedLessonId,
        sourceLessonId: lessonId,
        organizationId,
        targetLanguageCode,
        sourceLanguageCode: lesson.languageCode || 'en',
        status: 'translating',
        currentStep: 'translating',
        creditsCharged: totalCredits,
        initiatedBy: userId,
	        updatedAt: new Date(),
	      }).returning();

        await TranslationIndexService.enqueueForLessonMutation({
          lessonId: translatedLessonId,
          organizationId,
          eventType: "translate",
          dedupeSeed: `translate:${lessonId}:${targetLanguageCode}:${jobRecord[0]?.id || ''}`,
        });
        for (const translatedQuizId of translatedQuizIds) {
          await TranslationIndexService.enqueueForQuizMutation({
            quizId: translatedQuizId,
            organizationId,
            eventType: "translate",
            dedupeSeed: `translate-quiz:${translatedQuizId}:${jobRecord[0]?.id || ''}`,
          });
        }
        await TranslationAnalyticsService.trackEvent({
          organizationId,
          userId,
          eventType: "translation_start",
          resourceType: "lesson",
          resourceId: translatedLessonId,
          languageCode: targetLanguageCode,
          variantId: translatedLessonId,
          contentGroupId: groupId,
          metadata: {
            sourceLessonId: lessonId,
            translationJobId: jobRecord[0]?.id || null,
            selectedQuizCount: translatedQuizIds.length,
            includeDigest: translationOptions.includeDigest === true,
            includeStepGuide: translationOptions.includeStepGuide === true,
          },
          dedupeSeed: `lesson-translate:${jobRecord[0]?.id || translatedLessonId}`,
        });
        console.log("[TranslationOrchestration]", JSON.stringify({
          stage: "translation_job_created",
          translationJobId: jobRecord[0]?.id || null,
          translationCorrelationId,
          sourceLessonId: lessonId,
          translatedLessonId,
          organizationId,
          userId,
          targetLanguageCode,
          selectedArtifacts: Object.entries(translationOptions)
            .filter(([key, value]) => key.startsWith("include") && value === true)
            .map(([key]) => key),
          includePodcastScript: translationOptions.includePodcastScript === true,
          includePodcastAudio: translationOptions.includePodcastAudio === true,
        }));

	      res.json({
        translatedLessonId,
        translatedQuizIds,
        creditsCharged: totalCredits,
        targetLanguageCode,
        jobId: jobRecord[0]?.id,
        status: 'translating',
        translationOptions,
        message: "Translation started. AI translation is processing in the background.",
      });

      } catch (insertError) {
        console.error("Translate lesson skeleton creation failed, refunding credits:", insertError);
        if (totalCredits > 0) {
          try {
            await HybridCreditService.refundWithFallback({
              userId,
              organizationId,
              originalCorrelationId: translationCorrelationId,
              refundCorrelationId: `${translationCorrelationId}-refund`,
              reason: `Translation setup failed, refunding ${totalCredits} credits`,
              metadata: { sourceLessonId: lessonId, targetLanguageCode, failureReason: 'skeleton_creation_failed' },
            });
          } catch (refundErr) {
            console.error("Failed to refund credits after skeleton creation failure:", refundErr);
          }
        }
        return res.status(500).json({ error: "Failed to set up translation. Credits have been refunded." });
      }

    } catch (error) {
      console.error("Translate lesson error:", error);
      res.status(500).json({ error: "Failed to translate lesson" });
    }
  });

  app.post("/api/lessons/:lessonId/retry-translation", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId: requestedOrganizationId, retryFailedOnly } = req.body;
      const orgFromLesson = String((req as any)?.lesson?.organizationId || "");
      if (!orgFromLesson) {
        return res.status(400).json({ error: "Lesson has no organization context" });
      }
      if (requestedOrganizationId && String(requestedOrganizationId) !== orgFromLesson) {
        return res.status(403).json({ error: "Organization mismatch for translation retry request" });
      }
      const organizationId = orgFromLesson;

      const [latestJob] = await db
        .select()
        .from(lessonTranslationJobs)
        .where(
          and(
            eq(lessonTranslationJobs.lessonId, lessonId),
            eq(lessonTranslationJobs.organizationId, organizationId)
          )
        )
        .orderBy(desc(lessonTranslationJobs.createdAt))
        .limit(1);

      if (!latestJob) {
        return res.status(404).json({ error: "No translation job found for this lesson" });
      }

      const [translatedLesson] = await db
        .select({ id: lessons.id, metadata: lessons.metadata })
        .from(lessons)
        .where(
          and(
            eq(lessons.id, lessonId),
            eq(lessons.organizationId, organizationId)
          )
        )
        .limit(1);

      if (!translatedLesson) {
        return res.status(404).json({ error: "Translated lesson not found" });
      }

      const metadata = translatedLesson.metadata && typeof translatedLesson.metadata === "object"
        ? { ...(translatedLesson.metadata as any) }
        : {};
      const pkg = metadata.translationPackage && typeof metadata.translationPackage === "object"
        ? { ...(metadata.translationPackage as any) }
        : {};
      const assets = pkg.assets && typeof pkg.assets === "object" ? { ...(pkg.assets as any) } : {};
      const errors = pkg.errors && typeof pkg.errors === "object" ? { ...(pkg.errors as any) } : {};
      const failedAssets = Object.entries(assets)
        .filter(([_, value]) => {
          const status = String(value || "");
          return status === "failed" || status === "cancelled";
        })
        .map(([key]) => key);

      const shouldRetryFailedOnly = retryFailedOnly === true || (latestJob.currentStep === "partial_failed" && latestJob.status === "completed");

      if (shouldRetryFailedOnly) {
        if (failedAssets.length === 0) {
          return res.status(400).json({ error: "No failed or cancelled artifacts found to retry." });
        }

        const options = pkg.options && typeof pkg.options === "object" ? { ...(pkg.options as any) } : {};
        const assetToOptionMap: Record<string, string> = {
          sourceDb: "includeSourceDb",
          wordDocs: "includeWordDocs",
          quiz: "includeQuiz",
          podcastScript: "includePodcastScript",
          podcastAudio: "includePodcastAudio",
          pptx: "includePptx",
          objectives: "includeObjectives",
          digest: "includeDigest",
          stepGuide: "includeStepGuide",
        };

        for (const [asset, optionKey] of Object.entries(assetToOptionMap)) {
          options[optionKey] = failedAssets.includes(asset);
        }

        for (const asset of failedAssets) {
          assets[asset] = "queued";
          delete errors[asset];
        }

        metadata.translationPackage = {
          ...pkg,
          options,
          assets,
          errors,
          retryMode: "failed_only",
          lastUpdatedAt: new Date().toISOString(),
        };

        await db.update(lessons)
          .set({ metadata, generationStatus: "pending", updatedAt: new Date() })
          .where(eq(lessons.id, lessonId));

	        await db.update(lessonTranslationJobs)
	          .set({
            status: 'translating',
            currentStep: 'translating',
            errorMessage: null,
            creditsCharged: 0,
            updatedAt: new Date(),
	          })
	          .where(eq(lessonTranslationJobs.id, latestJob.id));

          await TranslationIndexService.enqueueForLessonMutation({
            lessonId,
            organizationId,
            eventType: "translate",
            dedupeSeed: `retry-failed-only:${latestJob.id}`,
          });
          await TranslationAnalyticsService.trackEvent({
            organizationId,
            userId,
            eventType: "translation_retry",
            resourceType: "lesson",
            resourceId: lessonId,
            languageCode: latestJob.targetLanguageCode || null,
            variantId: lessonId,
            metadata: { retryMode: "failed_only", retriedAssets: failedAssets },
            dedupeSeed: `retry-failed-only:${latestJob.id}`,
          });

	        return res.json({
          jobId: latestJob.id,
          status: 'translating',
          creditsCharged: 0,
          retryMode: "failed_only",
          retriedAssets: failedAssets,
          message: "Retrying failed artifacts only.",
        });
      }

      const [failedJob] = await db
        .select()
        .from(lessonTranslationJobs)
        .where(
          and(
            eq(lessonTranslationJobs.lessonId, lessonId),
            eq(lessonTranslationJobs.status, 'failed'),
            eq(lessonTranslationJobs.organizationId, organizationId)
          )
        )
        .orderBy(desc(lessonTranslationJobs.createdAt))
        .limit(1);

      if (!failedJob) {
        return res.status(404).json({ error: "No failed translation job found for this lesson" });
      }

      const [pricing] = await db
        .select()
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);
      const creditsPerLesson = pricing?.creditsPerLessonTranslation ?? 10;
      const creditsPerQuiz = pricing?.creditsPerQuizTranslation ?? 5;

      const options = pkg.options && typeof pkg.options === "object" ? { ...(pkg.options as any) } : {};
      const includeLessonCore = options.includeSourceDb === true || options.includeWordDocs === true;
      const includeQuiz = options.includeQuiz === true;

      const selectedQuizIds = Array.isArray(options.selectedQuizIds)
        ? options.selectedQuizIds.map((id: any) => String(id)).filter(Boolean)
        : [];
      const quizLinks = await db
        .select()
        .from(lessonQuizLinks)
        .where(eq(lessonQuizLinks.lessonId, lessonId));
      const billableQuizCount = includeQuiz
        ? (selectedQuizIds.length > 0
          ? quizLinks.filter((q: any) => selectedQuizIds.includes(String(q.quizId))).length
          : quizLinks.length)
        : 0;

      const totalCredits = (includeLessonCore ? creditsPerLesson : 0) + (billableQuizCount * creditsPerQuiz);

      const preview = await HybridCreditService.previewDeduction({
        userId,
        organizationId,
        amount: totalCredits,
      });

      if (!preview.canDeduct) {
        return res.status(402).json({
          error: "Insufficient credits for retry",
          requiredCredits: totalCredits,
        });
      }

      const retryChargeCorrelationId = `lesson-translation-retry-${failedJob.id}`;
      await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: totalCredits,
        type: 'deduction',
        activityType: 'content_translation' as const,
        correlationId: retryChargeCorrelationId,
        description: `Translation retry to ${failedJob.targetLanguageCode}: ${totalCredits} credits`,
        metadata: { translationJobId: failedJob.id, lessonId, retry: true },
      });

      if (translatedLesson.metadata && typeof translatedLesson.metadata === "object") {
        const updatedMetadata = { ...(translatedLesson.metadata as any) };
        const pkg = updatedMetadata.translationPackage && typeof updatedMetadata.translationPackage === "object"
          ? { ...(updatedMetadata.translationPackage as any) }
          : {};
        updatedMetadata.translationPackage = {
          ...pkg,
          chargeCorrelationId: retryChargeCorrelationId,
          lastUpdatedAt: new Date().toISOString(),
        };
        await db.update(lessons)
          .set({ metadata: updatedMetadata, updatedAt: new Date() })
          .where(eq(lessons.id, lessonId));
      }

      await db.update(lessons)
        .set({ generationStatus: 'pending', updatedAt: new Date() })
        .where(eq(lessons.id, lessonId));

	      await db.update(lessonTranslationJobs)
	        .set({
          status: 'translating',
          currentStep: 'translating',
          errorMessage: null,
          creditsCharged: totalCredits,
          updatedAt: new Date(),
	        })
	        .where(eq(lessonTranslationJobs.id, failedJob.id));

        await TranslationIndexService.enqueueForLessonMutation({
          lessonId,
          organizationId,
          eventType: "translate",
          dedupeSeed: `retry-full:${failedJob.id}`,
        });
        await TranslationAnalyticsService.trackEvent({
          organizationId,
          userId,
          eventType: "translation_retry",
          resourceType: "lesson",
          resourceId: lessonId,
          languageCode: failedJob.targetLanguageCode || null,
          variantId: lessonId,
          metadata: { retryMode: "full", chargedCredits: totalCredits },
          dedupeSeed: `retry-full:${failedJob.id}`,
        });

	      res.json({
        jobId: failedJob.id,
        status: 'translating',
        creditsCharged: totalCredits,
        message: "Translation retry started. Processing in background.",
      });
    } catch (error) {
      console.error("Retry translation error:", error);
      res.status(500).json({ error: "Failed to retry translation" });
    }
  });

  app.post("/api/lessons/:lessonId/cancel-translation", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const {
        organizationId: requestedOrganizationId,
        targetLanguageCode,
        translationJobId,
      } = req.body || {};

      const orgFromLesson = String((req as any)?.lesson?.organizationId || "");
      if (!orgFromLesson) {
        return res.status(400).json({ error: "Lesson has no organization context" });
      }
      if (requestedOrganizationId && String(requestedOrganizationId) !== orgFromLesson) {
        return res.status(403).json({ error: "Organization mismatch for translation cancel request" });
      }
      const organizationId = orgFromLesson;

      const activeConditions = [
        eq(lessonTranslationJobs.sourceLessonId, lessonId),
        eq(lessonTranslationJobs.organizationId, organizationId),
        eq(lessonTranslationJobs.status, "translating"),
      ];
      if (translationJobId) {
        activeConditions.push(eq(lessonTranslationJobs.id, String(translationJobId)));
      }
      if (targetLanguageCode) {
        activeConditions.push(eq(lessonTranslationJobs.targetLanguageCode, String(targetLanguageCode)));
      }

      const [activeJob] = await db
        .select()
        .from(lessonTranslationJobs)
        .where(and(...activeConditions))
        .orderBy(desc(lessonTranslationJobs.updatedAt), desc(lessonTranslationJobs.createdAt))
        .limit(1);

      if (!activeJob) {
        return res.status(404).json({ error: "No active translation job found to cancel." });
      }

      const cancellationReason = "Cancelled by user";
      const now = new Date();

      await db.update(lessonTranslationJobs)
        .set({
          status: "failed",
          currentStep: "partial_failed",
          errorMessage: cancellationReason,
          completedAt: now,
          updatedAt: now,
        })
        .where(eq(lessonTranslationJobs.id, activeJob.id));

      const [translatedLesson] = await db
        .select({
          id: lessons.id,
          metadata: lessons.metadata,
        })
        .from(lessons)
        .where(
          and(
            eq(lessons.id, activeJob.lessonId),
            eq(lessons.organizationId, organizationId),
          )
        )
        .limit(1);

      if (translatedLesson) {
        const metadata = translatedLesson.metadata && typeof translatedLesson.metadata === "object"
          ? { ...(translatedLesson.metadata as any) }
          : {};
        const pkg = metadata.translationPackage && typeof metadata.translationPackage === "object"
          ? { ...(metadata.translationPackage as any) }
          : {};
        const assets = pkg.assets && typeof pkg.assets === "object" ? { ...(pkg.assets as any) } : {};
        const errors = pkg.errors && typeof pkg.errors === "object" ? { ...(pkg.errors as any) } : {};
        const assetMessages = pkg.assetMessages && typeof pkg.assetMessages === "object"
          ? { ...(pkg.assetMessages as any) }
          : {};

        const updatableStatuses = new Set(["queued", "pending", "processing"]);
        for (const [asset, status] of Object.entries(assets)) {
          if (!updatableStatuses.has(String(status))) continue;
          assets[asset] = "cancelled";
          const message = `${cancellationReason}. Start a new run to continue this artifact.`;
          errors[asset] = message;
          assetMessages[asset] = message;
        }

        metadata.translationPackage = {
          ...pkg,
          assets,
          errors,
          assetMessages,
          cancelledAt: now.toISOString(),
          cancelledBy: userId,
          lastUpdatedAt: now.toISOString(),
        };

        await db.update(lessons)
          .set({
            metadata,
            generationStatus: "failed",
            updatedAt: now,
          })
          .where(eq(lessons.id, translatedLesson.id));
      }

      await TranslationAnalyticsService.trackEvent({
        organizationId,
        userId,
        eventType: "translation_cancel",
        resourceType: "lesson",
        resourceId: activeJob.lessonId,
        languageCode: activeJob.targetLanguageCode || null,
        variantId: activeJob.lessonId,
        contentGroupId: activeJob.sourceLessonId || activeJob.lessonId,
        metadata: {
          sourceLessonId: activeJob.sourceLessonId,
          translationJobId: activeJob.id,
          cancellationReason,
        },
        dedupeSeed: `translation-cancel:${activeJob.id}`,
      });

      return res.json({
        cancelled: true,
        jobId: activeJob.id,
        sourceLessonId: activeJob.sourceLessonId,
        translatedLessonId: activeJob.lessonId,
        targetLanguageCode: activeJob.targetLanguageCode,
        status: "failed",
        currentStep: "partial_failed",
        errorMessage: cancellationReason,
      });
    } catch (error) {
      console.error("Cancel translation error:", error);
      res.status(500).json({ error: "Failed to cancel translation" });
    }
  });

  app.post("/api/lessons/:lessonId/create-translation-draft", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { organizationId: requestedOrganizationId, targetLanguageCode } = req.body;
      if (!targetLanguageCode) {
        return res.status(400).json({ error: "Target language code is required" });
      }

      const isSupportedLanguage = await ContentLanguageService.isLanguageSupported(targetLanguageCode);
      if (!isSupportedLanguage) {
        return res.status(400).json({ error: `Unsupported language code: ${targetLanguageCode}` });
      }

      const lesson = (req as any).lesson;
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }
      const organizationId = String(lesson.organizationId || "");
      if (!organizationId) {
        return res.status(400).json({ error: "Lesson has no organization context" });
      }
      if (requestedOrganizationId && String(requestedOrganizationId) !== organizationId) {
        return res.status(403).json({ error: "Organization mismatch for lesson translation draft request" });
      }

      const groupId = lesson.contentGroupId || lesson.id;
      const [existingTranslation] = await db
        .select()
        .from(lessons)
        .where(
          and(
            eq(lessons.contentGroupId, groupId),
            eq(lessons.languageCode, targetLanguageCode),
            eq(lessons.organizationId, organizationId)
          )
        )
        .limit(1);

      if (existingTranslation) {
        if (existingTranslation.translationStatus === 'draft') {
          return res.json({
            translatedLessonId: existingTranslation.id,
            translatedQuizIds: [],
            creditsCharged: 0,
            targetLanguageCode,
            message: "Existing draft translation found",
          });
        }
        return res.status(409).json({ error: "Translation already exists for this language." });
      }

      const translatedLessonId = randomUUID();
      const [insertedTranslatedLesson] = await db.insert(schema.lessons).values({
        id: translatedLessonId,
        title: lesson.title,
        description: lesson.description,
        inputText: lesson.inputText,
        organizationId,
        createdBy: userId,
        isPublished: false,
        languageCode: targetLanguageCode,
        contentGroupId: groupId,
        isDefaultLanguage: false,
        sourceLanguageVersion: lesson.currentSlideVersion || 1,
        translationStatus: 'draft',
        gradeLevel: lesson.gradeLevel,
        department: lesson.department,
        subject: lesson.subject,
        unit: lesson.unit,
        generationMode: lesson.generationMode,
        generationStatus: 'completed',
      }).returning();

      if (String((insertedTranslatedLesson as any)?.storageKey || '').trim()) {
        await LessonVersioningService.createVersion({
          lessonId: translatedLessonId,
          organizationId,
          editedBy: userId,
          changeDescription: `Manual translation draft created for ${targetLanguageCode}`,
          currentLesson: insertedTranslatedLesson,
        });
      } else {
        console.log(`[TranslationOrchestration] Skipping manual draft version snapshot for ${translatedLessonId} because storageKey is not yet available.`);
      }

      const linkedQuizzes = await db
        .select()
        .from(lessonQuizLinks)
        .where(eq(lessonQuizLinks.lessonId, lessonId));

      const translatedQuizIds: string[] = [];

      for (const link of linkedQuizzes) {
        const [quizCollection] = await db
          .select()
          .from(quizCollections)
          .where(eq(quizCollections.id, link.quizId))
          .limit(1);

        if (!quizCollection) continue;

        const cards = await db
          .select()
          .from(quizCards)
          .where(eq(quizCards.collectionId, link.quizId))
          .orderBy(asc(quizCards.displayOrder));

        const translatedQuizId = randomUUID();
        await db.insert(quizCollections).values({
          id: translatedQuizId,
          organizationId: quizCollection.organizationId,
          subjectId: quizCollection.subjectId,
          createdBy: userId,
          name: quizCollection.name,
          description: quizCollection.description,
          totalCards: cards.length,
          isActive: true,
          isPublic: quizCollection.isPublic,
          difficulty: quizCollection.difficulty,
          passPercentage: quizCollection.passPercentage,
          languageCode: targetLanguageCode,
          contentGroupId: quizCollection.contentGroupId || quizCollection.id,
          isDefaultLanguage: false,
          sourceLanguageVersion: quizCollection.sourceLanguageVersion || 1,
          translationStatus: 'draft',
        });

        if (cards.length > 0) {
          await db.insert(quizCards).values(
            cards.map((c) => ({
              id: randomUUID(),
              collectionId: translatedQuizId,
              questionType: c.questionType,
              question: c.question,
              answer1: c.answer1,
              answer2: c.answer2,
              answer3: c.answer3,
              answer4: c.answer4,
              answer5: c.answer5 ?? null,
              answer6: c.answer6 ?? null,
              correctAnswerIndex: c.correctAnswerIndex,
              matchPairs: c.matchPairs,
              correctAnswer: c.correctAnswer,
              displayOrder: c.displayOrder,
            }))
          );
        }

        await db.insert(lessonQuizLinks).values({
          id: randomUUID(),
          lessonId: translatedLessonId,
          quizId: translatedQuizId,
          isPrimary: link.isPrimary,
        }).onConflictDoNothing();

        translatedQuizIds.push(translatedQuizId);
      }

      await db.insert(lessonTranslationJobs).values({
        lessonId: translatedLessonId,
        sourceLessonId: lessonId,
        organizationId,
        targetLanguageCode,
        sourceLanguageCode: lesson.languageCode || 'en',
        status: 'draft',
        currentStep: 'draft_created',
        creditsCharged: 0,
        initiatedBy: userId,
      });

      const sourceCourseLinks = await db
        .select()
        .from(courseLessons)
        .where(eq(courseLessons.lessonId, lessonId));

      for (const courseLink of sourceCourseLinks) {
        const [sourceCourse] = await db
          .select()
          .from(courses)
          .where(eq(courses.id, courseLink.courseId))
          .limit(1);

        if (!sourceCourse) continue;

        const courseGroupId = sourceCourse.contentGroupId || sourceCourse.id;
        const [translatedCourse] = await db
          .select()
          .from(courses)
          .where(
            and(
              eq(courses.contentGroupId, courseGroupId),
              eq(courses.languageCode, targetLanguageCode)
            )
          )
          .limit(1);

        if (translatedCourse) {
          await db.insert(courseLessons).values({
            id: randomUUID(),
            courseId: translatedCourse.id,
            lessonId: translatedLessonId,
            topicId: courseLink.topicId,
            topicOrder: courseLink.topicOrder,
            topicName: courseLink.topicName,
            primaryQuizId: translatedQuizIds.length > 0 ? translatedQuizIds[0] : null,
            learningObjectives: courseLink.learningObjectives,
            lessonDetail: courseLink.lessonDetail,
            realWorldExample: courseLink.realWorldExample,
            lessonType: courseLink.lessonType,
          }).onConflictDoNothing();
        }
      }

      try {
        const [translatedLesson] = await db
          .select()
          .from(lessons)
          .where(eq(lessons.id, translatedLessonId))
          .limit(1);
        if (translatedLesson) {
          await LessonDigestService.regenerateDigest(translatedLesson as any, {
            languageCode: targetLanguageCode,
          });
        }
      } catch (digestErr) {
        console.warn(`[TranslationWizard] Failed to pre-generate digest for translated lesson ${translatedLessonId}:`, digestErr);
      }

	      console.log(`[Routes] User ${userId} created manual translation draft for lesson ${lessonId} -> ${translatedLessonId} (lang: ${targetLanguageCode}, 0 credits)`);

        await TranslationIndexService.enqueueForLessonMutation({
          lessonId: translatedLessonId,
          organizationId,
          eventType: "translate",
          dedupeSeed: `manual-draft:${translatedLessonId}`,
        });
        for (const translatedQuizId of translatedQuizIds) {
          await TranslationIndexService.enqueueForQuizMutation({
            quizId: translatedQuizId,
            organizationId,
            eventType: "translate",
            dedupeSeed: `manual-draft-quiz:${translatedQuizId}`,
          });
        }
        await TranslationAnalyticsService.trackEvent({
          organizationId,
          userId,
          eventType: "translation_start",
          resourceType: "lesson",
          resourceId: translatedLessonId,
          languageCode: targetLanguageCode,
          variantId: translatedLessonId,
          contentGroupId: groupId,
          metadata: { source: "manual_draft", translatedQuizCount: translatedQuizIds.length },
          dedupeSeed: `manual-draft:${translatedLessonId}`,
        });

	      res.json({
        translatedLessonId,
        translatedQuizIds,
        creditsCharged: 0,
        targetLanguageCode,
      });
    } catch (error) {
      console.error("Create translation draft error:", error);
      res.status(500).json({ error: "Failed to create translation draft" });
    }
  });

  app.post("/api/lessons/:lessonId/publish-translation", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      if (lesson.translationStatus !== 'draft') {
        return res.status(400).json({ error: "Only draft translations can be published. Current status: " + (lesson.translationStatus || 'published') });
      }

      if (!lesson.inputText || lesson.inputText.trim().length === 0) {
        return res.status(400).json({ error: "Cannot publish a translation with no content. Please add content first." });
      }

      const publishTimestamp = new Date();

      // Version snapshot is best-effort for translated lessons without a PPTX storage key.
      // We capture the pre-publish state when possible and never allow snapshot failure
      // to produce a partial publish mutation.
      if (String(lesson.storageKey || "").trim()) {
        await LessonVersioningService.createVersion({
          lessonId: lesson.id,
          organizationId: lesson.organizationId || req.body.organizationId,
          editedBy: userId,
          changeDescription: 'Published translation',
          currentLesson: lesson,
        });
      } else {
        console.warn(`[TranslationWizard] Skipping publish snapshot for lesson ${lesson.id} because storageKey is missing.`);
      }

      await db.transaction(async (tx) => {
        await tx.update(lessons)
          .set({ translationStatus: 'published', updatedAt: publishTimestamp })
          .where(eq(lessons.id, lessonId));

        const linkedQuizzes = await tx
          .select({ quizId: lessonQuizLinks.quizId })
          .from(lessonQuizLinks)
          .where(eq(lessonQuizLinks.lessonId, lessonId));

        for (const link of linkedQuizzes) {
          await tx.update(quizCollections)
            .set({ translationStatus: 'published', updatedAt: publishTimestamp })
            .where(eq(quizCollections.id, link.quizId));
        }

        await tx.update(schema.lessonTranslationJobs)
          .set({ currentStep: 'published', status: 'completed', completedAt: publishTimestamp, updatedAt: publishTimestamp })
          .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
      });

      try {
        const refreshedLesson = await LessonService.getLessonById(lessonId, lesson.organizationId || req.body.organizationId);
        if (refreshedLesson) {
          await LessonDigestService.regenerateDigest(refreshedLesson as any, {
            languageCode: refreshedLesson.languageCode || lesson.languageCode || "en",
          });
        }
      } catch (digestErr) {
        console.warn(`[TranslationWizard] Failed to regenerate lesson digest for ${lessonId}:`, digestErr);
      }

        await TranslationIndexService.enqueueForLessonMutation({
          lessonId,
          organizationId: lesson.organizationId,
          eventType: "publish",
          dedupeSeed: `publish-translation:${lessonId}:${Date.now()}`,
        });
        await TranslationAnalyticsService.trackEvent({
          organizationId: lesson.organizationId,
          userId,
          eventType: "translation_publish",
          resourceType: "lesson",
          resourceId: lessonId,
          languageCode: lesson.languageCode || "en",
          variantId: lessonId,
          contentGroupId: lesson.contentGroupId || null,
          metadata: { source: "publish_translation_route" },
          dedupeSeed: `publish-translation:${lessonId}`,
        });

	      res.json({ success: true, translationStatus: 'published' });
    } catch (error) {
      console.error("Publish translation error:", error);
      res.status(500).json({ error: "Failed to publish translation" });
    }
  });

  app.post("/api/lessons/:lessonId/unpublish-translation", requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      if (lesson.translationStatus !== 'published') {
        return res.status(400).json({ error: "Only published translations can be unpublished. Current status: " + (lesson.translationStatus || 'draft') });
      }

      if (lesson.isDefaultLanguage) {
        return res.status(400).json({ error: "Cannot unpublish the default language version" });
      }

      const unpublishTimestamp = new Date();

      await db.transaction(async (tx) => {
        await tx.update(lessons)
          .set({ translationStatus: 'draft', updatedAt: unpublishTimestamp })
          .where(eq(lessons.id, lessonId));

        const linkedQuizzes = await tx
          .select({ quizId: lessonQuizLinks.quizId })
          .from(lessonQuizLinks)
          .where(eq(lessonQuizLinks.lessonId, lessonId));

        for (const link of linkedQuizzes) {
          await tx.update(quizCollections)
            .set({ translationStatus: 'draft', updatedAt: unpublishTimestamp })
            .where(eq(quizCollections.id, link.quizId));
        }

        await tx.update(schema.lessonTranslationJobs)
          .set({ currentStep: 'content_translated', updatedAt: unpublishTimestamp })
          .where(eq(schema.lessonTranslationJobs.lessonId, lessonId));
      });

      try {
        await LessonDigestService.invalidateDigestForLesson(lessonId, {
          languageCode: lesson.languageCode || "en",
        });
      } catch (digestErr) {
        console.warn(`[TranslationWizard] Failed to invalidate lesson digest for ${lessonId}:`, digestErr);
      }

        await TranslationIndexService.enqueueForLessonMutation({
          lessonId,
          organizationId: lesson.organizationId,
          eventType: "unpublish",
          dedupeSeed: `unpublish-translation:${lessonId}:${Date.now()}`,
        });
        await TranslationAnalyticsService.trackEvent({
          organizationId: lesson.organizationId,
          userId,
          eventType: "publish_action",
          resourceType: "lesson",
          resourceId: lessonId,
          languageCode: lesson.languageCode || "en",
          variantId: lessonId,
          contentGroupId: lesson.contentGroupId || null,
          metadata: { source: "unpublish_translation_route" },
          dedupeSeed: `unpublish-translation:${lessonId}`,
        });

	      res.json({ success: true, translationStatus: 'draft' });
    } catch (error) {
      console.error("Unpublish translation error:", error);
      res.status(500).json({ error: "Failed to unpublish translation" });
    }
  });

  /**
   * POST /api/lessons/:lessonId/refresh-status
   * Manually refresh a lesson's generation status by checking the Gamma job status
   * Used when frontend polling may have missed updates
   */
  app.post("/api/lessons/:lessonId/refresh-status", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const organizationId = req.body.organizationId || req.query.organizationId;

      if (!organizationId) {
        return res.status(400).json({ error: "Organization ID required" });
      }

      // Get the lesson
      const lesson = await LessonService.getLessonById(lessonId, organizationId as string);
      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      // Only refresh if lesson is in a generating state
      const generatingStatuses = ['pending', 'processing', 'polling'];
      if (!generatingStatuses.includes(lesson.generationStatus)) {
        return res.json({
          message: "Lesson is not in a generating state",
          status: lesson.generationStatus,
          lesson
        });
      }

      // Get the most recent job for this lesson
      const jobs = await JobQueueService.getJobsForLesson(lessonId);
      const activeJob = jobs.find(j => j.status === 'pending' || j.status === 'claimed' || j.status === 'polling');

      if (!activeJob) {
        // No active job found - check if there's a completed job
        const completedJob = jobs.find(j => j.status === 'completed');
        if (completedJob) {
          // Job completed but lesson status wasn't updated - fix it
          await LessonService.updateGenerationStatus(lessonId, 'completed');
          const updatedLesson = await LessonService.getLessonById(lessonId, organizationId as string);
          return res.json({
            message: "Lesson status updated to completed (job was completed)",
            status: 'completed',
            lesson: updatedLesson
          });
        }

        // Check if there's a failed job
        const failedJob = jobs.find(j => j.status === 'failed');
        if (failedJob) {
          await LessonService.updateGenerationStatus(lessonId, 'failed', failedJob.errorMessage || 'Generation failed');
          const updatedLesson = await LessonService.getLessonById(lessonId, organizationId as string);
          return res.json({
            message: "Lesson status updated to failed",
            status: 'failed',
            lesson: updatedLesson
          });
        }

        // No jobs at all - mark as failed
        await LessonService.updateGenerationStatus(lessonId, 'failed', 'No generation job found');
        const updatedLesson = await LessonService.getLessonById(lessonId, organizationId as string);
        return res.json({
          message: "Lesson status updated to failed (no job found)",
          status: 'failed',
          lesson: updatedLesson
        });
      }

      // Active job found - check Gamma status if we have a generation ID
      if (activeJob.gammaGenerationId) {
        try {
          const { GammaService } = await import('../services/gammaService');
          const gammaService = await GammaService.getInstance();
          const gammaStatus = await gammaService.checkGenerationStatus(activeJob.gammaGenerationId);

          if (gammaStatus.status === 'completed') {
            // Gamma completed! Trigger the job polling to process it
            console.log(`[RefreshStatus] Gamma generation ${activeJob.gammaGenerationId} is completed, triggering poll`);
            
            // Don't await - let it process in background, just update lesson status
            JobQueueService.pollJob(activeJob.id).catch(err => {
              console.error(`[RefreshStatus] Background poll failed:`, err);
            });

            return res.json({
              message: "Gamma generation completed, processing download",
              status: 'processing',
              gammaStatus: gammaStatus.status,
              hasExportUrl: !!gammaStatus.exportUrl
            });
          } else if (gammaStatus.status === 'failed') {
            await JobQueueService.markJobFailed(activeJob.id, gammaStatus.errorMessage || 'Gamma generation failed');
            const updatedLesson = await LessonService.getLessonById(lessonId, organizationId as string);
            return res.json({
              message: "Generation failed",
              status: 'failed',
              error: gammaStatus.errorMessage,
              lesson: updatedLesson
            });
          } else {
            // Still processing
            return res.json({
              message: "Generation still in progress",
              status: lesson.generationStatus,
              gammaStatus: gammaStatus.status
            });
          }
        } catch (gammaError) {
          console.error(`[RefreshStatus] Error checking Gamma status:`, gammaError);
          return res.json({
            message: "Unable to check Gamma status, job is still active",
            status: lesson.generationStatus,
            jobId: activeJob.id,
            jobStatus: activeJob.status
          });
        }
      }

      // Job exists but no Gamma ID yet - still pending
      return res.json({
        message: "Generation job is waiting to start",
        status: lesson.generationStatus,
        jobId: activeJob.id,
        jobStatus: activeJob.status
      });
    } catch (error) {
      console.error("Refresh lesson status error:", error);
      res.status(500).json({ error: "Failed to refresh lesson status" });
    }
  });

  // ==================== CERTIFICATE ROUTES ====================

  app.get("/api/certificates", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;

      const result = await CertificateService.listCertificatesForUser(userId, limit, offset);

      res.json(result);
    } catch (error) {
      console.error("List certificates error:", error);
      res.status(500).json({ error: "Failed to fetch certificates" });
    }
  });

  app.get("/api/certificates/:certificateId/download", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { certificateId } = req.params;

      const certificate = await CertificateService.getCertificateById(certificateId, userId);

      if (!certificate) {
        return res.status(404).json({ error: "Certificate not found" });
      }

      const storagePath = certificate.pdfStoragePath || certificate.pdfFileUrl;
      if (!storagePath) {
        console.error(`[Certificate Download] No storage path found for certificate ${certificateId}`);
        return res.status(404).json({ error: "Certificate PDF not available" });
      }

      console.log(`[Certificate Download] Processing certificate ${certificateId}, storage path: ${storagePath}`);

      let pdfBuffer: Buffer;

      if (storagePath.startsWith('/') && !storagePath.startsWith('http')) {
        try {
          pdfBuffer = await fs.promises.readFile(storagePath);
          console.log(`[Certificate Download] Read PDF directly from filesystem: ${storagePath} (${pdfBuffer.length} bytes)`);
        } catch (fsError: any) {
          console.error(`[Certificate Download] Failed to read PDF from filesystem: ${storagePath}`, fsError);
          return res.status(404).json({ error: "Certificate PDF file not found" });
        }
      } else if (storagePath.startsWith('/api/files/')) {
        try {
          const encoded = storagePath.replace('/api/files/', '');
          const relativePath = Buffer.from(encoded, 'base64url').toString('utf-8');
          const UPLOAD_DIR = getUploadDir();
          const fullPath = path.join(UPLOAD_DIR, relativePath);
          pdfBuffer = await fs.promises.readFile(fullPath);
          console.log(`[Certificate Download] Read PDF from decoded path: ${fullPath} (${pdfBuffer.length} bytes)`);
        } catch (fsError: any) {
          console.error(`[Certificate Download] Failed to read PDF from decoded path:`, fsError);
          return res.status(404).json({ error: "Certificate PDF file not found" });
        }
      } else {
        let pdfUrl: string;
        const objectStorageService = new ObjectStorageService();
        
        if (storagePath.startsWith('http://') || storagePath.startsWith('https://')) {
          try {
            const url = new URL(storagePath);
            const pathMatch = url.pathname.match(/^\/([^/]+)(\/.+\.pdf)$/);
            if (pathMatch && pathMatch[2]) {
              const objectPath = pathMatch[2];
              console.log("[Certificate Download] Extracted object path from signed URL:", objectPath);
              pdfUrl = await objectStorageService.getCertificateSignedURL(objectPath);
            } else {
              console.warn(`[Certificate Download] Could not extract object path from URL: ${storagePath}, attempting direct use`);
              pdfUrl = storagePath;
            }
          } catch (error) {
            console.error("[Certificate Download] Failed to parse storage URL:", error);
            pdfUrl = storagePath;
          }
        } else {
          console.log("[Certificate Download] Generating signed URL for storage path:", storagePath);
          try {
            pdfUrl = await objectStorageService.getCertificateSignedURL(storagePath);
            console.log("[Certificate Download] Generated signed URL successfully");
          } catch (error: any) {
            console.error(`[Certificate Download] Failed to generate signed URL for ${storagePath}:`, error);
            return res.status(404).json({ error: "Certificate PDF file not found in storage" });
          }
        }

        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
          console.error("[Certificate Download] Failed to fetch PDF from storage. Status:", pdfResponse.status, pdfResponse.statusText);
          return res.status(404).json({ error: "Certificate PDF file not found" });
        }
        pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
      }

      const displayTitle = certificate.courseTitle || 'course';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="certificate-${displayTitle.replace(/\s+/g, '-')}.pdf"`);
      res.setHeader('Content-Length', pdfBuffer.length);

      res.send(pdfBuffer);
    } catch (error) {
      console.error("Download certificate error:", error);
      res.status(500).json({ error: "Failed to download certificate" });
    }
  });

  app.get("/api/certificates/:certificateId", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { certificateId } = req.params;

      const certificate = await CertificateService.getCertificateById(certificateId, userId);

      if (!certificate) {
        return res.status(404).json({ error: "Certificate not found" });
      }

      res.json(certificate);
    } catch (error) {
      console.error("Get certificate error:", error);
      res.status(500).json({ error: "Failed to fetch certificate" });
    }
  });

  app.post("/api/certificates/:displayCertId/share", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { displayCertId } = req.params;
      const { platforms } = req.body;

      if (!platforms || !Array.isArray(platforms)) {
        return res.status(400).json({ error: "Platforms array required (linkedin, twitter, facebook)" });
      }

      const shareResult = await CertificateService.generateSocialShare(
        displayCertId,
        userId,
        platforms
      );

      res.json(shareResult);
    } catch (error: any) {
      console.error("Generate certificate share link error:", error);
      const statusCode = error.statusCode || (error.message?.includes("access denied") ? 403 : 500);
      res.status(statusCode).json({ error: error.message || "Failed to generate share link" });
    }
  });

  app.get("/api/certificates/shared/:shareToken", async (req: Request, res: Response) => {
    try {
      const { shareToken } = req.params;

      const certificate = await CertificateService.getCertificateByShareToken(shareToken);

      if (!certificate) {
        return res.status(404).json({ error: "Certificate not found" });
      }

      res.json(certificate);
    } catch (error) {
      console.error("Get shared certificate error:", error);
      res.status(500).json({ error: "Failed to fetch certificate" });
    }
  });

  app.get("/api/verify/:certificateId", async (req: Request, res: Response) => {
    try {
      const { certificateId } = req.params;

      const certificate = await CertificateService.verifyCertificate(certificateId);

      if (!certificate) {
        return res.status(404).json({ error: "Certificate not found" });
      }

      res.json({
        valid: true,
        certificate: {
          certificateId: certificate.certificateId,
          certificateType: certificate.certificateType,
          learnerName: certificate.learnerName,
          organizationName: certificate.organizationName,
          courseTitle: certificate.courseTitle,
          completedAt: certificate.completedAt,
        },
      });
    } catch (error) {
      console.error("Verify certificate error:", error);
      res.status(500).json({ error: "Failed to verify certificate" });
    }
  });

  app.get("/api/certificates/unclaimed-courses", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const unclaimedCourses = await CourseCompletionService.getUnclaimedCertificateCourses(userId);

      res.json({ unclaimedCourses });
    } catch (error: any) {
      console.error("Get unclaimed courses error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch unclaimed courses" });
    }
  });

  app.get("/api/courses/:courseId/certificate-status", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { courseId } = req.params;

      const eligibility = await CourseCompletionService.checkCertificateEligibility(courseId, userId);

      res.json(eligibility);
    } catch (error: any) {
      console.error("Get course certificate status error:", error);
      res.status(500).json({ error: error.message || "Failed to check certificate eligibility" });
    }
  });

  // NOTE: The POST /api/courses/:courseId/certificate route is defined earlier in this file (around line 2778)
  // Do not duplicate it here - Express will only use the first definition

  app.get("/api/courses/:courseId/quiz-progress", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { courseId } = req.params;

      const progress = await CourseCompletionService.computeCourseQuizProgress(courseId, userId);

      if (!progress) {
        return res.status(404).json({ error: "Course not found" });
      }

      res.json(progress);
    } catch (error: any) {
      console.error("Get course quiz progress error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch quiz progress" });
    }
  });

  // ==================== LESSON PROGRESS ROUTES ====================

  app.get("/api/lessons/:lessonId/progress", withSessionAuthMiddleware, requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;

      const progress = await LessonProgressService.getProgress(lessonId, userId, lesson.organizationId);

      if (!progress) {
        return res.json({
          lessonId,
          userId,
          organizationId: lesson.organizationId,
          status: "not_started",
          percentComplete: 0,
          secondsSpent: 0,
          lastCheckpoint: null,
          completedAt: null,
        });
      }

      res.json(progress);
    } catch (error: any) {
      console.error("Get lesson progress error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch progress" });
    }
  });

  app.post("/api/lessons/:lessonId/progress", withSessionAuthMiddleware, requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;

      const validationResult = updateProgressSchema.safeParse(req.body);
      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        return res.status(400).json({ 
          error: firstError.message,
          field: firstError.path.join('.')
        });
      }

      const validated = validationResult.data;

      const progress = await LessonProgressService.upsertProgress({
        lessonId,
        userId,
        organizationId: lesson.organizationId,
        ...validated,
      });

      res.json(progress);
    } catch (error: any) {
      console.error("Update lesson progress error:", error);
      res.status(500).json({ error: error.message || "Failed to update progress" });
    }
  });

  app.post("/api/lessons/:lessonId/progress/slides", withSessionAuthMiddleware, requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const { slideIndex } = req.body;
      const lesson = (req as any).lesson;

      if (typeof slideIndex !== 'number' || !Number.isInteger(slideIndex) || slideIndex < 0) {
        return res.status(400).json({ error: "slideIndex must be a non-negative integer" });
      }

      const progress = await LessonProgressService.trackSlideView({
        lessonId,
        userId,
        organizationId: lesson.organizationId,
        slideIndex,
      });

      res.json(progress);
    } catch (error: any) {
      console.error("Track slide view error:", error);
      res.status(500).json({ error: error.message || "Failed to track slide view" });
    }
  });

  app.post("/api/lessons/:lessonId/complete", withSessionAuthMiddleware, requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;

      const validationResult = completeLessonSchema.safeParse(req.body);
      if (!validationResult.success) {
        const firstError = validationResult.error.errors[0];
        return res.status(400).json({ 
          error: firstError.message,
          field: firstError.path.join('.')
        });
      }

      const validated = validationResult.data;

      const result = await LessonProgressService.finalizeCompletion({
        lessonId,
        userId,
        organizationId: lesson.organizationId,
        secondsSpent: validated.secondsSpent,
      });

      res.json({
        progress: result.progress,
        certificate: result.certificate,
        isFirstCompletion: result.isFirstCompletion,
      });
    } catch (error: any) {
      console.error("Complete lesson error:", error);
      const message = String(error?.message || "Failed to complete lesson");
      if (
        /Cannot complete lesson/i.test(message) ||
        /Lesson not found/i.test(message) ||
        /quiz .*must be passed/i.test(message)
      ) {
        return res.status(400).json({ error: message });
      }
      return res.status(500).json({ error: message });
    }
  });

  // ==================== LESSON VERSION ROUTES ====================

  app.get("/api/lessons/:lessonId/versions", withSessionAuthMiddleware, requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const lesson = (req as any).lesson;

      // Fetch content versions from lessonContentVersions table (includes AI improvements)
      const contentVersions = await db.select()
        .from(lessonContentVersions)
        .where(eq(lessonContentVersions.lessonId, lessonId))
        .orderBy(desc(lessonContentVersions.createdAt));

      // Transform content versions to match expected format for LessonContentDiffModal
      const transformedVersions = contentVersions.map(v => ({
        id: v.id,
        lessonId: v.lessonId,
        versionNumber: v.versionNumber,
        title: v.newTitle || v.previousTitle || lesson.title,
        description: v.newDescription || v.previousDescription,
        changeDescription: v.changeDescription,
        source: v.source,
        createdAt: v.createdAt?.toISOString() || new Date().toISOString(),
        createdBy: v.createdBy,
        metadata: v.metadata,
        // For the modal's diff comparison - store both previous and new content
        lessonSnapshot: {
          inputText: v.previousContent,
          title: v.previousTitle,
          description: v.previousDescription,
        },
        newContent: v.newContent,
        previousContent: v.previousContent,
      }));

      const versionsAsc = [...transformedVersions].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return Number(a.versionNumber || 0) - Number(b.versionNumber || 0);
      });

      const firstHistorical = versionsAsc[0];
      const hasPersistedSourceV1 = versionsAsc.some((version: any) =>
        String(version?.metadata?.sourceVersionRole || "") === "immutable_original" ||
        String(version?.metadata?.semanticVersion || "").toUpperCase() === "V1"
      );
      const initialText = firstHistorical
        ? String(firstHistorical.previousContent || "").trim() || String(firstHistorical.newContent || "").trim() || String(lesson.inputText || "")
        : String(lesson.inputText || "");

      const initialVersion = {
        id: "initial",
        lessonId,
        versionNumber: 1,
        title: lesson.title,
        description: lesson.description,
        changeDescription: "Initial version",
        source: "initial_state",
        createdAt: firstHistorical?.createdAt || (lesson.createdAt instanceof Date ? lesson.createdAt.toISOString() : lesson.createdAt) || new Date().toISOString(),
        createdBy: lesson.createdBy,
        metadata: {
          isSyntheticInitial: true,
        },
        languageCode: lesson.languageCode || "en",
        lessonSnapshot: {
          inputText: initialText,
          title: lesson.title,
          description: lesson.description,
        },
        newContent: initialText,
        previousContent: null,
      };

      const maxVersionNumber = transformedVersions.reduce((max, v) => Math.max(max, Number(v.versionNumber || 0)), 0);
      const currentStateVersion = {
        id: "current",
        lessonId,
        versionNumber: maxVersionNumber + 1,
        title: lesson.title,
        description: lesson.description,
        changeDescription: 'Current saved state',
        source: 'current_state',
        createdAt: (lesson.updatedAt instanceof Date ? lesson.updatedAt.toISOString() : lesson.updatedAt) || new Date().toISOString(),
        createdBy: lesson.updatedBy || lesson.createdBy,
        metadata: {
          isSyntheticCurrent: true,
        },
        languageCode: lesson.languageCode || "en",
        lessonSnapshot: {
          inputText: lesson.inputText || "",
          title: lesson.title,
          description: lesson.description,
        },
        newContent: lesson.inputText || "",
        previousContent: transformedVersions[0]?.newContent || lesson.inputText || "",
      };

      // If no content versions, fall back to legacy lessonVersions table
      if (transformedVersions.length === 0) {
        const legacyVersions = await LessonVersioningService.getVersionHistoryWithDiffs(
          lessonId,
          lesson.organizationId
        );
        
        if (legacyVersions.length > 0) {
          return res.json([currentStateVersion, initialVersion, ...legacyVersions]);
        }
        
        // Synthesize a "current state" version entry so Version History is never empty
        const currentVersion = {
          id: "current",
          lessonId: lessonId,
          organizationId: lesson.organizationId,
          versionNumber: 1,
          title: lesson.title,
          description: lesson.description,
          changeDescription: 'Initial version',
          source: lesson.generationMode || 'created',
          createdAt: (lesson.createdAt instanceof Date ? lesson.createdAt.toISOString() : lesson.createdAt) || new Date().toISOString(),
          createdBy: lesson.createdBy,
          changedFields: [],
          diffSummary: null,
          languageCode: lesson.languageCode || "en",
          lessonSnapshot: {
            inputText: lesson.inputText,
            title: lesson.title,
            description: lesson.description,
          },
          newContent: null,
          previousContent: null,
        };
        
        return res.json([currentVersion, initialVersion]);
      }

      res.json(hasPersistedSourceV1
        ? [currentStateVersion, ...transformedVersions]
        : [currentStateVersion, initialVersion, ...transformedVersions]);
    } catch (error: any) {
      console.error("Get version history error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch version history" });
    }
  });

  /**
   * GET /api/lessons/:lessonId/content-versions
   * Backward-compatible alias for source-content UIs.
   */
  app.get("/api/lessons/:lessonId/content-versions", withSessionAuthMiddleware, requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const lesson = (req as any).lesson;

      const contentVersions = await db.select()
        .from(lessonContentVersions)
        .where(eq(lessonContentVersions.lessonId, lessonId))
        .orderBy(desc(lessonContentVersions.createdAt));

      const transformedVersions = contentVersions.map(v => ({
        id: v.id,
        lessonId: v.lessonId,
        versionNumber: v.versionNumber,
        title: v.newTitle || v.previousTitle || lesson.title,
        description: v.newDescription || v.previousDescription,
        changeDescription: v.changeDescription,
        source: v.source,
        createdAt: v.createdAt?.toISOString() || new Date().toISOString(),
        createdBy: v.createdBy,
        metadata: v.metadata,
        lessonSnapshot: {
          inputText: v.previousContent,
          title: v.previousTitle,
          description: v.previousDescription,
        },
        newContent: v.newContent,
        previousContent: v.previousContent,
      }));

      const versionsAsc = [...transformedVersions].sort((a, b) => {
        const aTime = new Date(a.createdAt).getTime();
        const bTime = new Date(b.createdAt).getTime();
        if (aTime !== bTime) return aTime - bTime;
        return Number(a.versionNumber || 0) - Number(b.versionNumber || 0);
      });

      const firstHistorical = versionsAsc[0];
      const hasPersistedSourceV1 = versionsAsc.some((version: any) =>
        String(version?.metadata?.sourceVersionRole || "") === "immutable_original" ||
        String(version?.metadata?.semanticVersion || "").toUpperCase() === "V1"
      );
      const initialText = firstHistorical
        ? String(firstHistorical.previousContent || "").trim() || String(firstHistorical.newContent || "").trim() || String(lesson.inputText || "")
        : String(lesson.inputText || "");

      const maxVersionNumber = transformedVersions.reduce((max, v) => Math.max(max, Number(v.versionNumber || 0)), 0);
      const currentStateVersion = {
        id: "current",
        lessonId,
        versionNumber: maxVersionNumber + 1,
        title: lesson.title,
        description: lesson.description,
        changeDescription: "Current version",
        source: "current_state",
        createdAt: (lesson.updatedAt instanceof Date ? lesson.updatedAt.toISOString() : lesson.updatedAt) || new Date().toISOString(),
        createdBy: lesson.updatedBy || lesson.createdBy,
        metadata: {
          isSyntheticCurrent: true,
        },
        languageCode: lesson.languageCode || "en",
        lessonSnapshot: {
          inputText: lesson.inputText || "",
          title: lesson.title,
          description: lesson.description,
        },
        newContent: lesson.inputText || "",
        previousContent: transformedVersions[0]?.newContent || lesson.inputText || "",
      };

      const initialVersion = {
        id: "initial",
        lessonId,
        versionNumber: 1,
        title: lesson.title,
        description: lesson.description,
        changeDescription: "Initial version",
        source: "initial_state",
        createdAt: firstHistorical?.createdAt || (lesson.createdAt instanceof Date ? lesson.createdAt.toISOString() : lesson.createdAt) || new Date().toISOString(),
        createdBy: lesson.createdBy,
        metadata: {
          isSyntheticInitial: true,
        },
        languageCode: lesson.languageCode || "en",
        lessonSnapshot: {
          inputText: initialText,
          title: lesson.title,
          description: lesson.description,
        },
        newContent: initialText,
        previousContent: null,
      };

      return res.json(hasPersistedSourceV1
        ? [currentStateVersion, ...transformedVersions]
        : [currentStateVersion, initialVersion, ...transformedVersions]);
    } catch (error: any) {
      console.error("Get content versions error:", error);
      return res.status(500).json({ error: error.message || "Failed to fetch content versions" });
    }
  });

  app.get("/api/lessons/:lessonId/versions/:versionId", withSessionAuthMiddleware, requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const { versionId } = req.params;
      const lesson = (req as any).lesson;

      const version = await LessonVersioningService.getVersion(
        versionId,
        lesson.organizationId
      );

      if (!version) {
        return res.status(404).json({ error: "Version not found" });
      }

      res.json(version);
    } catch (error: any) {
      console.error("Get version error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch version" });
    }
  });

  app.post("/api/lessons/:lessonId/versions", withSessionAuthMiddleware, requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const { changeDescription } = req.body;

      const version = await LessonVersioningService.createVersion({
        lessonId,
        organizationId: lesson.organizationId,
        editedBy: userId,
        changeDescription: changeDescription || undefined,
        currentLesson: lesson,
      });

      res.status(201).json(version);
    } catch (error: any) {
      console.error("Create version error:", error);
      res.status(500).json({ error: error.message || "Failed to create version" });
    }
  });

  app.post("/api/lessons/:lessonId/versions/:versionId/restore", withSessionAuthMiddleware, requireLessonAdminAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId, versionId } = req.params;
      const lesson = (req as any).lesson;

      const restoredLesson = await LessonVersioningService.restoreVersion({
        versionId,
        lessonId,
        organizationId: lesson.organizationId,
        restoredBy: userId,
      });

      res.json(restoredLesson);
    } catch (error: any) {
      console.error("Restore version error:", error);
      res.status(500).json({ error: error.message || "Failed to restore version" });
    }
  });

  // ==================== CONTENT HEALTH ROUTES ====================

  app.get("/api/courses/:courseId/health", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { courseId } = req.params;

      const course = await db.query.courses.findFirst({
        where: eq(schema.courses.id, courseId),
      });

      if (!course) {
        return res.status(404).json({ error: "Course not found" });
      }

      let isSuperAdminUser = false;
      if (req.session.context) {
        isSuperAdminUser = req.session.context.effectiveRole === 'SuperAdmin';
      } else {
        const user = await storage.getUser(userId);
        isSuperAdminUser = user?.isSuperAdmin || false;
      }

      if (!isSuperAdminUser) {
        const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
        const resolvedEffectiveOrgId = effectiveResult?.organizationId || null;
        const hasAccess = await canAccessOrganization(userId, course.organizationId, req.session, resolvedEffectiveOrgId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const { ContentHealthService } = await import('../services/contentHealthService');
      const health = await ContentHealthService.getCourseHealth(courseId);

      res.json(health);
    } catch (error: any) {
      console.error("Get course health error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch course health" });
    }
  });

  app.get("/api/lessons/:lessonId/health", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;

      const lesson = await db.query.lessons.findFirst({
        where: eq(schema.lessons.id, lessonId),
      });

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      let isSuperAdminUser = false;
      if (req.session.context) {
        isSuperAdminUser = req.session.context.effectiveRole === 'SuperAdmin';
      } else {
        const user = await storage.getUser(userId);
        isSuperAdminUser = user?.isSuperAdmin || false;
      }

      if (!isSuperAdminUser && lesson.organizationId) {
        const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
        const resolvedEffectiveOrgId = effectiveResult?.organizationId || null;
        const hasAccess = await canAccessOrganization(userId, lesson.organizationId, req.session, resolvedEffectiveOrgId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      const { ContentHealthService } = await import('../services/contentHealthService');
      const health = await ContentHealthService.getLessonHealth(lessonId);

      res.json(health);
    } catch (error: any) {
      console.error("Get lesson health error:", error);
      res.status(500).json({ error: error.message || "Failed to fetch lesson health" });
    }
  });

  // Fix with AI endpoint - uses source document spans to fix content with zero hallucination
  const fixWithAISchema = z.object({
    field: z.enum(['description', 'detail', 'realWorldExample', 'objectives']),
    issue: z.string().min(5, "Issue description must be at least 5 characters"),
  });

  interface Citation {
    text: string;
    offset: number;
    source: string;
  }

  app.post("/api/lessons/:lessonId/fix-with-ai", withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const parseResult = fixWithAISchema.safeParse(req.body);
      
      if (!parseResult.success) {
        return res.status(400).json({ 
          error: "Invalid request body",
          details: parseResult.error.flatten().fieldErrors 
        });
      }

      const { field, issue } = parseResult.data;

      const lesson = await db.query.lessons.findFirst({
        where: eq(schema.lessons.id, lessonId),
      });

      if (!lesson) {
        return res.status(404).json({ error: "Lesson not found" });
      }

      let isSuperAdminUser = false;
      if (req.session.context) {
        isSuperAdminUser = req.session.context.effectiveRole === 'SuperAdmin';
      } else {
        const user = await storage.getUser(userId);
        isSuperAdminUser = user?.isSuperAdmin || false;
      }

      if (!isSuperAdminUser && lesson.organizationId) {
        const effectiveResult = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
        const resolvedEffectiveOrgId = effectiveResult?.organizationId || null;
        const hasAccess = await canAccessOrganization(userId, lesson.organizationId, req.session, resolvedEffectiveOrgId);
        if (!hasAccess) {
          return res.status(403).json({ error: "Access denied" });
        }
      }

      if (!lesson.sourceMap || !lesson.sourceMap.sections || lesson.sourceMap.sections.length === 0) {
        return res.status(400).json({ 
          error: "No source document available",
          message: "This lesson was not created from a document upload, so there's no source material to use for AI-based fixes. Consider re-uploading the source document or manually editing the content."
        });
      }

      const sourceText = lesson.sourceMap.sections
        .map(section => section.textSpan)
        .join('\n\n');

      if (!sourceText || sourceText.trim().length < 50) {
        return res.status(400).json({
          error: "Insufficient source content",
          message: "The source document content is too short to generate meaningful fixes."
        });
      }

      const currentFieldValue = (lesson as any)[field] || '';

      const { AIService, buildAntiHallucinationPrompt, validateAgainstSource } = await import('../ai/aiService');
      
      const aiResult = await AIService.getActiveConfigWithError('text');
      if (!aiResult.success || !aiResult.service) {
        return res.status(503).json({ 
          error: "AI service unavailable",
          message: aiResult.error?.message || "No active AI configuration found"
        });
      }

      const antiHallucinationContext = buildAntiHallucinationPrompt(sourceText);

      const fieldInstructions: Record<string, string> = {
        description: `Write a clear, concise description of this lesson that summarizes its main content and purpose.
FORMAT FOR GAMMA SLIDES:
- Use a clear, engaging title line
- Follow with 2-3 concise bullet points summarizing key themes
- Keep sentences short and impactful for slide readability`,
        detail: `Provide an expanded explanation with more depth and context about the lesson topics.
FORMAT FOR GAMMA SLIDES:
- Start with a section heading that could serve as a slide title
- Use concise bullet points (3-5 per section) under each heading
- Include a "Key Takeaways" section at the end with the most important points
- Add a brief "Summary" section (2-3 sentences) at the very end
- Keep each bullet point to 1-2 lines maximum for slide readability`,
        realWorldExample: `Generate a practical, real-world example that illustrates how the lesson concepts apply in practice.
FORMAT FOR GAMMA SLIDES:
- Start with a clear scenario heading
- Present the example in 3-4 concise bullet points
- End with a "Key Insight" bullet summarizing what this example teaches
- Use concrete, specific details from the source document only`,
        objectives: `List 3-5 clear learning objectives that describe what students will be able to do after completing this lesson.
FORMAT FOR GAMMA SLIDES:
- Format as a numbered list
- Start each objective with an action verb (Understand, Apply, Analyze, etc.)
- Keep each objective to one clear, concise sentence
- Ensure objectives are measurable and specific`,
      };

      const prompt = `${antiHallucinationContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 CRITICAL CONSTRAINTS - ZERO HALLUCINATION 🔴
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Use ONLY information from the provided source document
- Do NOT invent or fabricate any facts, statistics, examples, or claims
- Preserve all original terminology, concepts, and factual claims
- If information is unclear, keep it as-is rather than expanding
- Structure content for presentation slides with clear headings and concise points
- Every statement MUST be directly traceable to the source text above
- When in doubt, quote directly from the source rather than paraphrasing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TASK: Fix the following content issue for the lesson "${lesson.title}".

FIELD TO FIX: ${field}
ISSUE REPORTED: ${issue}

CURRENT VALUE:
${currentFieldValue || '(empty)'}

INSTRUCTIONS:
${fieldInstructions[field]}

ADDITIONAL REQUIREMENTS:
1. Use ONLY information from the source content above - NO external knowledge
2. Every statement must be traceable to the source document
3. Do NOT add any external facts, examples, statistics, or information not present in the source
4. Preserve all key terminology and concepts from the original source exactly as written
5. If you cannot fully address the issue from the source, indicate "[Source Gap: ...]" for missing information
6. After generating content, include citations showing which source sections support each claim
7. Format output for easy conversion to presentation slides (Gamma-compatible)

OUTPUT FORMAT:
First, provide the improved content for the "${field}" field, formatted for slides with:
- Clear section headings (for slide titles)
- Concise bullet points (3-5 per section)
- A "Key Takeaways" section if applicable
- A brief "Summary" section at the end if content is substantial

Then on a new line, add "---CITATIONS---"
Then list each citation in the format:
[Citation N]: "quoted text from source" (offset: X)

Generate the improved content now:`;

      const { GoogleGenAI } = await import('@google/genai');
      const genAI = new GoogleGenAI({ apiKey: (aiResult.service as any).apiKey });
      
      const response = await genAI.models.generateContent({
        model: (aiResult.service as any).modelName || 'gemini-2.0-flash',
        contents: prompt,
      });

      const rawResponse = response.text;
      if (!rawResponse) {
        return res.status(500).json({ error: "AI generated empty response" });
      }

      let updatedContent: string;
      const citations: Citation[] = [];

      const citationSplit = rawResponse.split('---CITATIONS---');
      updatedContent = citationSplit[0].trim();
      
      if (citationSplit.length > 1) {
        const citationText = citationSplit[1].trim();
        const citationMatches = Array.from(citationText.matchAll(/\[Citation \d+\]:\s*"([^"]+)"\s*\(offset:\s*(\d+)\)/gi));
        
        for (const match of citationMatches) {
          const text = match[1];
          const offset = parseInt(match[2], 10);
          
          const sourceSection = lesson.sourceMap.sections.find(
            s => s.startOffset <= offset && s.endOffset >= offset
          );
          
          citations.push({
            text,
            offset,
            source: sourceSection?.sectionId || lesson.sourceMap.documentName || 'source document',
          });
        }
      }

      if (citations.length === 0) {
        for (const section of lesson.sourceMap.sections) {
          const words = section.textSpan.split(/\s+/).slice(0, 5).join(' ');
          if (updatedContent.toLowerCase().includes(words.toLowerCase())) {
            citations.push({
              text: section.textSpan.substring(0, 100) + (section.textSpan.length > 100 ? '...' : ''),
              offset: section.startOffset,
              source: section.sectionId,
            });
          }
        }
      }

      const validation = validateAgainstSource(updatedContent, sourceText);
      
      if (!validation.isValid && validation.confidenceScore < 0.5) {
        return res.status(422).json({
          error: "Generated content could not be validated against source",
          message: "The AI-generated content contains too much information not found in the source document. Please try with a more specific issue description.",
          confidenceScore: validation.confidenceScore,
          unsourcedClaims: validation.unsourcedClaims.slice(0, 5),
        });
      }

      const updateData: Record<string, any> = {
        [field]: updatedContent,
        updatedAt: new Date(),
      };

      try {
        await LessonVersioningService.createVersion({
          lessonId,
          organizationId: lesson.organizationId || '',
          editedBy: userId,
          changeDescription: `AI Content Coach fix: ${field} - ${issue.substring(0, 100)}`,
          currentLesson: lesson,
        });
      } catch (versionError) {
        console.warn(`[FixWithAI] Could not create version snapshot for lesson ${lessonId}:`, versionError);
      }

      await db.update(schema.lessons)
        .set(updateData)
        .where(eq(schema.lessons.id, lessonId));

      console.log(`[FixWithAI] Updated lesson ${lessonId} field "${field}" with ${updatedContent.length} chars, ${citations.length} citations, confidence: ${validation.confidenceScore}`);

      res.json({
        updatedContent,
        citations,
        validation: {
          confidenceScore: validation.confidenceScore,
          isValid: validation.isValid,
          matchedPhrases: validation.matchedPhrases,
          totalPhrases: validation.totalPhrases,
        },
        field,
        lessonId,
      });

    } catch (error: any) {
      console.error("[FixWithAI] Error:", error);
      res.status(500).json({ error: error.message || "Failed to fix content with AI" });
    }
  });

  /**
   * Public endpoint for lesson feedback pricing (health report credits)
   */
  app.get('/api/public/lesson-feedback-pricing', async (req: Request, res: Response) => {
    try {
      const pricing = await healthReportPricingService.getPlatformDefault();
      res.json({ creditCost: pricing.creditCost });
    } catch (error: any) {
      console.error('[HealthReportPricing] Error fetching public pricing:', error);
      res.status(500).json({ error: 'Failed to fetch pricing' });
    }
  });

  /**
   * Generate AI-powered feedback for a lesson with credit deduction
   * Returns cached feedback if content unchanged, otherwise generates new feedback
   */
  app.post('/api/lessons/:lessonId/feedback', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const { forceRefresh } = req.body || {};
      const userId = req.session?.user?.id || req.session?.userId;
      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;
      
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization found for user' });
      }
      
      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      const lesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });
      
      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }
      
      if (lesson.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      
      const content = lesson.inputText || lesson.description || '';
      const contentHash = createHash('md5').update(content).digest('hex').substring(0, 16);
      
      if (!forceRefresh && lesson.lastFeedbackHash === contentHash && lesson.feedbackReport) {
        console.log(`[LessonFeedback] Returning cached feedback for lesson ${lessonId}`);
        return res.json({
          cached: true,
          score10: parseFloat(lesson.contentScore10 || '0'),
          previousScore10: lesson.previousScore10 ? parseFloat(lesson.previousScore10) : null,
          improvement: null,
          report: lesson.feedbackReport,
          lastFeedbackAt: lesson.lastFeedbackAt,
        });
      }
      
      if (lesson.feedbackStatus === 'processing') {
        return res.status(409).json({
          error: 'Feedback is already being generated for this lesson',
          status: 'processing',
        });
      }
      
      const creditCost = await healthReportPricingService.getHealthReportCreditCost(organizationId);
      
      const deductionPreview = await HybridCreditService.previewDeduction({
        userId,
        organizationId,
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
      
      const correlationId = `feedback_${lessonId}_${Date.now()}`;
      const deductionResult = await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: creditCost,
        type: 'deduction',
        correlationId,
        description: `Lesson feedback report for "${lesson.title}"`,
        activityType: 'lesson_feedback',
        metadata: { lessonId, contentHash },
      });
      
      await db.update(lessons)
        .set({ feedbackStatus: 'processing', updatedAt: new Date() })
        .where(eq(lessons.id, lessonId));
      
      (async () => {
        try {
          let overviewContext: Awaited<ReturnType<typeof CourseContextService.buildCourseLessonSummaries>> = null;
          try {
            const courseId = await CourseContextService.getCourseIdForLesson(lessonId);
            if (courseId) {
              const isOverview = await CourseContextService.isOverviewLesson(lessonId, courseId);
              if (isOverview) {
                overviewContext = await CourseContextService.buildCourseLessonSummaries(courseId, lessonId);
              }
            }
          } catch (e) {}
          
          const feedback = await contentCoachService.getContentFeedback(lessonId, { 
            forceRefresh: true,
            overviewContext: overviewContext || undefined,
          });
          
          const score10 = Math.round(feedback.overallScore) / 10;
          
          await db.update(lessons)
            .set({
              contentScore10: score10.toFixed(1),
              previousScore10: lesson.contentScore10 || null,
              lastFeedbackAt: new Date(),
              lastFeedbackHash: contentHash,
              feedbackReport: feedback,
              feedbackStatus: 'completed',
              updatedAt: new Date(),
            })
            .where(eq(lessons.id, lessonId));
          
          console.log(`[LessonFeedback] Async feedback completed for lesson ${lessonId}: score ${score10}/10`);
        } catch (error: any) {
          console.error(`[LessonFeedback] Async feedback failed for lesson ${lessonId}:`, error);
          await db.update(lessons)
            .set({ feedbackStatus: 'failed', updatedAt: new Date() })
            .where(eq(lessons.id, lessonId));
        }
      })();
      
      res.json({
        async: true,
        status: 'processing',
        message: 'Feedback generation started',
        creditsCharged: creditCost,
      });
    } catch (error: any) {
      if (error.name === 'InsufficientCreditsError' || error.name === 'InsufficientHybridCreditsError') {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: error.message,
        });
      }
      console.error('[LessonFeedback] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to generate feedback' });
    }
  });

  /**
   * GET /api/lessons/:lessonId/last-feedback
   * Returns the stored feedback report without charging credits
   * Use this to retrieve cached feedback after initial generation
   */
  app.get('/api/lessons/:lessonId/last-feedback', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const userId = req.session?.user?.id || req.session?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'No organization found for user' });
      }

      const lesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });

      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      if (lesson.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!lesson.feedbackReport) {
        return res.status(404).json({ error: 'No feedback report available for this lesson' });
      }

      res.json({
        report: lesson.feedbackReport,
        generatedAt: lesson.lastFeedbackAt,
        cached: true,
        score10: lesson.contentScore10 ? parseFloat(lesson.contentScore10) : null,
      });
    } catch (error: any) {
      console.error('[LastFeedback] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to retrieve feedback' });
    }
  });

  /**
   * POST /api/lessons/:lessonId/ai-improve
   * Uses AI to improve lesson content based on feedback report (async pattern)
   * Optionally fixes abbreviations in a second AI pass
   * Charges credits for AI processing
   */
  app.post('/api/lessons/:lessonId/ai-improve', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const { feedbackReport, abbreviations } = req.body;
      const userId = req.session?.user?.id || req.session?.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!feedbackReport) {
        return res.status(400).json({ error: 'feedbackReport is required in request body' });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;

      if (!organizationId) {
        return res.status(403).json({ error: 'No organization found for user' });
      }

      const lesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });

      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      if (lesson.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if ((lesson as any).aiImproveStatus === 'processing') {
        return res.status(409).json({
          error: 'AI improvement is already in progress for this lesson',
          status: 'processing',
        });
      }

      const currentContent = lesson.inputText || lesson.description || '';
      if (!currentContent) {
        return res.status(400).json({ error: 'Lesson has no content to improve' });
      }

      const creditCost = await healthReportPricingService.getHealthReportCreditCost(organizationId);

      const correlationId = `ai-improve-${lessonId}-${Date.now()}`;
      const deductionResult = await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: creditCost,
        type: 'deduction',
        correlationId,
        description: `AI content improvement for "${lesson.title}"`,
        activityType: 'ai_content_improvement',
        metadata: { lessonId },
      });

      await db.update(lessons)
        .set({ aiImproveStatus: 'processing', updatedAt: new Date() } as any)
        .where(eq(lessons.id, lessonId));

      const hasAbbreviations = abbreviations && Array.isArray(abbreviations) && abbreviations.length > 0;

      (async () => {
        try {
          let courseContext: Awaited<ReturnType<typeof CourseContextService.buildCourseLessonSummaries>> = null;
          let isOverviewLesson = false;
          let isKeyTakeawaysLesson = false;
          let keyTakeawaysContext: Awaited<ReturnType<typeof CourseContextService.buildFullContentForKeyTakeaways>> = null;
          
          try {
            const courseId = await CourseContextService.getCourseIdForLesson(lessonId);
            if (courseId) {
              isOverviewLesson = await CourseContextService.isOverviewLesson(lessonId, courseId);
              if (isOverviewLesson) {
                courseContext = await CourseContextService.buildCourseLessonSummaries(courseId, lessonId);
                if (courseContext) {
                  console.log(`[AIImprove] Found overview lesson ${lessonId} for course ${courseId}, including ${courseContext.otherLessonsSummaries.length} other lessons for context`);
                }
              }
              
              if (!isOverviewLesson) {
                isKeyTakeawaysLesson = await CourseContextService.isKeyTakeawaysLesson(lessonId, courseId);
                if (isKeyTakeawaysLesson) {
                  keyTakeawaysContext = await CourseContextService.buildFullContentForKeyTakeaways(courseId, lessonId, 50000);
                  if (keyTakeawaysContext) {
                    console.log(`[AIImprove] Found Key Takeaways lesson ${lessonId} for course ${courseId}, including ${keyTakeawaysContext.fullLessonContents.length} lessons for zero-hallucination grounding`);
                  }
                }
              }
            }
          } catch (error) {
            console.warn(`[AIImprove] Could not load course context for lesson ${lessonId}:`, error);
          }

          const { topImprovements = [], missingBloomLevels = [], rubric = {}, targetWordCount = 500 } = feedbackReport;
          
          const lowScoreDimensions = Object.entries(rubric)
            .filter(([_, dim]: [string, any]) => dim?.score && dim.score < 60)
            .map(([key, dim]: [string, any]) => `${key}: ${dim.feedback || 'Needs improvement'}`)
            .join('\n');

          const improvementSuggestions = topImprovements
            .map((imp: any) => `- [${imp.priority}] ${imp.title}: ${imp.description}`)
            .join('\n');

          let systemPrompt: string;
          
          if (isKeyTakeawaysLesson && keyTakeawaysContext) {
            systemPrompt = `You are an expert instructional designer tasked with improving the Key Takeaways lesson for this course.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 ZERO HALLUCINATION POLICY - MANDATORY COMPLIANCE 🔴
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Use ONLY the course content provided below as your source material.
- Do NOT add any information, facts, examples, or concepts not explicitly present in the course lessons.
- Every statement in the Key Takeaways must be traceable to the provided lesson content.
- Do NOT use external knowledge, even if you know it to be accurate.
- If the course content is insufficient, indicate gaps rather than filling with assumptions.
- When possible, use exact phrasing from the lessons to maintain accuracy.

⚠️ SELF-CHECK REQUIREMENT (MANDATORY):
Before writing ANY takeaway, verify:
- "Can I point to the exact lesson where this information appears?"
- "Am I adding any facts, examples, or context not in the lessons?"
- "If I'm uncertain, am I indicating the gap rather than guessing?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
AUTHORIZED COURSE CONTENT (YOUR ONLY SOURCE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Course: ${keyTakeawaysContext.courseTitle}
${keyTakeawaysContext.courseDescription ? `Description: ${keyTakeawaysContext.courseDescription}` : ''}

${CourseContextService.formatFullContentForKeyTakeaways(keyTakeawaysContext.fullLessonContents)}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF AUTHORIZED SOURCE - DO NOT USE INFORMATION FROM OUTSIDE THIS CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your task is to improve the Key Takeaways content:
- Summarize the most important learnings from the course lessons above
- Structure takeaways clearly and concisely
- Target approximately ${targetWordCount} words
- Return ONLY the improved content text, no explanations or meta-commentary`;
          } else {
            systemPrompt = `You are an expert instructional designer tasked with improving educational content. 
Enhance the provided lesson content based on the feedback while:
- Maintaining the original topic and core message
- Improving structure, depth, and clarity
- Adding practical examples where needed
- Ensuring appropriate coverage of Bloom's taxonomy levels
- Targeting approximately ${targetWordCount} words

Return ONLY the improved content text, no explanations or meta-commentary.`;
          }

          let courseContextSection = '';
          if (isOverviewLesson && courseContext) {
            courseContextSection = `
COURSE CONTEXT (This is the overview lesson for this course):
Course: ${courseContext.courseTitle}
${courseContext.courseDescription ? `Description: ${courseContext.courseDescription}` : ''}

OTHER LESSONS IN THIS COURSE that this overview should introduce:
${CourseContextService.formatSummariesForPrompt(courseContext.otherLessonsSummaries)}

IMPORTANT: As the overview lesson, the improved content should:
- Establish the full scope of the course
- Create excitement about the learning journey
- Preview what learners will gain from each subsequent lesson
`;
          }

          let userPrompt: string;
          
          if (isKeyTakeawaysLesson && keyTakeawaysContext) {
            userPrompt = `CURRENT KEY TAKEAWAYS CONTENT TO IMPROVE:
${currentContent}

IMPROVEMENT SUGGESTIONS:
${improvementSuggestions || 'No specific suggestions'}

LOW-SCORING AREAS:
${lowScoreDimensions || 'None identified'}

MISSING BLOOM LEVELS: ${missingBloomLevels.join(', ') || 'None'}

TARGET WORD COUNT: ${targetWordCount}

Improve this Key Takeaways content using ONLY information from the course lessons provided in the system prompt. Return only the improved text.`;
          } else {
            userPrompt = `ORIGINAL CONTENT:
${currentContent}
${courseContextSection}
IMPROVEMENT SUGGESTIONS:
${improvementSuggestions || 'No specific suggestions'}

LOW-SCORING AREAS:
${lowScoreDimensions || 'None identified'}

MISSING BLOOM LEVELS: ${missingBloomLevels.join(', ') || 'None'}

TARGET WORD COUNT: ${targetWordCount}

Please improve this educational content based on the feedback above. Return only the improved text.`;
          }

          const aiResult = await AIService.getActiveConfigWithError('text');
          if (!aiResult.success || !aiResult.service) {
            throw new Error(aiResult.error?.message || 'No active AI configuration found');
          }

          const { GoogleGenAI } = await import('@google/genai');
          const genAI = new GoogleGenAI({ apiKey: (aiResult.service as any).apiKey });
          
          const response = await genAI.models.generateContent({
            model: (aiResult.service as any).modelName || 'gemini-2.0-flash',
            config: { systemInstruction: systemPrompt },
            contents: userPrompt,
          });

          let improvedContent = response.text;
          if (!improvedContent) {
            throw new Error('AI returned empty content');
          }

          let abbreviationsFixed: any[] = [];

          if (hasAbbreviations) {
            try {
              const abbreviationMap = abbreviations
                .map((a: any) => `"${a.abbreviation}" = "${a.expandedForm}"`)
                .join('\n');

              const fixPrompt = `You are an expert editor. Your task is to expand abbreviations at their FIRST occurrence in the text.

For each abbreviation below, find its FIRST occurrence in the text and replace it with the expanded form followed by the abbreviation in parentheses. All subsequent occurrences should remain as just the abbreviation.

Abbreviation mappings:
${abbreviationMap}

RULES:
- Only modify the FIRST occurrence of each abbreviation
- Use format: "Expanded Form (ABBREVIATION)" for first occurrence
- Do NOT change subsequent occurrences
- Do NOT modify any other text
- If the abbreviation is already defined (has the expanded form near it), skip it
- Preserve all formatting, line breaks, and structure
- Keep all section headers unchanged (e.g., "Lesson X - Title", "Slide 1", "Slide 2", etc.)
- Do NOT add, remove, or reorder any lines or sections
- Do NOT summarize or rephrase any content — only expand abbreviations

ORIGINAL TEXT:
${improvedContent}

Return ONLY the modified text, nothing else.`;

              const abbrResponse = await genAI.models.generateContent({
                model: (aiResult.service as any).modelName || 'gemini-2.0-flash',
                contents: fixPrompt,
              });

              const fixedContent = abbrResponse.text?.trim();
              if (fixedContent) {
                improvedContent = fixedContent;
                abbreviationsFixed = abbreviations;
                console.log(`[AIImprove] Also fixed ${abbreviations.length} abbreviation(s) for lesson ${lessonId}`);
              }
            } catch (abbrError) {
              console.error(`[AIImprove] Abbreviation fix failed for lesson ${lessonId}, using improved content without abbreviation fixes:`, abbrError);
            }
          }

          const changesSummary = {
            summary: topImprovements.length > 0 
              ? `AI improved: ${topImprovements.slice(0, 3).map((imp: any) => imp.title).join(', ')}`
              : 'Content has been improved based on feedback',
            improvements: topImprovements.slice(0, 5).map((imp: any) => imp.title || imp.description || String(imp)),
          };

          await db.update(lessons)
            .set({
              inputText: improvedContent,
              aiImproveStatus: 'completed',
              aiImproveResult: {
                changesSummary,
                originalWordCount: currentContent.split(/\s+/).length,
                improvedWordCount: improvedContent.split(/\s+/).length,
                creditsCharged: creditCost,
                abbreviationsFixed: abbreviationsFixed.length > 0 ? abbreviationsFixed : null,
              },
              updatedAt: new Date(),
            } as any)
            .where(eq(lessons.id, lessonId));

          try {
            const [maxVersion] = await db
              .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
              .from(lessonContentVersions)
              .where(eq(lessonContentVersions.lessonId, lessonId));
            
            const nextVersionNumber = (maxVersion?.max || 0) + 1;

            await db.insert(lessonContentVersions).values({
              lessonId,
              versionNumber: nextVersionNumber,
              source: 'ai_improve',
              changeDescription: abbreviationsFixed.length > 0
                ? `${changesSummary} + fixed ${abbreviationsFixed.length} abbreviation(s)`
                : changesSummary,
              previousContent: currentContent,
              newContent: improvedContent,
              previousTitle: lesson.title,
              newTitle: lesson.title,
              previousDescription: lesson.description,
              newDescription: lesson.description,
              metadata: {
                creditsCharged: creditCost,
                aiModel: (aiResult.service as any).modelName || 'gemini-2.0-flash',
                originalWordCount: currentContent.split(/\s+/).length,
                improvedWordCount: improvedContent.split(/\s+/).length,
                feedbackSummary: {
                  topImprovements: topImprovements.slice(0, 5).map((imp: any) => imp.title),
                  missingBloomLevels,
                },
                abbreviationsFixed: abbreviationsFixed.length > 0 ? abbreviationsFixed : undefined,
              },
              createdBy: userId,
            } as any);

            console.log(`[AIImprove] Saved version ${nextVersionNumber} for lesson ${lessonId}`);
          } catch (versionError) {
            console.error(`[AIImprove] Failed to save version history:`, versionError);
          }

          console.log(`[AIImprove] Async improvement completed for lesson ${lessonId}`);
        } catch (error: any) {
          console.error(`[AIImprove] Async improvement failed for lesson ${lessonId}:`, error);
          await db.update(lessons)
            .set({
              aiImproveStatus: 'failed',
              aiImproveResult: { error: error.message || 'AI improvement failed' },
              updatedAt: new Date(),
            } as any)
            .where(eq(lessons.id, lessonId));
        }
      })();

      res.json({
        async: true,
        status: 'processing',
        creditsCharged: creditCost,
      });
    } catch (error: any) {
      if (error.name === 'InsufficientCreditsError' || error.name === 'InsufficientHybridCreditsError') {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: error.message,
        });
      }
      console.error('[AIImprove] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to improve content' });
    }
  });

  /**
   * GET /api/lessons/:lessonId/ai-improve-status
   * Returns the current AI improvement status and result for a lesson
   */
  app.get('/api/lessons/:lessonId/ai-improve-status', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const lesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });

      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      res.json({
        status: (lesson as any).aiImproveStatus || null,
        result: (lesson as any).aiImproveResult || null,
      });
    } catch (error: any) {
      console.error('[AIImproveStatus] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to get AI improve status' });
    }
  });

  /**
   * POST /api/lessons/:lessonId/ai-improve-reset
   * Resets the AI improvement status to allow re-running
   */
  app.post('/api/lessons/:lessonId/ai-improve-reset', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      await db.update(lessons)
        .set({ aiImproveStatus: null, aiImproveResult: null, updatedAt: new Date() } as any)
        .where(eq(lessons.id, lessonId));
      res.json({ success: true });
    } catch (error: any) {
      console.error('[AIImproveReset] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to reset AI improve status' });
    }
  });

  /**
   * POST /api/lessons/:lessonId/fix-abbreviations
   * Uses AI to expand abbreviations at first occurrence in lesson content
   * Charges credits for AI processing
   */
  app.post('/api/lessons/:lessonId/fix-abbreviations', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const userId = req.session?.user?.id || req.session?.userId;
      if (!userId) return res.status(401).json({ error: 'Authentication required' });

      const { abbreviations } = req.body;
      if (!abbreviations || !Array.isArray(abbreviations) || abbreviations.length === 0) {
        return res.status(400).json({ error: 'No abbreviations provided' });
      }

      const effectiveOrg = await resolveEffectiveOrganization(req as RequestWithEffectiveOrg);
      const organizationId = effectiveOrg.organizationId;
      if (!organizationId) {
        return res.status(403).json({ error: 'No organization found for user' });
      }

      const lesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });

      if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
      if (lesson.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (!lesson.inputText) return res.status(400).json({ error: 'Lesson has no content to fix' });

      const [pricing] = await db
        .select({ creditsPerAiFix: platformPricing.creditsPerAiFix })
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);
      const creditCost = pricing?.creditsPerAiFix ?? 10;

      const correlationId = `ai-fix-abbr-${lessonId}-${Date.now()}`;
      await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: creditCost,
        type: 'deduction',
        correlationId,
        description: `AI abbreviation fix for "${lesson.title}"`,
        activityType: 'ai_content_improvement',
        metadata: { lessonId, abbreviationCount: abbreviations.length },
      });

      const abbreviationMap = abbreviations
        .map((a: any) => `"${a.abbreviation}" = "${a.expandedForm}"`)
        .join('\n');

      const fixPrompt = `You are an expert editor. Your task is to expand abbreviations at their FIRST occurrence in the text.

For each abbreviation below, find its FIRST occurrence in the text and replace it with the expanded form followed by the abbreviation in parentheses. All subsequent occurrences should remain as just the abbreviation.

Abbreviation mappings:
${abbreviationMap}

RULES:
- Only modify the FIRST occurrence of each abbreviation
- Use format: "Expanded Form (ABBREVIATION)" for first occurrence
- Do NOT change subsequent occurrences
- Do NOT modify any other text
- If the abbreviation is already defined (has the expanded form near it), skip it
- Preserve all formatting, line breaks, and structure
- Keep all section headers unchanged (e.g., "Lesson X - Title", "Slide 1", "Slide 2", etc.)
- Do NOT add, remove, or reorder any lines or sections
- Do NOT summarize or rephrase any content — only expand abbreviations

ORIGINAL TEXT:
${lesson.inputText}

Return ONLY the modified text, nothing else.`;

      const aiResult = await AIService.getActiveConfigWithError('text');
      if (!aiResult.success || !aiResult.service) {
        throw new Error(aiResult.error?.message || 'No active AI configuration found');
      }

      const { GoogleGenAI } = await import('@google/genai');
      const genAI = new GoogleGenAI({ apiKey: (aiResult.service as any).apiKey });

      const response = await genAI.models.generateContent({
        model: (aiResult.service as any).modelName || 'gemini-2.0-flash',
        contents: fixPrompt,
      });

      const fixedContent = response.text?.trim();
      if (!fixedContent) {
        throw new Error('AI returned empty content');
      }

      await db.update(lessons)
        .set({ inputText: fixedContent, updatedAt: new Date() })
        .where(eq(lessons.id, lessonId));

      try {
        const [maxVersion] = await db
          .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
          .from(lessonContentVersions)
          .where(eq(lessonContentVersions.lessonId, lessonId));

        const nextVersionNumber = (maxVersion?.max || 0) + 1;

        await db.insert(lessonContentVersions).values({
          lessonId,
          versionNumber: nextVersionNumber,
          source: 'ai_improve',
          changeDescription: `AI abbreviation fix: expanded ${abbreviations.length} abbreviation(s)`,
          previousContent: lesson.inputText,
          newContent: fixedContent,
          previousTitle: lesson.title,
          newTitle: lesson.title,
          previousDescription: lesson.description,
          newDescription: lesson.description,
          metadata: {
            creditsCharged: creditCost,
            aiModel: (aiResult.service as any).modelName || 'gemini-2.0-flash',
            abbreviationsFixed: abbreviations,
          },
          createdBy: userId,
        });
      } catch (versionError) {
        console.error(`[AIFixAbbr] Failed to save version history:`, versionError);
      }

      const updatedLesson = await db.query.lessons.findFirst({
        where: eq(lessons.id, lessonId),
      });

      res.json({
        success: true,
        lesson: updatedLesson,
        creditsCost: creditCost,
        abbreviationsFixed: abbreviations.length,
      });
    } catch (error: any) {
      if (error.name === 'InsufficientCreditsError' || error.name === 'InsufficientHybridCreditsError') {
        return res.status(402).json({
          error: 'Insufficient credits',
          message: error.message,
        });
      }
      console.error('[AIFixAbbr] Error:', error);
      res.status(500).json({ error: error.message || 'Failed to fix abbreviations' });
    }
  });

  /**
   * Free system recalculation of lesson content score
   * Called after content updates to track score improvement without charging credits
   */
  app.post('/api/lessons/:lessonId/recalculate-score', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { lessonId } = req.params;
      const userId = req.session.userId;

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const [lesson] = await db.select()
        .from(lessons)
        .where(eq(lessons.id, lessonId));
      
      if (!lesson) {
        return res.status(404).json({ error: 'Lesson not found' });
      }

      const effectiveOrgId = getEffectiveOrganizationId(req.session);
      if (effectiveOrgId && lesson.organizationId !== effectiveOrgId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const contentToHash = `${lesson.inputText || ''}|${lesson.description || ''}`;
      const currentHash = createHash('md5').update(contentToHash).digest('hex');

      if (lesson.lastFeedbackHash === currentHash && lesson.contentScore10 !== null) {
        return res.json({
          success: true,
          previousScore10: lesson.previousScore10 ? parseFloat(lesson.previousScore10) : null,
          newScore10: parseFloat(lesson.contentScore10),
          improvement: 0,
          cached: true,
        });
      }

      const previousScore10 = lesson.contentScore10 ? parseFloat(lesson.contentScore10) : null;

      const feedback = await contentCoachService.getContentFeedback(lessonId, { forceRefresh: true });

      const newScore10 = parseFloat((feedback.overallScore / 10).toFixed(1));

      const improvement = previousScore10 !== null ? parseFloat((newScore10 - previousScore10).toFixed(1)) : 0;

      await db.update(lessons)
        .set({
          previousScore10: lesson.contentScore10 || null,
          contentScore10: String(newScore10),
          lastFeedbackAt: new Date(),
          lastFeedbackHash: currentHash,
          feedbackReport: feedback,
        })
        .where(eq(lessons.id, lessonId));

      console.log(`[LessonFeedback] Free recalculation for lesson ${lessonId}: ${previousScore10} -> ${newScore10} (improvement: ${improvement})`);

      res.json({
        success: true,
        previousScore10,
        newScore10,
        improvement,
        cached: false,
      });
    } catch (error: any) {
      console.error('[LessonFeedback] Recalculation error:', error);
      res.status(500).json({ error: 'Failed to recalculate score' });
    }
  });

  /**
   * POST /api/lessons/:lessonId/regenerate-quiz
   * Regenerate a quiz based on the latest lesson content (after PPTX regeneration)
   */
  app.post("/api/lessons/:lessonId/regenerate-quiz", requireLessonOrgAccess, async (req: Request, res: Response) => {
    try {
      const userId = req.session.userId;
      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      const { lessonId } = req.params;
      const lesson = (req as any).lesson;
      const { difficulty = 'medium', questionsPerSlide = 2 } = req.body;
      const lessonType = await LessonService.getEffectiveCourseLessonType(lessonId);

      if (lessonType === 'overview') {
        return res.status(400).json({
          error: "Quizzes are not allowed for overview lessons",
        });
      }

      if (!lesson.currentSlideVersion || lesson.currentSlideVersion === 0) {
        return res.status(400).json({ 
          error: "Lesson has no slides to generate quiz from. Generate the presentation first." 
        });
      }

      const slides = await db
        .select()
        .from(lessonSlides)
        .where(
          and(
            eq(lessonSlides.lessonId, lessonId),
            eq(lessonSlides.version, lesson.currentSlideVersion)
          )
        )
        .orderBy(lessonSlides.slideIndex);

      if (slides.length < 2) {
        return res.status(400).json({ 
          error: "Lesson must have at least 2 slides to generate quiz questions" 
        });
      }

      const learningAssetContract: LearningAssetContract = {
        version: LEARNING_ASSET_CONTRACT_VERSION,
        slides: slides.map((s) => ({
          position: s.slideIndex + 1,
          title: s.title,
          keyPoints: s.bullets || [],
          role: s.role as 'overview' | 'slide',
        })),
        validatedAt: new Date().toISOString(),
        sourceMode: 'manual',
      };

      const aiResult = await AIService.getActiveConfigWithError('text');
      if (!aiResult.success || !aiResult.service) {
        return res.status(503).json({ 
          error: aiResult.error?.message || "No active AI configuration found for quiz generation" 
        });
      }

      const aiService = aiResult.service;
      const questions = await aiService.generateQuizFromContract({
        learningAssetContract,
        questionsPerSlide: questionsPerSlide,
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
        grade: lesson.gradeLevel,
        subject: lesson.subject,
      });

      if (!questions || questions.length === 0) {
        return res.status(500).json({ error: "Failed to generate quiz questions" });
      }

      // Validate questions are grounded in source content (logging-based, non-blocking)
      const slideText = slides.map(s => `${s.title || ''} ${(s.bullets || []).join(' ')}`).join(' ').toLowerCase();
      let groundedCount = 0;
      for (const q of questions) {
        const questionWords = q.question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 4);
        const hasGrounding = questionWords.some((word: string) => slideText.includes(word));
        if (hasGrounding) groundedCount++;
      }
      const groundingRatio = questions.length > 0 ? groundedCount / questions.length : 0;
      if (groundingRatio < 0.7) {
        console.warn(`[RegenerateQuiz] Low grounding score: ${(groundingRatio * 100).toFixed(0)}% of questions appear grounded in slide content`);
      } else {
        console.log(`[RegenerateQuiz] Grounding validation passed: ${(groundingRatio * 100).toFixed(0)}% grounded`);
      }

      const [newQuiz] = await db
        .insert(quizCollections)
        .values({
          organizationId: lesson.organizationId,
          createdBy: userId,
          name: `${lesson.title} Quiz (Regenerated)`,
          description: `Auto-generated quiz for lesson: ${lesson.title}`,
          difficulty: difficulty,
          passPercentage: 70,
          isActive: true,
        })
        .returning();

      await db.update(quizCollections).set({ contentGroupId: newQuiz.id }).where(eq(quizCollections.id, newQuiz.id));

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        // Convert 0-based AI correctIndex to 1-based DB correctAnswerIndex
        const correctAnswerIndex = (q.correctIndex ?? 0) + 1;
        await db.insert(quizCards).values({
          collectionId: newQuiz.id,
          questionType: q.questionType || 'multiple-choice',
          question: q.question,
          answer1: q.answers?.[0] || null,
          answer2: q.answers?.[1] || null,
          answer3: q.answers?.[2] || null,
          answer4: q.answers?.[3] || null,
          correctAnswerIndex: correctAnswerIndex,
          displayOrder: i + 1,
        });
      }

      await db
        .update(quizCollections)
        .set({ totalCards: questions.length })
        .where(eq(quizCollections.id, newQuiz.id));

      // Mark all existing links as outdated AND demote from primary
      await db
        .update(lessonQuizLinks)
        .set({ isOutdated: true, isPrimary: false })
        .where(eq(lessonQuizLinks.lessonId, lessonId));

      const slideContentForHash = slides
        .map(s => `${s.slideIndex}:${s.title}:${(s.bullets || []).join('|')}`)
        .join('||');
      const slideContentHash = createHash('sha256').update(slideContentForHash).digest('hex').substring(0, 16);

      await db.insert(lessonQuizLinks).values({
        lessonId: lessonId,
        quizId: newQuiz.id,
        isPrimary: true,
        presentationVersionId: lesson.currentSlideVersion,
        slideContentHash: slideContentHash,
        isOutdated: false,
      });

      console.log(`[RegenerateQuiz] Created new quiz ${newQuiz.id} for lesson ${lessonId} with ${questions.length} questions`);

      res.json({
        success: true,
        quizCollectionId: newQuiz.id,
        questionsGenerated: questions.length,
        linkedToVersion: lesson.currentSlideVersion,
      });
    } catch (error: any) {
      console.error("[RegenerateQuiz] Error:", error);
      res.status(500).json({ error: error.message || "Failed to regenerate quiz" });
    }
  });

  const hasLessonDigestSections = (lesson: any): boolean => {
    const byKey = (lesson?.metadata as any)?.lessonDigestV1?.byKey;
    if (!byKey || typeof byKey !== 'object') return false;
    return Object.values(byKey).some((entry: any) => Array.isArray(entry?.sections) && entry.sections.length > 0);
  };

  const hasTakeawaysSourceGenerated = (lesson: any): boolean => {
    const manifest = (lesson?.metadata as any)?.lastTakeawaysGenerationManifest;
    if (!manifest || typeof manifest !== 'object') return false;
    const mode = String((manifest as any)?.mode || '').trim().toLowerCase();
    return mode === 'takeaways' || mode.length === 0;
  };

  const hasLinkedObjectives = (link: any): boolean => {
    if (!Array.isArray(link?.learningObjectives)) return false;
    return link.learningObjectives.some((objective: any) => String(objective || '').trim().length > 0);
  };

  const buildWorkflowLessonStatus = (params: {
    link: any;
    lesson: any;
    lessonsWithQuizzes: Set<string>;
    minTopicOrder?: number;
    maxTopicOrder?: number;
  }) => {
    const { link, lesson, lessonsWithQuizzes } = params;
    const rawLessonType = String(link?.lessonType || '').trim().toLowerCase();
    const lessonType = rawLessonType || 'content';
    const hasInputText = !!lesson?.inputText && String(lesson.inputText).trim().length > 0;
    const hasSourceDoc = !!lesson?.sourceDocumentPath;
    const hasLessonContent = hasInputText || hasSourceDoc;
    const hasPptx = !!lesson?.storageKey || !!lesson?.gammaCardId;
    const hasVideo = !!lesson?.videoStorageKey;
    const hasPresentationAsset = hasPptx || hasVideo;
    const hasQuiz = !!lesson?.relatedQuizId || (link?.lessonId ? lessonsWithQuizzes.has(String(link.lessonId)) : false);
    const hasObjectives = hasLinkedObjectives(link);
    const hasDigest = hasLessonDigestSections(lesson);
    const sourceGenerated = lessonType === 'key_takeaways' ? hasTakeawaysSourceGenerated(lesson) : hasLessonContent;
    const requiresQuiz = lessonType === 'content' || lessonType === 'key_takeaways';

    const isCompleteContentLesson = lessonType === 'content' &&
      hasLessonContent &&
      hasObjectives &&
      hasDigest &&
      hasPresentationAsset &&
      hasQuiz;

    const isCompleteKeyTakeawaysLesson = lessonType === 'key_takeaways' &&
      sourceGenerated &&
      hasObjectives &&
      hasDigest &&
      hasPresentationAsset &&
      hasQuiz;

    const isRequiredWorkflowComplete =
      lessonType === 'content'
        ? isCompleteContentLesson
        : lessonType === 'key_takeaways'
          ? isCompleteKeyTakeawaysLesson
          : (hasLessonContent && hasDigest && hasPresentationAsset);

    return {
      lessonId: String(link?.lessonId || ''),
      title: String(lesson?.title || link?.topicName || ''),
      hasSourceDoc,
      hasInputText,
      hasLessonContent,
      hasObjectives,
      hasDigest,
      hasPptx,
      hasVideo,
      hasPresentationAsset,
      hasQuiz,
      requiresQuiz,
      sourceGenerated,
      hasFeedback: !!lesson?.lastFeedbackAt,
      isCompleteContentLesson,
      isCompleteKeyTakeawaysLesson,
      isRequiredWorkflowComplete,
      lessonType,
    };
  };

  const lessonHasCourseObjectives = async (lessonId: string): Promise<boolean> => {
    const links = await db
      .select({ learningObjectives: courseLessons.learningObjectives })
      .from(courseLessons)
      .where(eq(courseLessons.lessonId, lessonId));

    return links.some((link) =>
      Array.isArray(link.learningObjectives) &&
      link.learningObjectives.some((objective) => String(objective || '').trim().length > 0)
    );
  };

  const getKeyTakeawaysWorkflowBlockingReason = async (params: {
    lesson: any;
    lessonId: string;
    step: 'objectives' | 'digest';
  }): Promise<string | null> => {
    const lessonType = await LessonService.getEffectiveCourseLessonType(params.lessonId);
    if (lessonType !== 'key_takeaways') return null;

    const sourceGenerated = hasTakeawaysSourceGenerated(params.lesson);
    if (!sourceGenerated) {
      return 'Generate key takeaways source content first after all content lessons are complete.';
    }

    if (params.step === 'digest') {
      const hasObjectives = await lessonHasCourseObjectives(params.lessonId);
      if (!hasObjectives) {
        return 'Generate or save key takeaways learning objectives before generating lesson digest.';
      }
    }

    return null;
  };

  // ==================== GENERATION READINESS CHECK ====================

  app.get('/api/courses/:courseId/generation-readiness', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;

      const allCourseLinks = await db
        .select({
          lessonId: courseLessons.lessonId,
          topicOrder: courseLessons.topicOrder,
          topicName: courseLessons.topicName,
          lessonType: courseLessons.lessonType,
          learningObjectives: courseLessons.learningObjectives,
        })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.topicOrder));

      if (allCourseLinks.length === 0) {
        return res.json({
          takeaways: { ready: false, lessonId: null, totalContent: 0, readyCount: 0, lessons: [] },
          overview: { ready: false, lessonId: null, totalRequired: 0, readyCount: 0, lessons: [] },
        });
      }

      const minOrder = Math.min(...allCourseLinks.map(l => l.topicOrder));
      const maxOrder = Math.max(...allCourseLinks.map(l => l.topicOrder));

      const overviewLink = allCourseLinks.find(l => l.lessonType === 'overview');
      const keyTakeawaysLink = allCourseLinks.find(l => l.lessonType === 'key_takeaways');
      const contentLinks = allCourseLinks.filter(l => {
        if (!l.lessonId) return false;
        if (overviewLink && l.lessonId === overviewLink.lessonId) return false;
        if (keyTakeawaysLink && l.lessonId === keyTakeawaysLink.lessonId) return false;
        return true;
      });

      const allLessonIds = allCourseLinks.map(l => l.lessonId).filter((id): id is string => !!id);
      let lessonMap = new Map<string, any>();
      let lessonsWithQuizzes = new Set<string>();
      if (allLessonIds.length > 0) {
        const lessonRecords = await db.query.lessons.findMany({
          where: (lessons, { inArray }) => inArray(lessons.id, allLessonIds),
        });
        lessonMap = new Map(lessonRecords.map(l => [l.id, l]));

        const quizLinks = await db
          .select({ lessonId: lessonQuizLinks.lessonId })
          .from(lessonQuizLinks)
          .where(inArray(lessonQuizLinks.lessonId, allLessonIds));
        lessonsWithQuizzes = new Set(quizLinks.map(q => q.lessonId));
      }

      const getLessonStatus = (link: any) => {
        const lesson = link.lessonId ? lessonMap.get(link.lessonId) : null;
        return buildWorkflowLessonStatus({
          link,
          lesson,
          lessonsWithQuizzes,
          minTopicOrder: minOrder,
          maxTopicOrder: maxOrder,
        });
      };

      const contentStatuses = contentLinks.map(getLessonStatus);
      const contentReadyCount = contentStatuses.filter((l) => l.isCompleteContentLesson).length;
      const totalContent = contentStatuses.length;

      const keyTakeawaysStatus = keyTakeawaysLink?.lessonId ? getLessonStatus(keyTakeawaysLink) : null;
      const keyTakeawaysComplete = !!keyTakeawaysStatus?.isCompleteKeyTakeawaysLesson;
      const overviewReadyCount = contentReadyCount + (keyTakeawaysComplete ? 1 : 0);
      const totalForOverview = totalContent + (keyTakeawaysLink?.lessonId ? 1 : 0);

      res.json({
        takeaways: {
          ready: contentReadyCount === totalContent && totalContent > 0,
          lessonId: keyTakeawaysLink?.lessonId || null,
          totalContent,
          readyCount: contentReadyCount,
          sourceGenerated: !!keyTakeawaysStatus?.sourceGenerated,
          keyTakeawaysComplete,
          lessons: contentStatuses,
        },
        overview: {
          ready:
            contentReadyCount === totalContent &&
            totalContent > 0 &&
            !!keyTakeawaysLink?.lessonId &&
            keyTakeawaysComplete,
          lessonId: overviewLink?.lessonId || null,
          totalRequired: totalForOverview,
          readyCount: overviewReadyCount,
          keyTakeawaysComplete,
          lessons: keyTakeawaysStatus ? [...contentStatuses, keyTakeawaysStatus] : contentStatuses,
        },
      });
    } catch (error: any) {
      console.error('[GenerationReadiness] Error:', error);
      res.status(500).json({ error: 'Failed to check generation readiness' });
    }
  });

  // ==================== GENERATE OVERVIEW CONTENT ====================

  app.post('/api/courses/:courseId/generate-overview', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const userId = req.session.userId!;
      let organizationId = getEffectiveOrganizationId(req.session);

      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (!organizationId) {
        organizationId = course.organizationId;
      } else if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const allCourseLinks = await db
        .select({
          lessonId: courseLessons.lessonId,
          topicOrder: courseLessons.topicOrder,
          lessonType: courseLessons.lessonType,
          topicName: courseLessons.topicName,
          learningObjectives: courseLessons.learningObjectives,
        })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.topicOrder));

      const minOrder = Math.min(...allCourseLinks.map(l => l.topicOrder));
      const maxOrder = Math.max(...allCourseLinks.map(l => l.topicOrder));
      const overviewLink = allCourseLinks.find(l => l.lessonType === 'overview');
      const keyTakeawaysLink = allCourseLinks.find(l => l.lessonType === 'key_takeaways');
      if (!overviewLink?.lessonId) {
        return res.status(404).json({ error: 'Overview lesson not found in course' });
      }
      if (!keyTakeawaysLink?.lessonId) {
        return res.status(400).json({ error: 'Key takeaways lesson not found in course' });
      }

      const contentLinks = allCourseLinks.filter(l => {
        if (!l.lessonId) return false;
        if (overviewLink && l.lessonId === overviewLink.lessonId) return false;
        if (keyTakeawaysLink && l.lessonId === keyTakeawaysLink.lessonId) return false;
        return true;
      });
      const contentLessonIds = contentLinks.map(l => l.lessonId).filter((id): id is string => !!id);

      if (contentLessonIds.length === 0) {
        return res.status(400).json({ error: 'No content lessons found' });
      }

      const contentLessonRecords = await db.query.lessons.findMany({
        where: (lessons, { inArray }) => inArray(lessons.id, contentLessonIds),
      });
      const [keyTakeawaysLesson] = await db
        .select()
        .from(lessons)
        .where(eq(lessons.id, keyTakeawaysLink.lessonId))
        .limit(1);

      if (!keyTakeawaysLesson) {
        return res.status(404).json({ error: 'Key takeaways lesson record not found' });
      }
      const keyTakeawaysContent = String(keyTakeawaysLesson.inputText || '').trim();
      const keyTakeawaysHasSource = hasTakeawaysSourceGenerated(keyTakeawaysLesson);
      if (!keyTakeawaysHasSource || keyTakeawaysContent.length === 0) {
        return res.status(400).json({
          error: 'Generate key takeaways source content first before generating overview',
        });
      }

      const resolvedSourcesResult = await resolveCourseSynthesisSources({
        organizationId,
        lessonLinks: contentLinks.map((link) => ({ lessonId: String(link.lessonId), topicOrder: Number(link.topicOrder || 0) })),
        lessonRecords: contentLessonRecords.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description || null,
          inputText: lesson.inputText || null,
        })),
        userId,
      });
      if (resolvedSourcesResult.errors.length > 0) {
        return res.status(400).json({
          error: 'Insufficient or unresolved source content for overview generation',
          details: resolvedSourcesResult.errors,
        });
      }
      if (resolvedSourcesResult.sources.length !== contentLessonIds.length) {
        return res.status(400).json({
          error: 'Could not resolve all content lesson sources for overview generation',
          resolvedCount: resolvedSourcesResult.sources.length,
          requiredCount: contentLessonIds.length,
        });
      }

      const [pricing] = await db
        .select({ creditsPerOverviewGeneration: platformPricing.creditsPerOverviewGeneration })
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);
      const creditCost = pricing?.creditsPerOverviewGeneration ?? 25;

      const correlationId = `overview-gen-${courseId}-${Date.now()}`;
      await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: creditCost,
        type: 'deduction',
        correlationId,
        description: `Generate overview for course "${course.title}"`,
        activityType: 'ai_content_improvement',
        metadata: { courseId, overviewLessonId: overviewLink.lessonId },
      });

      try {
        const aiResult = await AIService.getActiveConfigWithError('text');
        if (!aiResult.success || !aiResult.service) {
          throw new Error(aiResult.error?.message || 'No active AI configuration found');
        }

        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: (aiResult.service as any).apiKey });
        const keyTakeawaysContent = String(keyTakeawaysLesson?.inputText || '').trim();
        const keyTakeawaysHasContent = keyTakeawaysContent.length > 0;
        const sourceCorpus = [
          ...resolvedSourcesResult.sources.map((source) => source.content),
          keyTakeawaysContent,
        ].join('\n\n---\n\n');
        const expectedLessonCount = resolvedSourcesResult.sources.length;

        let generatedContent = '';
        let validationManifest: any = null;
        let retryDirective: string | null = null;
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const prompt = buildCourseSynthesisPrompt({
            mode: 'overview',
            courseTitle: course.title,
            courseDescription: course.description || null,
            lessonSources: resolvedSourcesResult.sources,
            keyTakeawaysContent: {
              title: keyTakeawaysLesson?.title || 'Key Takeaways',
              description: keyTakeawaysLesson?.description || null,
              content: keyTakeawaysContent,
            },
            retryDirective,
          });

          const response = await genAI.models.generateContent({
            model: (aiResult.service as any).modelName || 'gemini-2.0-flash',
            contents: prompt,
          });

          generatedContent = String(response.text || '').trim();
          if (!generatedContent) {
            retryDirective = 'Previous output was empty. Return non-empty grounded overview text.';
            if (attempt === maxAttempts) {
              throw new Error('AI returned empty content.');
            }
            continue;
          }

          const structureValidation = validateSynthesisStructure(generatedContent, expectedLessonCount, 'overview');
          const groundingValidation = validateSynthesisGrounding(generatedContent, sourceCorpus);
          validationManifest = {
            mode: 'overview',
            attempt,
            maxAttempts,
            structure: structureValidation,
            grounding: groundingValidation,
          };

          if (structureValidation.isValid && groundingValidation.isValid) {
            break;
          }

          retryDirective = `${structureValidation.reason}. ${groundingValidation.reason}. Missing tokens: ${(groundingValidation.missingTokens || []).join(', ') || 'none'}`;
          if (attempt === maxAttempts) {
            throw new Error(
              `Overview generation failed strict grounding/structure validation. ${structureValidation.reason} ${groundingValidation.reason}`
            );
          }
        }

        const { generateSimpleDocx } = await import('../services/courseTranslationOrchestrator');
        const docxBuffer = await generateSimpleDocx(`Course Overview: ${course.title}`, generatedContent);

        const objectStorage = new ObjectStorageService();
        const sourceDocumentPath = await objectStorage.uploadSourceDocument(
          organizationId,
          overviewLink.lessonId,
          docxBuffer,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          `Course Overview - ${course.title}.docx`,
        );

        const [overviewLesson] = await db.select().from(lessons).where(eq(lessons.id, overviewLink.lessonId)).limit(1);
        const previousMetadata = (overviewLesson?.metadata && typeof overviewLesson.metadata === 'object')
          ? overviewLesson.metadata
          : {};
        const generationManifest = {
          mode: 'overview',
          generatedAt: new Date().toISOString(),
          courseId,
          lessonCount: expectedLessonCount,
          warnings: resolvedSourcesResult.warnings,
          sourceContracts: resolvedSourcesResult.sources.map((source) => source.sourceContract),
          keyTakeawaysSource: {
            lessonId: keyTakeawaysLink.lessonId,
            hasContent: keyTakeawaysHasContent,
          },
          validation: validationManifest,
        };

        await db.update(lessons)
          .set({
            inputText: generatedContent,
            sourceDocumentPath,
            metadata: {
              ...previousMetadata,
              lastOverviewGenerationManifest: generationManifest,
            },
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, overviewLink.lessonId));

        const generatedWordCount = generatedContent.split(/\s+/).length;

        try {
          const [maxVersion] = await db
            .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
            .from(lessonContentVersions)
            .where(eq(lessonContentVersions.lessonId, overviewLink.lessonId));

          const nextVersionNumber = (maxVersion?.max || 0) + 1;

          await db.insert(lessonContentVersions).values({
            lessonId: overviewLink.lessonId,
            versionNumber: nextVersionNumber,
            source: 'generate_overview',
            changeDescription: `Generated course overview (${generatedWordCount} words)`,
            previousContent: overviewLesson?.inputText,
            newContent: generatedContent,
            previousTitle: overviewLesson?.title,
            newTitle: overviewLesson?.title,
            previousDescription: overviewLesson?.description,
            newDescription: overviewLesson?.description,
            metadata: {
              sourceDocumentPath,
              generatedWordCount,
              courseId,
              aiModel: (aiResult.service as any).modelName || 'gemini-2.0-flash',
              generationManifest,
            },
            createdBy: userId,
          } as any);
        } catch (versionError) {
          console.error('[VersionTracking] Failed to record content version:', versionError);
        }

        console.log(`[GenerateOverview] Generated overview for course ${courseId} (${generatedWordCount} words)`);

        res.json({
          success: true,
          generatedWordCount,
          lessonId: overviewLink.lessonId,
        });
      } catch (genError: any) {
        console.error(`[GenerateOverview] AI generation failed, refunding ${creditCost} credits for course ${courseId}:`, genError);
        try {
          await CreditService.refundCredits(
            userId,
            organizationId,
            creditCost,
            overviewLink.lessonId,
            `Refund for failed overview generation for course "${course.title}"`,
            correlationId,
          );
          console.log(`[GenerateOverview] Successfully refunded ${creditCost} credits for user ${userId}`);
        } catch (refundError) {
          console.error(`[GenerateOverview] Credit refund failed:`, refundError);
        }
        throw genError;
      }
    } catch (error: any) {
      console.error('[GenerateOverview] Error:', error);
      if (error.message?.includes('Insufficient') || error.message?.includes('credits')) {
        return res.status(402).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || 'Failed to generate overview' });
    }
  });

  // ==================== GENERATE KEY TAKEAWAYS CONTENT ====================

  app.post('/api/courses/:courseId/generate-takeaways', withSessionAuthMiddleware, isTeacherOrAdmin, async (req: Request, res: Response) => {
    try {
      const { courseId } = req.params;
      const userId = req.session.userId!;
      let organizationId = getEffectiveOrganizationId(req.session);

      const [course] = await db
        .select()
        .from(courses)
        .where(eq(courses.id, courseId))
        .limit(1);

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (!organizationId) {
        organizationId = course.organizationId;
      } else if (course.organizationId !== organizationId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const allCourseLinks = await db
        .select({
          lessonId: courseLessons.lessonId,
          topicOrder: courseLessons.topicOrder,
          lessonType: courseLessons.lessonType,
          topicName: courseLessons.topicName,
          learningObjectives: courseLessons.learningObjectives,
        })
        .from(courseLessons)
        .where(eq(courseLessons.courseId, courseId))
        .orderBy(asc(courseLessons.topicOrder));

      const overviewLink = allCourseLinks.find(l => l.lessonType === 'overview');
      const takeawaysLink = allCourseLinks.find(l => l.lessonType === 'key_takeaways');

      if (!takeawaysLink?.lessonId) {
        return res.status(404).json({ error: 'Key takeaways lesson not found in course' });
      }

      const contentLinks = allCourseLinks.filter(l => {
        if (!l.lessonId) return false;
        if (overviewLink && l.lessonId === overviewLink.lessonId) return false;
        if (takeawaysLink && l.lessonId === takeawaysLink.lessonId) return false;
        return true;
      });

      const contentLessonIds = contentLinks.map(l => l.lessonId).filter((id): id is string => !!id);
      if (contentLessonIds.length === 0) {
        return res.status(400).json({ error: 'No content lessons found' });
      }

      const lessonRecords = await db.query.lessons.findMany({
        where: (lessons, { inArray }) => inArray(lessons.id, contentLessonIds),
      });

      const resolvedSourcesResult = await resolveCourseSynthesisSources({
        organizationId,
        lessonLinks: contentLinks.map((link) => ({ lessonId: String(link.lessonId), topicOrder: Number(link.topicOrder || 0) })),
        lessonRecords: lessonRecords.map((lesson) => ({
          id: lesson.id,
          title: lesson.title,
          description: lesson.description || null,
          inputText: lesson.inputText || null,
        })),
        userId,
      });
      if (resolvedSourcesResult.errors.length > 0) {
        return res.status(400).json({
          error: 'Insufficient or unresolved source content for key takeaways generation',
          details: resolvedSourcesResult.errors,
        });
      }
      if (resolvedSourcesResult.sources.length !== contentLessonIds.length) {
        return res.status(400).json({
          error: 'Could not resolve all content lesson sources for key takeaways generation',
          resolvedCount: resolvedSourcesResult.sources.length,
          requiredCount: contentLessonIds.length,
        });
      }

      const [pricing] = await db
        .select({ creditsPerKeyTakeawaysGeneration: platformPricing.creditsPerKeyTakeawaysGeneration })
        .from(platformPricing)
        .orderBy(desc(platformPricing.updatedAt), desc(platformPricing.createdAt))
        .limit(1);
      const creditCost = pricing?.creditsPerKeyTakeawaysGeneration ?? 25;

      const correlationId = `takeaways-gen-${courseId}-${Date.now()}`;
      await HybridCreditService.deductWithFallback({
        userId,
        organizationId,
        amount: creditCost,
        type: 'deduction',
        correlationId,
        description: `Generate key takeaways for course "${course.title}"`,
        activityType: 'ai_content_improvement',
        metadata: { courseId, takeawaysLessonId: takeawaysLink.lessonId },
      });

      try {
        const aiResult = await AIService.getActiveConfigWithError('text');
        if (!aiResult.success || !aiResult.service) {
          throw new Error(aiResult.error?.message || 'No active AI configuration found');
        }

        const { GoogleGenAI } = await import('@google/genai');
        const genAI = new GoogleGenAI({ apiKey: (aiResult.service as any).apiKey });
        const sourceCorpus = resolvedSourcesResult.sources.map((source) => source.content).join('\n\n---\n\n');
        const expectedLessonCount = resolvedSourcesResult.sources.length;

        let generatedContent = '';
        let validationManifest: any = null;
        let retryDirective: string | null = null;
        const maxAttempts = 3;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const prompt = buildCourseSynthesisPrompt({
            mode: 'takeaways',
            courseTitle: course.title,
            courseDescription: course.description || null,
            lessonSources: resolvedSourcesResult.sources,
            retryDirective,
          });

          const response = await genAI.models.generateContent({
            model: (aiResult.service as any).modelName || 'gemini-2.0-flash',
            contents: prompt,
          });

          generatedContent = String(response.text || '').trim();
          if (!generatedContent) {
            retryDirective = 'Previous output was empty. Return non-empty grounded key takeaways text.';
            if (attempt === maxAttempts) {
              throw new Error('AI returned empty content.');
            }
            continue;
          }

          const structureValidation = validateSynthesisStructure(generatedContent, expectedLessonCount, 'takeaways');
          const groundingValidation = validateSynthesisGrounding(generatedContent, sourceCorpus);
          validationManifest = {
            mode: 'takeaways',
            attempt,
            maxAttempts,
            structure: structureValidation,
            grounding: groundingValidation,
          };

          if (structureValidation.isValid && groundingValidation.isValid) {
            break;
          }

          retryDirective = `${structureValidation.reason}. ${groundingValidation.reason}. Missing tokens: ${(groundingValidation.missingTokens || []).join(', ') || 'none'}`;
          if (attempt === maxAttempts) {
            throw new Error(
              `Key takeaways generation failed strict grounding/structure validation. ${structureValidation.reason} ${groundingValidation.reason}`
            );
          }
        }

        const { generateSimpleDocx } = await import('../services/courseTranslationOrchestrator');
        const docxBuffer = await generateSimpleDocx(`Key Takeaways: ${course.title}`, generatedContent);

        const objectStorage = new ObjectStorageService();
        const sourceDocumentPath = await objectStorage.uploadSourceDocument(
          organizationId,
          takeawaysLink.lessonId,
          docxBuffer,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          `Key Takeaways - ${course.title}.docx`,
        );

        const [takeawaysLesson] = await db.select().from(lessons).where(eq(lessons.id, takeawaysLink.lessonId)).limit(1);
        const previousMetadata = (takeawaysLesson?.metadata && typeof takeawaysLesson.metadata === 'object')
          ? takeawaysLesson.metadata
          : {};
        const generationManifest = {
          mode: 'takeaways',
          generatedAt: new Date().toISOString(),
          courseId,
          lessonCount: expectedLessonCount,
          warnings: resolvedSourcesResult.warnings,
          sourceContracts: resolvedSourcesResult.sources.map((source) => source.sourceContract),
          validation: validationManifest,
        };

        await db.update(lessons)
          .set({
            inputText: generatedContent,
            sourceDocumentPath,
            generationStatus: 'completed',
            contentStatus: 'completed',
            metadata: {
              ...previousMetadata,
              lastTakeawaysGenerationManifest: generationManifest,
            },
            updatedAt: new Date(),
          })
          .where(eq(lessons.id, takeawaysLink.lessonId));

        const generatedWordCount = generatedContent.split(/\s+/).length;

        try {
          const [maxVersion] = await db
            .select({ max: sql<number>`COALESCE(MAX(${lessonContentVersions.versionNumber}), 0)` })
            .from(lessonContentVersions)
            .where(eq(lessonContentVersions.lessonId, takeawaysLink.lessonId));

          const nextVersionNumber = (maxVersion?.max || 0) + 1;

          await db.insert(lessonContentVersions).values({
            lessonId: takeawaysLink.lessonId,
            versionNumber: nextVersionNumber,
            source: 'generate_takeaways',
            changeDescription: `Generated key takeaways (${generatedWordCount} words)`,
            previousContent: takeawaysLesson?.inputText,
            newContent: generatedContent,
            previousTitle: takeawaysLesson?.title,
            newTitle: takeawaysLesson?.title,
            previousDescription: takeawaysLesson?.description,
            newDescription: takeawaysLesson?.description,
            metadata: {
              sourceDocumentPath,
              generatedWordCount,
              courseId,
              aiModel: (aiResult.service as any).modelName || 'gemini-2.0-flash',
              generationManifest,
            },
            createdBy: userId,
          } as any);
        } catch (versionError) {
          console.error('[VersionTracking] Failed to record content version:', versionError);
        }

        console.log(`[GenerateTakeaways] Generated key takeaways for course ${courseId} (${generatedWordCount} words)`);

        res.json({
          success: true,
          generatedWordCount,
          lessonId: takeawaysLink.lessonId,
        });
      } catch (genError: any) {
        console.error(`[GenerateTakeaways] AI generation failed, refunding ${creditCost} credits for course ${courseId}:`, genError);
        try {
          await CreditService.refundCredits(
            userId,
            organizationId,
            creditCost,
            takeawaysLink.lessonId,
            `Refund for failed key takeaways generation for course "${course.title}"`,
            correlationId,
          );
          console.log(`[GenerateTakeaways] Successfully refunded ${creditCost} credits for user ${userId}`);
        } catch (refundError) {
          console.error(`[GenerateTakeaways] Credit refund failed:`, refundError);
        }
        throw genError;
      }
    } catch (error: any) {
      console.error('[GenerateTakeaways] Error:', error);
      if (error.message?.includes('Insufficient') || error.message?.includes('credits')) {
        return res.status(402).json({ error: error.message });
      }
      res.status(500).json({ error: error.message || 'Failed to generate key takeaways' });
    }
  });

  // ==================== FREE COURSE ENROLLMENT ====================

  // Free course enrollment
  app.post('/api/courses/:id/purchase', withSessionAuthMiddleware, async (req: Request, res: Response) => {
    try {
      const { id: courseId } = req.params;
      const userId = req.session.userId!;

      const course = await db.query.courses.findFirst({
        where: eq(schema.courses.id, courseId),
      });

      if (!course) {
        return res.status(404).json({ error: 'Course not found' });
      }

      if (course.status !== 'active') {
        return res.status(400).json({ error: 'Course is not available' });
      }

      // Check visibility
      if (course.visibility !== 'public') {
        const { CourseVisibilityService } = await import('../services/courseVisibilityService');
        const enrollmentCheck = await CourseVisibilityService.canUserEnrollInCourse(
          courseId,
          userId,
          req.session.context || null
        );
        if (!enrollmentCheck.canEnroll) {
          return res.status(403).json({ 
            error: 'This course is only available to organization members' 
          });
        }
      }

      // Only handle free courses here; paid courses use /checkout endpoint
      if (Number(course.price || 0) > 0) {
        return res.status(400).json({ error: 'Use the checkout flow for paid courses' });
      }

      const purchase = await PurchaseService.grantAccess(userId, courseId, userId);
      console.log(`[CourseRoutes] Free course access granted: user ${userId}, course ${courseId}`);
      return res.json(purchase);
    } catch (error: any) {
      if (error.message === 'User already has access to this course') {
        return res.status(400).json({ error: error.message });
      }
      console.error('[CourseRoutes] Free course enrollment error:', error);
      return res.status(500).json({ error: 'Failed to enroll in course' });
    }
  });
}
