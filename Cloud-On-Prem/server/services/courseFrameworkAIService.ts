import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "crypto";
import { AIService, ZERO_HALLUCINATION_CONSTRAINTS, validateAgainstSource, buildAntiHallucinationPrompt } from "../ai/aiService";
import { withExponentialBackoff } from "../utils/aiRetry";
import { isFeatureEnabled } from "../featureFlags";
import {
  normalizeLessonSourceContentWithAI,
  type SourceNormalizationAsset,
} from "./courseSourceNormalizationService";
import type { 
  GeneratedLesson, 
  RecommendedLesson, 
  ExtractedSection,
  ExtractedContent,
  AdvisorHint,
  LearningObjective,
  BloomLevel,
} from "@shared/courseFrameworkContracts";

export interface StructuredLessonHeading {
  index: number;
  rawHeading: string;
  normalizedTitle: string;
  lessonNumber: number | null;
  type: 'lesson' | 'module' | 'chapter' | 'section' | 'overview' | 'takeaways';
}

export interface FrameworkGenerationOptions {
  courseDescription?: string;
  targetLessonCount?: number;
  includeRecommendations?: boolean;
  targetAudience?: 'beginner' | 'intermediate' | 'advanced';
  structuredLessonHeadings?: StructuredLessonHeading[];
  hasExplicitLessonStructure?: boolean;
  selectedTopics?: string[];
  customTopics?: string[];
}

export interface ContentWarning {
  lessonIndex: number;
  title: string;
  wordCount: number;
  deficit: number;
  minRequired: number;
  status: 'ok' | 'needs_content';
}

export interface ContentHealth {
  totalLessons: number;
  lessonsWithSufficientContent: number;
  lessonsNeedingContent: number;
  overallStatus: 'healthy' | 'warning' | 'critical';
}

export interface GeneratedFramework {
  title: string;
  description: string;
  lessons: GeneratedLesson[];
  recommendedLessons: RecommendedLesson[];
  metadata: {
    documentsProcessed: number;
    totalWordCount: number;
    generatedAt: string;
    modelUsed: string;
    contentValidation?: { valid: boolean; errors: string[] };
    contentWarnings?: ContentWarning[];
    contentHealth?: ContentHealth;
    sourceValidation?: {
      passedValidation: number;
      failedValidation: number;
      averageConfidence: number;
      hallucinationRisk: 'low' | 'medium' | 'high';
    };
    assignmentWarnings?: string[];
    contaminationRemediation?: CrossLessonRemediationReport;
  };
}

// New interface for documents with raw text
export interface ExtractedDocumentV2 {
  documentId: string;
  fileName: string;
  rawText: string;
  wordCount: number;
}

// Legacy interface for backward compatibility
export interface ExtractedDocument {
  documentId: string;
  fileName: string;
  sections: ExtractedSection[];
}

export type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
export type ContentStatus = 'ok' | 'needs_content';

const VALID_BLOOM_LEVELS: BloomsLevel[] = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

const BLOOM_LEVEL_ALIASES: Record<string, BloomsLevel> = {
  'knowledge': 'remember',
  'recall': 'remember',
  'recognition': 'remember',
  'comprehension': 'understand',
  'comprehend': 'understand',
  'interpretation': 'understand',
  'application': 'apply',
  'implementing': 'apply',
  'analysis': 'analyze',
  'analyzing': 'analyze',
  'analyse': 'analyze',
  'evaluation': 'evaluate',
  'evaluating': 'evaluate',
  'judge': 'evaluate',
  'judging': 'evaluate',
  'synthesis': 'create',
  'creating': 'create',
  'design': 'create',
  'designing': 'create',
  'compose': 'create',
  'composing': 'create',
};

export function normalizeBloomLevel(value: unknown, defaultLevel: BloomsLevel = 'understand'): BloomsLevel {
  if (typeof value !== 'string' || !value.trim()) {
    return defaultLevel;
  }
  
  const normalized = value.trim().toLowerCase();
  
  if (VALID_BLOOM_LEVELS.includes(normalized as BloomsLevel)) {
    return normalized as BloomsLevel;
  }
  
  if (normalized in BLOOM_LEVEL_ALIASES) {
    return BLOOM_LEVEL_ALIASES[normalized];
  }
  
  for (const validLevel of VALID_BLOOM_LEVELS) {
    if (normalized.includes(validLevel) || validLevel.includes(normalized)) {
      return validLevel;
    }
  }
  
  console.warn(`[CourseFrameworkAI] Invalid bloom level "${value}", defaulting to "${defaultLevel}"`);
  return defaultLevel;
}

export function normalizeContentStatus(value: unknown): ContentStatus {
  if (typeof value !== 'string') {
    return 'needs_content';
  }
  
  const normalized = value.trim().toLowerCase();
  
  if (normalized === 'ok' || normalized === 'okay' || normalized === 'good' || normalized === 'sufficient') {
    return 'ok';
  }
  
  return 'needs_content';
}

export interface AdvisorContext {
  currentStep: string;
  courseDescription?: string;
  generatedTitle?: string;
  generatedLessons?: GeneratedLesson[];
  documentCount?: number;
}

export interface FrameworkGenerationError {
  error: true;
  code: 'CONTENT_TOO_LARGE' | 'DOCUMENT_TOO_LARGE' | 'GENERATION_FAILED' | 'TOKEN_LIMIT_EXCEEDED';
  message: string;
  details: Record<string, any>;
}

interface CrossLessonContaminationIssue {
  lessonIndex: number;
  lessonTitle: string;
  conflictingLessonIndex: number;
  conflictingTitle: string;
}

interface CrossLessonRemediationReport {
  detectedBefore: number;
  detectedAfter: number;
  remediated: number;
  remaining: number;
}

export class CourseFrameworkAIService {
  private aiService: AIService | null = null;
  private modelName: string = 'gemini-2.0-flash';
  private apiKey: string = '';

  private readonly BLOOMS_LEVELS: Record<BloomsLevel, string[]> = {
    remember: ['define', 'identify', 'list', 'name', 'recall', 'recognize', 'state'],
    understand: ['describe', 'explain', 'summarize', 'interpret', 'classify', 'compare', 'paraphrase'],
    apply: ['apply', 'demonstrate', 'implement', 'solve', 'use', 'execute', 'illustrate'],
    analyze: ['analyze', 'compare', 'contrast', 'differentiate', 'examine', 'organize', 'deconstruct'],
    evaluate: ['evaluate', 'assess', 'critique', 'justify', 'recommend', 'judge', 'defend'],
    create: ['create', 'design', 'develop', 'formulate', 'construct', 'produce', 'compose'],
  };

  private readonly MAX_CONTENT_TOKENS = 900000;
  private readonly MAX_SUMMARY_TOKENS = 900000;
  private readonly MAX_TOPIC_ANALYSIS_TOKENS = 900000;
  private readonly MAX_SAFE_PROMPT_TOKENS = 950000;

  private logMemoryUsage(label: string): void {
    const usage = process.memoryUsage();
    console.log(`[CourseFrameworkAI] Memory (${label}): ` +
      `heap=${Math.round(usage.heapUsed / 1024 / 1024)}MB, ` +
      `rss=${Math.round(usage.rss / 1024 / 1024)}MB, ` +
      `external=${Math.round(usage.external / 1024 / 1024)}MB`);
  }

  private validateDocumentSizes(documents: ExtractedDocumentV2[]): FrameworkGenerationError | null {
    const totalBytes = documents.reduce((sum, doc) => sum + Buffer.byteLength(doc.rawText, 'utf8'), 0);
    const largestDocBytes = documents.reduce((max, doc) => Math.max(max, Buffer.byteLength(doc.rawText, 'utf8')), 0);
    console.log(
      `[CourseFrameworkAI] Document size audit (non-blocking): total=${Math.round(totalBytes / 1024 / 1024 * 100) / 100}MB, ` +
      `largest=${Math.round(largestDocBytes / 1024 / 1024 * 100) / 100}MB, count=${documents.length}`
    );
    return null;
  }

  private async safeCallGemini(systemPrompt: string, userContent: string, context: { step: string; documentCount?: number }): Promise<string> {
    const totalContent = systemPrompt + userContent;
    const estimatedTokens = this.estimateTokens(totalContent);
    
    console.log(`[CourseFrameworkAI] safeCallGemini step=${context.step}, estimatedTokens=${estimatedTokens}, contentLength=${totalContent.length}`);
    
    if (estimatedTokens > this.MAX_SAFE_PROMPT_TOKENS) {
      throw new Error(
        `Prompt token budget exceeded (${estimatedTokens} > ${this.MAX_SAFE_PROMPT_TOKENS}). ` +
        `Content was not truncated to avoid silent data loss.`
      );
    }
    
    return this.callGemini(systemPrompt, userContent);
  }

  private async getAIService(): Promise<AIService> {
    if (!this.aiService) {
      const result = await AIService.getActiveConfigWithError('text');
      if (!result.success || !result.service) {
        const errorMessage = result.error?.message || "No active AI configuration found. Please configure AI settings.";
        throw new Error(errorMessage);
      }
      this.aiService = result.service;
      this.modelName = (result.service as any).modelName || 'gemini-2.0-flash';
      this.apiKey = (result.service as any).apiKey;
    }
    return this.aiService;
  }

