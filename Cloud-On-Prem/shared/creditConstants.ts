export const LP_CREDITS_NAME = "LP Credits";
export const LP_CREDITS_SHORT = "LPC";

export const MIN_CREDITS_WITH_IMAGES = 140;
export const MIN_CREDITS_NO_IMAGES = 40;

export const MAX_CREDITS_WITH_IMAGES = 290;
export const MAX_CREDITS_NO_IMAGES = 90;

export const LESSON_BASE_CREDITS = 40;
export const LESSON_WITH_IMAGES_CREDITS = 140;

export const QUIZ_TIER_10_CREDITS = 20;
export const QUIZ_TIER_15_CREDITS = 25;
export const QUIZ_TIER_20_CREDITS = 30;

export const QUIZ_TIERS = {
  "10": { questionCount: 10, defaultCredits: QUIZ_TIER_10_CREDITS, label: "10 Questions" },
  "15": { questionCount: 15, defaultCredits: QUIZ_TIER_15_CREDITS, label: "15 Questions" },
  "20": { questionCount: 20, defaultCredits: QUIZ_TIER_20_CREDITS, label: "20 Questions" },
} as const;

export type QuizTier = keyof typeof QUIZ_TIERS;

export const COURSE_FRAMEWORK_CREDITS = 20;
export const COURSE_PER_TOPIC_CREDITS = 3;
export const COURSE_MAX_CREDITS = 50;

// AI Thumbnail Generation Credits
export const THUMBNAIL_GENERATION_CREDITS = 15; // Default LP credits per AI thumbnail generation

// Lesson Health Report Credits
export const HEALTH_REPORT_CREDITS = 10; // Default LP credits per lesson feedback/health report

// Topic Analysis Credits
export const TOPIC_ANALYSIS_CREDITS = 5; // Default LP credits per AI topic analysis in Course Document Wizard

export const BUNDLE_DISCOUNT_PERCENT = 15;

export type GenerationStage = 'lesson' | 'quiz' | 'course-framework';
export type OrchestrationMode = 'lesson-only' | 'lesson-with-quiz' | 'lesson-with-course' | 'full-chain';

export interface StageCreditCost {
  stage: GenerationStage;
  baseCredits: number;
  variableCredits: number;
  maxCredits: number;
  estimatedCredits: number;
}

export interface ChainedCreditCost {
  mode: OrchestrationMode;
  stages: StageCreditCost[];
  subtotal: number;
  bundleDiscount: number;
  total: number;
}

export interface QuizTierPricing {
  tier: QuizTier;
  questionCount: number;
  creditCost: number;
  label: string;
}

export function getRequiredCredits(includeImages: boolean): number {
  return includeImages ? MIN_CREDITS_WITH_IMAGES : MIN_CREDITS_NO_IMAGES;
}

export function hasEnoughCredits(balance: number, includeImages: boolean): boolean {
  return balance >= getRequiredCredits(includeImages);
}

export function calculateLessonCredits(includeImages: boolean, slideCount: number = 5): number {
  const baseCredits = includeImages ? LESSON_WITH_IMAGES_CREDITS : LESSON_BASE_CREDITS;
  return Math.min(baseCredits, includeImages ? MAX_CREDITS_WITH_IMAGES : MAX_CREDITS_NO_IMAGES);
}

export function getQuizTierCredits(tier: QuizTier): number {
  return QUIZ_TIERS[tier].defaultCredits;
}

export function calculateQuizCredits(tier: QuizTier): number {
  return QUIZ_TIERS[tier].defaultCredits;
}

export function calculateCourseFrameworkCredits(topicCount: number): number {
  const credits = COURSE_FRAMEWORK_CREDITS + (topicCount * COURSE_PER_TOPIC_CREDITS);
  return Math.min(credits, COURSE_MAX_CREDITS);
}

export function calculateChainedCredits(
  mode: OrchestrationMode,
  options: {
    includeImages?: boolean;
    slideCount?: number;
    quizTier?: QuizTier;
    topicCount?: number;
  } = {}
): ChainedCreditCost {
  const { 
    includeImages = false, 
    slideCount = 5, 
    quizTier = "10",
    topicCount = 5 
  } = options;

  const stages: StageCreditCost[] = [];
  
  if (mode === 'lesson-only' || mode === 'lesson-with-quiz' || mode === 'lesson-with-course' || mode === 'full-chain') {
    stages.push({
      stage: 'lesson',
      baseCredits: includeImages ? LESSON_WITH_IMAGES_CREDITS : LESSON_BASE_CREDITS,
      variableCredits: 0,
      maxCredits: includeImages ? MAX_CREDITS_WITH_IMAGES : MAX_CREDITS_NO_IMAGES,
      estimatedCredits: calculateLessonCredits(includeImages, slideCount),
    });
  }
  
  if (mode === 'lesson-with-quiz' || mode === 'full-chain') {
    const quizCredits = calculateQuizCredits(quizTier);
    stages.push({
      stage: 'quiz',
      baseCredits: quizCredits,
      variableCredits: 0,
      maxCredits: quizCredits,
      estimatedCredits: quizCredits,
    });
  }
  
  if (mode === 'lesson-with-course' || mode === 'full-chain') {
    stages.push({
      stage: 'course-framework',
      baseCredits: COURSE_FRAMEWORK_CREDITS,
      variableCredits: topicCount * COURSE_PER_TOPIC_CREDITS,
      maxCredits: COURSE_MAX_CREDITS,
      estimatedCredits: calculateCourseFrameworkCredits(topicCount),
    });
  }

  const subtotal = stages.reduce((sum, s) => sum + s.estimatedCredits, 0);
  const bundleDiscount = stages.length > 1 ? Math.floor(subtotal * BUNDLE_DISCOUNT_PERCENT / 100) : 0;
  const total = subtotal - bundleDiscount;

  return {
    mode,
    stages,
    subtotal,
    bundleDiscount,
    total,
  };
}

export function hasEnoughCreditsForChain(balance: number, mode: OrchestrationMode, options?: {
  includeImages?: boolean;
  slideCount?: number;
  quizTier?: QuizTier;
  topicCount?: number;
}): boolean {
  const cost = calculateChainedCredits(mode, options);
  return balance >= cost.total;
}

export function getCreditsNeededForChain(balance: number, mode: OrchestrationMode, options?: {
  includeImages?: boolean;
  slideCount?: number;
  quizTier?: QuizTier;
  topicCount?: number;
}): number {
  const cost = calculateChainedCredits(mode, options);
  return Math.max(0, cost.total - balance);
}

export function formatLpCredits(amount: number): string {
  return `${amount} ${LP_CREDITS_SHORT}`;
}

export function formatLpCreditsLong(amount: number): string {
  return `${amount} ${LP_CREDITS_NAME}`;
}

/**
 * Get the credit cost for AI thumbnail generation.
 * This returns the default value; actual pricing may be configured in platform pricing.
 */
export function getThumbnailGenerationCredits(): number {
  return THUMBNAIL_GENERATION_CREDITS;
}

/**
 * Check if user has enough credits for thumbnail generation.
 */
export function hasEnoughCreditsForThumbnail(balance: number, creditCost: number = THUMBNAIL_GENERATION_CREDITS): boolean {
  return balance >= creditCost;
}

/**
 * Get the number of credits needed for thumbnail generation.
 */
export function getCreditsNeededForThumbnail(balance: number, creditCost: number = THUMBNAIL_GENERATION_CREDITS): number {
  return Math.max(0, creditCost - balance);
}
