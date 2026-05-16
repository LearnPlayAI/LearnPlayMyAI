import { z } from "zod";

export const LEARNING_ASSET_CONTRACT_VERSION = "1.0.0";

export const slideRoleEnum = z.enum(["overview", "slide"]);
export type SlideRole = z.infer<typeof slideRoleEnum>;

export const contentProvenanceEnum = z.enum([
  "user_provided",
  "ai_generated",
  "document_extracted",
  "legacy_migrated"
]);
export type ContentProvenance = z.infer<typeof contentProvenanceEnum>;

export const gammaSlideSchema = z.object({
  position: z.number().int().min(1).max(10),
  title: z.string().min(1).max(200),
  keyPoints: z.array(z.string()).min(0).max(5),
  role: slideRoleEnum,
  provenance: contentProvenanceEnum.optional(),
});
export type GammaSlide = z.infer<typeof gammaSlideSchema>;

export const learningAssetContractSchema = z.object({
  version: z.string(),
  slides: z.array(gammaSlideSchema).min(2).max(10),
  validatedAt: z.string().datetime().optional(),
  sourceMode: z.enum(["gemini-topics", "text-input", "document-upload", "manual"]).optional(),
  legacyRecordId: z.string().optional(),
  extensions: z.record(z.unknown()).optional(),
});
export type LearningAssetContract = z.infer<typeof learningAssetContractSchema>;

export interface ParsedSlide {
  title: string;
  keyPoints: string[];
  originalPosition: number;
}

export interface SlideValidationResult {
  valid: boolean;
  error?: string;
  slides: ParsedSlide[];
}

export interface TopicFromSlide {
  position: number;
  title: string;
  role: SlideRole;
}