  private async callGemini(systemPrompt: string, userContent: string): Promise<string> {
    await this.getAIService();
    
    const estimatedTokens = this.estimateTokens(systemPrompt + userContent);
    
    if (estimatedTokens > this.MAX_SAFE_PROMPT_TOKENS) {
      throw new Error(
        `Prompt token budget exceeded (${estimatedTokens} > ${this.MAX_SAFE_PROMPT_TOKENS}). ` +
        `Aborting AI call to prevent truncation of source content.`
      );
    }
    
    return withExponentialBackoff(async () => {
      const genAI = new GoogleGenAI({ apiKey: this.apiKey });
      
      const response = await genAI.models.generateContent({
        model: this.modelName,
        config: {
          systemInstruction: systemPrompt,
        },
        contents: userContent,
      });

      const text = response.text;
      if (!text) {
        throw new Error("Empty response from AI model");
      }
      return text;
    }, {
      maxRetries: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
      operationName: 'CourseFrameworkAI:callGemini',
    });
  }

  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  private extractJsonFromResponse(response: string): string {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      return jsonMatch[1].trim();
    }
    
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      return arrayMatch[0];
    }
    
    const objectMatch = response.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      return objectMatch[0];
    }
    
    return response.trim();
  }

  private async summarizeIfNeeded(content: string, maxTokens: number = this.MAX_SUMMARY_TOKENS): Promise<string> {
    const estimatedTokens = this.estimateTokens(content);

    if (isFeatureEnabled('CF_V2_NO_SUMMARIZATION')) {
      if (estimatedTokens > maxTokens) {
        throw new Error(
          `Source content exceeds token budget (${estimatedTokens} > ${maxTokens}) while summarization is disabled. ` +
          `Split the uploaded documents into smaller source sets.`
        );
      }
      console.log(`[CourseFrameworkAI] Summarization disabled by feature flag; using full source content (${estimatedTokens} tokens).`);
      return content;
    }

    if (estimatedTokens <= maxTokens) {
      console.log(`[CourseFrameworkAI] Content within token limit (${estimatedTokens} <= ${maxTokens}), using full content`);
      return content;
    }

    const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;
    console.log(`[CourseFrameworkAI] Content exceeds ${maxTokens} tokens (estimated: ${estimatedTokens}, ${wordCount} words), using smart chunking...`);

    // Enhanced chunking with better overlap for context preservation
    const maxChars = maxTokens * 4;
    const CHUNK_SIZE = 16000; // 4000 tokens per chunk
    const CHUNK_OVERLAP = 2000; // 500 tokens overlap (12.5%)
    
    // If content is not too large (up to 3x limit), try direct summarization first
    if (estimatedTokens <= maxTokens * 3) {
      try {
        const systemPrompt = `You are an expert at condensing educational content while preserving VERBATIM key passages.

YOUR TASK: Create a condensed version that:
- PRESERVES exact wording, quotes, and specific phrases from the source
- Keeps ALL key learning concepts, topics, facts, and definitions VERBATIM
- Maintains important terminology using the EXACT words from the source
- Preserves the structure and organization of the content
- NEVER adds information not in the original source
- NEVER loses topic headings, section names, or structural markers

${ZERO_HALLUCINATION_CONSTRAINTS.source_only}
${ZERO_HALLUCINATION_CONSTRAINTS.verbatim_preferred}
${ZERO_HALLUCINATION_CONSTRAINTS.no_external}

CRITICAL: Preserve ALL topic names, section headers, and lesson titles exactly as they appear. Do NOT paraphrase key facts, statistics, or claims.`;

        const userPrompt = `Condense the following educational content, preserving ALL topic names and key passages VERBATIM:

${content}

Return a condensed version that retains exact wording for all topics, facts and concepts.`;

        const result = await this.callGemini(systemPrompt, userPrompt);
        const resultTokens = this.estimateTokens(result);
        console.log(`[CourseFrameworkAI] Content summarized: ${estimatedTokens} tokens -> ${resultTokens} tokens`);
        return result;
      } catch (error: any) {
        console.error(`[CourseFrameworkAI] summarizeIfNeeded failed, falling back to smart truncation:`, error.message);
      }
    }

    // For very large content, use smart truncation with context preservation
    console.log(`[CourseFrameworkAI] Using smart truncation for very large content (${estimatedTokens} tokens, ${wordCount} words)`);
    
    // Extract and preserve structural elements (headings, topic names)
    const lines = content.split('\n');
    const structuralLines: string[] = [];
    const contentLines: string[] = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      // Detect structural elements (headings, numbered items, bold text indicators)
      if (trimmed.match(/^(#{1,6}|[A-Z][A-Z\s]+:|LESSON|MODULE|CHAPTER|TOPIC|SECTION|\d+\.\s)/i) ||
          trimmed.match(/^(\*\*|__).+(\*\*|__)$/) ||
          (trimmed.length > 0 && trimmed.length < 100 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed))) {
        structuralLines.push(trimmed);
      } else if (trimmed.length > 0) {
        contentLines.push(trimmed);
      }
    }

    // Build the output: structural elements + as much content as fits
    const structuralHeader = structuralLines.length > 0 
      ? `[DOCUMENT STRUCTURE - ${structuralLines.length} sections/topics identified]\n${structuralLines.join('\n')}\n\n[CONTENT EXCERPTS]\n`
      : '';
    
    const headerTokens = this.estimateTokens(structuralHeader);
    const remainingTokens = maxTokens - headerTokens;
    const remainingChars = remainingTokens * 4;
    
    // Take content from beginning and end to preserve context
    const contentText = contentLines.join('\n');
    if (contentText.length <= remainingChars) {
      console.log(`[CourseFrameworkAI] Smart truncation preserved all content with structure header`);
      return structuralHeader + contentText;
    }
    
    // Split: 60% from start, 40% from end with overlap marker
    const startChars = Math.floor(remainingChars * 0.6);
    const endChars = Math.floor(remainingChars * 0.35);
    const startContent = contentText.substring(0, startChars);
    const endContent = contentText.substring(contentText.length - endChars);
    
    const truncatedWordsLost = Math.round((contentText.length - startChars - endChars) / 5); // Rough word estimate
    console.log(`[CourseFrameworkAI] Smart truncation: preserved ${structuralLines.length} structure elements, ~${truncatedWordsLost} words from middle section condensed`);
    
    return `${structuralHeader}${startContent}\n\n[...Content condensed: ~${truncatedWordsLost} words from middle sections...]\n\n${endContent}`;
  }

  private static readonly MIN_SOURCE_CONTENT_WORDS = 200; // Minimum words required for sourceContent (aligned with prompt)

  private stripLessonPrefix(value: string): string {
    return (value || '')
      .replace(/^lesson\s*\d+\s*[:\-–—]?\s*/i, '')
      .replace(/^module\s*\d+\s*[:\-–—]?\s*/i, '')
      .replace(/^chapter\s*\d+\s*[:\-–—]?\s*/i, '')
      .trim();
  }

  private getContentLessonIndices(lessons: GeneratedLesson[]): number[] {
    return lessons
      .map((lesson, index) => ({ lesson, index }))
      .filter(({ lesson, index }) => {
        if (!lesson) return false;
        if (lesson.lessonType) return lesson.lessonType === 'content';
        if (lesson.isOverview === true || index === 0) return false;
        const title = (lesson.title || '').toLowerCase();
        return !title.includes('key takeaway');
      })
      .map(({ index }) => index);
  }

  private detectCrossLessonContamination(lessons: GeneratedLesson[]): CrossLessonContaminationIssue[] {
    const issues: CrossLessonContaminationIssue[] = [];
    const contentIndices = this.getContentLessonIndices(lessons);

    for (const lessonIndex of contentIndices) {
      const lesson = lessons[lessonIndex];
      const contentNormalized = this.normalizeForMatching(lesson.sourceContent || '');
      if (!contentNormalized) continue;

      for (const otherIndex of contentIndices) {
        if (otherIndex === lessonIndex) continue;
        const otherTitleRaw = (lessons[otherIndex].title || '').trim();
        if (!otherTitleRaw) continue;

        const otherTitleNormalized = this.normalizeForMatching(otherTitleRaw);
        const otherCore = this.normalizeForMatching(this.stripLessonPrefix(otherTitleRaw));
        const titlePhraseHit = otherTitleNormalized.length >= 20 && contentNormalized.includes(otherTitleNormalized);
        const corePhraseHit = otherCore.length >= 16 && contentNormalized.includes(otherCore);

        if (titlePhraseHit || corePhraseHit) {
          issues.push({
            lessonIndex,
            lessonTitle: lesson.title || `Lesson ${lessonIndex + 1}`,
            conflictingLessonIndex: otherIndex,
            conflictingTitle: lessons[otherIndex].title || `Lesson ${otherIndex + 1}`,
          });
        }
      }
    }

    const dedup = new Map<string, CrossLessonContaminationIssue>();
    for (const issue of issues) {
      const key = `${issue.lessonIndex}:${issue.conflictingLessonIndex}`;
      if (!dedup.has(key)) dedup.set(key, issue);
    }
    return Array.from(dedup.values());
  }

  private annotateLessonProvenance(
    lesson: GeneratedLesson,
    patch: Record<string, any>
  ): GeneratedLesson {
    const currentMetadata = ((lesson as any).metadata || {}) as Record<string, any>;
    const currentProvenance = (currentMetadata.sourceProvenance || {}) as Record<string, any>;
    return {
      ...lesson,
      metadata: {
        ...currentMetadata,
        sourceProvenance: {
          ...currentProvenance,
          ...patch,
          updatedAt: new Date().toISOString(),
        },
      },
    } as GeneratedLesson;
  }

  private remediateCrossLessonContamination(
    lessons: GeneratedLesson[],
    fullDocumentContent: string
  ): { lessons: GeneratedLesson[]; report: CrossLessonRemediationReport } {
    const beforeIssues = this.detectCrossLessonContamination(lessons);
    if (beforeIssues.length === 0) {
      return {
        lessons,
        report: { detectedBefore: 0, detectedAfter: 0, remediated: 0, remaining: 0 },
      };
    }

    const contentIndices = this.getContentLessonIndices(lessons);
    const remapped = [...lessons];
    const matchResult = this.tryTopicBasedContentMatching(remapped, contentIndices, fullDocumentContent);
    if (matchResult && matchResult.matchedIndices.size > 0) {
      for (const idx of Array.from(matchResult.matchedIndices)) {
        const candidate = matchResult.lessons[idx];
        const words = (candidate.sourceContent || '').split(/\s+/).filter(Boolean).length;
        remapped[idx] = this.annotateLessonProvenance(candidate, {
          assignmentMethod: 'topic_heading_remap',
          remediatedFromCrossLessonContamination: true,
          remapWordCount: words,
        });
      }
    }

    const topup = this.ensureMinimumLessonSourceContent(
      remapped,
      contentIndices,
      fullDocumentContent,
      CourseFrameworkAIService.MIN_SOURCE_CONTENT_WORDS
    );

    const afterIssues = this.detectCrossLessonContamination(topup);
    return {
      lessons: topup,
      report: {
        detectedBefore: beforeIssues.length,
        detectedAfter: afterIssues.length,
        remediated: Math.max(0, beforeIssues.length - afterIssues.length),
        remaining: afterIssues.length,
      },
    };
  }

  /**
   * Distribute full document content across content lessons to ensure ZERO content loss.
   * This method first tries topic-based matching (finding sections that match lesson titles),
   * then falls back to proportional distribution ONLY for unmatched/insufficient lessons.
   * 
   * IMPORTANT: Semantically matched content is PROTECTED from paragraph redistribution.
   * Priority hierarchy: User-uploaded content > AI topic-matched content > paragraph-distributed content
   * 
   * @param lessons - Generated lessons from AI
   * @param fullDocumentContent - The complete raw text from all documents
   * @returns Lessons with guaranteed full document content distribution
   */
  private distributeFullDocumentContent(lessons: GeneratedLesson[], fullDocumentContent: string): GeneratedLesson[] {
    if (!fullDocumentContent || fullDocumentContent.trim().length === 0) {
      console.log('[CourseFrameworkAI] No document content to distribute');
      return lessons;
    }

    let contentLessonIndices = this.getContentLessonIndices(lessons);

    // If no lessons, assign to first lesson
    if (contentLessonIndices.length === 0 && lessons.length > 0) {
      console.log('[CourseFrameworkAI] No content lessons found, assigning all content to first lesson');
      const updatedLessons = [...lessons];
      updatedLessons[0] = this.annotateLessonProvenance({
        ...lessons[0],
        sourceContent: fullDocumentContent,
      }, {
        assignmentMethod: 'single_lesson_fallback',
        sourceRange: { startLine: 0, endLine: fullDocumentContent.split('\n').length },
      });
      return updatedLessons;
    }

    if (contentLessonIndices.length === 0) {
      console.log('[CourseFrameworkAI] No lessons available to distribute content to');
      return lessons;
    }

    // Calculate total AI-extracted content length before reset (for observability only)
    const totalAIExtractedWords = lessons.reduce((sum, lesson) => {
      const words = (lesson.sourceContent || '').split(/\s+/).filter(w => w.length > 0).length;
      return sum + words;
    }, 0);

    const fullDocumentWords = fullDocumentContent.split(/\s+/).filter(w => w.length > 0).length;
    
    console.log(`[CourseFrameworkAI] Content distribution analysis: ` +
      `AI extracted ${totalAIExtractedWords} words, full document has ${fullDocumentWords} words, ` +
      `${contentLessonIndices.length} content lessons`);

    console.log(
      `[CourseFrameworkAI] AI extracted ${Math.round((totalAIExtractedWords / fullDocumentWords) * 100)}% of document words. ` +
      `Resetting AI sourceContent and rebuilding from uploaded document text only...`
    );

    // HARD GUARD: prevent AI-generated sourceContent from contaminating persisted lesson source.
    // We only keep user-uploaded source content; all other sourceContent is rebuilt from document text.
    let updatedLessons = lessons.map((lesson, index) => {
      const isContentLesson = contentLessonIndices.includes(index);
      if (!isContentLesson) return { ...lesson };
      if ((lesson as any).userUploadedContent === true) return { ...lesson };
      return {
        ...lesson,
        sourceContent: '',
      };
    });
    
    // Track which lessons have been successfully matched (protected from redistribution)
    const matchedLessonIndices = new Set<number>();
    
    // Try topic-based content matching: find sections in document that match lesson titles
    const topicMatchResult = this.tryTopicBasedContentMatching(
      updatedLessons, 
      contentLessonIndices, 
      fullDocumentContent
    );
    
    if (topicMatchResult) {
      // Topic-based matching succeeded - use matched lessons and track which were matched
      updatedLessons = topicMatchResult.lessons;
      topicMatchResult.matchedIndices.forEach(idx => matchedLessonIndices.add(idx));
      
      const topicMatchedWords = updatedLessons.reduce((sum, lesson) => {
        const words = (lesson.sourceContent || '').split(/\s+/).filter(w => w.length > 0).length;
        return sum + words;
      }, 0);
      
      console.log(`[CourseFrameworkAI] ✓ Topic-based matching recovered ${topicMatchedWords} words (was ${totalAIExtractedWords}), ` +
        `${matchedLessonIndices.size} lessons protected from redistribution`);
      
      const matchRatio = matchedLessonIndices.size / contentLessonIndices.length;
      console.log(`[CourseFrameworkAI] Topic match ratio: ${Math.round(matchRatio * 100)}%`);
    }

    // Find lessons that need content.
    const expectedWordsPerLesson = Math.max(200, Math.floor(fullDocumentWords / contentLessonIndices.length));

    const lessonsNeedingContent = contentLessonIndices.filter(idx => {
      const lesson = updatedLessons[idx] as any;
      if (lesson.userUploadedContent === true) {
        console.log(`[CourseFrameworkAI] Skipping lesson ${idx + 1} "${lesson.title}" - has user-uploaded content`);
        return false;
      }
      const wordCount = (updatedLessons[idx].sourceContent || '').split(/\s+/).filter(w => w.length > 0).length;
      const minimumRequired = Math.max(CourseFrameworkAIService.MIN_SOURCE_CONTENT_WORDS, Math.floor(expectedWordsPerLesson * 0.7));
      return wordCount < minimumRequired;
    });

    if (lessonsNeedingContent.length === 0) {
      console.log('[CourseFrameworkAI] All lessons have sufficient content, skipping paragraph redistribution');
      return updatedLessons;
    }

    console.log(`[CourseFrameworkAI] Falling back to topic-aligned supplementation for ${lessonsNeedingContent.length} lessons...`);

    // Track normalized paragraphs already used across lessons to prevent cross-lesson duplication/contamination.
    const usedNormalizedParagraphs = new Set<string>();
    for (const idx of contentLessonIndices) {
      const existing = updatedLessons[idx].sourceContent || '';
      const paragraphs = existing.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      for (const paragraph of paragraphs) {
        const normalized = this.normalizeForMatching(paragraph);
        if (normalized) {
          usedNormalizedParagraphs.add(normalized);
        }
      }
    }

    for (const lessonIndex of lessonsNeedingContent) {
      const existingContent = updatedLessons[lessonIndex].sourceContent || '';
      const existingWordCount = existingContent.split(/\s+/).filter(w => w.length > 0).length;
      const minimumRequired = Math.max(
        CourseFrameworkAIService.MIN_SOURCE_CONTENT_WORDS,
        Math.floor(expectedWordsPerLesson * 0.7)
      );
      const deficit = Math.max(0, minimumRequired - existingWordCount);
      const targetSupplementWords = Math.max(deficit + 80, Math.floor(expectedWordsPerLesson * 0.8));

      const supplemental = this.extractTopicAlignedSupplement(
        updatedLessons[lessonIndex].title || '',
        fullDocumentContent,
        existingContent,
        deficit,
        usedNormalizedParagraphs,
        targetSupplementWords
      );

      if (!supplemental) {
        console.warn(
          `[CourseFrameworkAI] No topic-aligned supplement found for lesson ${lessonIndex + 1} "${updatedLessons[lessonIndex].title}". ` +
          `Keeping existing content (${existingWordCount} words) to avoid cross-topic contamination.`
        );
        continue;
      }

      const mergedContent = existingContent.trim().length > 0
        ? `${existingContent}\n\n${supplemental}`.trim()
        : supplemental;
      const mergedWordCount = mergedContent.split(/\s+/).filter(w => w.length > 0).length;
      updatedLessons[lessonIndex] = {
        ...updatedLessons[lessonIndex],
        sourceContent: mergedContent,
      };

      // Mark newly assigned paragraphs as used.
      const supplementalParagraphs = supplemental.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
      for (const paragraph of supplementalParagraphs) {
        const normalized = this.normalizeForMatching(paragraph);
        if (normalized) {
          usedNormalizedParagraphs.add(normalized);
        }
      }

      console.log(
        `[CourseFrameworkAI] Lesson ${lessonIndex + 1} "${updatedLessons[lessonIndex].title}": ` +
        `topic-aligned supplement applied (${existingWordCount} -> ${mergedWordCount} words)`
      );
    }

    // Final minimum-word guard so selected lessons do not remain underfilled.
    updatedLessons = this.ensureMinimumLessonSourceContent(
      updatedLessons,
      contentLessonIndices,
      fullDocumentContent,
      CourseFrameworkAIService.MIN_SOURCE_CONTENT_WORDS
    );

    // Log the final distribution
    const finalTotalWords = updatedLessons.reduce((sum, lesson) => {
      const words = (lesson.sourceContent || '').split(/\s+/).filter(w => w.length > 0).length;
      return sum + words;
    }, 0);
    console.log(`[CourseFrameworkAI] ✓ Content redistribution complete: ${finalTotalWords} words now assigned (was ${totalAIExtractedWords}), ` +
      `${matchedLessonIndices.size} lessons protected`);

    return updatedLessons;
  }

  private ensureMinimumLessonSourceContent(
    lessons: GeneratedLesson[],
    contentLessonIndices: number[],
    fullDocumentContent: string,
    minWords: number
  ): GeneratedLesson[] {
    const updated = [...lessons];
    if (!fullDocumentContent || fullDocumentContent.trim().length === 0) {
      return updated;
    }

    for (const idx of contentLessonIndices) {
      const current = updated[idx].sourceContent || '';
      const currentWords = current.split(/\s+/).filter(w => w.length > 0);
      if (currentWords.length >= minWords) {
        continue;
      }
      const deficit = Math.max(0, minWords - currentWords.length);
      const usedNormalizedParagraphs = new Set<string>();
      for (const lesson of updated) {
        const existing = lesson.sourceContent || '';
        const paragraphs = existing.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
        for (const paragraph of paragraphs) {
          const normalized = this.normalizeForMatching(paragraph);
          if (normalized) {
            usedNormalizedParagraphs.add(normalized);
          }
        }
      }

      const topUp = this.extractTopicAlignedSupplement(
        updated[idx].title || '',
        fullDocumentContent,
        current,
        deficit,
        usedNormalizedParagraphs,
        Math.max(minWords + 80, minWords + deficit)
      );
      if (!topUp) {
        console.warn(
          `[CourseFrameworkAI] Could not find topic-aligned supplemental content for lesson ${idx + 1} "${updated[idx].title}". ` +
          `Leaving lesson at ${currentWords.length} words to avoid cross-topic contamination.`
        );
        continue;
      }
      updated[idx] = {
        ...updated[idx],
        sourceContent: current.trim().length > 0 ? `${current}\n\n${topUp}` : topUp,
      };
      const newWordCount = (updated[idx].sourceContent || '').split(/\s+/).filter(w => w.length > 0).length;
      console.log(
        `[CourseFrameworkAI] Topped up lesson ${idx + 1} "${updated[idx].title}" to ${newWordCount} words (minimum ${minWords})`
      );
    }

    return updated;
  }


  private extractTopicAlignedSupplement(
    lessonTitle: string,
    fullDocumentContent: string,
    existingContent: string,
    minWordsNeeded: number,
    excludedNormalizedParagraphs: Set<string> = new Set<string>(),
    maxWordsToAdd = 0
  ): string {
    const paragraphs = fullDocumentContent
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);
    if (paragraphs.length === 0) {
      return '';
    }

    const existingNormalized = this.normalizeForMatching(existingContent || '');
    const lessonTokens = this.normalizeForMatching(lessonTitle)
      .split(/\s+/)
      .filter(t => t.length > 3)
      .filter(t => !new Set(['lesson', 'course', 'overview', 'takeaways', 'module', 'topic', 'content']).has(t));

    if (lessonTokens.length === 0) {
      return '';
    }

    const scored = paragraphs.map((paragraph, idx) => {
      const normalized = this.normalizeForMatching(paragraph);
      if (!normalized) {
        return { idx, score: 0, paragraph };
      }
      if (excludedNormalizedParagraphs.has(normalized)) {
        return { idx, score: 0, paragraph };
      }
      if (existingNormalized && existingNormalized.includes(normalized)) {
        return { idx, score: 0, paragraph };
      }
      const isCrossLessonMeta =
        /course title and description/i.test(paragraph) ||
        /lesson\s+\d+\s+(addresses|deconstructs|delves|prepares|provides)/i.test(paragraph) ||
        ((paragraph.match(/\blesson\s+\d+\b/gi) || []).length >= 2);
      if (isCrossLessonMeta) {
        return { idx, score: 0, paragraph };
      }
      let score = 0;
      for (const token of lessonTokens) {
        if (normalized.includes(token)) {
          score += 1;
        }
      }
      return { idx, score, paragraph };
    });

    const relevant = scored
      .filter(s => s.score > 0)
      .sort((a, b) => (b.score - a.score) || (a.idx - b.idx));

    if (relevant.length === 0) {
      return '';
    }

    const targetWords = maxWordsToAdd > 0 ? maxWordsToAdd : Math.max(minWordsNeeded + 40, 120);
    const selected: string[] = [];
    let addedWords = 0;
    for (const entry of relevant) {
      selected.push(entry.paragraph);
      addedWords += entry.paragraph.split(/\s+/).filter(Boolean).length;
      if (addedWords >= targetWords) {
        break;
      }
    }

    return selected.join('\n\n').trim();
  }

  /**
   * Try to match document sections to lesson topics by finding topic headings in the document.
   * Returns null if topic-based matching fails or doesn't find enough content.
   * 
   * IMPROVED: Returns matched lesson indices to protect them from paragraph redistribution.
   * Uses confidence threshold (0.35) for semantic matching.
   */
  private tryTopicBasedContentMatching(
    lessons: GeneratedLesson[], 
    contentLessonIndices: number[], 
    fullDocumentContent: string
  ): { lessons: GeneratedLesson[]; matchedIndices: Set<number> } | null {
    const updatedLessons = [...lessons];
    const matchedIndices = new Set<number>();
    
    // Get lesson titles for content lessons (normalize for matching)
    const contentLessons = contentLessonIndices.map(idx => ({
      index: idx,
      title: lessons[idx].title,
      normalizedTitle: this.normalizeForMatching(lessons[idx].title),
    }));
    
    // Find potential section boundaries in the document (headings, numbered items, etc.)
    const lines = fullDocumentContent.split('\n');
    const sectionBoundaries: Array<{ lineIndex: number; heading: string; normalizedHeading: string }> = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Detect section headers with stronger constraints to avoid false positives.
      const alphaTokens = line.split(/\s+/).filter(token => /[A-Za-z]/.test(token));
      const isAllCapsHeading =
        line.length >= 5 &&
        line.length <= 120 &&
        line === line.toUpperCase() &&
        /[A-Z]/.test(line) &&
        alphaTokens.length >= 2;
      const isStructuredHeading = !!line.match(/^(lesson|module|chapter|section|topic|\d+[\.\):])\s/i);
      const isDelimitedHeading = !!line.match(/^[A-Z][^:]{2,100}:\s*$/);
      const isHeading = isAllCapsHeading || isStructuredHeading || isDelimitedHeading;
      const isMetaHeading =
        /course title and description/i.test(line) ||
        /lesson\s+\d+\s+(addresses|deconstructs|delves|prepares|provides)/i.test(line);
      
      if (isHeading && !isMetaHeading) {
        sectionBoundaries.push({
          lineIndex: i,
          heading: line,
          normalizedHeading: this.normalizeForMatching(line),
        });
      }
    }
    
    if (sectionBoundaries.length === 0) {
      console.log('[CourseFrameworkAI] No section boundaries found for topic-based matching');
      return null;
    }
    
    console.log(`[CourseFrameworkAI] Found ${sectionBoundaries.length} potential section boundaries for topic matching`);
    
    // Match lessons to sections - track used boundaries to prevent duplicate assignments
    const usedBoundaries = new Set<number>();
    
    for (const lessonInfo of contentLessons) {
      // Find best matching section header (that hasn't been used yet)
      let bestMatch: typeof sectionBoundaries[0] | null = null;
      let bestScore = 0;
      let bestBoundaryIdx = -1;
      
      for (let boundaryIdx = 0; boundaryIdx < sectionBoundaries.length; boundaryIdx++) {
        // Skip already-used boundaries to prevent duplicate content assignment
        if (usedBoundaries.has(boundaryIdx)) continue;
        
        const boundary = sectionBoundaries[boundaryIdx];
        const score = this.calculateMatchScore(lessonInfo.normalizedTitle, boundary.normalizedHeading);
        if (score > bestScore && score >= 0.5) {
          bestScore = score;
          bestMatch = boundary;
          bestBoundaryIdx = boundaryIdx;
        }
      }
      
      if (bestMatch && bestBoundaryIdx >= 0) {
        // Mark this boundary as used
        usedBoundaries.add(bestBoundaryIdx);
        
        // Find the section content: from this heading to the next heading (or end of document)
        const startLine = bestMatch.lineIndex;
        const endLine = bestBoundaryIdx < sectionBoundaries.length - 1 
          ? sectionBoundaries[bestBoundaryIdx + 1].lineIndex 
          : lines.length;
        
        const sectionContent = lines.slice(startLine, endLine).join('\n').trim();
        const sectionWordCount = sectionContent.split(/\s+/).filter(w => w.length > 0).length;
        const existingWordCount = (lessons[lessonInfo.index].sourceContent || '').split(/\s+/).filter(w => w.length > 0).length;
        
        if (sectionWordCount >= 50) {
          updatedLessons[lessonInfo.index] = this.annotateLessonProvenance({
            ...lessons[lessonInfo.index],
            sourceContent: sectionContent,
          }, {
            assignmentMethod: 'topic_heading_match',
            confidenceScore: Number(bestScore.toFixed(2)),
            matchedHeading: bestMatch.heading,
          });
          // Mark this lesson as matched - protected from redistribution
          matchedIndices.add(lessonInfo.index);
          console.log(`[CourseFrameworkAI] Topic matched: "${lessonInfo.title}" -> "${bestMatch.heading.substring(0, 40)}..." ` +
            `(${sectionWordCount} words, score=${bestScore.toFixed(2)}, protected=true)`);
        } else if (sectionWordCount > existingWordCount) {
          // Section has some content but below threshold - use it but don't protect
          updatedLessons[lessonInfo.index] = this.annotateLessonProvenance({
            ...lessons[lessonInfo.index],
            sourceContent: sectionContent,
          }, {
            assignmentMethod: 'topic_heading_partial_match',
            confidenceScore: Number(bestScore.toFixed(2)),
            matchedHeading: bestMatch.heading,
          });
          console.log(`[CourseFrameworkAI] Topic partial match: "${lessonInfo.title}" -> "${bestMatch.heading.substring(0, 40)}..." ` +
            `(${sectionWordCount} words, score=${bestScore.toFixed(2)}, protected=false - below minimum)`);
        }
      }
    }
    
    // Require at least 40% of lessons to be confidently matched before trusting this mode.
    if (matchedIndices.size < Math.ceil(contentLessons.length * 0.4)) {
      console.log(`[CourseFrameworkAI] Topic-based matching only matched ${matchedIndices.size}/${contentLessons.length} lessons with confidence, returning partial matches`);
      // Still return what we matched - they'll be protected, unmatched ones will get redistribution
      if (matchedIndices.size > 0) {
        return { lessons: updatedLessons, matchedIndices };
      }
      return null;
    }
    
    return { lessons: updatedLessons, matchedIndices };
  }

  /**
   * Normalize a string for fuzzy matching (lowercase, remove punctuation, collapse whitespace)
   */
  private normalizeForMatching(text: string): string {
    return text
      .toLowerCase()
      .replace(/[:\-–—\.]/g, ' ')
      .replace(/lesson\s*\d+\s*/gi, '')
      .replace(/module\s*\d+\s*/gi, '')
      .replace(/chapter\s*\d+\s*/gi, '')
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Calculate a match score between two normalized strings (0-1 range)
   */
  private calculateMatchScore(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    
    // Exact match
    if (str1 === str2) return 1.0;
    
    // Check substring containment
    if (str1.includes(str2)) return 0.9;
    if (str2.includes(str1)) return 0.85;
    
    // Calculate word overlap
    const words1Array = str1.split(' ').filter(w => w.length > 2);
    const words2Array = str2.split(' ').filter(w => w.length > 2);
    const words1 = new Set(words1Array);
    const words2 = new Set(words2Array);
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = words1Array.filter(w => words2.has(w));
    const unionArray = words1Array.concat(words2Array.filter(w => !words1.has(w)));
    
    return intersection.length / unionArray.length;
  }

  private validateLessonSourceContent(lessons: GeneratedLesson[], totalDocumentWords: number): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      const sourceContent = lesson.sourceContent || '';
      const wordCount = sourceContent.split(/\s+/).filter(w => w.length > 0).length;
      
      if (wordCount < CourseFrameworkAIService.MIN_SOURCE_CONTENT_WORDS) {
        errors.push(`Lesson ${i + 1} "${lesson.title}" has insufficient source content (${wordCount} words, minimum ${CourseFrameworkAIService.MIN_SOURCE_CONTENT_WORDS} required)`);
      }
    }
    
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validates that AI-generated lesson titles match the extracted document headings.
   * Uses fuzzy matching to account for minor formatting differences.
   */
  private validateGeneratedTopicsAgainstHeadings(
    generatedLessons: GeneratedLesson[],
    expectedHeadings: StructuredLessonHeading[]
  ): { isValid: boolean; matchedCount: number; issues: string[] } {
    const issues: string[] = [];
    let matchedCount = 0;
    
    // Filter to content lessons only (skip overview and key takeaways)
    const contentLessons = generatedLessons.filter(l => 
      !l.isOverview && l.lessonType !== 'key_takeaways'
    );
    
    // Check count matches
    if (contentLessons.length !== expectedHeadings.length) {
      issues.push(`Expected ${expectedHeadings.length} content lessons but generated ${contentLessons.length}`);
    }
    
    // Helper: normalize title for comparison (lowercase, remove punctuation, collapse whitespace)
    const normalizeTitle = (title: string): string => {
      return title
        .toLowerCase()
        .replace(/[:\-–—]/g, ' ')
        .replace(/lesson\s*\d+\s*/gi, '')
        .replace(/module\s*\d+\s*/gi, '')
        .replace(/chapter\s*\d+\s*/gi, '')
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    // Check each content lesson title matches an expected heading
    for (const lesson of contentLessons) {
      const normalizedGenerated = normalizeTitle(lesson.title);
      
      // Try to find a matching heading
      const matchingHeading = expectedHeadings.find(h => {
        const normalizedExpected = normalizeTitle(h.rawHeading);
        const normalizedTitle = normalizeTitle(h.normalizedTitle);
        
        // Check for substring match or high similarity
        return normalizedGenerated.includes(normalizedExpected) ||
               normalizedExpected.includes(normalizedGenerated) ||
               normalizedGenerated.includes(normalizedTitle) ||
               normalizedTitle.includes(normalizedGenerated) ||
               this.calculateSimilarity(normalizedGenerated, normalizedExpected) > 0.7 ||
               this.calculateSimilarity(normalizedGenerated, normalizedTitle) > 0.7;
      });
      
      if (matchingHeading) {
        matchedCount++;
      } else {
        issues.push(`Generated topic "${lesson.title}" does not match any extracted heading`);
      }
    }
    
    return {
      isValid: issues.length === 0,
      matchedCount,
      issues,
    };
  }
  
  /**
   * Calculate simple similarity score between two strings (0-1)
   */
  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;
    
    // Use Jaccard similarity on words
    const words1 = str1.split(/\s+/);
    const words2 = str2.split(/\s+/);
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    
    // Calculate intersection using Array.from for compatibility
    const intersection = Array.from(set1).filter(x => set2.has(x));
    const unionSize = new Set([...words1, ...words2]).size;
    
    return intersection.length / unionSize;
  }

  private findBestHeadingLineIndex(
    lines: string[],
    headingTitle: string
  ): { lineIndex: number; score: number } | null {
    const normalizedHeading = this.normalizeForMatching(headingTitle);
    if (!normalizedHeading) return null;

    let bestLineIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < lines.length; i++) {
      const normalizedLine = this.normalizeForMatching(lines[i] || '');
      if (!normalizedLine) continue;

      const score =
        normalizedLine.includes(normalizedHeading) || normalizedHeading.includes(normalizedLine)
          ? 1
          : this.calculateMatchScore(normalizedHeading, normalizedLine);

      if (score > bestScore) {
        bestScore = score;
        bestLineIndex = i;
      }
    }

    if (bestLineIndex < 0) return null;
    return { lineIndex: bestLineIndex, score: bestScore };
  }

  /**
   * Strictly assign lesson sourceContent from document heading boundaries.
   * No supplementation is performed to avoid cross-topic contamination.
   */
  private assignSourceContentFromStructuredHeadings(
    lessons: GeneratedLesson[],
    fullDocumentContent: string,
    allStructuredHeadings: StructuredLessonHeading[],
    selectedContentHeadings: StructuredLessonHeading[]
  ): GeneratedLesson[] {
    const lines = fullDocumentContent.split('\n');
    const updated = [...lessons];
    const contentLessonIndices = updated
      .map((lesson, index) => ({ lesson, index }))
      .filter(({ lesson }) => lesson.lessonType === 'content')
      .map(({ index }) => index);

    if (contentLessonIndices.length === 0) {
      throw new Error('Strict heading assignment failed: no content lessons found');
    }

    const sortedAllHeadings = [...allStructuredHeadings].sort((a, b) => a.index - b.index);
    const headingPositions = new Map<number, number>();

    for (const heading of sortedAllHeadings) {
      const rawMatch = this.findBestHeadingLineIndex(lines, heading.rawHeading);
      const normalizedMatch = this.findBestHeadingLineIndex(lines, heading.normalizedTitle);
      const bestMatch = !rawMatch
        ? normalizedMatch
        : !normalizedMatch
          ? rawMatch
          : (rawMatch.score >= normalizedMatch.score ? rawMatch : normalizedMatch);
      if (bestMatch && bestMatch.score >= 0.5) {
        headingPositions.set(heading.index, bestMatch.lineIndex);
      }
    }

    const selectedHeadingByLesson = new Map<number, StructuredLessonHeading>();
    const usedSelectedHeadingIndexes = new Set<number>();

    for (const lessonIndex of contentLessonIndices) {
      const lesson = updated[lessonIndex];
      const normalizedLessonTitle = this.normalizeForMatching(lesson.title || '');

      let bestHeading: StructuredLessonHeading | null = null;
      let bestScore = 0;

      for (const heading of selectedContentHeadings) {
        if (usedSelectedHeadingIndexes.has(heading.index)) continue;
        const normalizedHeading = this.normalizeForMatching(heading.rawHeading || heading.normalizedTitle || '');
        const score =
          normalizedHeading.includes(normalizedLessonTitle) || normalizedLessonTitle.includes(normalizedHeading)
            ? 1
            : this.calculateSimilarity(normalizedLessonTitle, normalizedHeading);
        if (score > bestScore) {
          bestScore = score;
          bestHeading = heading;
        }
      }

      if (!bestHeading || bestScore < 0.45) {
        throw new Error(`Strict heading assignment failed: lesson "${lesson.title}" could not be mapped to a selected document heading`);
      }

      usedSelectedHeadingIndexes.add(bestHeading.index);
      selectedHeadingByLesson.set(lessonIndex, bestHeading);
    }

    for (const lessonIndex of contentLessonIndices) {
      const heading = selectedHeadingByLesson.get(lessonIndex);
      if (!heading) {
        throw new Error(`Strict heading assignment failed: no heading assigned for lesson index ${lessonIndex}`);
      }

      const startLine = headingPositions.get(heading.index);
      if (startLine === undefined) {
        throw new Error(`Strict heading assignment failed: heading "${heading.rawHeading}" was not located in extracted source text`);
      }

      let endLine = lines.length;
      for (const nextHeading of sortedAllHeadings) {
        if (nextHeading.index <= heading.index) continue;
        const nextPos = headingPositions.get(nextHeading.index);
        if (nextPos !== undefined && nextPos > startLine) {
          endLine = nextPos;
          break;
        }
      }

      const sectionContent = lines.slice(startLine, endLine).join('\n').trim();
      const wordCount = sectionContent.split(/\s+/).filter(Boolean).length;
      if (wordCount < 40) {
        throw new Error(
          `Strict heading assignment failed: mapped section for "${updated[lessonIndex].title}" is too short (${wordCount} words)`
        );
      }

      updated[lessonIndex] = this.annotateLessonProvenance({
        ...updated[lessonIndex],
        sourceContent: sectionContent,
      }, {
        assignmentMethod: 'strict_structured_heading',
        confidenceScore: 1,
        matchedHeading: heading.rawHeading,
        sourceRange: { startLine, endLine },
      });
    }

    const contentSections = contentLessonIndices
      .map(index => updated[index].sourceContent || '')
      .filter(Boolean);

    const overviewIndex = updated.findIndex(lesson => lesson.lessonType === 'overview' || lesson.isOverview);
    if (overviewIndex >= 0 && contentSections.length > 0) {
      updated[overviewIndex] = this.annotateLessonProvenance({
        ...updated[overviewIndex],
        sourceContent: contentSections.map(section => section.split(/\n{2,}/)[0] || '').join('\n\n').trim(),
      }, {
        assignmentMethod: 'derived_overview_from_content',
        confidenceScore: 0.9,
      });
    }

    const takeawaysIndex = updated.findIndex(lesson => lesson.lessonType === 'key_takeaways');
    if (takeawaysIndex >= 0 && contentSections.length > 0) {
      updated[takeawaysIndex] = this.annotateLessonProvenance({
        ...updated[takeawaysIndex],
        sourceContent: contentSections.join('\n\n'),
      }, {
        assignmentMethod: 'derived_takeaways_from_content',
        confidenceScore: 0.8,
      });
    }

    console.log(
      `[CourseFrameworkAI] Strict structured-heading source assignment complete: ` +
      `${contentLessonIndices.length} content lessons mapped without supplementation`
    );
    return updated;
  }

  /**
   * Enforce strict selected-topic structure:
   * 1 overview + N selected content topics + 1 key takeaways.
   * This prevents deselected topics from leaking back into the generated framework.
   */
  private enforceSelectedTopicStructure(
    lessons: GeneratedLesson[],
    selectedTopicNames: string[]
  ): GeneratedLesson[] {
    const normalizedTopics = selectedTopicNames
      .map(topic => (topic || '').trim())
      .filter(Boolean);

    if (normalizedTopics.length === 0 || lessons.length === 0) {
      return lessons;
    }

    const normalize = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ');
    const isOverviewLesson = (lesson: GeneratedLesson, idx: number) =>
      lesson.isOverview === true ||
      lesson.lessonType === 'overview' ||
      idx === 0 ||
      normalize(lesson.title || '').includes('overview');
    const isTakeawayLesson = (lesson: GeneratedLesson, idx: number) =>
      lesson.lessonType === 'key_takeaways' ||
      normalize(lesson.title || '').includes('key takeaway') ||
      normalize(lesson.title || '').includes('takeaways') ||
      idx === lessons.length - 1;

    const overviewLesson = lessons.find(isOverviewLesson) || lessons[0];
    const keyTakeawaysLesson = lessons.find(isTakeawayLesson) || lessons[lessons.length - 1];

    const contentCandidates = lessons.filter((lesson, idx) => !isOverviewLesson(lesson, idx) && !isTakeawayLesson(lesson, idx));
    const usedCandidateIndices = new Set<number>();

    const contentLessons = normalizedTopics.map((topicName) => {
      const normalizedTopic = normalize(topicName);
      let bestIdx = -1;
      let bestScore = 0;

      for (let i = 0; i < contentCandidates.length; i++) {
        if (usedCandidateIndices.has(i)) continue;
        const candidate = contentCandidates[i];
        const normalizedTitle = normalize(candidate.title || '');
        const score =
          normalizedTitle.includes(normalizedTopic) || normalizedTopic.includes(normalizedTitle)
            ? 1
            : this.calculateSimilarity(normalizedTitle, normalizedTopic);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx >= 0 && bestScore >= 0.35) {
        usedCandidateIndices.add(bestIdx);
        return {
          ...contentCandidates[bestIdx],
          title: topicName,
          isOverview: false,
          lessonType: 'content' as const,
          prerequisiteTopicIds: [],
        };
      }

      return {
        title: topicName,
        description: `Learning module focused on ${topicName}.`,
        objectives: [],
        isFromContent: true,
        isSelected: true,
        isOverview: false,
        lessonType: 'content' as const,
        sourceDocumentId: null,
        sourceContent: '',
        prerequisiteTopicIds: [],
      } as GeneratedLesson;
    });

    const normalizedOverview = {
      ...overviewLesson,
      title: (overviewLesson.title || '').trim() || 'Course Overview',
      isOverview: true,
      lessonType: 'overview' as const,
      prerequisiteTopicIds: [],
    };
    const normalizedKeyTakeaways = {
      ...keyTakeawaysLesson,
      title: 'Key Takeaways',
      isOverview: false,
      lessonType: 'key_takeaways' as const,
      prerequisiteTopicIds: [],
    };

    const normalizedLessons = [normalizedOverview, ...contentLessons, normalizedKeyTakeaways];
    console.log(
      `[CourseFrameworkAI] Enforced selected-topic structure: ${normalizedLessons.length} total lessons ` +
      `(1 overview + ${contentLessons.length} selected content + 1 key takeaways)`
    );
    return normalizedLessons;
  }

  // New method that uses raw text for AI analysis
  async generateFrameworkFromRawText(
    documents: ExtractedDocumentV2[],
    options: FrameworkGenerationOptions = {}
  ): Promise<GeneratedFramework | FrameworkGenerationError> {
    const startTime = Date.now();
    const {
      courseDescription = '',
      targetLessonCount = 8,
      includeRecommendations = true,
      targetAudience = 'intermediate',
      structuredLessonHeadings = [],
      hasExplicitLessonStructure = false,
      selectedTopics = [],
      customTopics = [],
    } = options;
    
    // Apply user's topic selection — only generate content for selected topics
    let filteredHeadings = structuredLessonHeadings;
    const hasTopicSelection = selectedTopics.length > 0 || customTopics.length > 0;
    const assignmentWarnings: string[] = [];

    let headingFilterMatchFailed = false;
    if (hasTopicSelection && hasExplicitLessonStructure) {
      const normalizeForComparison = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
      const extractCoreName = (s: string) => s.replace(/\s*\(.*?\)\s*/g, '').trim();
      const selectedNormalized = new Set(selectedTopics.map(normalizeForComparison));
      const selectedCoreNames = new Set(selectedTopics.map(t => normalizeForComparison(extractCoreName(t))));
      
      filteredHeadings = structuredLessonHeadings.filter(h => {
        if (h.type === 'overview' || h.type === 'takeaways') return true;
        const rawNorm = normalizeForComparison(h.rawHeading);
        const titleNorm = normalizeForComparison(h.normalizedTitle);
        const rawCore = normalizeForComparison(extractCoreName(h.rawHeading));
        const titleCore = normalizeForComparison(extractCoreName(h.normalizedTitle));
        return selectedNormalized.has(rawNorm) ||
               selectedNormalized.has(titleNorm) ||
               selectedCoreNames.has(rawCore) ||
               selectedCoreNames.has(titleCore) ||
               Array.from(selectedCoreNames).some(core =>
                 rawNorm.includes(core) || titleNorm.includes(core) ||
                 core.includes(rawCore) || core.includes(titleCore) ||
                 this.calculateSimilarity(rawCore, core) > 0.6
               );
      });
      
      const filteredContentCount = filteredHeadings.filter(h => h.type !== 'overview' && h.type !== 'takeaways').length;
      
      if (filteredContentCount === 0 && selectedTopics.length > 0) {
        headingFilterMatchFailed = true;
        const warning =
          `Selected topics could not be aligned to detected document headings. ` +
          `Falling back to non-structured generation for selected topics: ${selectedTopics.join(' | ')}`;
        assignmentWarnings.push(warning);
        console.warn(`[CourseFrameworkAI] ${warning}`);
      } else {
        if (customTopics.length > 0) {
          headingFilterMatchFailed = true;
          const warning =
            'Custom topics are not supported when explicit document structure is detected. ' +
            'Falling back to non-structured generation to include custom topics.';
          assignmentWarnings.push(warning);
          console.warn(`[CourseFrameworkAI] ${warning}`);
        }
        
        console.log(`[CourseFrameworkAI] Topic selection filter applied: ${selectedTopics.length} selected + ${customTopics.length} custom = ${filteredContentCount} content topics matched document headings`);
      }
    }

    const useStructuredHeadings = hasExplicitLessonStructure && !headingFilterMatchFailed;
    const contentLessons = filteredHeadings.filter(h => 
      h.type !== 'overview' && h.type !== 'takeaways'
    );
    const effectiveTargetCount = useStructuredHeadings && contentLessons.length > 0
      ? contentLessons.length
      : hasTopicSelection 
        ? selectedTopics.length + customTopics.length
        : targetLessonCount;
    
    if (hasExplicitLessonStructure) {
      console.log(`[CourseFrameworkAI] Document has explicit lesson structure (${structuredLessonHeadings.length} headings). useStructuredHeadings=${useStructuredHeadings}, headingFilterMatchFailed=${headingFilterMatchFailed}`);
      console.log(`[CourseFrameworkAI] Effective target count: ${effectiveTargetCount} lessons (targetLessonCount=${targetLessonCount})`);
      console.log(`[CourseFrameworkAI] Extracted headings: ${structuredLessonHeadings.map(h => h.rawHeading.substring(0, 40)).join(' | ')}`);
    }

    const documentSizes = documents.map(d => ({
      fileName: d.fileName,
      bytes: Buffer.byteLength(d.rawText, 'utf8'),
      wordCount: d.wordCount,
      estimatedTokens: this.estimateTokens(d.rawText),
    }));
    const totalBytes = documentSizes.reduce((sum, d) => sum + d.bytes, 0);
    const totalEstimatedTokens = documentSizes.reduce((sum, d) => sum + d.estimatedTokens, 0);

    console.log(`[CourseFrameworkAI] === START generateFrameworkFromRawText ===`);
    console.log(`[CourseFrameworkAI] Documents: ${documents.length}, TotalBytes: ${Math.round(totalBytes / 1024)}KB, EstimatedTokens: ${totalEstimatedTokens}`);
    console.log(`[CourseFrameworkAI] Document details: ${JSON.stringify(documentSizes.map(d => ({ name: d.fileName, kb: Math.round(d.bytes / 1024), tokens: d.estimatedTokens })))}`);
    this.logMemoryUsage('start');

    const sizeValidationError = this.validateDocumentSizes(documents);
    if (sizeValidationError) {
      console.error(`[CourseFrameworkAI] Document size validation failed: ${sizeValidationError.code}`);
      return sizeValidationError;
    }

    try {
      const documentContents: string[] = [];
      let totalWordCount = 0;
      const fullRawText: string[] = [];

      for (const doc of documents) {
        totalWordCount += doc.wordCount;
        fullRawText.push(doc.rawText);
        const contentForFramework = await this.summarizeIfNeeded(doc.rawText, this.MAX_CONTENT_TOKENS);
        documentContents.push(`## Document: ${doc.fileName}\n${contentForFramework}`);
      }

      const combinedContent = documentContents.join('\n\n---\n\n');
      const fullDocumentContent = fullRawText.join('\n\n---\n\n');
      
      this.logMemoryUsage('after-summarize');
      
      const { title, description } = await this.generateTitleAndDescription(
        combinedContent,
        courseDescription,
        targetAudience
      );

      this.logMemoryUsage('after-title');

      const selectedTopicNames = hasTopicSelection ? [...selectedTopics, ...customTopics] : undefined;
      let aiGeneratedLessons = await this.generateLessonsFromRawText(
        fullDocumentContent.length <= this.MAX_CONTENT_TOKENS * 4 ? fullDocumentContent : combinedContent,
        title,
        description,
        effectiveTargetCount,
        targetAudience,
        useStructuredHeadings ? filteredHeadings : undefined,
        selectedTopicNames
      );
      
      this.logMemoryUsage('after-lessons');
      
      // Post-generation validation: verify generated topics match extracted headings
      if (useStructuredHeadings && contentLessons.length > 0) {
        const topicValidation = this.validateGeneratedTopicsAgainstHeadings(
          aiGeneratedLessons,
          contentLessons
        );
        
        if (!topicValidation.isValid) {
          console.warn(`[CourseFrameworkAI] ⚠️ Topic validation failed: ${topicValidation.issues.join('; ')}`);
          // Log but don't fail - the constraint prompt should prevent most issues
          // We continue with generation but the mismatch is logged for debugging
        } else {
          console.log(`[CourseFrameworkAI] ✅ Topic validation passed: all ${topicValidation.matchedCount}/${contentLessons.length} content lessons match extracted headings`);
        }
      }

      if (hasTopicSelection) {
        aiGeneratedLessons = this.enforceSelectedTopicStructure(aiGeneratedLessons, [
          ...selectedTopics,
          ...customTopics,
        ]);
      }

      // For explicit-structure documents, always assign source content strictly by
      // detected heading boundaries (no supplementation) to prevent cross-topic mixing.
      // Fallback distribution is used only when explicit structure is unavailable.
      let distributedLessons: GeneratedLesson[];
      if (useStructuredHeadings && contentLessons.length > 0) {
        try {
          distributedLessons = this.assignSourceContentFromStructuredHeadings(
            aiGeneratedLessons,
            fullDocumentContent,
            structuredLessonHeadings,
            contentLessons
          );
        } catch (structuredAssignmentError: any) {
          const warning =
            `Structured heading assignment failed and fallback distribution was used: ` +
            `${structuredAssignmentError.message || 'unknown assignment error'}`;
          assignmentWarnings.push(warning);
          console.warn(`[CourseFrameworkAI] ${warning}`);
          distributedLessons = this.distributeFullDocumentContent(aiGeneratedLessons, fullDocumentContent);
        }
      } else {
        distributedLessons = this.distributeFullDocumentContent(aiGeneratedLessons, fullDocumentContent);
      }
      const contaminationRemediationResult = this.remediateCrossLessonContamination(
        distributedLessons,
        fullDocumentContent
      );
      const lessons = contaminationRemediationResult.lessons;
      
      this.logMemoryUsage('after-content-distribution');

      const validation = this.validateLessonSourceContent(lessons, totalWordCount);
      const contentWarnings: Array<{
        lessonIndex: number;
        title: string;
        wordCount: number;
        deficit: number;
        minRequired: number;
        status: 'ok' | 'needs_content';
      }> = [];
      let lessonsWithInsufficientContent = 0;
      
      for (let i = 0; i < lessons.length; i++) {
        const lesson = lessons[i];
        const sourceContent = lesson.sourceContent || '';
        const wordCount = sourceContent.split(/\s+/).filter(w => w.length > 0).length;
        const minRequired = CourseFrameworkAIService.MIN_SOURCE_CONTENT_WORDS;
        
        if (wordCount < minRequired) {
          lessonsWithInsufficientContent++;
          const deficit = minRequired - wordCount;
          contentWarnings.push({
            lessonIndex: i,
            title: lesson.title,
            wordCount,
            deficit,
            minRequired,
            status: 'needs_content',
          });
          (lesson as any).contentWarning = `Insufficient source content (${wordCount}/${minRequired} words). Add ${deficit} more words.`;
          (lesson as any).contentStatus = 'needs_content';
          (lesson as any).contentWordCount = wordCount;
          (lesson as any).contentDeficit = deficit;
          (lesson as any).canGenerate = true;
        } else {
          contentWarnings.push({
            lessonIndex: i,
            title: lesson.title,
            wordCount,
            deficit: 0,
            minRequired,
            status: 'ok',
          });
          (lesson as any).contentStatus = 'ok';
          (lesson as any).contentWordCount = wordCount;
          (lesson as any).contentDeficit = 0;
          (lesson as any).canGenerate = true;
        }
      }
      
      if (lessonsWithInsufficientContent > 0) {
        console.warn(`[CourseFrameworkAI] Content health warning: ${lessonsWithInsufficientContent}/${lessons.length} lessons have insufficient source content. ` +
          `Framework generated with warnings for user remediation.`);
      }

      // Validate lesson sourceContent against original document to detect hallucinations
      const { validatedLessons, validationSummary } = this.validateLessonContent(lessons, fullDocumentContent);
      console.log(`[CourseFrameworkAI] Source content validation: ${validationSummary.passedValidation}/${validationSummary.totalLessons} passed, ` +
        `average confidence: ${validationSummary.averageConfidence}`);
      
      if (validationSummary.failedValidation > 0) {
        console.warn(`[CourseFrameworkAI] ⚠️ ${validationSummary.failedValidation} lessons have low source validation confidence - potential hallucinations detected`);
      }

      let recommendedLessons: RecommendedLesson[] = [];
      if (includeRecommendations) {
        recommendedLessons = await this.generateRecommendedLessons(
          title,
          description,
          lessons,
          targetAudience
        );
      }

      this.logMemoryUsage('after-recommendations');
      const durationMs = Date.now() - startTime;
      console.log(`[CourseFrameworkAI] === END generateFrameworkFromRawText === duration=${durationMs}ms, lessons=${lessons.length}`);

      return {
        title,
        description,
        lessons: validatedLessons,
        recommendedLessons,
        metadata: {
          documentsProcessed: documents.length,
          totalWordCount,
          generatedAt: new Date().toISOString(),
          modelUsed: this.modelName,
          contentValidation: validation,
          contentWarnings,
          contentHealth: {
            totalLessons: lessons.length,
            lessonsWithSufficientContent: lessons.length - lessonsWithInsufficientContent,
            lessonsNeedingContent: lessonsWithInsufficientContent,
            overallStatus: lessonsWithInsufficientContent === 0 ? 'healthy' : 
              lessonsWithInsufficientContent === lessons.length ? 'critical' : 'warning',
          },
          sourceValidation: {
            passedValidation: validationSummary.passedValidation,
            failedValidation: validationSummary.failedValidation,
            averageConfidence: validationSummary.averageConfidence,
            hallucinationRisk: validationSummary.averageConfidence < 0.7 ? 'high' : 
              validationSummary.averageConfidence < 0.85 ? 'medium' : 'low',
          },
          assignmentWarnings: assignmentWarnings.length > 0 ? assignmentWarnings : undefined,
          contaminationRemediation: contaminationRemediationResult.report,
        },
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.logMemoryUsage('error');
      console.error(`[CourseFrameworkAI] === FAILED generateFrameworkFromRawText === duration=${durationMs}ms`);
      console.error(`[CourseFrameworkAI] Error details:`, {
        message: error.message,
        documentCount: documents.length,
        totalBytes,
        totalEstimatedTokens,
        stack: error.stack?.split('\n').slice(0, 5).join('\n'),
      });

      return {
        error: true,
        code: 'GENERATION_FAILED',
        message: `Failed to generate course framework: ${error.message || 'Unknown error'}. Please try again with smaller documents or fewer files.`,
        details: {
          documentCount: documents.length,
          totalBytes,
          estimatedTokens: totalEstimatedTokens,
          errorMessage: error.message,
        }
      } as FrameworkGenerationError;
    }
  }

  async normalizeGeneratedLessonsSourceContent(
    lessons: GeneratedLesson[],
    options: { targetAudience?: string; enabled?: boolean } = {}
  ): Promise<GeneratedLesson[]> {
    const isEnabled = options.enabled ?? process.env.COURSE_SOURCE_NORMALIZATION_ENABLED !== 'false';
    if (!isEnabled) {
      console.log('[CourseFrameworkAI] Source normalization disabled; keeping raw source content');
      return lessons;
    }

    const normalizedLessons: GeneratedLesson[] = [];
    for (let index = 0; index < lessons.length; index++) {
      const lesson = lessons[index] as GeneratedLesson & Record<string, any>;
      const lessonType = String(lesson.lessonType || '').toLowerCase();
      const isContentLesson =
        lessonType === 'content' ||
        (lesson.isOverview !== true && lessonType !== 'overview' && lessonType !== 'key_takeaways');

      if (!isContentLesson || !String(lesson.sourceContent || '').trim()) {
        normalizedLessons.push({ ...lesson });
        continue;
      }

      const rawSourceContent = String(lesson.sourceContent || '').trim();
      const sourceAssets = Array.isArray(lesson.sourceAssets)
        ? lesson.sourceAssets
            .map((asset: any): SourceNormalizationAsset | null => {
              const id = String(asset?.assetId || asset?.id || '').trim();
              if (!id) return null;
              return {
                id,
                pageOrSlide: typeof asset.pageOrSlide === 'number' ? asset.pageOrSlide : null,
                caption: typeof asset.caption === 'string' ? asset.caption : null,
                altText: typeof asset.altText === 'string' ? asset.altText : null,
                containsEmbeddedText: asset.containsEmbeddedText === true,
              };
            })
            .filter(Boolean) as SourceNormalizationAsset[]
        : [];

      const result = await normalizeLessonSourceContentWithAI({
        lessonTitle: lesson.title,
        lessonDescription: lesson.description,
        rawSourceContent,
        sourceAssets,
        targetAudience: options.targetAudience,
        modelName: this.modelName,
        generate: (systemPrompt, userPrompt) => this.callGemini(systemPrompt, userPrompt),
      });

      const mergedVisualRefs = result.visualRefs.length > 0
        ? result.visualRefs
        : (Array.isArray(lesson.sourceAssets) ? lesson.sourceAssets : []);

      normalizedLessons.push({
        ...lesson,
        sourceContent: result.normalizedText,
        sourceContentRaw: result.rawSourceContent,
        sourceNormalization: result.metadata,
        sourceNormalizationWarnings: result.warnings,
        sourceCitations: result.citations as Array<Record<string, unknown>>,
        sourceAssets: mergedVisualRefs,
        contentWordCount: result.metadata.normalizedWordCount,
        contentStatus: result.status === 'normalized' ? 'ok' : lesson.contentStatus,
      } as GeneratedLesson);

      console.log(
        `[CourseFrameworkAI] Source normalization ${result.status} for lesson ${index + 1} "${lesson.title}": ` +
        `${result.metadata.rawWordCount} raw words -> ${result.metadata.normalizedWordCount} stored words`
      );
    }

    return normalizedLessons;
  }

  // Legacy method for backward compatibility
  async generateFramework(
    extractedDocuments: ExtractedDocument[],
    options: FrameworkGenerationOptions = {}
  ): Promise<GeneratedFramework | FrameworkGenerationError> {
    const startTime = Date.now();
    const {
      courseDescription = '',
      targetLessonCount = 8,
      includeRecommendations = true,
      targetAudience = 'intermediate',
    } = options;

    console.log(`[CourseFrameworkAI] === START generateFramework (legacy) ===`);
    console.log(`[CourseFrameworkAI] Documents: ${extractedDocuments.length}`);
    this.logMemoryUsage('start-legacy');

    try {
      const documentSummaries: string[] = [];
      let totalWordCount = 0;
      let totalBytes = 0;

      for (const doc of extractedDocuments) {
        const docContent = doc.sections
          .map(s => `[${s.type.toUpperCase()}] ${s.heading}\n${s.content}`)
          .join('\n\n');
        
        const docBytes = Buffer.byteLength(docContent, 'utf8');
        totalBytes += docBytes;
        
        totalWordCount += docContent.split(/\s+/).length;
        const summary = await this.summarizeIfNeeded(docContent);
        documentSummaries.push(`## Document: ${doc.fileName}\n${summary}`);
      }
      console.log(`[CourseFrameworkAI] Legacy generation size audit (non-blocking): total=${Math.round(totalBytes / 1024 / 1024 * 100) / 100}MB, docs=${extractedDocuments.length}`);

      const combinedContent = documentSummaries.join('\n\n---\n\n');
      
      const { title, description } = await this.generateTitleAndDescription(
        combinedContent,
        courseDescription,
        targetAudience
      );

      // Build full document content for distribution (before summarization)
      const fullLegacyContent = extractedDocuments
        .map(doc => doc.sections.map(s => `[${s.type.toUpperCase()}] ${s.heading}\n${s.content}`).join('\n\n'))
        .join('\n\n---\n\n');

      const aiGeneratedLessons = await this.generateLessonsFromRawText(
        combinedContent,
        title,
        description,
        targetLessonCount,
        targetAudience
      );

      // CRITICAL: Ensure ZERO content loss by redistributing full document content
      const lessons = this.distributeFullDocumentContent(aiGeneratedLessons, fullLegacyContent);

      let recommendedLessons: RecommendedLesson[] = [];
      if (includeRecommendations) {
        recommendedLessons = await this.generateRecommendedLessons(
          title,
          description,
          lessons,
          targetAudience
        );
      }

      const durationMs = Date.now() - startTime;
      console.log(`[CourseFrameworkAI] === END generateFramework (legacy) === duration=${durationMs}ms`);

      return {
        title,
        description,
        lessons,
        recommendedLessons,
        metadata: {
          documentsProcessed: extractedDocuments.length,
          totalWordCount,
          generatedAt: new Date().toISOString(),
          modelUsed: this.modelName,
        },
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;
      this.logMemoryUsage('error-legacy');
      console.error(`[CourseFrameworkAI] === FAILED generateFramework (legacy) === duration=${durationMs}ms`);
      console.error(`[CourseFrameworkAI] Error:`, error.message);

      return {
        error: true,
        code: 'GENERATION_FAILED',
        message: `Failed to generate course framework: ${error.message || 'Unknown error'}. Please try again.`,
        details: {
          documentCount: extractedDocuments.length,
          errorMessage: error.message,
        }
      };
    }
  }

  private async generateTitleAndDescription(
    content: string,
    userDescription: string,
    targetAudience: string
  ): Promise<{ title: string; description: string }> {
    const systemPrompt = `You are an expert curriculum designer. Based on the provided content, generate a compelling course title and description.

The title should:
- Be concise (3-8 words)
- Clearly communicate the course topic
- Be engaging and professional

The description should:
- Be 2-3 sentences
- Highlight key learning outcomes
- Appeal to ${targetAudience} level learners

Return your response as JSON: {"title": "...", "description": "..."}`;

    const userPrompt = `${userDescription ? `User's description: ${userDescription}\n\n` : ''}Based on the following content, generate a course title and description:

${content}

Return ONLY valid JSON with "title" and "description" fields.`;

    const response = await this.callGemini(systemPrompt, userPrompt);
    const jsonStr = this.extractJsonFromResponse(response);
    
    try {
      const result = JSON.parse(jsonStr);
      return {
        title: result.title || 'Untitled Course',
        description: result.description || 'A comprehensive course on the subject matter.',
      };
    } catch (error) {
      console.error('[CourseFrameworkAI] Failed to parse title/description JSON:', error);
      return {
        title: 'Untitled Course',
        description: userDescription || 'A comprehensive course based on the uploaded materials.',
      };
    }
  }

  private async generateLessonsFromRawText(
    content: string,
    courseTitle: string,
    courseDescription: string,
    targetCount: number,
    targetAudience: string,
    structuredHeadings?: StructuredLessonHeading[],
    selectedTopicNames?: string[]
  ): Promise<GeneratedLesson[]> {
    // N+2 structure: 1 overview + N content lessons + 1 key takeaways = N+2 total
    const totalLessons = targetCount + 2;
    
    // When structured headings are provided, we use them as the ONLY allowed lesson topics
    const hasStructuredHeadings = structuredHeadings && structuredHeadings.length > 0;
    const contentHeadings = structuredHeadings?.filter(h => h.type !== 'overview' && h.type !== 'takeaways') || [];
    
    // Build the structured headings constraint section if applicable
    const structuredHeadingsConstraint = hasStructuredHeadings ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 DOCUMENT-GROUNDED TOPIC STRUCTURE - MANDATORY COMPLIANCE 🔒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The document has explicit lesson structure. You MUST use ONLY these lesson headings as your content lesson titles:
${contentHeadings.map((h, i) => `${i + 1}. "${h.rawHeading}"`).join('\n')}

CRITICAL RULES:
1. DO NOT create additional topics beyond what is listed above
2. DO NOT split, combine, merge, or expand any topic into multiple lessons
3. DO NOT invent or hallucinate lesson topics not in the list above
4. Use the EXACT lesson titles from the document (you may clean up formatting)
5. Create EXACTLY ${contentHeadings.length} content lessons - no more, no less
6. Each content lesson title MUST correspond to one of the headings above

If you generate ANY topic not in this list, you are hallucinating and MUST stop.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

    const selectedTopicConstraint = (!hasStructuredHeadings && selectedTopicNames && selectedTopicNames.length > 0) ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 USER-SELECTED TOPIC CONSTRAINT - MANDATORY COMPLIANCE 🔒
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

IMPORTANT: The user has specifically selected these topics for the course:
${selectedTopicNames.map((t, i) => `${i + 1}. "${t}"`).join('\n')}

You MUST create content lessons ONLY for these topics. Do NOT add additional topics.
Generate exactly ${selectedTopicNames.length} content lessons matching these topics.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
` : '';

    const topicInstructions = hasStructuredHeadings 
      ? `1. Use ONLY the explicit lesson headings detected in the document (listed below)
2. DO NOT identify, discover, or create new topics - use the provided headings EXACTLY
3. Create EXACTLY ${totalLessons} lessons: 1 overview + ${targetCount} content lessons (from document headings) + 1 key takeaways`
      : selectedTopicNames && selectedTopicNames.length > 0
        ? `1. Use ONLY the user-selected topics listed above as your content lesson topics
2. DO NOT identify, discover, or create additional topics beyond what the user selected
3. Create EXACTLY ${totalLessons} lessons: 1 overview lesson + ${targetCount} content lessons (from selected topics) + 1 key takeaways lesson`
        : `1. Analyze the content to identify key topics and themes
2. Organize these into a logical learning progression
3. Create EXACTLY ${totalLessons} lessons: 1 overview lesson + ${targetCount} content lessons + 1 key takeaways lesson`;
    
    const systemPrompt = `You are an expert instructional designer creating a comprehensive course curriculum with enriched educational metadata.

Course: ${courseTitle}
Description: ${courseDescription}
Target Audience: ${targetAudience}
Content Lessons Requested: ${targetCount}
Total Lessons to Generate: ${totalLessons} (1 overview + ${targetCount} content lessons + 1 key takeaways)
${structuredHeadingsConstraint}${selectedTopicConstraint}
IMPORTANT INSTRUCTIONS:
${topicInstructions}
4. The FIRST lesson (index 0) MUST be a course overview/introduction that summarizes ALL content lessons - set isOverview: true
5. Lessons 1 through ${targetCount} are CONTENT lessons based on the source document topics
6. The LAST lesson (index ${targetCount + 1}) MUST be a "Key Takeaways" lesson that summarizes the most important points from ALL content lessons
7. Include structured learning objectives using Bloom's Taxonomy with specific levels
8. Ensure lessons are appropriate for ${targetAudience} level learners
9. Identify prerequisites by referencing earlier lesson indices

Bloom's Taxonomy Levels (use these exact values for bloomLevel):
- "remember": define, identify, list, name, recall, recognize, state
- "understand": describe, explain, summarize, interpret, classify, compare, paraphrase
- "apply": apply, demonstrate, implement, solve, use, execute, illustrate
- "analyze": analyze, compare, contrast, differentiate, examine, organize, deconstruct
- "evaluate": evaluate, assess, critique, justify, recommend, judge, defend
- "create": create, design, develop, formulate, construct, produce, compose

Each lesson MUST include:
- 3-5 structured learning objectives with Bloom's level and optional assessment ideas
- A detailed 2-3 paragraph summary explaining the topic in depth
- 3-8 key terms/vocabulary
- 2-4 formative assessment suggestions
- Estimated duration in minutes (typically 30-90 minutes)
- Prerequisite lesson indices (which earlier lessons should be completed first)
- sourceContent: The exact relevant text/content from the source document that this lesson covers. Include all important details, examples, and explanations from the original content. This should be comprehensive - typically 500-2000 words depending on the topic's complexity.

Return as JSON array with this EXACT structure:
[
  {
    "title": "Lesson title",
    "description": "Brief 2-3 sentence description",
    "objectives": ["Simple objective string 1", "Simple objective string 2"],
    "isOverview": true,
    "detailedSummary": "A rich 2-3 paragraph narrative explaining what this topic covers, why it matters, and what learners will gain. This should be comprehensive enough to give learners a clear understanding of the scope and importance of the material.",
    "learningObjectives": [
      {"bloomLevel": "understand", "objective": "Explain the core principles of the topic", "assessmentIdea": "Short quiz on key concepts"},
      {"bloomLevel": "apply", "objective": "Demonstrate practical application of techniques", "assessmentIdea": "Hands-on exercise"}
    ],
    "keyTerms": ["term1", "term2", "term3"],
    "assessmentIdeas": ["Quiz on key concepts", "Case study analysis", "Discussion prompts"],
    "estimatedDurationMinutes": 45,
    "prerequisiteIndices": [],
    "sourceContent": "The exact relevant text/content from the source document that this lesson should cover. Include all important details, examples, and explanations from the original content. This should be comprehensive - typically 500-2000 words depending on the topic's complexity."
  },
  {
    "title": "Second lesson title",
    "description": "Brief description",
    "objectives": ["Objective 1", "Objective 2"],
    "isOverview": false,
    "detailedSummary": "Detailed explanation...",
    "learningObjectives": [
      {"bloomLevel": "remember", "objective": "Identify key components", "assessmentIdea": "Matching exercise"}
    ],
    "keyTerms": ["term1", "term2"],
    "assessmentIdeas": ["Quick check questions"],
    "estimatedDurationMinutes": 60,
    "prerequisiteIndices": [0],
    "sourceContent": "Extract the specific portion of the source document relevant to this lesson..."
  }
]

CRITICAL REQUIREMENTS:
- The first lesson (index 0) MUST have isOverview: true and be a comprehensive course introduction
- The last lesson (index ${targetCount + 1}) MUST be titled "Key Takeaways" or similar and summarize all key learnings
- All middle lessons (indices 1 through ${targetCount}) are CONTENT lessons from the source document
- bloomLevel MUST be one of: "remember", "understand", "apply", "analyze", "evaluate", "create"
- prerequisiteIndices should reference earlier lessons by their array index (0-based)

SOURCE CONTENT EXTRACTION (MANDATORY):
- sourceContent MUST contain the ACTUAL TEXT from the source document, NOT a summary or paraphrase
- Copy the exact relevant paragraphs/sections from the document for each lesson
- Each lesson's sourceContent should be 200-2000 words of VERBATIM document content
- Do NOT generate or hallucinate content - only extract what exists in the document
- If a topic is mentioned briefly in the document, include all related text even if short
- Mark lessons where source content is less than 200 words with a warning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 ZERO HALLUCINATION POLICY - ABSOLUTE MANDATORY COMPLIANCE 🔴
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CRITICAL VERBATIM EXTRACTION REQUIREMENTS:
1. ${ZERO_HALLUCINATION_CONSTRAINTS.source_only}
2. ${ZERO_HALLUCINATION_CONSTRAINTS.traceable}
3. ${ZERO_HALLUCINATION_CONSTRAINTS.indicate_gaps}
4. ${ZERO_HALLUCINATION_CONSTRAINTS.no_external}
5. ${ZERO_HALLUCINATION_CONSTRAINTS.verbatim_preferred}

SOURCE CONTENT EXTRACTION (STRICTLY ENFORCED):
- The sourceContent field MUST contain EXACT VERBATIM TEXT copied directly from the source document
- COPY-PASTE the relevant paragraphs/sections exactly as they appear in the source
- DO NOT paraphrase, rephrase, summarize, or reword ANY facts, statistics, claims, or definitions
- If specific numbers, percentages, dates, or quotes appear in the source, copy them EXACTLY
- NEVER fabricate examples, case studies, statistics, or facts not explicitly in the source
- NEVER use your training data or external knowledge to supplement the source

⚠️ SELF-VERIFICATION CHECKLIST (MANDATORY):
Before finalizing EACH lesson, verify:
☐ "Can I point to the EXACT paragraph in the source where this text appears?"
☐ "Have I copied the source text VERBATIM rather than paraphrasing?"
☐ "Am I adding ANY information not explicitly stated in the source document?"
☐ "If the source lacks detail on a topic, am I indicating the gap rather than filling it?"

If you cannot check ALL boxes, you are hallucinating. STOP and revise.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

    const userPrompt = `Analyze the following document content and create ${targetCount} well-structured, enriched lessons:

${content}

Return ONLY a valid JSON array of lesson objects with all the enriched fields specified.`;

    const response = await this.callGemini(systemPrompt, userPrompt);
    const jsonStr = this.extractJsonFromResponse(response);
    
    try {
      interface RawLesson {
        title?: string;
        description?: string;
        objectives?: string[];
        isOverview?: boolean;
        detailedSummary?: string;
        learningObjectives?: Array<{
          bloomLevel?: string;
          objective?: string;
          assessmentIdea?: string;
        }>;
        keyTerms?: string[];
        assessmentIdeas?: string[];
        estimatedDurationMinutes?: number;
        prerequisiteIndices?: number[];
        sourceDocumentId?: string | null;
        sourceContent?: string;
      }
      
      const parsedLessons = JSON.parse(jsonStr) as RawLesson[];
      const safeParsedLessons = Array.isArray(parsedLessons) ? parsedLessons : [];
      const expectedTotalLessons = targetCount + 2;

      const normalizeForComparison = (value: string) => value.toLowerCase().trim().replace(/\s+/g, ' ');
      const selectedTopicList = (selectedTopicNames || []).map(topic => topic.trim()).filter(Boolean);

      const pickOverview = (): RawLesson | null => {
        if (safeParsedLessons.length === 0) return null;
        return (
          safeParsedLessons.find((lesson, idx) =>
            lesson.isOverview === true ||
            idx === 0 ||
            normalizeForComparison(lesson.title || '').includes('overview')
          ) || null
        );
      };

      const pickKeyTakeaways = (): RawLesson | null => {
        if (safeParsedLessons.length === 0) return null;
        return (
          safeParsedLessons.find((lesson, idx) =>
            normalizeForComparison(lesson.title || '').includes('key takeaway') ||
            normalizeForComparison(lesson.title || '').includes('takeaways') ||
            idx === safeParsedLessons.length - 1
          ) || null
        );
      };

      const fallbackRawLesson = (type: 'overview' | 'content' | 'key_takeaways', titleHint?: string): RawLesson => {
        if (type === 'overview') {
          return {
            title: titleHint || `Course Overview: ${courseTitle}`,
            description: `Introduction to ${courseTitle}.`,
            objectives: [],
            isOverview: true,
            detailedSummary: courseDescription || `Overview of ${courseTitle}.`,
            learningObjectives: [],
            keyTerms: [],
            assessmentIdeas: [],
            estimatedDurationMinutes: 30,
            prerequisiteIndices: [],
            sourceContent: '',
          };
        }

        if (type === 'key_takeaways') {
          return {
            title: 'Key Takeaways',
            description: 'Summary of the most important concepts from the course.',
            objectives: [],
            isOverview: false,
            detailedSummary: 'Consolidates the core concepts and practical actions from the full course.',
            learningObjectives: [],
            keyTerms: [],
            assessmentIdeas: [],
            estimatedDurationMinutes: 30,
            prerequisiteIndices: [0],
            sourceContent: '',
          };
        }

        return {
          title: titleHint || 'Content Lesson',
          description: `Learning module focused on ${titleHint || 'the selected topic'}.`,
          objectives: [],
          isOverview: false,
          detailedSummary: '',
          learningObjectives: [],
          keyTerms: [],
          assessmentIdeas: [],
          estimatedDurationMinutes: 45,
          prerequisiteIndices: [0],
          sourceContent: '',
        };
      };

      const overviewLesson = pickOverview() || fallbackRawLesson('overview');
      const keyTakeawaysLesson = pickKeyTakeaways() || fallbackRawLesson('key_takeaways');
      const candidateContentLessons = safeParsedLessons.filter(
        lesson => lesson !== overviewLesson && lesson !== keyTakeawaysLesson
      );

      let normalizedLessons: RawLesson[];
      if (selectedTopicList.length > 0) {
        const usedCandidateIndices = new Set<number>();
        const selectedContentLessons = selectedTopicList.map((topicName) => {
          const normalizedTopic = normalizeForComparison(topicName);
          let bestIdx = -1;
          let bestScore = 0;

          for (let i = 0; i < candidateContentLessons.length; i++) {
            if (usedCandidateIndices.has(i)) continue;
            const candidate = candidateContentLessons[i];
            const normalizedCandidateTitle = normalizeForComparison(candidate.title || '');
            const score =
              normalizedCandidateTitle.includes(normalizedTopic) || normalizedTopic.includes(normalizedCandidateTitle)
                ? 1
                : this.calculateSimilarity(normalizedCandidateTitle, normalizedTopic);
            if (score > bestScore) {
              bestScore = score;
              bestIdx = i;
            }
          }

          if (bestIdx >= 0 && bestScore >= 0.35) {
            usedCandidateIndices.add(bestIdx);
            return {
              ...candidateContentLessons[bestIdx],
              title: topicName,
              isOverview: false,
            };
          }

          return fallbackRawLesson('content', topicName);
        });

        normalizedLessons = [
          { ...overviewLesson, isOverview: true },
          ...selectedContentLessons,
          { ...keyTakeawaysLesson, isOverview: false, title: 'Key Takeaways' },
        ];
      } else {
        const selectedContentLessons = candidateContentLessons.slice(0, targetCount);
        while (selectedContentLessons.length < targetCount) {
          selectedContentLessons.push(fallbackRawLesson('content', `Lesson ${selectedContentLessons.length + 1}`));
        }
        normalizedLessons = [
          { ...overviewLesson, isOverview: true },
          ...selectedContentLessons,
          { ...keyTakeawaysLesson, isOverview: false, title: 'Key Takeaways' },
        ];
      }

      if (normalizedLessons.length !== expectedTotalLessons) {
        normalizedLessons = normalizedLessons.slice(0, expectedTotalLessons);
        while (normalizedLessons.length < expectedTotalLessons) {
          normalizedLessons.splice(
            Math.max(1, normalizedLessons.length - 1),
            0,
            fallbackRawLesson('content', `Lesson ${normalizedLessons.length}`)
          );
        }
      }

      console.log(
        `[CourseFrameworkAI] Parsed ${safeParsedLessons.length} lessons from AI response; normalized to ${normalizedLessons.length} lessons ` +
        `(expected: 1 overview + ${targetCount} content + 1 key_takeaways)`
      );

      const lessonIds: string[] = normalizedLessons.map(() => randomUUID());
      
      return normalizedLessons.map((lesson, index): GeneratedLesson => {
        // N+2 structure: Overview (index 0), Content (indices 1 to N), Key Takeaways (index N+1)
        // With N content lessons requested, we have N+2 total lessons
        const isOverview = index === 0;
        const isKeyTakeaways = index === normalizedLessons.length - 1;
        const isContentLesson = !isOverview && !isKeyTakeaways;
        
        // Set default bloom level based on lesson type:
        // - Overview & Key Takeaways: "remember" (lower-order taxonomy for summaries)
        // - Content lessons: "understand" (default higher-order for learning)
        const defaultBloomLevel: BloomsLevel = (isOverview || isKeyTakeaways) ? 'remember' : 'understand';
        
        const enrichedLearningObjectives: LearningObjective[] = (lesson.learningObjectives || []).map(obj => ({
          id: randomUUID(),
          bloomLevel: normalizeBloomLevel(obj.bloomLevel, defaultBloomLevel),
          objective: obj.objective || '',
          assessmentIdea: obj.assessmentIdea,
        }));

        const prerequisiteTopicIds = (lesson.prerequisiteIndices || [])
          .filter(i => i >= 0 && i < index && i < lessonIds.length)
          .map(i => lessonIds[i]);

        // Determine lessonType based on position:
        // - First lesson (index 0): overview - AI-generated course introduction
        // - Last lesson (index N+1): key_takeaways - AI-generated summary of all content
        // - Middle lessons (indices 1 to N): content - from source document topics
        const lessonType: 'overview' | 'content' | 'key_takeaways' = isOverview 
          ? 'overview' 
          : isKeyTakeaways 
            ? 'key_takeaways' 
            : 'content';

        console.log(`[CourseFrameworkAI] Lesson ${index + 1}/${normalizedLessons.length}: "${lesson.title}" -> type=${lessonType}`);

        return {
          title: lesson.title || `Lesson ${index + 1}`,
          description: lesson.description || '',
          objectives: Array.isArray(lesson.objectives) ? lesson.objectives : [],
          isFromContent: isContentLesson, // Only content lessons are from source content
          isSelected: true,
          sourceDocumentId: lesson.sourceDocumentId || null,
          isOverview: isOverview,
          lessonType: lessonType,
          detailedSummary: lesson.detailedSummary || '',
          learningObjectives: enrichedLearningObjectives.length > 0 ? enrichedLearningObjectives : undefined,
          keyTerms: Array.isArray(lesson.keyTerms) ? lesson.keyTerms : undefined,
          assessmentIdeas: Array.isArray(lesson.assessmentIdeas) ? lesson.assessmentIdeas : undefined,
          estimatedDurationMinutes: lesson.estimatedDurationMinutes || undefined,
          prerequisiteTopicIds: prerequisiteTopicIds.length > 0 ? prerequisiteTopicIds : undefined,
          sourceContent: lesson.sourceContent || '',
        };
      });
    } catch (error) {
      console.error('[CourseFrameworkAI] Failed to parse lessons JSON:', error);
      throw new Error('Failed to generate lessons from content. Please try again.');
    }
  }

  private async generateRecommendedLessons(
    courseTitle: string,
    courseDescription: string,
    existingLessons: GeneratedLesson[],
    targetAudience: string
  ): Promise<RecommendedLesson[]> {
    const existingTitles = existingLessons.map(l => l.title).join(', ');

    const systemPrompt = `You are an expert instructional designer. Based on the course content, recommend 2-3 additional lessons that would enhance the course based on industry best practices.

These recommended lessons should:
- Fill gaps in the curriculum
- Add value beyond the uploaded content
- Follow best practices for ${targetAudience} level courses
- Be clearly marked as AI-recommended additions

Include a rationale explaining WHY each lesson would benefit the course.

IMPORTANT: Include a disclaimer that these are AI-generated suggestions and should be reviewed.

Return as JSON array:
[
  {
    "title": "Recommended lesson title",
    "description": "2-3 sentence description",
    "objectives": ["Objective 1", "Objective 2", "Objective 3"],
    "rationale": "Why this lesson would benefit the course..."
  }
]`;

    const userPrompt = `Course: ${courseTitle}
Description: ${courseDescription}
Target Audience: ${targetAudience}

Existing lessons: ${existingTitles}

Recommend 2-3 additional lessons that would complement and enhance this course.
Return ONLY valid JSON array.`;

    const response = await this.callGemini(systemPrompt, userPrompt);
    const jsonStr = this.extractJsonFromResponse(response);
    
    try {
      const recommendations = JSON.parse(jsonStr) as RecommendedLesson[];
      
      return recommendations.map(rec => ({
        title: rec.title || 'Recommended Lesson',
        description: rec.description || '',
        objectives: Array.isArray(rec.objectives) ? rec.objectives : [],
        rationale: rec.rationale || 'AI-recommended based on best practices.',
      }));
    } catch (error) {
      console.error('[CourseFrameworkAI] Failed to parse recommendations JSON:', error);
      return [];
    }
  }

  async generateLearningObjectives(
    lessonTitle: string,
    lessonContent: string,
    targetLevel?: BloomsLevel
  ): Promise<string[]> {
    const levelDescription = targetLevel 
      ? `the ${targetLevel} level`
      : 'understand and apply levels';

    const bloomsReference = Object.entries(this.BLOOMS_LEVELS)
      .map(([level, verbs]) => `${level}: ${verbs.join(', ')}`)
      .join('\n');

    const systemPrompt = `You are an expert in instructional design specializing in Bloom's Taxonomy.

Generate 3-5 learning objectives for the lesson that:
- Start with an action verb from ${levelDescription}
- Are specific and measurable
- Are achievable within the lesson scope
- Follow the SMART criteria (Specific, Measurable, Achievable, Relevant, Time-bound)

Bloom's Taxonomy action verbs by level:
${bloomsReference}

${targetLevel ? `Focus on the "${targetLevel}" level verbs.` : 'Use a mix of "understand" and "apply" level verbs.'}

Return as JSON array of strings.
Example: ["Explain the key principles of...", "Apply the methodology to...", "Analyze the relationship between..."]`;

    const contentSummary = lessonContent.length > 2000 
      ? await this.summarizeIfNeeded(lessonContent, 500)
      : lessonContent;

    const userPrompt = `Lesson Title: ${lessonTitle}

Lesson Content:
${contentSummary}

Generate 3-5 learning objectives as a JSON array of strings.`;

    const response = await this.callGemini(systemPrompt, userPrompt);
    const jsonStr = this.extractJsonFromResponse(response);
    
    try {
      const objectives = JSON.parse(jsonStr);
      if (Array.isArray(objectives)) {
        return objectives.filter(obj => typeof obj === 'string' && obj.length > 0);
      }
      throw new Error('Response is not an array');
    } catch (error) {
      console.error('[CourseFrameworkAI] Failed to parse objectives JSON:', error);
      
      const fallbackObjectives = [
        `Understand the key concepts of ${lessonTitle}`,
        `Apply the principles learned in practical scenarios`,
        `Analyze and evaluate different approaches to ${lessonTitle.toLowerCase()}`,
      ];
      return fallbackObjectives;
    }
  }

  async getAdvisorHint(context: AdvisorContext): Promise<AdvisorHint> {
    const { currentStep, courseDescription, generatedTitle, generatedLessons, documentCount } = context;

    const stepGuidance: Record<string, string> = {
      upload: 'Provide tips for document upload and content preparation.',
      select_content: 'Provide tips for selecting and organizing content sections.',
      generate: 'Provide tips for reviewing and customizing generated lessons.',
      review: 'Provide tips for final review before course creation.',
      complete: 'Provide next steps after course framework is complete.',
    };

    const systemPrompt = `You are a helpful course design advisor. Provide ONE concise, actionable tip based on the current wizard step.

Current step: ${currentStep}
Guidance focus: ${stepGuidance[currentStep] || 'Provide general course design advice.'}

Your response should:
- Be brief (1-2 sentences)
- Be actionable and specific
- Be encouraging
- NOT hallucinate or invent information not provided

Respond with JSON: {"type": "suggestion|warning|best_practice|missing_content", "message": "...", "actionSuggestion": "..."}`;

    const contextSummary = [
      documentCount !== undefined ? `Documents uploaded: ${documentCount}` : null,
      courseDescription ? `Course description provided: Yes` : `Course description: Not yet provided`,
      generatedTitle ? `Generated title: ${generatedTitle}` : null,
      generatedLessons ? `Lessons generated: ${generatedLessons.length}` : null,
    ].filter(Boolean).join('\n');

    const userPrompt = `Current context:
${contextSummary}

Provide a helpful tip for this step of the course creation wizard.`;

    try {
      const response = await this.callGemini(systemPrompt, userPrompt);
      const jsonStr = this.extractJsonFromResponse(response);
      const hint = JSON.parse(jsonStr) as AdvisorHint;
      
      return {
        type: hint.type || 'suggestion',
        message: hint.message || 'Continue building your course framework.',
        actionSuggestion: hint.actionSuggestion,
      };
    } catch (error) {
      console.error('[CourseFrameworkAI] Failed to generate advisor hint:', error);
      
      const fallbackHints: Record<string, AdvisorHint> = {
        upload: {
          type: 'suggestion',
          message: 'Upload Word (.docx) or PowerPoint (.pptx) files containing your course content.',
          actionSuggestion: 'Start by uploading your most comprehensive document first.',
        },
        select_content: {
          type: 'best_practice',
          message: 'Review the extracted content and select sections most relevant to your learning objectives.',
        },
        generate: {
          type: 'suggestion',
          message: 'Review the generated lessons and adjust titles or descriptions as needed.',
          actionSuggestion: 'Ensure each lesson has clear, measurable learning objectives.',
        },
        review: {
          type: 'best_practice',
          message: 'Take a final look at the course structure before creating the course.',
        },
        complete: {
          type: 'suggestion',
          message: 'Your course framework is ready! You can now create the full course.',
        },
      };
      
      return fallbackHints[currentStep] || {
        type: 'suggestion',
        message: 'Continue building your course framework.',
      };
    }
  }

  async regenerateLessonObjectives(
    lesson: GeneratedLesson,
    targetLevel?: BloomsLevel
  ): Promise<string[]> {
    const content = `${lesson.title}\n\n${lesson.description}`;
    return this.generateLearningObjectives(lesson.title, content, targetLevel);
  }

  // Generate course description from raw document text
  async generateCourseDescription(
    rawText: string, 
    existingTitle?: string,
    userContext?: {
      userDescription?: string;
      targetAudience?: 'beginner' | 'intermediate' | 'advanced';
    }
  ): Promise<string> {
    console.log(`[CourseFrameworkAI] Generating course description from ${rawText.length} chars`);

    const summarizedContent = await this.summarizeIfNeeded(rawText, this.MAX_SUMMARY_TOKENS);

    // Build user context section if provided
    let userContextSection = '';
    if (userContext?.userDescription || userContext?.targetAudience) {
      userContextSection = '\n\nUSER-PROVIDED CONTEXT (IMPORTANT - incorporate these requirements):';
      if (userContext.userDescription) {
        userContextSection += `\n- User's description/notes: "${userContext.userDescription}"`;
      }
      if (userContext.targetAudience) {
        const audienceDescriptions: Record<string, string> = {
          beginner: 'Beginners with little to no prior knowledge',
          intermediate: 'Learners with some foundational knowledge',
          advanced: 'Advanced learners seeking to deepen their expertise',
        };
        userContextSection += `\n- Target audience: ${audienceDescriptions[userContext.targetAudience] || userContext.targetAudience}`;
      }
      userContextSection += '\n\nMake sure the generated description reflects these user requirements.';
    }

    const systemPrompt = `You are an expert course designer. Generate a compelling, professional course description based on the provided content.

The description should:
- Be 2-4 sentences long
- Clearly communicate the course value proposition
- Highlight key learning outcomes
- Be engaging and motivating for potential learners
- Use professional but accessible language
${userContext?.targetAudience ? `- Be tailored for ${userContext.targetAudience}-level learners` : ''}
${userContext?.userDescription ? `- Incorporate the user's notes and requirements` : ''}

${existingTitle ? `The course is titled: "${existingTitle}"` : ''}

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided source text. Do not add any information not present in the source.
- Every statement must be traceable to the source document.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.
- DO NOT invent topics, features, or claims not explicitly in the source material.

Return ONLY the description text, no JSON or formatting.`;

    const userPrompt = `Based on the following content, generate a compelling course description:
${userContextSection}

DOCUMENT CONTENT:
${summarizedContent}`;

    const response = await this.callGemini(systemPrompt, userPrompt);
    return response.trim();
  }

  private extractHeadingLikeLines(rawText: string): string[] {
    return rawText
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line.length >= 4 && line.length <= 120)
      .filter(line => !/^[\W_]+$/.test(line))
      .filter(line => !/^page\s+\d+$/i.test(line))
      .filter(line => !/^table of contents$/i.test(line))
      .filter(line => {
        const words = line.split(/\s+/).length;
        if (words <= 1) return false;
        return /^[A-Z0-9]/.test(line) || /^[0-9]+[\.\)]\s+/.test(line) || /^[A-Z][\w\s\-\(\)&:,]+$/.test(line);
      });
  }

  private estimateTopicWordCountsFromSource(
    rawText: string,
    topics: Array<{ name: string; estimatedWordCount: number }>,
    preferredChunks?: string[]
  ): Array<{ name: string; estimatedWordCount: number }> {
    if (topics.length === 0) return topics;

    const totalWords = rawText.split(/\s+/).filter(Boolean).length;
    if (totalWords === 0) {
      return topics.map(t => ({ ...t, estimatedWordCount: 0 }));
    }

    const stopWords = new Set([
      'lesson', 'module', 'chapter', 'section', 'topic', 'overview', 'content',
      'course', 'introduction', 'and', 'the', 'for', 'with', 'from', 'into',
    ]);

    const topicTokens = topics.map((topic) => {
      const normalized = this.normalizeForMatching(topic.name || '');
      return normalized
        .split(/\s+/)
        .filter(token => token.length > 2 && !stopWords.has(token));
    });

    const paragraphs = rawText
      .split(/\n{2,}/)
      .map(p => p.trim())
      .filter(Boolean);
    const lineChunks = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const chunks = (preferredChunks && preferredChunks.length > 0)
      ? preferredChunks.map(c => c.trim()).filter(Boolean)
      : (paragraphs.length > 1 ? paragraphs : lineChunks);

    const counts = new Array<number>(topics.length).fill(0);
    let assignedWords = 0;

    for (const chunk of chunks) {
      const chunkWords = chunk.split(/\s+/).filter(Boolean).length;
      if (chunkWords === 0) continue;
      const normalizedChunk = this.normalizeForMatching(chunk);
      if (!normalizedChunk) continue;

      const topicScores: Array<{ index: number; score: number }> = [];
      for (let i = 0; i < topics.length; i++) {
        const tokens = topicTokens[i];
        let tokenScore = 0;
        for (const token of tokens) {
          if (normalizedChunk.includes(token)) tokenScore += 1;
        }
        const similarityScore = this.calculateSimilarity(
          normalizedChunk.slice(0, 240),
          this.normalizeForMatching(topics[i].name).slice(0, 120)
        );
        const score = tokenScore + similarityScore;
        topicScores.push({ index: i, score });
      }

      if (topicScores.length === 0) continue;
      topicScores.sort((a, b) => b.score - a.score);
      const bestScore = topicScores[0].score;
      if (bestScore <= 0.2) continue;

      // Soft-assign chunk words to top-matching topics to avoid winner-take-all skew.
      const eligible = topicScores
        .filter((entry) => entry.score > 0.2 && entry.score >= bestScore * 0.6)
        .slice(0, 2);
      const totalEligibleScore = eligible.reduce((sum, entry) => sum + entry.score, 0);
      if (totalEligibleScore <= 0) continue;

      let distributed = 0;
      for (let i = 0; i < eligible.length; i++) {
        const entry = eligible[i];
        const isLast = i === eligible.length - 1;
        const chunkShare = isLast
          ? Math.max(0, chunkWords - distributed)
          : Math.max(0, Math.round(chunkWords * (entry.score / totalEligibleScore)));
        counts[entry.index] += chunkShare;
        distributed += chunkShare;
      }
      if (distributed > 0) {
        assignedWords += distributed;
      }
    }

    if (assignedWords === 0) {
      const even = Math.max(1, Math.floor(totalWords / topics.length));
      return topics.map(topic => ({ ...topic, estimatedWordCount: even }));
    }

    const remainingWords = Math.max(0, totalWords - assignedWords);
    if (remainingWords > 0) {
      // Distribute unassigned words with smoothing to prevent dominant-topic amplification.
      const base = counts.reduce((sum, n) => sum + (n + 1), 0) || topics.length;
      for (let i = 0; i < counts.length; i++) {
        const weight = base > 0 ? ((counts[i] + 1) / base) : (1 / counts.length);
        counts[i] += Math.round(remainingWords * weight);
      }
    }

    return topics.map((topic, idx) => ({
      ...topic,
      estimatedWordCount: Math.max(1, counts[idx] || 0),
    }));
  }

  private isWeakTopicLabel(name: string): boolean {
    const normalized = this.normalizeForMatching(name);
    if (!normalized) return true;
    return (
      /^lesson\s*\d+/i.test(name) ||
      /^module\s*\d+/i.test(name) ||
      /^chapter\s*\d+/i.test(name) ||
      /^course title and description$/i.test(name) ||
      /^overview of course content/i.test(name) ||
      /^topic\s+\d+$/i.test(name)
    );
  }

  private cleanTopicLabel(name: string): string {
    return String(name || '')
      .replace(/^\s*(lesson|module|chapter)\s*\d+\s*[:\-]\s*/i, '')
      .replace(/^\s*topic\s*\d+\s*[:\-]\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private enrichTopicQualityFromSource(
    rawText: string,
    topics: Array<{ name: string; estimatedWordCount: number }>
  ): Array<{
    name: string;
    estimatedWordCount: number;
    confidenceScore: number;
    evidenceSections: string[];
    directMatchedWords: number;
    relatedContextWords: number;
    isWeakTitle: boolean;
  }> {
    const headings = this.extractHeadingLikeLines(rawText);
    const totalWords = rawText.split(/\s+/).filter(Boolean).length || 1;
    return topics.map((topic) => {
      const topicName = this.cleanTopicLabel(topic.name);
      const normalizedTopic = this.normalizeForMatching(topicName);
      const scoredHeadings: Array<{ heading: string; score: number }> = [];
      for (const heading of headings) {
        const score = this.calculateSimilarity(
          normalizedTopic,
          this.normalizeForMatching(heading)
        );
        if (score > 0) scoredHeadings.push({ heading, score });
      }
      scoredHeadings.sort((a, b) => b.score - a.score);
      const bestHeading = scoredHeadings[0]?.heading || '';
      const bestScore = scoredHeadings[0]?.score || 0;

      const weakTitle = this.isWeakTopicLabel(topicName);
      const finalName = weakTitle && bestHeading && bestScore >= 0.42
        ? this.cleanTopicLabel(bestHeading)
        : topicName;

      const directMatchedWords = Math.max(0, topic.estimatedWordCount || 0);
      const relatedContextWords = Math.max(0, Math.round(directMatchedWords * 0.18));
      const topicTokens = normalizedTopic.split(/\s+/).filter(Boolean);
      const matchedTokenCount = topicTokens.filter(token => rawText.toLowerCase().includes(token)).length;
      const tokenCoverage = topicTokens.length > 0 ? (matchedTokenCount / topicTokens.length) : 0;
      const wordCoverage = Math.min(1, directMatchedWords / totalWords);
      const dominantTopicPenalty =
        topics.length >= 4 && wordCoverage >= 0.65
          ? Math.min(0.25, (wordCoverage - 0.65) * 0.7)
          : 0;
      const confidenceScore = Number(
        Math.max(
          0.08,
          Math.min(
            0.95,
            (weakTitle ? 0.22 : 0.34) + (bestScore * 0.38) + (tokenCoverage * 0.2) + (wordCoverage * 0.18) - dominantTopicPenalty
          )
        ).toFixed(2)
      );

      return {
        name: finalName || topic.name,
        estimatedWordCount: directMatchedWords,
        confidenceScore,
        evidenceSections: scoredHeadings.slice(0, 3).map(s => s.heading),
        directMatchedWords,
        relatedContextWords,
        isWeakTitle: weakTitle,
      };
    });
  }

  private buildSuggestedTitleFromSource(
    rawText: string,
    topics: Array<{ name: string; estimatedWordCount: number }>,
    aiSuggestedTitle?: string
  ): string {
    const cleanedAiTitle = String(aiSuggestedTitle || '').trim();
    if (cleanedAiTitle && !/^untitled course$/i.test(cleanedAiTitle)) {
      return cleanedAiTitle;
    }

    const headings = this.extractHeadingLikeLines(rawText)
      .map(h => h.replace(/^[0-9]+[\.\)]\s*/, '').trim())
      .filter(h => h.length >= 6);
    if (headings.length > 0) {
      return headings[0];
    }

    const primaryTopics = topics
      .map(t => t.name.trim())
      .filter(Boolean)
      .slice(0, 2);
    if (primaryTopics.length === 1) {
      return primaryTopics[0];
    }
    if (primaryTopics.length === 2) {
      return `${primaryTopics[0]} and ${primaryTopics[1]}`;
    }
    return 'Untitled Course';
  }

  // Analyze document content and identify key topics
  async analyzeDocumentTopics(
    rawText: string,
    options?: {
      structuredHeadings?: string[];
      sectionChunks?: Array<{ heading: string; content: string }>;
    }
  ): Promise<{
    topics: Array<{
      name: string;
      estimatedWordCount: number;
      confidenceScore?: number;
      evidenceSections?: string[];
      directMatchedWords?: number;
      relatedContextWords?: number;
      isWeakTitle?: boolean;
    }>;
    suggestedTitle: string;
    wordCount: number;
    wasContentTruncated: boolean;
  }> {
    const wordCount = rawText.split(/\s+/).filter(w => w.length > 0).length;
    const estimatedTokens = this.estimateTokens(rawText);
    console.log(`[CourseFrameworkAI] Analyzing document topics: ${rawText.length} chars, ${wordCount} words, ~${estimatedTokens} tokens`);

    // Use higher token limit specifically for topic analysis to prevent content loss
    const wasContentTruncated = estimatedTokens > this.MAX_TOPIC_ANALYSIS_TOKENS;
    const summarizedContent = await this.summarizeIfNeeded(rawText, this.MAX_TOPIC_ANALYSIS_TOKENS);
    
    if (wasContentTruncated) {
      console.log(`[CourseFrameworkAI] ⚠️ Large document was summarized for topic analysis: ${estimatedTokens} tokens -> ${this.MAX_TOPIC_ANALYSIS_TOKENS} tokens limit`);
    }

    const normalizedStructuredHeadings = Array.from(
      new Set(
        (options?.structuredHeadings || [])
          .map((h) => this.cleanTopicLabel(String(h || '').trim()))
          .filter((h) => h.length >= 4)
      )
    );

    const structuredHeadingsInstruction = normalizedStructuredHeadings.length > 0
      ? `\nSTRICT TOPIC GROUNDING:
- The source provides these extracted section headings: ${normalizedStructuredHeadings.map(h => `"${h}"`).join(', ')}
- Prefer these headings as the topic list.
- Do not invent topics outside this heading set unless a clearly separate section exists in the source text.`
      : '';

    const systemPrompt = `You are an expert curriculum designer. Analyze the provided educational content and identify:
1. The main topics covered (dynamic count based on source content depth) with an estimate of how many words of content relate to each topic
2. A suggested course title that captures the essence of the content

🔴 ZERO HALLUCINATION POLICY:
- Use ONLY the provided source text. Do not add any information not present in the source.
- Every statement must be traceable to the source document.
- If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.
- Topics MUST be explicitly mentioned or clearly covered in the source document.
- DO NOT invent topics that aren't present in the source material.
${structuredHeadingsInstruction}

For estimatedWordCount: Estimate how many words in the source document are relevant to each topic. This helps users understand content distribution. The sum of all topic word counts should approximately equal the total document word count.

Return as JSON: {"topics": [{"name": "Topic 1", "estimatedWordCount": 500}, {"name": "Topic 2", "estimatedWordCount": 300}], "suggestedTitle": "Course Title"}`;

    const userPrompt = `Analyze the following content (approximately ${wordCount} words total) and identify key topics with estimated word counts per topic:

${summarizedContent}

Return ONLY valid JSON.`;

    const response = await this.callGemini(systemPrompt, userPrompt);
    const jsonStr = this.extractJsonFromResponse(response);

    try {
      const result = JSON.parse(jsonStr);

      const topicCountFromResponse = Array.isArray(result.topics) ? result.topics.length : 0;
      const defaultPerTopicWords = topicCountFromResponse > 0
        ? Math.max(1, Math.floor(wordCount / topicCountFromResponse))
        : 0;

      // Normalize mixed/legacy topic payloads and tolerate malformed AI values.
      let topics: Array<{ name: string; estimatedWordCount: number }> = Array.isArray(result.topics)
        ? result.topics
            .map((topic: any) => {
              if (typeof topic === 'string') {
                return {
                  name: topic.trim(),
                  estimatedWordCount: defaultPerTopicWords,
                };
              }
              if (topic && typeof topic === 'object') {
                const parsedCount = Number.parseInt(String(topic.estimatedWordCount ?? ''), 10);
                return {
                  name: String(topic.name || '').trim(),
                  estimatedWordCount: Number.isFinite(parsedCount) && parsedCount > 0
                    ? parsedCount
                    : defaultPerTopicWords,
                };
              }
              return { name: '', estimatedWordCount: 0 };
            })
            .filter((t: { name: string; estimatedWordCount: number }) => t.name.length > 0)
        : [];

      // Dedupe by normalized name, preserving first occurrence.
      const seen = new Set<string>();
      topics = topics.filter(t => {
        const key = t.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Fallback: derive topics from document headings when AI returns no usable topics.
      if (topics.length === 0) {
        const headingLikeLines = rawText
          .split(/\r?\n/)
          .map(line => line.trim())
          .filter(line => line.length >= 4 && line.length <= 120)
          .filter(line => !/^[\W_]+$/.test(line))
          .filter(line => !/^page\s+\d+$/i.test(line))
          .filter(line => !/^table of contents$/i.test(line))
          .filter(line => {
            const words = line.split(/\s+/).length;
            if (words <= 1) return false;
            return /^[A-Z0-9]/.test(line) || /^[0-9]+[\.\)]\s+/.test(line) || /^[A-Z][\w\s\-\(\)&:,]+$/.test(line);
          });

        const uniqueHeadingTopics: string[] = [];
        const headingSeen = new Set<string>();
        for (const line of headingLikeLines) {
          const normalized = line.toLowerCase();
          if (headingSeen.has(normalized)) continue;
          headingSeen.add(normalized);
          uniqueHeadingTopics.push(line);
          if (uniqueHeadingTopics.length >= 8) break;
        }

        if (uniqueHeadingTopics.length > 0) {
          const perTopicWords = Math.max(1, Math.floor(wordCount / uniqueHeadingTopics.length));
          topics = uniqueHeadingTopics.map(name => ({
            name,
            estimatedWordCount: perTopicWords,
          }));
          console.log(`[CourseFrameworkAI] Topic analysis fallback used: ${topics.length} heading-derived topics`);
        }
      }

      // Last-resort fallback for unstructured content: still provide non-zero per-topic analysis.
      if (topics.length === 0 && wordCount > 0) {
        const fallbackCount = Math.min(6, Math.max(3, Math.floor(wordCount / 700)));
        const perTopicWords = Math.max(1, Math.floor(wordCount / fallbackCount));
        topics = Array.from({ length: fallbackCount }, (_, idx) => ({
          name: `Topic ${idx + 1}`,
          estimatedWordCount: perTopicWords,
        }));
        console.log(`[CourseFrameworkAI] Topic analysis fallback used: ${topics.length} generic topics for unstructured content`);
      }

      if (normalizedStructuredHeadings.length >= 2) {
        const headingTopics = normalizedStructuredHeadings.map((name) => ({
          name,
          estimatedWordCount: Math.max(1, Math.floor(wordCount / normalizedStructuredHeadings.length)),
        }));
        // Prefer structured headings as canonical topic candidates when explicit structure exists.
        topics = headingTopics;
      }

      const preferredChunks = Array.isArray(options?.sectionChunks)
        ? options!.sectionChunks
            .map((section) => `${section.heading || ''}\n${section.content || ''}`.trim())
            .filter(Boolean)
        : undefined;

      topics = this.estimateTopicWordCountsFromSource(rawText, topics, preferredChunks).map(topic => ({
        ...topic,
        name: this.cleanTopicLabel(topic.name) || topic.name,
      }));
      const enrichedTopics = this.enrichTopicQualityFromSource(rawText, topics);
      const dedupedTopics: typeof enrichedTopics = [];
      const seenNames = new Set<string>();
      for (const topic of enrichedTopics) {
        const key = this.normalizeForMatching(topic.name);
        if (!key || seenNames.has(key)) continue;
        seenNames.add(key);
        dedupedTopics.push(topic);
      }
      topics = dedupedTopics;
      const suggestedTitle = this.buildSuggestedTitleFromSource(rawText, topics, result.suggestedTitle);

      console.log(`[CourseFrameworkAI] Topic analysis complete: ${topics.length} topics found with per-topic word counts, source document had ${wordCount} words`);
      return {
        topics,
        suggestedTitle,
        wordCount,
        wasContentTruncated,
      };
    } catch (error) {
      console.error('[CourseFrameworkAI] Failed to parse topics JSON:', error);
      const headingLikeLines = this.extractHeadingLikeLines(rawText);
      const fallbackTopics = Array.from(new Set(headingLikeLines.map(line => line.toLowerCase())))
        .slice(0, 8)
        .map((normalizedName) => {
          const original = headingLikeLines.find(l => l.toLowerCase() === normalizedName) || normalizedName;
          return original;
        });
      const perTopicWords = fallbackTopics.length > 0
        ? Math.max(1, Math.floor(wordCount / fallbackTopics.length))
        : 0;

      let topics = fallbackTopics.map(name => ({ name, estimatedWordCount: perTopicWords }));
      if (topics.length === 0 && wordCount > 0) {
        const fallbackCount = Math.min(6, Math.max(3, Math.floor(wordCount / 700)));
        const genericPerTopicWords = Math.max(1, Math.floor(wordCount / fallbackCount));
        topics = Array.from({ length: fallbackCount }, (_, idx) => ({
          name: `Topic ${idx + 1}`,
          estimatedWordCount: genericPerTopicWords,
        }));
      }
      const preferredChunks = Array.isArray(options?.sectionChunks)
        ? options!.sectionChunks
            .map((section) => `${section.heading || ''}\n${section.content || ''}`.trim())
            .filter(Boolean)
        : undefined;
      topics = this.estimateTopicWordCountsFromSource(rawText, topics, preferredChunks).map(topic => ({
        ...topic,
        name: this.cleanTopicLabel(topic.name) || topic.name,
      }));
      const enrichedTopics = this.enrichTopicQualityFromSource(rawText, topics);
      const dedupedTopics: typeof enrichedTopics = [];
      const seenNames = new Set<string>();
      for (const topic of enrichedTopics) {
        const key = this.normalizeForMatching(topic.name);
        if (!key || seenNames.has(key)) continue;
        seenNames.add(key);
        dedupedTopics.push(topic);
      }
      topics = dedupedTopics;
      const suggestedTitle = this.buildSuggestedTitleFromSource(rawText, topics);

      return {
        topics,
        suggestedTitle,
        wordCount,
        wasContentTruncated,
      };
    }
  }

  /**
   * Generate supplementary content for a lesson that has insufficient source content.
   * Uses Gemini to create educational content based on lesson title, objectives, and course context.
   * 
   * NOTE: This method is used when source content is insufficient. It generates supplementary
   * content but includes anti-hallucination constraints to minimize fabrication.
   */
  async generateLessonContent(
    lessonTitle: string,
    lessonDescription: string,
    objectives: string[],
    courseTitle: string,
    courseDescription: string,
    targetWordCount: number,
    existingContent: string
  ): Promise<string> {
    const systemPrompt = `You are an expert educational content writer. Generate comprehensive, educational content for the following lesson.

COURSE CONTEXT:
- Course Title: ${courseTitle}
- Course Description: ${courseDescription}

LESSON TO EXPAND:
- Lesson Title: ${lessonTitle}
- Lesson Description: ${lessonDescription}
- Learning Objectives: ${objectives.join(', ')}

${existingContent ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
EXISTING SOURCE CONTENT (THIS IS YOUR PRIMARY SOURCE - EXPAND ON IT):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${existingContent}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate ADDITIONAL content that complements and expands on the existing material above.
${ZERO_HALLUCINATION_CONSTRAINTS.verbatim_preferred}
- PRESERVE the exact facts, terminology, and claims from the existing content
- Expand explanations around concepts ALREADY mentioned in the source
- DO NOT introduce new facts, statistics, or claims not supported by the existing content` : `⚠️ NO SOURCE CONTENT AVAILABLE
This is a supplementary lesson with no source document content.
Generate general educational content based ONLY on the lesson title and objectives.
${ZERO_HALLUCINATION_CONSTRAINTS.indicate_gaps}
- Clearly indicate when content is general educational material
- Avoid making specific claims about facts, statistics, or case studies`}

TARGET: Generate approximately ${targetWordCount} words of high-quality educational content.

REQUIREMENTS:
1. Content must be educational, informative, and directly relevant to the lesson title and objectives
2. Use clear explanations with practical examples where appropriate
3. Include key concepts, definitions, and actionable insights
4. Structure the content with clear paragraphs covering different aspects of the topic
5. Ensure content is appropriate for learners and supports the stated learning objectives
6. Do NOT include lesson titles, headers, or meta-commentary - just provide the educational content
7. Write in a professional, engaging educational tone

🔴 ANTI-HALLUCINATION REQUIREMENTS:
${ZERO_HALLUCINATION_CONSTRAINTS.no_external}
- If expanding on existing content, stay CLOSE to what the source says
- Do NOT fabricate specific statistics, research studies, or case studies
- If you need to provide examples, use generic/hypothetical ones and label them as such`;

    const userContent = `Generate the educational content for the lesson "${lessonTitle}" now. Provide approximately ${targetWordCount} words of educational material.`;

    const result = await this.callGemini(systemPrompt, userContent);

    console.log(`[CourseFrameworkAI] Generated ${result.split(/\s+/).length} words of content for lesson: ${lessonTitle}`);
    return result.trim();
  }

  /**
   * Validate generated lesson sourceContent against the original document.
   * Returns validation results with confidence scores.
   */
  validateLessonContent(lessons: GeneratedLesson[], originalDocumentContent: string): {
    validatedLessons: GeneratedLesson[];
    validationSummary: {
      totalLessons: number;
      passedValidation: number;
      failedValidation: number;
      averageConfidence: number;
    };
  } {
    const validatedLessons: GeneratedLesson[] = [];
    let totalConfidence = 0;
    let passedCount = 0;
    let failedCount = 0;

    for (const lesson of lessons) {
      const sourceContent = lesson.sourceContent || '';
      
      if (!sourceContent || sourceContent.length < 50) {
        validatedLessons.push({
          ...lesson,
          validationStatus: 'skipped',
          validationConfidence: 0,
          validationNote: 'Insufficient source content for validation',
        } as GeneratedLesson & { validationStatus: string; validationConfidence: number; validationNote: string });
        continue;
      }

      const validation = validateAgainstSource(sourceContent, originalDocumentContent);
      totalConfidence += validation.confidenceScore;

      if (validation.isValid) {
        passedCount++;
        validatedLessons.push({
          ...lesson,
          validationStatus: 'passed',
          validationConfidence: validation.confidenceScore,
        } as GeneratedLesson & { validationStatus: string; validationConfidence: number });
      } else {
        failedCount++;
        console.warn(`[CourseFrameworkAI] Lesson "${lesson.title}" failed validation with score ${validation.confidenceScore}. ` +
          `Potential hallucinations detected: ${validation.unsourcedClaims.length} unsourced claims`);
        validatedLessons.push({
          ...lesson,
          validationStatus: 'warning',
          validationConfidence: validation.confidenceScore,
          validationNote: `Low confidence (${Math.round(validation.confidenceScore * 100)}%). ` +
            `${validation.unsourcedClaims.length} phrases not found in source.`,
          unsourcedClaims: validation.unsourcedClaims.slice(0, 5),
        } as GeneratedLesson & { validationStatus: string; validationConfidence: number; validationNote: string; unsourcedClaims: any[] });
      }
    }

    const lessonsWithContent = lessons.filter(l => (l.sourceContent?.length || 0) >= 50).length;
    const averageConfidence = lessonsWithContent > 0 ? totalConfidence / lessonsWithContent : 0;

    return {
      validatedLessons,
      validationSummary: {
        totalLessons: lessons.length,
        passedValidation: passedCount,
        failedValidation: failedCount,
        averageConfidence: Math.round(averageConfidence * 100) / 100,
      },
    };
  }
}

export const courseFrameworkAIService = new CourseFrameworkAIService();
