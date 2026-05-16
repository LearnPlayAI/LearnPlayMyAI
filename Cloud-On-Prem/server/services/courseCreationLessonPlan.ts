import { normalizeTopicLabel } from './courseFrameworkTopicValidation';

export function buildCourseCreationPlaceholderLesson(type: 'overview' | 'key_takeaways'): any {
  const isOverview = type === 'overview';
  return {
    title: isOverview ? 'Overview' : 'Key Takeaways',
    description: isOverview
      ? 'Placeholder lesson. Create the course overview after the content lessons are edited.'
      : 'Placeholder lesson. Create the key takeaways after the content lessons are edited.',
    objectives: [],
    learningObjectives: [],
    keyTerms: [],
    assessmentIdeas: [],
    isFromContent: false,
    isSelected: true,
    isOverview,
    lessonType: type,
    sourceContent: '',
    sourceSegmentIds: [],
    sourceAssets: [],
    contentStatus: 'placeholder',
    canGenerate: true,
    metadata: {
      placeholder: true,
      createdDuringCourseCreation: false,
    },
  };
}

export function buildDeterministicLessonsFromTopics(
  topicNames: string[],
  targetAudience: 'beginner' | 'intermediate' | 'advanced' = 'intermediate'
): any[] {
  const cleanTopics = Array.from(new Set(topicNames.map(topic => normalizeTopicLabel(topic)).filter(Boolean)));
  const objectivesByAudience: Record<'beginner' | 'intermediate' | 'advanced', string> = {
    beginner: 'Describe the core concepts using source-backed evidence',
    intermediate: 'Apply source-backed concepts to practical scenarios',
    advanced: 'Critically evaluate source-backed concepts in complex contexts',
  };

  const lessons: any[] = [buildCourseCreationPlaceholderLesson('overview')];

  for (const topic of cleanTopics) {
    lessons.push({
      title: topic,
      description: `Source-grounded lesson for topic: ${topic}`,
      objectives: [objectivesByAudience[targetAudience]],
      isFromContent: true,
      isSelected: true,
      lessonType: 'content',
      sourceContent: '',
      sourceSegmentIds: [],
    });
  }

  lessons.push(buildCourseCreationPlaceholderLesson('key_takeaways'));

  return lessons;
}

export function normalizeCourseCreationLessonPlan(lessons: any[]): any[] {
  const contentLessons = (lessons || [])
    .filter((lesson) => {
      const type = String(lesson?.lessonType || '').toLowerCase();
      return lesson?.isOverview !== true && type !== 'overview' && type !== 'key_takeaways';
    })
    .map((lesson) => ({
      ...lesson,
      isOverview: false,
      lessonType: 'content',
      isSelected: lesson?.isSelected !== false,
    }));

  return [
    buildCourseCreationPlaceholderLesson('overview'),
    ...contentLessons,
    buildCourseCreationPlaceholderLesson('key_takeaways'),
  ];
}