export function parseGammaSlidesRaw(inputText: string): ParsedSlide[] {
  if (!inputText?.trim()) return [];
  
  return inputText.split(/\n\s*---\s*\n/)
    .map((slideContent, originalPosition) => {
      const lines = slideContent.trim().split('\n').filter(l => l.trim());
      
      const title = lines.length > 0 
        ? lines[0]
            .replace(/^#+\s*/, '')
            .replace(/^\*+\s*/, '')
            .replace(/^-\s*/, '')
            .trim()
        : '';
      
      const keyPoints = lines.slice(1)
        .map(line => line.replace(/^[-*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim())
        .filter(line => line.length > 0);
      
      return { title, keyPoints, originalPosition };
    });
}

export function parseGammaSlides(inputText: string): ParsedSlide[] {
  return parseGammaSlidesRaw(inputText).filter(slide => slide.title.length > 0);
}

export function validateGammaContent(inputText: string): SlideValidationResult {
  const allSlides = parseGammaSlidesRaw(inputText);
  
  if (allSlides.length < 2) {
    return { 
      valid: false, 
      error: "Content must have at least 2 slides separated by '---'. Each slide needs a title and key points.",
      slides: [] 
    };
  }
  
  if (!allSlides[0]?.title?.trim()) {
    return { 
      valid: false, 
      error: "The first slide (Overview) must have a title. Please add a title to the first section before the first '---' separator.",
      slides: [] 
    };
  }
  
  if (allSlides[0]?.keyPoints?.length < 2) {
    return { 
      valid: false, 
      error: "The first slide (Overview) must have at least 2 key point sentences below the title.",
      slides: [] 
    };
  }
  
  const validSlides = allSlides.filter(s => s.title.length > 0);
  
  if (validSlides.length < 2) {
    return { 
      valid: false, 
      error: "At least 2 slides must have titles. Please ensure each slide section starts with a title.",
      slides: validSlides 
    };
  }
  
  if (validSlides.length > 10) {
    return { 
      valid: false, 
      error: `Content has ${validSlides.length} slides with titles but maximum is 10. Please reduce the number of slides.`,
      slides: validSlides 
    };
  }
  
  const slidesWithFewPoints = validSlides.filter(s => s.keyPoints.length < 2);
  if (slidesWithFewPoints.length > 0) {
    const positions = slidesWithFewPoints.map(s => s.originalPosition + 1).join(', ');
    return { 
      valid: false, 
      error: `Slide(s) ${positions} have fewer than 2 key points. Each slide should have 2-5 key point sentences.`,
      slides: validSlides 
    };
  }
  
  const slidesWithTooManyPoints = validSlides.filter(s => s.keyPoints.length > 5);
  if (slidesWithTooManyPoints.length > 0) {
    const positions = slidesWithTooManyPoints.map(s => s.originalPosition + 1).join(', ');
    return { 
      valid: false, 
      error: `Slide(s) ${positions} have more than 5 key points. Each slide should have 2-5 key point sentences. Extra points will be removed.`,
      slides: validSlides.map(s => ({
        ...s,
        keyPoints: s.keyPoints.slice(0, 5)
      }))
    };
  }
  
  return { valid: true, slides: validSlides };
}

export function slidesToTopics(slides: ParsedSlide[]): TopicFromSlide[] {
  return slides.map((slide, index) => ({
    position: index + 1,
    title: slide.title,
    role: index === 0 ? "overview" as const : "slide" as const,
  }));
}

export function slidesToGammaSlides(
  slides: ParsedSlide[], 
  provenance: ContentProvenance = "user_provided"
): GammaSlide[] {
  return slides.map((slide, index) => ({
    position: index + 1,
    title: slide.title,
    keyPoints: slide.keyPoints.slice(0, 5),
    role: index === 0 ? "overview" as const : "slide" as const,
    provenance,
  }));
}

export function createLearningAssetContract(
  slides: ParsedSlide[],
  sourceMode: LearningAssetContract["sourceMode"],
  provenance: ContentProvenance = "user_provided"
): LearningAssetContract {
  return {
    version: LEARNING_ASSET_CONTRACT_VERSION,
    slides: slidesToGammaSlides(slides, provenance),
    validatedAt: new Date().toISOString(),
    sourceMode,
  };
}

export function gammaFormatFromSlides(slides: GammaSlide[]): string {
  return slides
    .sort((a, b) => a.position - b.position)
    .map(slide => {
      const keyPointsText = slide.keyPoints.length > 0 
        ? `\n\n${slide.keyPoints.join('\n')}` 
        : '';
      return `${slide.title}${keyPointsText}`;
    })
    .join('\n\n---\n\n');
}

export function validateTopicsAlignment(
  topics: Array<{ position: number; title: string; role: string }>,
  slides: ParsedSlide[]
): { valid: boolean; error?: string } {
  const nonEmptyTopics = topics.filter(t => t.title.trim().length > 0);
  
  if (nonEmptyTopics.length !== slides.length) {
    return {
      valid: false,
      error: `Topics count (${nonEmptyTopics.length}) doesn't match slide count (${slides.length})`
    };
  }
  
  const firstTopic = topics.find(t => t.position === 1);
  if (firstTopic && firstTopic.role !== "overview") {
    return {
      valid: false,
      error: "The first topic (position 1) must have role 'overview'"
    };
  }
  
  return { valid: true };
}

export class ContentValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = "ContentValidationError";
  }
}

export class OverviewMissingError extends ContentValidationError {
  constructor(message = "The first slide (Overview) must have a title") {
    super(message, "OVERVIEW_MISSING", "inputText");
  }
}

export class KeyPointCountError extends ContentValidationError {
  constructor(slidePosition: number, actualCount: number) {
    super(
      `Slide ${slidePosition} has ${actualCount} key points but needs at least 2`,
      "KEY_POINT_COUNT",
      "inputText"
    );
  }
}

export class SlideCountError extends ContentValidationError {
  constructor(count: number, min: number, max: number) {
    const message = count < min 
      ? `Content has ${count} slides but needs at least ${min}`
      : `Content has ${count} slides but maximum is ${max}`;
    super(message, "SLIDE_COUNT", "inputText");
  }
}

export class ContractVersionError extends ContentValidationError {
  constructor(expectedVersion: string, actualVersion: string) {
    super(
      `Contract version mismatch: expected ${expectedVersion}, got ${actualVersion}`,
      "CONTRACT_VERSION",
      undefined
    );
  }
}

export function convertLegacyTopicsToContract(
  legacyTopics: Array<{ position: number; title: string; role: 'overview' | 'slide' }> | null,
  mainTopic?: string | null,
  subtopic1?: string | null,
  subtopic2?: string | null
): LearningAssetContract | null {
  if (legacyTopics && legacyTopics.length > 0) {
    const slides: GammaSlide[] = legacyTopics
      .filter(t => t.title?.trim())
      .map(t => ({
        position: t.position,
        title: t.title,
        keyPoints: [],
        role: t.role,
        provenance: "legacy_migrated" as const,
      }));
    
    if (slides.length >= 2) {
      return {
        version: LEARNING_ASSET_CONTRACT_VERSION,
        slides,
        sourceMode: "gemini-topics",
        legacyRecordId: undefined,
      };
    }
  }
  
  if (mainTopic?.trim()) {
    const slides: GammaSlide[] = [
      { position: 1, title: mainTopic.trim(), keyPoints: [], role: "overview", provenance: "legacy_migrated" },
    ];
    
    if (subtopic1?.trim()) {
      slides.push({ position: 2, title: subtopic1.trim(), keyPoints: [], role: "slide", provenance: "legacy_migrated" });
    }
    
    if (subtopic2?.trim()) {
      slides.push({ position: 3, title: subtopic2.trim(), keyPoints: [], role: "slide", provenance: "legacy_migrated" });
    }
    
    if (slides.length >= 2) {
      return {
        version: LEARNING_ASSET_CONTRACT_VERSION,
        slides,
        sourceMode: "gemini-topics",
        legacyRecordId: undefined,
      };
    }
  }
  
  return null;
}

export interface QuizQuestionFromSlide {
  slidePosition: number;
  slideTitle: string;
  suggestedQuestionCount: number;
}

export function deriveQuizQuestionsFromSlides(
  slides: GammaSlide[],
  questionsPerSlide: number = 2
): QuizQuestionFromSlide[] {
  return slides
    .filter(slide => slide.role !== "overview")
    .map(slide => ({
      slidePosition: slide.position,
      slideTitle: slide.title,
      suggestedQuestionCount: Math.min(questionsPerSlide, Math.max(1, slide.keyPoints.length)),
    }));
}

export interface CourseModuleFromSlides {
  order: number;
  name: string;
  description: string;
  isOverview: boolean;
  sourceSlidePosition?: number;
}

export function deriveCourseModulesFromSlides(
  slides: GammaSlide[],
  courseTitle: string
): CourseModuleFromSlides[] {
  return slides.map((slide, index) => ({
    order: index + 1,
    name: slide.title,
    description: slide.keyPoints.length > 0 
      ? slide.keyPoints.slice(0, 2).join('. ') + '.'
      : `Learn about ${slide.title.toLowerCase()} in the context of ${courseTitle}.`,
    isOverview: slide.role === "overview",
    sourceSlidePosition: slide.position,
  }));
}
