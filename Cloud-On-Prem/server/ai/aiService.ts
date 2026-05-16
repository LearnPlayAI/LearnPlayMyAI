// DON'T DELETE THIS COMMENT
// Using blueprint: javascript_gemini
// Reusable AI service abstraction layer supporting multiple providers

import { GoogleGenAI } from "@google/genai";
import { IntegrationConfigService } from "../services/integrationConfigService";
import { db } from "../db";
import { aiConfig } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";
import { 
  type LearningAssetContract,
  deriveQuizQuestionsFromSlides,
} from "@shared/contentParsers";

export interface MatchPair {
  left: string;
  right: string;
}

export interface QuizQuestion {
  questionType: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank';
  question: string;
  answers?: string[]; // For multiple-choice and true-false
  correctIndex?: number; // For multiple-choice and true-false
  matchPairs?: MatchPair[]; // For match questions
  correctAnswer?: string; // For fill-blank questions
  objectiveId?: string; // Optional learning objective mapping id
  sourceAssetId?: string;
  imageKey?: string;
  imageAltText?: string;
  imageCaption?: string;
  selected?: boolean;
  slidePosition?: number; // Links question to source slide (optional for manual questions)
}

export interface QuestionTypeDistribution {
  multipleChoice: number; // Percentage 0-100
  trueFalse: number; // Percentage 0-100
  match: number; // Percentage 0-100
  fillBlank: number; // Percentage 0-100
}

export interface QuizGenerationParams {
  topic?: string; // Legacy support for single topic
  primaryTopic?: string; // New structured topic support
  subtopic1?: string;
  subtopic2?: string;
  numberOfQuestions: number;
  difficulty: 'easy' | 'medium' | 'hard';
  grade?: string;
  subject?: string;
  description?: string;
  curriculum?: string; // e.g., "CAPS", "IEB"
  questionTypeDistribution?: QuestionTypeDistribution;
  lessonContent?: string | null; // Actual lesson content from PPTX transcript for content-based generation
  forcedQuestionType?: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank';
  learningObjectives?: Array<{ id: string; objective: string; bloomLevel?: string }>;
  preferredObjectiveId?: string | null;
  visualAssets?: Array<{
    assetId: string;
    storageKey?: string;
    caption?: string | null;
    altText?: string | null;
    pageOrSlide?: number | null;
  }>;
}

function attachVisualAssetsToQuestions(
  questions: QuizQuestion[],
  visualAssets?: QuizGenerationParams["visualAssets"],
): QuizQuestion[] {
  const assets = Array.isArray(visualAssets)
    ? visualAssets.filter((asset) => String(asset?.assetId || "").trim())
    : [];
  if (assets.length === 0 || questions.length === 0) return questions;

  const byId = new Map(assets.map((asset) => [asset.assetId, asset]));
  let attachedAny = false;
  const withExplicitAssets = questions.map((question) => {
    const selectedAsset = question.sourceAssetId ? byId.get(question.sourceAssetId) : undefined;
    if (!selectedAsset) return question;
    attachedAny = true;
    return {
      ...question,
      imageKey: selectedAsset.storageKey,
      imageAltText: selectedAsset.altText || selectedAsset.caption || undefined,
      imageCaption: selectedAsset.caption || undefined,
    };
  });

  if (attachedAny) return withExplicitAssets;

  const firstAsset = assets[0];
  return withExplicitAssets.map((question, index) => index === 0
    ? {
        ...question,
        sourceAssetId: firstAsset.assetId,
        imageKey: firstAsset.storageKey,
        imageAltText: firstAsset.altText || firstAsset.caption || undefined,
        imageCaption: firstAsset.caption || undefined,
      }
    : question);
}

