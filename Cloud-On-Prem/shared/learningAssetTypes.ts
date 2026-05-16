import { z } from "zod";
import { learningAssetContractSchema, type LearningAssetContract, type GammaSlide } from "./contentParsers";

export const LEARNING_ASSET_API_VERSION = "2.0";
export const LEGACY_API_VERSION = "1.0";

export const generationStageEnum = z.enum([
  "lesson",
  "quiz",
  "course-framework",
]);
export type GenerationStage = z.infer<typeof generationStageEnum>;

export const orchestrationModeEnum = z.enum([
  "lesson-only",
  "lesson-with-quiz",
  "lesson-with-course",
  "full-chain",
]);
export type OrchestrationMode = z.infer<typeof orchestrationModeEnum>;

export const lessonRequestV1Schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  gradeLevel: z.string().optional(),
  subject: z.string().optional(),
  mainTopic: z.string().optional(),
  subtopic1: z.string().optional(),
  subtopic2: z.string().optional(),
  inputText: z.string().optional(),
  generationMode: z.enum(["gemini-topics", "text-input", "document-upload", "manual-upload"]).optional(),
  includeImages: z.boolean().optional(),
});
export type LessonRequestV1 = z.infer<typeof lessonRequestV1Schema>;

export const lessonRequestV2Schema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  gradeLevel: z.string().optional(),
  subject: z.string().optional(),
  contract: learningAssetContractSchema.optional(),
  generationMode: z.enum(["gemini-topics", "text-input", "document-upload", "manual-upload"]).optional(),
  includeImages: z.boolean().optional(),
  orchestrationMode: orchestrationModeEnum.optional(),
  quizOptions: z.object({
    questionsPerSlide: z.number().min(1).max(5).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  }).optional(),
  courseOptions: z.object({
    enhanceTopics: z.boolean().optional(),
  }).optional(),
});
export type LessonRequestV2 = z.infer<typeof lessonRequestV2Schema>;

export const lessonResponseV1Schema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  presentationUrl: z.string().nullable(),
  topics: z.array(z.object({
    position: z.number(),
    title: z.string(),
    role: z.enum(["overview", "slide"]),
  })).nullable(),
});
export type LessonResponseV1 = z.infer<typeof lessonResponseV1Schema>;

export const lessonResponseV2Schema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.string(),
  presentationUrl: z.string().nullable(),
  contract: learningAssetContractSchema.nullable(),
  orchestration: z.object({
    capabilities: z.object({
      canGenerateQuiz: z.boolean(),
      canGenerateCourse: z.boolean(),
      slideCount: z.number(),
      keyPointCount: z.number(),
      hasValidOverview: z.boolean(),
    }),
    chainedResults: z.object({
      quizId: z.string().nullable(),
      quizQuestionCount: z.number().nullable(),
      courseTopicsGenerated: z.number().nullable(),
    }).nullable(),
    warnings: z.array(z.string()),
  }).optional(),
  apiVersion: z.string(),
  isLegacyRecord: z.boolean(),
});
export type LessonResponseV2 = z.infer<typeof lessonResponseV2Schema>;

export interface CreditEstimate {
  stage: GenerationStage;
  minCredits: number;
  maxCredits: number;
  estimatedCredits: number;
}

export interface ChainedCreditEstimate {
  mode: OrchestrationMode;
  stages: CreditEstimate[];
  totalMinCredits: number;
  totalMaxCredits: number;
  totalEstimatedCredits: number;
  bundleDiscount: number;
}

export function convertV1ToV2Request(v1: LessonRequestV1): LessonRequestV2 {
  return {
    title: v1.title,
    description: v1.description,
    gradeLevel: v1.gradeLevel,
    subject: v1.subject,
    generationMode: v1.generationMode,
    includeImages: v1.includeImages,
    orchestrationMode: "lesson-only",
  };
}

export function convertV2ToV1Response(v2: LessonResponseV2): LessonResponseV1 {
  const topics = v2.contract?.slides?.map(slide => ({
    position: slide.position,
    title: slide.title,
    role: slide.role,
  })) ?? null;

  return {
    id: v2.id,
    title: v2.title,
    description: v2.description,
    status: v2.status,
    presentationUrl: v2.presentationUrl,
    topics,
  };
}

export function isV2ApiEnabled(): boolean {
  return process.env.ENABLE_LEARNING_ASSET_V2_API === "true";
}

export function getApiVersionFromHeader(acceptHeader?: string): "1.0" | "2.0" {
  if (!acceptHeader) return LEGACY_API_VERSION as "1.0";
  
  if (acceptHeader.includes("application/vnd.learnplay.v2+json")) {
    return LEARNING_ASSET_API_VERSION as "2.0";
  }
  
  return LEGACY_API_VERSION as "1.0";
}
