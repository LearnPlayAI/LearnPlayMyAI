import { db } from "../db";
import { lessons, type QuizQuestionTier } from "@shared/schema";
import { eq } from "drizzle-orm";
import { AIService, QuizQuestion, QuizFromContractParams } from "../ai/aiService";
import { CourseTopicAIService, GeneratedTopic, GenerateTopicsFromContractParams } from "./courseTopicAIService";
import { 
  type LearningAssetContract,
  type GammaSlide,
  type ParsedSlide,
  type SlideValidationResult,
  parseGammaSlides,
  validateGammaContent,
  LEARNING_ASSET_CONTRACT_VERSION,
} from "@shared/contentParsers";
import {
  type OrchestrationMode,
  type ChainedCreditCost,
  calculateChainedCredits,
  hasEnoughCreditsForChain,
  getCreditsNeededForChain,
} from "@shared/creditConstants";
import { CreditService } from "./creditService";
import { OrganizationCreditService } from "./organizationCreditService";
import { HybridCreditService, InsufficientHybridCreditsError, type HybridDeductResult } from "./hybridCreditService";
import { quizPricingService } from "./quizPricingService";
import { isQuizCreditChargingEnabled } from "../featureFlags";

const MAX_KEY_POINTS = 5;
const MIN_KEY_POINTS = 2;

function clampKeyPoints(keyPoints: string[]): string[] {
  if (keyPoints.length > MAX_KEY_POINTS) {
    console.warn(`[LessonOrchestration] Clamping ${keyPoints.length} key points to ${MAX_KEY_POINTS}`);
    return keyPoints.slice(0, MAX_KEY_POINTS);
  }
  return keyPoints;
}

function convertParsedSlidesToContract(
  parsedSlides: ParsedSlide[],
  lessonId: string,
  lessonTitle: string
): LearningAssetContract {
  const slides: GammaSlide[] = parsedSlides.map((slide, index) => ({
    position: index + 1,
    title: slide.title,
    keyPoints: clampKeyPoints(slide.keyPoints),
    role: index === 0 ? 'overview' as const : 'slide' as const,
    provenance: 'legacy_migrated' as const,
  }));

  return {
    version: LEARNING_ASSET_CONTRACT_VERSION,
    slides,
    validatedAt: new Date().toISOString(),
    sourceMode: 'text-input',
    legacyRecordId: lessonId,
  };
}

export interface OrchestrationStatus {
  stage: 'idle' | 'validating' | 'generating-quiz' | 'generating-course' | 'complete' | 'error';
  progress: number;
  message: string;
  lessonId?: string;
  quizId?: string;
  courseId?: string;
  error?: string;
}

export interface OrchestrationOptions {
  generateQuiz?: boolean;
  generateCourse?: boolean;
  quizQuestionsPerSlide?: number;
  quizDifficulty?: 'easy' | 'medium' | 'hard';
  enhanceCourseTopics?: boolean;
  onProgress?: (status: OrchestrationStatus) => void;
  userId?: string;
  organizationId?: string;
  quizTier?: QuizQuestionTier;
}

export interface LessonWithContract {
  id: string;
  title: string;
  description?: string | null;
  learningAssetContract?: LearningAssetContract | null;
  inputText?: string | null;
  organizationId: string;
  createdBy: string;
}