function validateObjectiveCoverage(params: {
  questions: QuizQuestion[];
  learningObjectives?: Array<{ id: string; objective: string; bloomLevel?: string }>;
  numberOfQuestions: number;
  preferredObjectiveId?: string | null;
}): { isValid: boolean; message: string } {
  const objectives = Array.isArray(params.learningObjectives)
    ? params.learningObjectives
        .map((obj) => ({
          id: String(obj?.id || "").trim(),
          objective: String(obj?.objective || "").trim(),
          bloomLevel: String(obj?.bloomLevel || "").trim(),
        }))
        .filter((obj) => obj.id && obj.objective)
    : [];

  if (!objectives.length) {
    return { isValid: true, message: "No structured learning objectives supplied for coverage validation." };
  }

  const validIds = new Set(objectives.map((obj) => obj.id));
  const invalidAssignments: number[] = [];
  const counts = new Map<string, number>();
  for (const q of params.questions) {
    const objectiveId = String(q?.objectiveId || "").trim();
    if (!objectiveId || !validIds.has(objectiveId)) {
      invalidAssignments.push((invalidAssignments.length + 1));
      continue;
    }
    counts.set(objectiveId, (counts.get(objectiveId) || 0) + 1);
  }

  const missingObjectives = objectives.filter((obj) => (counts.get(obj.id) || 0) === 0);
  const shouldRequireAllObjectives = params.numberOfQuestions >= objectives.length;
  const preferredObjectiveId = String(params.preferredObjectiveId || "").trim();
  const preferredMissing = preferredObjectiveId ? (counts.get(preferredObjectiveId) || 0) === 0 : false;

  if (!invalidAssignments.length && (!shouldRequireAllObjectives || missingObjectives.length === 0) && !preferredMissing) {
    return { isValid: true, message: "Learning objective coverage requirements satisfied." };
  }

  const missingList = missingObjectives
    .map((obj) => `${obj.id} (${obj.objective.slice(0, 80)})`)
    .join("; ");

  return {
    isValid: false,
    message: [
      invalidAssignments.length
        ? `One or more questions are missing a valid objectiveId from the provided objective list.`
        : null,
      shouldRequireAllObjectives && missingObjectives.length
        ? `Missing objective coverage for: ${missingList}`
        : null,
      preferredMissing
        ? `Preferred objective ${preferredObjectiveId} was not covered by regenerated question.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
  };
}

export interface QuizFromContractParams {
  learningAssetContract: LearningAssetContract;
  questionsPerSlide?: number;
  difficulty: 'easy' | 'medium' | 'hard';
  grade?: string;
  subject?: string;
  questionTypeDistribution?: QuestionTypeDistribution;
}

function isPlaceholderSecret(value?: string | null): boolean {
  const trimmed = String(value || '').trim();
  if (!trimmed) return true;
  return /^(your_|changeme|replace_me|example)/i.test(trimmed);
}

async function getConfiguredGeminiKey(): Promise<string | null> {
  let integrated: string | null = null;
  try {
    integrated = await IntegrationConfigService.getSecret('gemini', 'apiKey');
  } catch (error) {
    console.warn('[AIService] Integration Gemini secret unavailable; checking legacy aiConfig fallback:', error);
  }
  if (!isPlaceholderSecret(integrated)) return integrated;
  return null;
}

async function getLegacyGeminiConfig(purpose: 'text' | 'image'): Promise<{ apiKey: string; modelName: string } | null> {
  const [config] = await db
    .select({
      apiKey: aiConfig.apiKey,
      modelName: aiConfig.modelName,
    })
    .from(aiConfig)
    .where(and(
      eq(aiConfig.provider, 'gemini'),
      eq(aiConfig.purpose, purpose),
      eq(aiConfig.isActive, true),
    ))
    .orderBy(desc(aiConfig.updatedAt), desc(aiConfig.createdAt))
    .limit(1);

  const apiKey = String(config?.apiKey || '').trim();
  const modelName = String(config?.modelName || '').trim();
  if (!isValidGeminiApiKey(apiKey) || !modelName) return null;
  return { apiKey, modelName };
}

// ==================== ZERO HALLUCINATION VALIDATION ====================

export interface UnsouredClaim {
  claim: string;
  position: number;
  reason: string;
}

export interface ValidationResult {
  confidenceScore: number; // 0-1, where 1 means high confidence text is source-based
  unsourcedClaims: UnsouredClaim[];
  totalPhrases: number;
  matchedPhrases: number;
  isValid: boolean; // true if confidenceScore >= 0.7
}

// Zero-hallucination constraints to be included in AI prompts
export const ZERO_HALLUCINATION_CONSTRAINTS = {
  source_only: "Use ONLY the provided source text. Do not add any information not present in the source.",
  traceable: "Every statement must be traceable to the source document.",
  indicate_gaps: "If the source doesn't contain enough information, indicate gaps rather than filling with assumptions.",
  no_external: "DO NOT use external knowledge, facts, or information not explicitly stated in the source material.",
  verbatim_preferred: "When possible, use exact phrasing from the source document to maintain accuracy.",
};

/**
 * Validates that generated text is based on source text with zero hallucinations.
 * Checks if key phrases in generated text appear in source text.
 * 
 * @param generatedText - The AI-generated text to validate
 * @param sourceText - The original source text that should be the basis for generation
 * @returns ValidationResult with confidence score and list of potentially unsourced claims
 */
export function validateAgainstSource(
  generatedText: string,
  sourceText: string
): ValidationResult {
  if (!generatedText || !sourceText) {
    return {
      confidenceScore: 0,
      unsourcedClaims: [],
      totalPhrases: 0,
      matchedPhrases: 0,
      isValid: false,
    };
  }

  const normalizedSource = sourceText.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const normalizedGenerated = generatedText.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();

  // Extract significant phrases (3-6 word sequences) from generated text
  const words = normalizedGenerated.split(' ').filter(w => w.length > 2);
  const phrases: Array<{ phrase: string; position: number }> = [];
  
  // Extract 3-word, 4-word, and 5-word phrases
  for (let phraseLen = 3; phraseLen <= 5; phraseLen++) {
    for (let i = 0; i <= words.length - phraseLen; i += 2) { // Step by 2 to reduce overlap
      const phrase = words.slice(i, i + phraseLen).join(' ');
      // Skip common filler phrases
      if (!isFillerPhrase(phrase)) {
        phrases.push({ phrase, position: i });
      }
    }
  }

  if (phrases.length === 0) {
    return {
      confidenceScore: 1,
      unsourcedClaims: [],
      totalPhrases: 0,
      matchedPhrases: 0,
      isValid: true,
    };
  }

  // Check which phrases appear in source
  let matchedCount = 0;
  const unsourcedClaims: UnsouredClaim[] = [];

  for (const { phrase, position } of phrases) {
    if (normalizedSource.includes(phrase)) {
      matchedCount++;
    } else {
      // Check if individual significant words appear (partial match)
      const significantWords = phrase.split(' ').filter(w => w.length > 4);
      const wordMatchRatio = significantWords.filter(w => normalizedSource.includes(w)).length / Math.max(significantWords.length, 1);
      
      if (wordMatchRatio >= 0.5) {
        // Partial match - count as half
        matchedCount += 0.5;
      } else if (significantWords.length > 0) {
        // Only flag as unsourced if it contains significant words that aren't in source
        unsourcedClaims.push({
          claim: phrase,
          position,
          reason: 'Phrase not found in source text',
        });
      }
    }
  }

  // Limit unsourced claims to top 10 most significant
  const limitedUnsourcedClaims = unsourcedClaims.slice(0, 10);

  const confidenceScore = Math.min(1, matchedCount / phrases.length);
  
  return {
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    unsourcedClaims: limitedUnsourcedClaims,
    totalPhrases: phrases.length,
    matchedPhrases: Math.round(matchedCount),
    isValid: confidenceScore >= 0.7,
  };
}

/**
 * Checks if a phrase is a common filler/transitional phrase that shouldn't be validated
 */
function isFillerPhrase(phrase: string): boolean {
  const fillerPatterns = [
    'this is the', 'that is the', 'which is the', 'what is the',
    'here is the', 'there is the', 'there are the',
    'you will learn', 'you will be', 'you should be',
    'in this lesson', 'in this course', 'in this section',
    'the following are', 'the following is',
    'for example the', 'such as the',
    'based on the', 'according to the',
    'it is important', 'it is essential',
    'this section covers', 'this lesson covers',
    'by the end', 'at the end',
  ];
  
  return fillerPatterns.some(pattern => phrase.includes(pattern));
}

/**
 * Builds anti-hallucination prompt constraints for AI generation
 */
export function buildAntiHallucinationPrompt(sourceContent: string): string {
  return `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 ZERO HALLUCINATION POLICY - MANDATORY COMPLIANCE 🔴
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${ZERO_HALLUCINATION_CONSTRAINTS.source_only}
${ZERO_HALLUCINATION_CONSTRAINTS.traceable}
${ZERO_HALLUCINATION_CONSTRAINTS.indicate_gaps}
${ZERO_HALLUCINATION_CONSTRAINTS.no_external}
${ZERO_HALLUCINATION_CONSTRAINTS.verbatim_preferred}

⚠️ SELF-CHECK REQUIREMENT (MANDATORY):
Before generating ANY content, you MUST verify:
- "Can I point to the exact location in the source where this information appears?"
- "Am I adding any facts, examples, or context not in the source?"
- "If I'm uncertain, am I indicating the gap rather than guessing?"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SOURCE CONTENT (YOUR ONLY AUTHORIZED SOURCE):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${sourceContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF SOURCE - DO NOT USE INFORMATION FROM OUTSIDE THIS CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

type QuizGroundingFailure = {
  index: number;
  confidenceScore: number;
  lexicalCoverage: number;
  missingTokens: string[];
};

export class QuizGroundingValidationError extends Error {
  rejectedQuestions: QuizQuestion[];
  failures: QuizGroundingFailure[];

  constructor(message: string, rejectedQuestions: QuizQuestion[], failures: QuizGroundingFailure[]) {
    super(message);
    this.name = "QuizGroundingValidationError";
    this.rejectedQuestions = rejectedQuestions;
    this.failures = failures;
  }
}

function normalizeGroundingText(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeGroundingToken(token: string): string {
  let normalized = String(token || "").trim().toLowerCase();
  if (!normalized) return "";

  if (normalized.endsWith("ies") && normalized.length > 5) {
    normalized = `${normalized.slice(0, -3)}y`;
  } else if (normalized.endsWith("ing") && normalized.length > 6) {
    normalized = normalized.slice(0, -3);
  } else if (normalized.endsWith("ed") && normalized.length > 5) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith("es") && normalized.length > 5) {
    normalized = normalized.slice(0, -2);
  } else if (normalized.endsWith("s") && normalized.length > 4) {
    normalized = normalized.slice(0, -1);
  }

  return normalized;
}

function extractGroundingTokens(text: string): string[] {
  const stopwords = new Set([
    "about", "according", "across", "after", "among", "answer", "answers", "based", "below",
    "blank", "choose", "content", "correct", "course", "each", "false", "following", "from",
    "given", "identify", "instruction", "instructions", "lesson", "match", "matches", "matching",
    "pair", "pairs", "question", "questions", "review", "right", "select", "selected", "source",
    "statement", "statements", "student", "students", "target", "text", "that", "their", "there",
    "these", "this", "true", "type", "types", "using", "under", "which", "with", "without",
    "would", "your", "option", "options", "quiz", "quizzes", "fill", "multiple", "choice",
    "choices", "left",
  ]);

  const normalized = normalizeGroundingText(text);
  if (!normalized) return [];

  return Array.from(
    new Set(
      normalized
        .split(" ")
        .map((token) => canonicalizeGroundingToken(token))
        .filter((token) => token.length >= 5)
        .filter((token) => !/^\d+$/.test(token))
        .filter((token) => !stopwords.has(token))
    )
  );
}

function serializeQuestionForGrounding(question: QuizQuestion): string {
  const lines: string[] = [];
  lines.push(String(question.question || ""));

  if (Array.isArray(question.answers) && question.answers.length > 0) {
    lines.push(question.answers.join(" | "));
    if (typeof question.correctIndex === "number" && question.correctIndex >= 0 && question.correctIndex < question.answers.length) {
      lines.push(question.answers[question.correctIndex]);
    }
  }

  if (Array.isArray(question.matchPairs) && question.matchPairs.length > 0) {
    for (const pair of question.matchPairs) {
      lines.push(`${pair.left} -> ${pair.right}`);
    }
  }

  if (question.correctAnswer) {
    lines.push(question.correctAnswer);
  }

  return lines.filter(Boolean).join("\n");
}

function resolveGroundingAttemptBudget(
  envVarName: string,
  defaults: { onprem: number; cloud: number },
): number {
  const raw = Number(process.env[envVarName] || "");
  const fallback = process.env.ONPREM_MODE === "true" ? defaults.onprem : defaults.cloud;
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(1, Math.min(5, Math.floor(raw)));
}

function validateQuizQuestionsAgainstSource(
  questions: QuizQuestion[],
  sourceText: string,
): { isValid: boolean; failures: QuizGroundingFailure[]; message: string } {
  const sourceTokens = new Set(extractGroundingTokens(sourceText));
  const failures: QuizGroundingFailure[] = [];

  questions.forEach((question, index) => {
    const serialized = serializeQuestionForGrounding(question);
    const phraseValidation = validateAgainstSource(serialized, sourceText);
    const questionTokens = extractGroundingTokens(serialized);

    const missingTokens = questionTokens.filter((token) => !sourceTokens.has(token));
    const lexicalCoverage = questionTokens.length === 0
      ? 1
      : (questionTokens.length - missingTokens.length) / questionTokens.length;

    const significantMissingTokens = missingTokens.filter((token) => token.length >= 8);
    const minimumLexicalCoverage = questionTokens.length <= 6 ? 0.62 : 0.68;
    const minimumPhraseConfidence = questionTokens.length <= 6 ? 0.58 : 0.64;
    // If token-level source coverage is effectively complete, accept paraphrased wording even when phrase matching is lower.
    const hasFullCoverage = lexicalCoverage >= 0.99;
    const isGrounded =
      (
        (phraseValidation.confidenceScore >= minimumPhraseConfidence && lexicalCoverage >= minimumLexicalCoverage) ||
        hasFullCoverage
      ) &&
      significantMissingTokens.length <= 2;
    if (!isGrounded) {
      failures.push({
        index,
        confidenceScore: phraseValidation.confidenceScore,
        lexicalCoverage: Math.round(lexicalCoverage * 100) / 100,
        missingTokens: missingTokens.slice(0, 8),
      });
    }
  });

  const message = failures.length === 0
    ? "All generated quiz questions passed strict source-grounding validation."
    : failures
        .slice(0, 3)
        .map((failure) => {
          const missing = failure.missingTokens.length > 0
            ? `missing tokens: ${failure.missingTokens.join(", ")}`
            : "no missing-token summary";
          return `Q${failure.index + 1} failed grounding (phraseConfidence=${failure.confidenceScore}, lexicalCoverage=${failure.lexicalCoverage}; ${missing})`;
        })
        .join(" | ");

  return {
    isValid: failures.length === 0,
    failures,
    message,
  };
}

export interface AIConfigResult {
  success: boolean;
  service?: AIService;
  error?: {
    code: 'ai_config_missing' | 'invalid_model';
    message: string;
    purpose: 'text' | 'image';
  };
}

function isValidGeminiApiKey(value?: string | null): boolean {
  const trimmed = String(value || "").trim();
  return !isPlaceholderSecret(trimmed);
}

export class AIService {
  private apiKey: string;
  private modelName: string;
  private provider: string;
  
  constructor(apiKey: string, modelName: string, provider: string = 'gemini') {
    this.apiKey = apiKey;
    this.modelName = modelName;
    this.provider = provider;
  }

  // Static method to get active AI config from database (system-wide, not per organization)
  // Accepts optional purpose parameter to get config for specific purpose (text/image)
  // Defaults to 'text' for backward compatibility with all existing callers
  static async getActiveConfig(purpose: 'text' | 'image' = 'text'): Promise<AIService | null> {
    const integrationGeminiKey = await getConfiguredGeminiKey();
    const legacyConfig = await getLegacyGeminiConfig(purpose);
    const integrationModel = purpose === 'image'
      ? (await IntegrationConfigService.getSetting<string>("gemini", "defaultImageModel")) || 'gemini-2.0-flash-exp'
      : (await IntegrationConfigService.getSetting<string>("gemini", "defaultTextModel")) || 'gemini-2.5-flash';
    const apiKey = integrationGeminiKey || legacyConfig?.apiKey;
    const modelName = integrationGeminiKey ? integrationModel : legacyConfig?.modelName;
    if (!isValidGeminiApiKey(apiKey) || !modelName) return null;
    return new AIService(apiKey!, modelName, 'gemini');
  }

  static async getActiveConfigWithError(purpose: 'text' | 'image' = 'text'): Promise<AIConfigResult> {
    const integrationGeminiKey = await getConfiguredGeminiKey();
    const legacyConfig = await getLegacyGeminiConfig(purpose);
    const integrationModel = purpose === 'image'
      ? (await IntegrationConfigService.getSetting<string>("gemini", "defaultImageModel")) || 'gemini-2.0-flash-exp'
      : (await IntegrationConfigService.getSetting<string>("gemini", "defaultTextModel")) || 'gemini-2.5-flash';
    const apiKey = integrationGeminiKey || legacyConfig?.apiKey;
    const modelName = integrationGeminiKey ? integrationModel : legacyConfig?.modelName;

    if (!isValidGeminiApiKey(apiKey) || !modelName) {
      return {
        success: false,
        error: {
          code: 'ai_config_missing',
          message: `No valid Gemini API key configured for ${purpose} generation. Update Integration Settings.`,
          purpose,
        }
      };
    }

    if (!modelName.toLowerCase().startsWith('gemini') && !modelName.toLowerCase().startsWith('nano-banana')) {
      return {
        success: false,
        error: {
          code: 'invalid_model',
          message: `Configured model "${modelName}" is not a supported Gemini model.`,
          purpose,
        }
      };
    }

    return {
      success: true,
      service: new AIService(apiKey!, modelName, 'gemini'),
    };
  }

  // Generate quiz questions using AI
  async generateQuizQuestions(params: QuizGenerationParams): Promise<QuizQuestion[]> {
    if (this.provider === 'gemini') {
      return this.generateWithGemini(params);
    }
    
    throw new Error(`Unsupported AI provider: ${this.provider}`);
  }

  async generateQuizFromContract(params: QuizFromContractParams): Promise<QuizQuestion[]> {
    const { learningAssetContract, questionsPerSlide = 2, difficulty, grade, subject, questionTypeDistribution } = params;
    
    if (!learningAssetContract?.slides || learningAssetContract.slides.length < 2) {
      throw new Error("Learning asset contract must have at least 2 slides to generate quiz questions");
    }

    const slideQuestionMeta = deriveQuizQuestionsFromSlides(learningAssetContract.slides, questionsPerSlide);
    
    const allQuestions: QuizQuestion[] = [];
    
    for (const slideMeta of slideQuestionMeta) {
      const slide = learningAssetContract.slides.find(s => s.position === slideMeta.slidePosition);
      if (!slide || slide.keyPoints.length < 2) {
        console.warn(`[AIService] Skipping slide ${slideMeta.slidePosition}: insufficient key points`);
        continue;
      }

      const slideContent = `Topic: ${slide.title}\n\nKey points:\n${slide.keyPoints.map((kp, i) => `${i + 1}. ${kp}`).join('\n')}`;
      
      try {
        const questions = await this.generateQuizQuestions({
          primaryTopic: slide.title,
          numberOfQuestions: slideMeta.suggestedQuestionCount,
          difficulty,
          grade,
          subject,
          lessonContent: slideContent,
          questionTypeDistribution,
        });

        allQuestions.push(...questions.map(q => ({
          ...q,
          slidePosition: slideMeta.slidePosition,
        })));
      } catch (error) {
        console.error(`[AIService] Failed to generate questions for slide ${slideMeta.slidePosition}:`, error);
      }
    }

    if (allQuestions.length === 0) {
      throw new Error("Failed to generate any quiz questions from the learning asset contract");
    }

    return allQuestions;
  }

  // Regenerate a single question
  async regenerateQuestion(params: QuizGenerationParams, existingQuestions: QuizQuestion[]): Promise<QuizQuestion> {
    const questions = await this.generateQuizQuestions({
      ...params,
      numberOfQuestions: 1
    });
    
    return questions[0];
  }

  // Regenerate answers for a question
  async regenerateAnswers(question: string, correctAnswer: string, params: QuizGenerationParams): Promise<{ answers: string[], correctIndex: number }> {
    if (this.provider === 'gemini') {
      return this.regenerateAnswersWithGemini(question, correctAnswer, params);
    }
    
    throw new Error(`Unsupported AI provider: ${this.provider}`);
  }

  // Generate explanation for a quiz answer with identified key terms
  async generateExplanation(
    question: string, 
    questionType: string,
    data: { 
      correctAnswer?: string; 
      allAnswers?: string[];
      matchPairs?: Array<{ left: string; right: string }>;
    },
    params?: { grade?: string; subject?: string; difficulty?: string; languageCode?: string }
  ): Promise<{ explanation: string; terms: Array<{ term: string; definition: string }> }> {
    if (this.provider === 'gemini') {
      return this.generateExplanationWithGemini(question, questionType, data, params);
    }
    
    throw new Error(`Unsupported AI provider: ${this.provider}`);
  }

  // Define a single term
  async defineTerm(term: string, context?: { subject?: string; grade?: string }): Promise<string> {
    if (this.provider === 'gemini') {
      return this.defineTermWithGemini(term, context);
    }
    
    throw new Error(`Unsupported AI provider: ${this.provider}`);
  }

  // Generate quiz metadata (name and description) based on topics
  async generateQuizMetadata(params: {
    primaryTopic: string;
    subtopic1?: string;
    subtopic2?: string;
    grade?: string;
    subject?: string;
    curriculum?: string;
  }): Promise<{ name: string; description: string }> {
    if (this.provider === 'gemini') {
      return this.generateQuizMetadataWithGemini(params);
    }
    
    throw new Error(`Unsupported AI provider: ${this.provider}`);
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string; model: string }> {
    if (this.provider !== 'gemini') {
      return { healthy: false, error: `Unsupported provider: ${this.provider}`, model: this.modelName };
    }
    
    try {
      const ai = new GoogleGenAI({ apiKey: this.apiKey });
      
      await ai.models.countTokens({
        model: this.modelName,
        contents: "health check",
      });
      
      return { healthy: true, model: this.modelName };
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      console.error(`[AIService] Health check failed for ${this.modelName}:`, errorMessage);
      
      if (errorMessage.includes('404') || errorMessage.includes('NOT_FOUND')) {
        return { healthy: false, error: `Model "${this.modelName}" not found or unavailable`, model: this.modelName };
      }
      if (errorMessage.includes('401') || errorMessage.includes('INVALID_API_KEY')) {
        return { healthy: false, error: 'Invalid API key', model: this.modelName };
      }
      if (errorMessage.includes('429') || errorMessage.includes('QUOTA')) {
        return { healthy: false, error: 'API quota exceeded', model: this.modelName };
      }
      
      return { healthy: false, error: errorMessage, model: this.modelName };
    }
  }

  // Gemini-specific implementation
  private async generateWithGemini(params: QuizGenerationParams): Promise<QuizQuestion[]> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    // Build topic string from structured or legacy format
    let topicText = '';
    let scopeRequirements = '';
    if (params.primaryTopic) {
      topicText = `Primary Topic: ${params.primaryTopic}`;
      const subtopics = [params.subtopic1, params.subtopic2].filter(Boolean);
      if (subtopics.length > 0) {
        scopeRequirements = `\n⚠️ REQUIRED SCOPE (STRICTLY ENFORCE): ${subtopics.join(' AND ')}\n   - ALL questions MUST strictly adhere to this scope\n   - Questions that ignore these constraints are INCORRECT and must be regenerated`;
      }
    } else if (params.topic) {
      topicText = params.topic;
    }

    // Calculate question counts based on distribution (default to 40% MC, 20% each for others)
    const distribution = params.questionTypeDistribution || {
      multipleChoice: 40,
      trueFalse: 20,
      match: 20,
      fillBlank: 20,
    };
    const forcedQuestionType = params.forcedQuestionType;

    // Validate and normalize distribution to sum to 100%
    const distTotal = distribution.multipleChoice + distribution.trueFalse + distribution.match + distribution.fillBlank;
    let normalizedDist = distribution;
    
    // Guard against invalid total (0 or negative)
    if (distTotal <= 0) {
      // Reset to default distribution
      normalizedDist = {
        multipleChoice: 40,
        trueFalse: 20,
        match: 20,
        fillBlank: 20,
      };
    } else if (distTotal !== 100) {
      // Normalize to sum to 100%
      const scale = 100 / distTotal;
      normalizedDist = {
        multipleChoice: Math.round(distribution.multipleChoice * scale),
        trueFalse: Math.round(distribution.trueFalse * scale),
        match: Math.round(distribution.match * scale),
        fillBlank: Math.round(distribution.fillBlank * scale),
      };
      
      // Adjust for rounding errors to ensure exactly 100%
      const newTotal = normalizedDist.multipleChoice + normalizedDist.trueFalse + normalizedDist.match + normalizedDist.fillBlank;
      if (newTotal !== 100) {
        normalizedDist.multipleChoice += (100 - newTotal);
      }
    }

    let mcCount = Math.round(params.numberOfQuestions * normalizedDist.multipleChoice / 100);
    let tfCount = Math.round(params.numberOfQuestions * normalizedDist.trueFalse / 100);
    let matchCount = Math.round(params.numberOfQuestions * normalizedDist.match / 100);
    let fbCount = Math.round(params.numberOfQuestions * normalizedDist.fillBlank / 100);

    if (forcedQuestionType) {
      mcCount = forcedQuestionType === "multiple-choice" ? params.numberOfQuestions : 0;
      tfCount = forcedQuestionType === "true-false" ? params.numberOfQuestions : 0;
      matchCount = forcedQuestionType === "match" ? params.numberOfQuestions : 0;
      fbCount = forcedQuestionType === "fill-blank" ? params.numberOfQuestions : 0;
    }

    // Adjust to ensure total equals numberOfQuestions
    let total = mcCount + tfCount + matchCount + fbCount;
    let adjusted = { mc: mcCount, tf: tfCount, match: matchCount, fb: fbCount };
    
    if (total !== params.numberOfQuestions) {
      const diff = params.numberOfQuestions - total;
      if (adjusted.mc > 0) adjusted.mc += diff;
      else if (adjusted.tf > 0) adjusted.tf += diff;
      else if (adjusted.match > 0) adjusted.match += diff;
      else adjusted.fb += diff;
    }

    const curriculumText = params.curriculum || 'CAPS';
    const normalizedObjectives = Array.isArray(params.learningObjectives)
      ? params.learningObjectives
          .map((obj) => ({
            id: String(obj?.id || "").trim(),
            objective: String(obj?.objective || "").trim(),
            bloomLevel: String(obj?.bloomLevel || "").trim() || "understand",
          }))
          .filter((obj) => obj.id && obj.objective)
      : [];
    const preferredObjectiveId = String(params.preferredObjectiveId || "").trim();
    const objectiveCoverageRequired = normalizedObjectives.length > 0 && params.numberOfQuestions >= normalizedObjectives.length;
    const objectiveMapText = normalizedObjectives.length
      ? normalizedObjectives.map((obj) => `- ${obj.id}: ${obj.objective} (Bloom: ${obj.bloomLevel})`).join("\n")
      : "";
    
    // Build validation checklist with proper numbering
    const checklistItems: string[] = [];
    
    // CRITICAL: Add lesson content verification FIRST if content is provided
    if (params.lessonContent) {
      checklistItems.push(`🔴 CONTENT SOURCE VERIFICATION (MANDATORY): Can this question be answered using ONLY information in the lesson content above?
   - Verify the facts/concepts appear in the lesson slides
   - If you're using external knowledge → REJECT and regenerate`);
    }
    
    // Add scope compliance if subtopics are provided
    if (scopeRequirements) {
      const subtopics = [params.subtopic1, params.subtopic2].filter(Boolean).join(' AND ');
      checklistItems.push(`⚠️ SCOPE COMPLIANCE: Does this question strictly adhere to the required scope? (${subtopics})
   - If NO → REJECT and regenerate`);
    }
    
    // Add curriculum requirements if description is provided
    if (params.description) {
      checklistItems.push(`🔴 CURRICULUM REQUIREMENTS: Does this question incorporate and address the mandatory curriculum requirements?
   - If NO → REJECT and regenerate`);
    }
    
    // Add standard validation items
    checklistItems.push(`TOPIC ALIGNMENT: Does it directly address "${params.primaryTopic || params.topic}"?`);
    checklistItems.push(`GRADE APPROPRIATENESS: Is it suitable for ${params.grade || 'the target grade'} ${params.subject || 'students'}?`);
    checklistItems.push(`DIFFICULTY: Does it match "${params.difficulty}" difficulty level?`);
    checklistItems.push(`CURRICULUM STANDARDS: Does it align with ${curriculumText} assessment standards?`);
    
    // Format checklist with proper numbering
    const formattedChecklist = checklistItems.map((item, index) => `${index + 1}. ${item}`).join('\n');
    
    // Build lesson content constraint if provided (CRITICAL anti-hallucination measure)
    const lessonContentConstraint = params.lessonContent 
      ? `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 CRITICAL CONTENT SOURCE CONSTRAINT - HIGHEST PRIORITY 🔴
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Below is the COMPLETE content from the presentation lesson. This is your ONLY authorized source of information.

⚠️ MANDATORY RULES (ZERO TOLERANCE):
1. You MUST ONLY create questions using information explicitly present in the lesson content below
2. DO NOT use your general knowledge, external facts, or information not in these slides
3. DO NOT create questions about topics not covered in the lesson content
4. DO NOT add examples, facts, or context that aren't in the lesson content
5. If a concept isn't explained in the lesson content, DO NOT create questions about it
6. Questions that reference information NOT in the lesson content are WRONG and will be REJECTED

📝 SELF-CHECK REQUIREMENT (MANDATORY FOR EACH QUESTION):
Before finalizing EACH question, you MUST ask yourself:
- "Can I answer this question using ONLY the information in the lesson content below?"
- "Does this specific fact/concept appear in the lesson slides?"
- "Am I adding any external knowledge or assumptions?"

If the answer to any of these is uncertain → REJECT the question and try again.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LESSON CONTENT (YOUR ONLY SOURCE OF TRUTH):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${params.lessonContent}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
END OF LESSON CONTENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Remember: Every question must be answerable using ONLY the information provided above. Questions using external knowledge will be REJECTED.

`
      : '';
    const visualAssets = Array.isArray(params.visualAssets)
      ? params.visualAssets.filter((asset) => String(asset?.assetId || "").trim())
      : [];
    const visualAssetInstruction = visualAssets.length
      ? `

SOURCE VISUALS AVAILABLE:
${visualAssets.map((asset, index) => `${index + 1}. assetId=${asset.assetId}; caption=${asset.caption || "No caption"}; alt=${asset.altText || "No alt text"}; pageOrSlide=${asset.pageOrSlide || "unknown"}`).join("\n")}

You may create image-supported questions when the caption or alt text is enough to make the question answerable. If a question uses a visual, include "sourceAssetId" with the exact assetId. Do not request translated or edited images.
`
      : "";
    
    const systemPrompt = `You are an expert educational content creator specializing in creating quiz questions for South African students following the ${curriculumText} (${curriculumText === 'CAPS' ? 'Curriculum and Assessment Policy Statement' : curriculumText}) syllabus.
${lessonContentConstraint}
QUIZ PARAMETERS:
- Topic: ${topicText}${scopeRequirements}
- Number of Questions: ${params.numberOfQuestions}
- Difficulty Level: ${params.difficulty}
${params.grade ? `- Grade Level: ${params.grade}` : ''}
${params.subject ? `- Subject: ${params.subject}` : ''}
${params.description ? `\n🔴 MANDATORY CURRICULUM REQUIREMENTS (STRICTLY ENFORCE):\n   ${params.description}\n   - These requirements are NOT optional suggestions\n   - EVERY question MUST incorporate and address these requirements\n   - Questions that ignore these requirements are INCORRECT` : ''}
${normalizedObjectives.length ? `\n🔵 LESSON LEARNING OBJECTIVES (STRUCTURED):\n${objectiveMapText}\n` : ""}
${visualAssetInstruction}

QUESTION TYPE DISTRIBUTION:
- Multiple Choice: ${adjusted.mc} questions
- True/False: ${adjusted.tf} questions
- Match: ${adjusted.match} questions
- Fill in the Blank: ${adjusted.fb} questions

CURRICULUM REQUIREMENTS:
${params.grade && params.subject ? `- All questions MUST align with the ${params.subject} ${curriculumText} syllabus content for ${params.grade}
- Questions must reflect the assessment standards and learning outcomes specified in the ${curriculumText} curriculum for this grade and subject
- Use terminology and concepts appropriate for ${params.grade} students in South Africa` : `- Questions must be relevant to the South African ${curriculumText} curriculum`}

CRITICAL VALIDATION CHECKLIST - VERIFY BEFORE GENERATING EACH QUESTION:
For EVERY single question you generate, you MUST verify ALL of the following (in order):
${formattedChecklist}

⚠️ IMPORTANT: Questions that fail ANY of the above checks are INCORRECT and must be regenerated

QUESTION TYPE FORMATS:

1. MULTIPLE CHOICE (${adjusted.mc} questions):
   {
     "questionType": "multiple-choice",
     "question": "question text",
     "answers": ["answer1", "answer2", "answer3", "answer4", "answer5", "answer6"],
     "correctIndex": 0
   }
   - Must have exactly 6 answer options
   - correctIndex indicates which answer (0-5) is correct

2. TRUE/FALSE (${adjusted.tf} questions):
   {
     "questionType": "true-false",
     "question": "statement to evaluate",
     "answers": ["True", "False"],
     "correctIndex": 0
   }
   - Must have exactly 2 answers: ["True", "False"]
   - correctIndex is 0 for True, 1 for False

3. MATCH (${adjusted.match} questions):
   {
     "questionType": "match",
     "question": "instruction text (e.g., 'Match each term to its definition')",
     "matchPairs": [
       {"left": "Term 1", "right": "Definition 1"},
       {"left": "Term 2", "right": "Definition 2"},
       {"left": "Term 3", "right": "Definition 3"},
       {"left": "Term 4", "right": "Definition 4"}
     ]
   }
   - Must have 4-6 pairs
   - ⚠️ CRITICAL VALIDATION REQUIREMENT ⚠️: You MUST verify EACH pair individually:
     * For EACH left item, ask yourself: "Is this right value the ACTUAL CORRECT match for this specific left value?"
     * DO NOT rotate, shuffle, or reorder the right values
     * DO NOT mix up the pairs
   - Example CORRECT pairs:
     * {"left": "1", "right": "One"}, {"left": "2", "right": "Two"}, {"left": "3", "right": "Three"}
     * {"left": "12", "right": "1 ten and 2 ones"}, {"left": "15", "right": "1 ten and 5 ones"}
     * {"left": "Na", "right": "Sodium"}, {"left": "K", "right": "Potassium"}
   - Example WRONG pairs (DO NOT DO THIS):
     * {"left": "1", "right": "Two"}, {"left": "2", "right": "Three"}, {"left": "3", "right": "One"} ← WRONG! Mixed up
     * {"left": "12", "right": "2 tens and 0 ones"}, {"left": "15", "right": "1 ten and 2 ones"} ← WRONG! Rotated
   - Validation checklist for EACH pair:
     1. Read the left value
     2. Read the right value  
     3. Ask: "Is this right value TRULY the correct match for this left value?"
     4. If NO, fix it immediately
     5. Double-check before finalizing

4. FILL IN THE BLANK (${adjusted.fb} questions):
   {
     "questionType": "fill-blank",
     "question": "The process of ___ converts light energy into chemical energy.",
     "correctAnswer": "photosynthesis"
   }
   - Question must contain ___ as the blank placeholder
   - correctAnswer is the exact word/phrase that fills the blank

REQUIREMENTS:
- All questions must test understanding of the specified topic${params.description ? ` with focus on: ${params.description}` : ''}
- Language and complexity appropriate for the ${params.difficulty} difficulty level
- For multiple choice: Five plausible distractors that test common misconceptions
- For match questions - CRITICAL VALIDATION STEPS:
  1. Write out each left item
  2. Write the CORRECT right match for that specific left item
  3. DO NOT shuffle, rotate, or reorder the right-side values
  4. Verify: 12 → "1 ten and 2 ones" (NOT "2 tens and 0 ones")
  5. Verify: 15 → "1 ten and 5 ones" (NOT "1 ten and 2 ones" or "2 tens and 0 ones")
  6. Each pair must be independently correct - don't rotate answers between pairs
  7. Common ERROR to AVOID: Creating pairs where the right values are shuffled/rotated from their correct positions
- For fill-blank: Answer should be specific and unambiguous
${normalizedObjectives.length ? `- Every question MUST include an "objectiveId" that matches one of the objective IDs listed above` : ''}
${objectiveCoverageRequired ? `- Coverage rule: include at least ONE question for EACH listed learning objective` : ''}
${preferredObjectiveId ? `- Priority rule: include objectiveId "${preferredObjectiveId}" in this output` : ''}

Return a JSON array containing the exact number and types of questions specified in the distribution.`;

    const baseRequestContent = `Generate ${params.numberOfQuestions} quiz questions about: ${topicText}${params.grade ? ` for ${params.grade}` : ''}${params.subject ? ` ${params.subject}` : ''}
      
Distribution:
- ${adjusted.mc} multiple-choice questions
- ${adjusted.tf} true/false questions
- ${adjusted.match} match questions
- ${adjusted.fb} fill-in-the-blank questions

Ensure you generate the EXACT number and types as specified above.`;

    const objectiveAttemptFloor = normalizedObjectives.length ? 2 : 1;
    const groundingAttempts = params.lessonContent
      ? resolveGroundingAttemptBudget("QUIZ_GROUNDING_MAX_ATTEMPTS", { onprem: 2, cloud: 3 })
      : 1;
    const maxAttempts = Math.max(groundingAttempts, objectiveAttemptFloor);
    let retryGroundingDirective: string | null = null;
    let retryObjectiveDirective: string | null = null;
    let lastRejectedQuestions: QuizQuestion[] = [];
    let lastGroundingFailures: QuizGroundingFailure[] = [];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const retryInstruction = retryGroundingDirective
        ? `\n\nSTRICT RETRY: Previous output failed source-grounding validation.\n${retryGroundingDirective}\nRegenerate all questions and ensure every question/answer is strictly supported by the provided lesson content.`
        : "";
      const objectiveRetryInstruction = retryObjectiveDirective
        ? `\n\nOBJECTIVE COVERAGE RETRY: ${retryObjectiveDirective}\nRegenerate all questions and correct objectiveId mapping/coverage accordingly.`
        : "";

      const response = await ai.models.generateContent({
        model: this.modelName,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: "array",
            items: {
              type: "object",
              properties: {
                questionType: {
                  type: "string",
                  enum: ["multiple-choice", "true-false", "match", "fill-blank"]
                },
                question: { type: "string" },
                answers: {
                  type: "array",
                  items: { type: "string" }
                },
                correctIndex: { type: "number" },
                matchPairs: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      left: { type: "string" },
                      right: { type: "string" }
                    },
                    required: ["left", "right"]
                  }
                },
                correctAnswer: { type: "string" },
                objectiveId: { type: "string" },
                sourceAssetId: { type: "string" }
              },
              required: ["questionType", "question"]
            }
          }
        },
        contents: `${baseRequestContent}${retryInstruction}${objectiveRetryInstruction}`
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error("Empty response from AI model");
      }

      let questions: QuizQuestion[];
      try {
        questions = JSON.parse(rawJson);
      } catch (parseError: any) {
        console.error('[AIService] Failed to parse quiz JSON response:', parseError.message);
        console.error('[AIService] Raw response (first 500 chars):', rawJson.substring(0, 500));
        throw new Error('AI returned an invalid response format. Please try again.');
      }

      if (!Array.isArray(questions)) {
        console.error('[AIService] AI response was not an array:', typeof questions);
        throw new Error('AI returned an unexpected response format. Please try again.');
      }

      const processedQuestions = attachVisualAssetsToQuestions(questions.map(q => {
        if (q.questionType === 'true-false' && q.answers && q.answers.length === 2 && q.correctIndex !== undefined) {
          if (Math.random() > 0.5) {
            const swappedAnswers = [q.answers[1], q.answers[0]];
            const swappedCorrectIndex = q.correctIndex === 0 ? 1 : 0;
            return {
              ...q,
              answers: swappedAnswers,
              correctIndex: swappedCorrectIndex,
              selected: true
            };
          }
        }
        return { ...q, selected: true };
      }), params.visualAssets);

      if (normalizedObjectives.length > 0) {
        const objectiveCoverage = validateObjectiveCoverage({
          questions: processedQuestions,
          learningObjectives: normalizedObjectives,
          numberOfQuestions: params.numberOfQuestions,
          preferredObjectiveId,
        });
        if (!objectiveCoverage.isValid) {
          retryObjectiveDirective = objectiveCoverage.message;
          console.warn(
            `[AIService] Learning objective coverage failed on attempt ${attempt}/${maxAttempts}: ${objectiveCoverage.message}`
          );
          if (attempt < maxAttempts) {
            continue;
          }
        } else {
          retryObjectiveDirective = null;
        }
      }

      if (!params.lessonContent) {
        return processedQuestions;
      }

      const groundingValidation = validateQuizQuestionsAgainstSource(processedQuestions, params.lessonContent);
      if (groundingValidation.isValid) {
        return processedQuestions;
      }

      lastRejectedQuestions = processedQuestions;
      lastGroundingFailures = groundingValidation.failures;
      retryGroundingDirective = groundingValidation.message;
      console.warn(
        `[AIService] Quiz grounding validation failed on attempt ${attempt}/${maxAttempts}: ${groundingValidation.message}`
      );

      if (attempt === maxAttempts) {
        throw new QuizGroundingValidationError(
          "Generated quiz failed strict selected-source grounding validation. Please refine the selected source content and try again.",
          lastRejectedQuestions,
          lastGroundingFailures,
        );
      }
    }

    throw new Error("Failed to generate source-grounded quiz questions.");
  }

  // Regenerate answers with Gemini
  private async regenerateAnswersWithGemini(question: string, correctAnswer: string, params: QuizGenerationParams): Promise<{ answers: string[], correctIndex: number }> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const sourceConstraint = params.lessonContent
      ? `

STRICT SOURCE-GROUNDING REQUIREMENT:
- Use ONLY information present in the provided lesson content.
- Do not introduce external facts or assumptions.
- Every answer option must stay within the selected source content scope.

LESSON CONTENT:
${params.lessonContent}
`
      : "";

    const systemPrompt = `You are an expert educational content creator specializing in South African CAPS curriculum content.
For the given question and correct answer, generate 5 plausible incorrect answers (distractors).
${params.grade ? `Grade Level: ${params.grade}` : ''}
${params.subject ? `Subject: ${params.subject}` : ''}
Difficulty level: ${params.difficulty}
${sourceConstraint}

The distractors should be appropriate for the CAPS curriculum level and believable enough to challenge students.

Return JSON with this exact structure:
{
  "answers": ["correct answer", "distractor1", "distractor2", "distractor3", "distractor4", "distractor5"],
  "correctIndex": 0
}

The answers array must have exactly 6 items, with the correct answer at the position indicated by correctIndex.`;

    const maxAttempts = params.lessonContent
      ? resolveGroundingAttemptBudget("QUIZ_ANSWER_GROUNDING_MAX_ATTEMPTS", { onprem: 2, cloud: 3 })
      : 1;
    let retryGroundingDirective: string | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const retryInstruction = retryGroundingDirective
        ? `\n\nSTRICT RETRY: ${retryGroundingDirective}\nRegenerate answer options that are fully grounded in the provided lesson content.`
        : "";

      const response = await ai.models.generateContent({
        model: this.modelName,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              answers: {
                type: "array",
                items: { type: "string" },
                minItems: 6,
                maxItems: 6
              },
              correctIndex: { type: "number" }
            },
            required: ["answers", "correctIndex"]
          }
        },
        contents: `Question: ${question}\nCorrect Answer: ${correctAnswer}${params.grade ? `\nGrade Level: ${params.grade}` : ''}${params.subject ? `\nSubject: ${params.subject}` : ''}\n\nGenerate 5 plausible distractors.${retryInstruction}`
      });

      const rawJson = response.text;
      if (!rawJson) {
        throw new Error("Empty response from AI model");
      }

      let parsed: { answers: string[]; correctIndex: number };
      try {
        parsed = JSON.parse(rawJson);
      } catch (parseError: any) {
        console.error('[AIService] Failed to parse answer regeneration JSON response:', parseError.message);
        throw new Error('AI returned an invalid response format. Please try again.');
      }

      if (!params.lessonContent) {
        return parsed;
      }

      const validationPayload: QuizQuestion = {
        questionType: "multiple-choice",
        question,
        answers: parsed.answers,
        correctIndex: parsed.correctIndex,
      };
      const groundingValidation = validateQuizQuestionsAgainstSource([validationPayload], params.lessonContent);
      if (groundingValidation.isValid) {
        return parsed;
      }

      retryGroundingDirective = groundingValidation.message;
      console.warn(
        `[AIService] Regenerate answers grounding failed on attempt ${attempt}/${maxAttempts}: ${groundingValidation.message}`
      );

      if (attempt === maxAttempts) {
        throw new Error(
          "Regenerated answers failed strict selected-source grounding validation. Please refine the selected source content and try again."
        );
      }
    }

    throw new Error("Failed to regenerate source-grounded answers.");
  }

  // Generate explanation with key terms using Gemini
  private async generateExplanationWithGemini(
    question: string, 
    questionType: string,
    data: { 
      correctAnswer?: string; 
      allAnswers?: string[];
      matchPairs?: Array<{ left: string; right: string }>;
    },
    params?: { grade?: string; subject?: string; difficulty?: string; languageCode?: string }
  ): Promise<{ explanation: string; terms: Array<{ term: string; definition: string }> }> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    // Build type-specific prompt content
    let contentText = `Question: ${question}\n`;
    let taskInstruction = '';
    
    if (questionType === 'match') {
      contentText += `Question Type: Match the Pairs\n`;
      contentText += `Correct Matches:\n`;
      data.matchPairs?.forEach(pair => {
        contentText += `  - ${pair.left} → ${pair.right}\n`;
      });
      taskInstruction = 'Explain the correct matches and why they go together. List ALL the correct pairs in your explanation so students can see what the right answers are.';
    } else if (questionType === 'fill-blank') {
      contentText += `Question Type: Fill in the Blank\n`;
      contentText += `Correct Answer: ${data.correctAnswer}\n`;
      taskInstruction = 'Explain why this is the correct answer to fill in the blank. Make sure to state the complete correct answer clearly.';
    } else {
      // multiple-choice or true-false
      contentText += `Question Type: ${questionType === 'true-false' ? 'True/False' : 'Multiple Choice'}\n`;
      contentText += `Correct Answer: ${data.correctAnswer}\n`;
      if (data.allAnswers && data.allAnswers.length > 0) {
        contentText += `All Answer Options: ${data.allAnswers.join(', ')}\n`;
      }
      taskInstruction = 'Explain why the correct answer is right.';
    }
    
    if (params?.grade) contentText += `Grade Level: ${params.grade}\n`;
    if (params?.subject) contentText += `Subject: ${params.subject}\n`;

    const languageInstruction = params?.languageCode && params.languageCode !== 'en' 
      ? `\nIMPORTANT: Respond ENTIRELY in ${params.languageCode} language. All text including the explanation and key term definitions must be in ${params.languageCode}.\n` 
      : '';
    const systemPrompt = `You are an expert educational content creator specializing in creating clear, concise explanations for quiz answers${params?.subject ? ` in ${params.subject}` : ''}${params?.grade ? ` for ${params.grade} students` : ''}.${languageInstruction}

Your task:
1. Write a brief (2-3 sentence) explanation that ${taskInstruction}
2. For match questions: ALWAYS list the correct pairs (e.g., "Iron = Fe, Sodium = Na, Gold = Au, Silver = Ag")
3. For fill-blank questions: ALWAYS state the complete correct answer
4. Identify 3-5 key terms in your explanation that students might not know
5. Provide clear, simple definitions for each term

Keep explanations educational and easy to understand. Focus on helping students learn the concept.

Return JSON with this exact structure:
{
  "explanation": "Brief explanation text here...",
  "terms": [
    {"term": "key term 1", "definition": "simple definition"},
    {"term": "key term 2", "definition": "simple definition"}
  ]
}`;

    const response = await ai.models.generateContent({
      model: this.modelName,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            explanation: { type: "string" },
            terms: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  term: { type: "string" },
                  definition: { type: "string" }
                },
                required: ["term", "definition"]
              }
            }
          },
          required: ["explanation", "terms"]
        }
      },
      contents: contentText + `\n${taskInstruction} Identify key terms students might not understand.`
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from AI model");
    }

    try {
      return JSON.parse(rawJson);
    } catch (parseError: any) {
      console.error('[AIService] Failed to parse explanation JSON response:', parseError.message);
      throw new Error('AI returned an invalid response format. Please try again.');
    }
  }

  // Define a term using Gemini
  private async defineTermWithGemini(term: string, context?: { subject?: string; grade?: string }): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const systemPrompt = `You are an expert educational content creator. Provide a clear, simple definition for the given term${context?.subject ? ` in the context of ${context.subject}` : ''}${context?.grade ? ` suitable for ${context.grade} students` : ''}.

Keep the definition:
- Brief (1-2 sentences)
- Easy to understand
- Accurate and educational

Return only the definition text, no additional formatting.`;

    const response = await ai.models.generateContent({
      model: this.modelName,
      config: {
        systemInstruction: systemPrompt,
      },
      contents: `Define the term: ${term}${context?.subject ? `\nSubject context: ${context.subject}` : ''}${context?.grade ? `\nGrade level: ${context.grade}` : ''}`
    });

    const definition = response.text?.trim();
    if (!definition) {
      throw new Error("Empty response from AI model");
    }

    return definition;
  }

  // Generate quiz metadata with Gemini
  private async generateQuizMetadataWithGemini(params: {
    primaryTopic: string;
    subtopic1?: string;
    subtopic2?: string;
    grade?: string;
    subject?: string;
    curriculum?: string;
  }): Promise<{ name: string; description: string }> {
    const ai = new GoogleGenAI({ apiKey: this.apiKey });

    const subtopics = [params.subtopic1, params.subtopic2].filter(Boolean);
    const curriculumText = params.curriculum || 'CAPS';

    const systemPrompt = `You are an expert educational content creator for South African ${curriculumText} curriculum quizzes.

Generate a compelling quiz name and description based on the provided topics.

Requirements:
- Name: Concise, engaging title (maximum 60 characters)
- Description: Brief summary that explains what students will be tested on (2-3 sentences, maximum 200 characters)
- Must be relevant to ${params.grade || 'the grade level'} ${params.subject || 'curriculum'}
- Should clearly indicate the topic coverage

Return JSON with this exact structure:
{
  "name": "Quiz title here",
  "description": "Brief description of what this quiz covers"
}`;

    let contentText = `Primary Topic: ${params.primaryTopic}\n`;
    if (subtopics.length > 0) {
      contentText += `Focus Areas: ${subtopics.join(', ')}\n`;
    }
    if (params.grade) contentText += `Grade Level: ${params.grade}\n`;
    if (params.subject) contentText += `Subject: ${params.subject}\n`;
    contentText += `Curriculum: ${curriculumText}`;

    const response = await ai.models.generateContent({
      model: this.modelName,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" }
          },
          required: ["name", "description"]
        }
      },
      contents: contentText
    });

    const rawJson = response.text;
    if (!rawJson) {
      throw new Error("Empty response from AI model");
    }

    try {
      return JSON.parse(rawJson);
    } catch (parseError: any) {
      console.error('[AIService] Failed to parse quiz metadata JSON response:', parseError.message);
      throw new Error('AI returned an invalid response format. Please try again.');
    }
  }
}
