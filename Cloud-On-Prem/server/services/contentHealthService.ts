import { db } from '../db';
import {
  courseLessons,
  courseFrameworks,
  lessons,
  courses,
  type CourseLesson,
  type CourseFramework,
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';

interface LessonHealthScore {
  score: number;
  issues: string[];
  wordCount: number;
  objectiveCoverage: number;
  sourceConfidence: number;
  validatedAt: string;
}

interface FrameworkHealthScore {
  overallScore: number;
  topicScores: Array<{
    topicId: string;
    score: number;
    issues: string[];
  }>;
  hasOverview: boolean;
  hasKeyTakeaways: boolean;
  validatedAt: string;
}

interface N1ValidationResult {
  valid: boolean;
  hasOverview: boolean;
  hasKeyTakeaways: boolean;
  issues: string[];
}

interface CourseHealthResult {
  courseId: string;
  frameworkHealth: FrameworkHealthScore | null;
  lessonHealthScores: Array<{
    lessonId: string;
    topicName: string;
    topicOrder: number;
    health: LessonHealthScore | null;
  }>;
  overallScore: number;
  n1Validation: N1ValidationResult;
}

interface SourceMap {
  documentId?: string;
  documentName?: string;
  rawTextHash?: string;
  sections?: Array<{
    sectionId: string;
    startOffset: number;
    endOffset: number;
    textSpan: string;
    confidence: number;
  }>;
  extractedAt?: string;
}

const MIN_WORD_COUNT = 100;
const OPTIMAL_WORD_COUNT = 500;
const MAX_WORD_COUNT = 2000;

export class ContentHealthService {
  static async scoreContent(
    lessonId: string,
    sourceMap?: SourceMap | null
  ): Promise<LessonHealthScore> {
    const lesson = await db.query.lessons.findFirst({
      where: eq(lessons.id, lessonId),
    });

    if (!lesson) {
      throw new Error('Lesson not found');
    }

    const issues: string[] = [];
    let score = 100;

    const content = this.extractLessonContent(lesson);
    const wordCount = this.countWords(content);
    
    if (wordCount < MIN_WORD_COUNT) {
      issues.push(`Content too short: ${wordCount} words (minimum ${MIN_WORD_COUNT})`);
      score -= 30;
    } else if (wordCount < OPTIMAL_WORD_COUNT) {
      issues.push(`Content below optimal: ${wordCount} words (recommended ${OPTIMAL_WORD_COUNT}+)`);
      score -= 10;
    } else if (wordCount > MAX_WORD_COUNT) {
      issues.push(`Content may be too long: ${wordCount} words (consider splitting)`);
      score -= 5;
    }

    const courseLesson = await db.query.courseLessons.findFirst({
      where: eq(courseLessons.lessonId, lessonId),
    });

    let objectiveCoverage = 0;
    if (courseLesson?.learningObjectives && courseLesson.learningObjectives.length > 0) {
      const objectives = courseLesson.learningObjectives;
      let coveredCount = 0;
      
      for (const objective of objectives) {
        const objLower = objective.toLowerCase();
        const contentLower = content.toLowerCase();
        const keywords = objLower.split(/\s+/).filter(w => w.length > 4);
        const matchCount = keywords.filter(kw => contentLower.includes(kw)).length;
        if (matchCount >= Math.ceil(keywords.length * 0.3)) {
          coveredCount++;
        }
      }
      
      objectiveCoverage = Math.round((coveredCount / objectives.length) * 100);
      
      if (objectiveCoverage < 50) {
        issues.push(`Low objective coverage: ${objectiveCoverage}% (aim for 70%+)`);
        score -= 20;
      } else if (objectiveCoverage < 70) {
        issues.push(`Moderate objective coverage: ${objectiveCoverage}%`);
        score -= 10;
      }
    } else {
      objectiveCoverage = 0;
      issues.push('No learning objectives defined');
      score -= 5;
    }

    let sourceConfidence = 0;
    if (sourceMap && sourceMap.sections && sourceMap.sections.length > 0) {
      const totalSpanLength = sourceMap.sections.reduce(
        (sum, span) => sum + (span.textSpan?.length || 0),
        0
      );
      sourceConfidence = Math.min(100, Math.round((totalSpanLength / (wordCount * 5)) * 100));
      
      if (sourceConfidence < 30) {
        issues.push('Low source document coverage');
        score -= 15;
      }
    } else {
      issues.push('No source document mapping');
      score -= 5;
    }

    score = Math.max(0, Math.min(100, score));

    const healthScore: LessonHealthScore = {
      score,
      issues,
      wordCount,
      objectiveCoverage,
      sourceConfidence,
      validatedAt: new Date().toISOString(),
    };

    if (courseLesson) {
      await db
        .update(courseLessons)
        .set({
          contentHealth: healthScore,
        })
        .where(eq(courseLessons.id, courseLesson.id));
    }

    return healthScore;
  }

  static async validateN1Structure(courseId: string): Promise<N1ValidationResult> {
    const issues: string[] = [];

    const courseLessonRows = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
      orderBy: (cl, { asc }) => [asc(cl.topicOrder)],
    });

    if (courseLessonRows.length === 0) {
      return {
        valid: false,
        hasOverview: false,
        hasKeyTakeaways: false,
        issues: ['No lessons found in course'],
      };
    }

    const firstLesson = courseLessonRows[0];
    const hasOverview = firstLesson?.lessonType === 'overview' || 
                        firstLesson?.topicName?.toLowerCase().includes('overview') ||
                        firstLesson?.topicName?.toLowerCase().includes('introduction');

    if (!hasOverview) {
      issues.push('First lesson should be an overview/introduction');
    }

    const lastLesson = courseLessonRows[courseLessonRows.length - 1];
    const hasKeyTakeaways = lastLesson?.lessonType === 'key_takeaways' ||
                            lastLesson?.topicName?.toLowerCase().includes('takeaway') ||
                            lastLesson?.topicName?.toLowerCase().includes('summary') ||
                            lastLesson?.topicName?.toLowerCase().includes('conclusion');

    if (!hasKeyTakeaways) {
      issues.push('Last lesson should be key takeaways/summary');
    }

    const contentLessons = courseLessonRows.filter(
      cl => cl.lessonType !== 'overview' && cl.lessonType !== 'key_takeaways'
    );
    
    if (contentLessons.length < 1) {
      issues.push('Course should have at least one content lesson between overview and takeaways');
    }

    for (const cl of courseLessonRows) {
      if (!cl.learningObjectives || cl.learningObjectives.length === 0) {
        issues.push(`Lesson "${cl.topicName}" is missing learning objectives`);
      }
    }

    const valid = hasOverview && hasKeyTakeaways && issues.length <= 2;

    return {
      valid,
      hasOverview,
      hasKeyTakeaways,
      issues,
    };
  }

  static async getCourseHealth(courseId: string): Promise<CourseHealthResult> {
    const course = await db.query.courses.findFirst({
      where: eq(courses.id, courseId),
    });

    if (!course) {
      throw new Error('Course not found');
    }

    const framework = await db.query.courseFrameworks.findFirst({
      where: eq(courseFrameworks.courseId, courseId),
    });

    const courseLessonRows = await db.query.courseLessons.findMany({
      where: eq(courseLessons.courseId, courseId),
      orderBy: (cl, { asc }) => [asc(cl.topicOrder)],
    });

    const n1Validation = await this.validateN1Structure(courseId);

    const lessonHealthScores: CourseHealthResult['lessonHealthScores'] = [];
    let totalScore = 0;
    let scoredCount = 0;

    for (const cl of courseLessonRows) {
      let health: LessonHealthScore | null = null;
      
      if (cl.contentHealth) {
        health = cl.contentHealth as LessonHealthScore;
      } else if (cl.lessonId) {
        try {
          health = await this.scoreContent(cl.lessonId, framework?.sourceMap as SourceMap | null);
        } catch {
          health = null;
        }
      }

      lessonHealthScores.push({
        lessonId: cl.lessonId,
        topicName: cl.topicName,
        topicOrder: cl.topicOrder,
        health,
      });

      if (health) {
        totalScore += health.score;
        scoredCount++;
      }
    }

    const overallScore = scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0;

    let frameworkHealth: FrameworkHealthScore | null = null;
    if (framework) {
      if (framework.contentHealth) {
        frameworkHealth = framework.contentHealth as FrameworkHealthScore;
      } else {
        frameworkHealth = await this.computeFrameworkHealth(courseId, framework, lessonHealthScores, n1Validation);
      }
    }

    return {
      courseId,
      frameworkHealth,
      lessonHealthScores,
      overallScore,
      n1Validation,
    };
  }

  static async getLessonHealth(lessonId: string): Promise<LessonHealthScore> {
    const courseLesson = await db.query.courseLessons.findFirst({
      where: eq(courseLessons.lessonId, lessonId),
    });

    if (courseLesson?.contentHealth) {
      return courseLesson.contentHealth as LessonHealthScore;
    }

    let sourceMap: SourceMap | null = null;
    if (courseLesson) {
      const framework = await db.query.courseFrameworks.findFirst({
        where: eq(courseFrameworks.courseId, courseLesson.courseId),
      });
      sourceMap = framework?.sourceMap as SourceMap | null;
    }

    return this.scoreContent(lessonId, sourceMap);
  }

  private static async computeFrameworkHealth(
    courseId: string,
    framework: CourseFramework,
    lessonHealthScores: CourseHealthResult['lessonHealthScores'],
    n1Validation: N1ValidationResult
  ): Promise<FrameworkHealthScore> {
    const topics = (framework.topics || []) as Array<{ id: string; name: string; order: number }>;
    
    const topicScores: FrameworkHealthScore['topicScores'] = topics.map(topic => {
      const lessonHealth = lessonHealthScores.find(l => l.topicOrder === topic.order);
      return {
        topicId: topic.id,
        score: lessonHealth?.health?.score ?? 0,
        issues: lessonHealth?.health?.issues ?? ['No lesson content'],
      };
    });

    const overallScore = lessonHealthScores.length > 0
      ? Math.round(lessonHealthScores.reduce((sum, l) => sum + (l.health?.score ?? 0), 0) / lessonHealthScores.length)
      : 0;

    const frameworkHealth: FrameworkHealthScore = {
      overallScore,
      topicScores,
      hasOverview: n1Validation.hasOverview,
      hasKeyTakeaways: n1Validation.hasKeyTakeaways,
      validatedAt: new Date().toISOString(),
    };

    await db
      .update(courseFrameworks)
      .set({
        contentHealth: frameworkHealth,
        updatedAt: new Date(),
      })
      .where(eq(courseFrameworks.id, framework.id));

    return frameworkHealth;
  }

  private static countWords(text: string): number {
    if (!text) return 0;
    const cleaned = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/[#*_`~\[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned ? cleaned.split(' ').length : 0;
  }

  private static extractLessonContent(lesson: any): string {
    const parts: string[] = [];

    if (lesson.title) {
      parts.push(lesson.title);
    }

    if (lesson.description) {
      parts.push(lesson.description);
    }

    if (lesson.inputText) {
      parts.push(lesson.inputText);
    }

    if (lesson.detail) {
      parts.push(lesson.detail);
    }

    if (lesson.realWorldExample) {
      parts.push(lesson.realWorldExample);
    }

    if (lesson.learningAssetContract) {
      const lac = lesson.learningAssetContract as {
        slides?: Array<{
          title?: string;
          keyPoints?: string[];
          content?: string;
        }>;
      };
      
      if (lac.slides && Array.isArray(lac.slides)) {
        for (const slide of lac.slides) {
          if (slide.title) {
            parts.push(slide.title);
          }
          if (slide.keyPoints && Array.isArray(slide.keyPoints)) {
            parts.push(...slide.keyPoints);
          }
          if (slide.content) {
            parts.push(slide.content);
          }
        }
      }
    }

    if (lesson.topics && Array.isArray(lesson.topics)) {
      for (const topic of lesson.topics) {
        if (topic.title) {
          parts.push(topic.title);
        }
      }
    }

    return parts.join(' ');
  }
}