export interface OrchestrationResult {
  success: boolean;
  lesson: LessonWithContract;
  contract: LearningAssetContract;
  quiz?: {
    id: string;
    questions: QuizQuestion[];
  };
  courseTopics?: GeneratedTopic[];
  errors: string[];
  warnings: string[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export class LessonOrchestrationService {
  private aiService: AIService | null = null;
  private courseTopicService: CourseTopicAIService;
  
  constructor() {
    this.courseTopicService = new CourseTopicAIService();
  }

  private async getAIService(): Promise<AIService> {
    if (!this.aiService) {
      this.aiService = await AIService.getActiveConfig();
      if (!this.aiService) {
        throw new Error("No active AI configuration found. Please configure AI settings.");
      }
    }
    return this.aiService;
  }

  private emitProgress(options: OrchestrationOptions, status: OrchestrationStatus): void {
    if (options.onProgress) {
      options.onProgress(status);
    }
  }

  async getLessonContract(lessonId: string): Promise<{ lesson: LessonWithContract; contract: LearningAssetContract } | null> {
    const lessonResults = await db
      .select({
        id: lessons.id,
        title: lessons.title,
        description: lessons.description,
        learningAssetContract: lessons.learningAssetContract,
        inputText: lessons.inputText,
        organizationId: lessons.organizationId,
        createdBy: lessons.createdBy,
      })
      .from(lessons)
      .where(eq(lessons.id, lessonId))
      .limit(1);

    if (lessonResults.length === 0) {
      return null;
    }

    const lesson = lessonResults[0] as LessonWithContract;
    let contract: LearningAssetContract;

    if (lesson.learningAssetContract) {
      contract = lesson.learningAssetContract;
    } else if (lesson.inputText) {
      const validation = validateGammaContent(lesson.inputText);
      
      if (!validation.valid) {
        throw new Error(`Legacy content validation failed: ${validation.error}`);
      }
      
      contract = convertParsedSlidesToContract(validation.slides, lesson.id, lesson.title);
    } else {
      throw new Error("Lesson has no content to process");
    }

    return { lesson, contract };
  }

  async validateLessonContract(lessonId: string): Promise<{
    isValid: boolean;
    errors: ValidationError[];
    contract?: LearningAssetContract;
  }> {
    try {
      const result = await this.getLessonContract(lessonId);
      if (!result) {
        return {
          isValid: false,
          errors: [{ field: 'lesson', message: 'Lesson not found', severity: 'error' }],
        };
      }

      const { contract } = result;
      
      const contentString = contract.slides.map(slide => 
        `${slide.title}\n${slide.keyPoints.join('\n')}`
      ).join('\n---\n');
      
      const validation = validateGammaContent(contentString);
      
      const errors: ValidationError[] = [];
      if (!validation.valid && validation.error) {
        errors.push({ field: 'content', message: validation.error, severity: 'error' });
      }
      
      return {
        isValid: validation.valid,
        errors,
        contract: validation.valid ? contract : undefined,
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [{
          field: 'general',
          message: error instanceof Error ? error.message : 'Unknown validation error',
          severity: 'error',
        }],
      };
    }
  }

  async orchestrateFromLesson(
    lessonId: string,
    options: OrchestrationOptions = {}
  ): Promise<OrchestrationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let quiz: { id: string; questions: QuizQuestion[] } | undefined;
    let courseTopics: GeneratedTopic[] | undefined;

    this.emitProgress(options, {
      stage: 'validating',
      progress: 10,
      message: 'Validating lesson content...',
      lessonId,
    });

    const lessonResult = await this.getLessonContract(lessonId);
    if (!lessonResult) {
      return {
        success: false,
        lesson: { id: lessonId, title: 'Unknown', organizationId: '', createdBy: '' },
        contract: { version: '1.0.0', slides: [] },
        errors: ['Lesson not found'],
        warnings,
      };
    }

    const { lesson, contract } = lessonResult;

    const contentString = contract.slides.map(slide => 
      `${slide.title}\n${slide.keyPoints.join('\n')}`
    ).join('\n---\n');
    
    const validation = validateGammaContent(contentString);
    if (!validation.valid) {
      return {
        success: false,
        lesson,
        contract,
        errors: [validation.error || 'Validation failed'],
        warnings,
      };
    }

    this.emitProgress(options, {
      stage: 'validating',
      progress: 20,
      message: 'Content validated successfully',
      lessonId,
    });

    if (options.generateQuiz) {
      this.emitProgress(options, {
        stage: 'generating-quiz',
        progress: 40,
        message: 'Generating quiz questions from lesson content...',
        lessonId,
      });

      const creditChargingEnabled = isQuizCreditChargingEnabled();
      let hybridDeductResult: HybridDeductResult | null = null;
      let creditCost = 0;
      
      const userId = options.userId || lesson.createdBy;
      const organizationId = options.organizationId || lesson.organizationId;
      const tier = options.quizTier || '10';
      
      try {
        if (creditChargingEnabled) {
          creditCost = await quizPricingService.getTierCreditCost(organizationId, tier);
          console.log(
            `[LessonOrchestration] Quiz credit charging enabled. Tier: ${tier}, Cost: ${creditCost} credits. ` +
            `User: ${userId}, Org: ${organizationId}`
          );

          const correlationId = `lesson_quiz_gen_${lessonId}_${tier}_${Date.now()}`;
          
          hybridDeductResult = await HybridCreditService.deductWithFallback({
            userId,
            organizationId,
            amount: creditCost,
            type: 'quiz_generation',
            correlationId,
            description: `Quiz generation from lesson (tier: ${tier}, ${creditCost} credits)`,
            activityType: 'quiz_generation',
            metadata: {
              lessonId,
              lessonTitle: lesson.title,
              quizTier: tier,
              activityName: `Quiz generation (${tier} questions tier)`,
            },
          });

          console.log(
            `[LessonOrchestration] Credits deducted via HybridCreditService. ` +
            `Source: ${hybridDeductResult.creditSource}, ` +
            `User deducted: ${hybridDeductResult.userAmountDeducted}, ` +
            `Org deducted: ${hybridDeductResult.orgAmountDeducted}`
          );
        } else {
          console.log('[LessonOrchestration] Quiz credit charging is disabled, skipping deduction');
        }

        const aiService = await this.getAIService();
        const quizParams: QuizFromContractParams = {
          learningAssetContract: contract,
          questionsPerSlide: options.quizQuestionsPerSlide || 2,
          difficulty: options.quizDifficulty || 'medium',
        };

        const questions = await aiService.generateQuizFromContract(quizParams);
        
        quiz = {
          id: `quiz_${Date.now()}`,
          questions,
        };

        this.emitProgress(options, {
          stage: 'generating-quiz',
          progress: 60,
          message: `Generated ${questions.length} quiz questions`,
          lessonId,
          quizId: quiz.id,
        });

        console.log(
          `[LessonOrchestration] Quiz generated successfully. Questions: ${questions.length}` +
          (hybridDeductResult ? `, Credits charged: ${creditCost}` : '')
        );
      } catch (error) {
        if (error instanceof InsufficientHybridCreditsError) {
          console.error(
            `[LessonOrchestration] Insufficient credits for quiz generation. ` +
            `User: ${error.userId}, Org: ${error.organizationId}, ` +
            `User balance: ${error.userBalance}, Org balance: ${error.orgBalance}, ` +
            `Required: ${error.requiredAmount}`
          );
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : 'Failed to generate quiz';
        errors.push(`Quiz generation failed: ${errorMessage}`);
        warnings.push('You can retry quiz generation later');

        if (creditChargingEnabled && hybridDeductResult) {
          console.log(
            `[LessonOrchestration] AI generation failed, refunding credits. ` +
            `Source: ${hybridDeductResult.creditSource}, ` +
            `User amount: ${hybridDeductResult.userAmountDeducted}, Org amount: ${hybridDeductResult.orgAmountDeducted}`
          );
          try {
            if (hybridDeductResult.userAmountDeducted > 0 && hybridDeductResult.userTransactionId) {
              const userRefundResult = await CreditService.refundCredits(
                userId,
                organizationId,
                hybridDeductResult.userAmountDeducted,
                undefined,
                `AI generation failed - refund for quiz (tier: ${tier}) - reason: ai_failure_refund`,
                hybridDeductResult.userTransactionId
              );
              console.log(
                `[LessonOrchestration] User credits refunded successfully. New balance: ${userRefundResult.newBalance}, ` +
                `Refund transaction: ${userRefundResult.transactionId}`
              );
            }
            
            if (hybridDeductResult.orgAmountDeducted > 0 && hybridDeductResult.orgTransactionId) {
              const orgRefundResult = await OrganizationCreditService.refundCredits({
                organizationId,
                actorUserId: userId,
                amount: hybridDeductResult.orgAmountDeducted,
                correlationId: `refund_${hybridDeductResult.orgTransactionId}`,
                reason: `AI generation failed - refund for quiz (tier: ${tier})`,
                metadata: {
                  originalTransactionId: hybridDeductResult.orgTransactionId,
                  lessonId,
                  lessonTitle: lesson.title,
                  quizTier: tier,
                  activityName: `Refund: Quiz generation (${tier} questions tier)`,
                },
              });
              console.log(
                `[LessonOrchestration] Org credits refunded successfully. New balance: ${orgRefundResult.newBalance}, ` +
                `Refund transaction: ${orgRefundResult.transactionId}`
              );
            }
          } catch (refundError) {
            console.error('[LessonOrchestration] Failed to refund credits:', refundError);
            errors.push('Warning: Credits were deducted but refund failed. Please contact support.');
          }
        }
      }
    }

    if (options.generateCourse) {
      this.emitProgress(options, {
        stage: 'generating-course',
        progress: 80,
        message: 'Generating course framework from lesson content...',
        lessonId,
      });

      try {
        const courseParams: GenerateTopicsFromContractParams = {
          courseTitle: lesson.title,
          courseDescription: lesson.description || '',
          difficultyLevel: options.quizDifficulty || 'medium',
          category: 'General',
          learningAssetContract: contract,
        };

        if (options.enhanceCourseTopics) {
          courseTopics = await this.courseTopicService.enhanceTopicsFromContract(courseParams);
        } else {
          courseTopics = await this.courseTopicService.generateTopicsFromContract(courseParams);
        }

        this.emitProgress(options, {
          stage: 'generating-course',
          progress: 90,
          message: `Generated ${courseTopics.length} course topics`,
          lessonId,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate course framework';
        errors.push(`Course framework generation failed: ${errorMessage}`);
        warnings.push('You can retry course generation later');
      }
    }

    this.emitProgress(options, {
      stage: 'complete',
      progress: 100,
      message: 'Orchestration complete',
      lessonId,
      quizId: quiz?.id,
    });

    return {
      success: errors.length === 0,
      lesson,
      contract,
      quiz,
      courseTopics,
      errors,
      warnings,
    };
  }

  async getOrchestrationCapabilities(lessonId: string): Promise<{
    canGenerateQuiz: boolean;
    canGenerateCourse: boolean;
    slideCount: number;
    keyPointCount: number;
    hasValidOverview: boolean;
    warnings: string[];
  }> {
    const result = await this.getLessonContract(lessonId);
    if (!result) {
      return {
        canGenerateQuiz: false,
        canGenerateCourse: false,
        slideCount: 0,
        keyPointCount: 0,
        hasValidOverview: false,
        warnings: ['Lesson not found'],
      };
    }

    const { contract } = result;
    
    const contentString = contract.slides.map(slide => 
      `${slide.title}\n${slide.keyPoints.join('\n')}`
    ).join('\n---\n');
    
    const validation = validateGammaContent(contentString);
    const warnings: string[] = [];
    
    if (!validation.valid && validation.error) {
      warnings.push(validation.error);
    }

    const slideCount = contract.slides.length;
    const keyPointCount = contract.slides.reduce(
      (sum, slide) => sum + slide.keyPoints.length,
      0
    );
    
    const overviewSlide = contract.slides.find(s => s.role === 'overview');
    const hasValidOverview = !!overviewSlide && overviewSlide.keyPoints.length >= 2;

    const canGenerateQuiz = 
      slideCount >= 2 &&
      keyPointCount >= 4 &&
      validation.valid;

    const canGenerateCourse = 
      slideCount >= 2 &&
      hasValidOverview &&
      validation.valid;

    return {
      canGenerateQuiz,
      canGenerateCourse,
      slideCount,
      keyPointCount,
      hasValidOverview,
      warnings,
    };
  }

  estimateCreditCost(
    lessonId: string,
    options: {
      includeImages?: boolean;
      generateQuiz?: boolean;
      generateCourse?: boolean;
      questionsPerSlide?: number;
    } = {}
  ): ChainedCreditCost {
    const { includeImages = false, generateQuiz = false, generateCourse = false, questionsPerSlide = 2 } = options;
    
    let mode: OrchestrationMode = 'lesson-only';
    if (generateQuiz && generateCourse) {
      mode = 'full-chain';
    } else if (generateQuiz) {
      mode = 'lesson-with-quiz';
    } else if (generateCourse) {
      mode = 'lesson-with-course';
    }

    return calculateChainedCredits(mode, {
      includeImages,
      slideCount: 5,
      topicCount: 5,
    });
  }

  checkCreditAvailability(
    balance: number,
    options: {
      includeImages?: boolean;
      generateQuiz?: boolean;
      generateCourse?: boolean;
      questionsPerSlide?: number;
    } = {}
  ): { hasEnough: boolean; needed: number; cost: ChainedCreditCost } {
    const { includeImages = false, generateQuiz = false, generateCourse = false, questionsPerSlide = 2 } = options;
    
    let mode: OrchestrationMode = 'lesson-only';
    if (generateQuiz && generateCourse) {
      mode = 'full-chain';
    } else if (generateQuiz) {
      mode = 'lesson-with-quiz';
    } else if (generateCourse) {
      mode = 'lesson-with-course';
    }

    const costOptions = {
      includeImages,
      slideCount: 5,
      questionCount: 5 * questionsPerSlide,
      topicCount: 5,
    };

    const cost = calculateChainedCredits(mode, costOptions);
    const hasEnough = hasEnoughCreditsForChain(balance, mode, costOptions);
    const needed = getCreditsNeededForChain(balance, mode, costOptions);

    return { hasEnough, needed, cost };
  }
}

export const lessonOrchestrationService = new LessonOrchestrationService();
