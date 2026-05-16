import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';

describe('Course lesson manual creation contract', () => {
  const courseLessonsSource = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/CourseLessons.tsx'),
    'utf8'
  );
  const courseRoutesSource = fs.readFileSync(
    path.resolve(process.cwd(), 'server/routes/courseRoutes.ts'),
    'utf8'
  );
  const courseServiceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'server/services/courseService.ts'),
    'utf8'
  );
  const courseLessonServiceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'server/services/courseLessonService.ts'),
    'utf8'
  );
  const lessonServiceSource = fs.readFileSync(
    path.resolve(process.cwd(), 'server/services/lessonService.ts'),
    'utf8'
  );
  const lessonViewerSource = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/pages/LessonViewer.tsx'),
    'utf8'
  );
  const queryClientSource = fs.readFileSync(
    path.resolve(process.cwd(), 'client/src/lib/queryClient.ts'),
    'utf8'
  );

  it('creates an actual linked empty lesson when using Add Manually', () => {
    expect(courseLessonsSource).toContain("createEmptyLesson: action === 'manual'");
    expect(courseRoutesSource).toContain('createEmptyLesson');
    expect(courseRoutesSource).toContain('CourseService.createEmptyLessonTopic');
  });

  it('allows any linked lesson to be removed from a course and exposes explicit structural role changes', () => {
    expect(courseLessonsSource).toContain('showRemoveFromCourse: !!lessonData?.id');
    expect(courseLessonsSource).toContain('showSetCourseLessonType={true}');
    expect(courseLessonsSource).toContain('select-lesson-type-');
    expect(courseRoutesSource).toContain("app.patch('/api/courses/:courseId/lessons/:lessonId/type'");
    expect(courseRoutesSource).toContain("lessonType must be overview, content, or key_takeaways");
    expect(courseRoutesSource).toContain('matchingFrameworkTopic');
    expect(courseLessonServiceSource).toContain('Repaired missing courseLessons link');
    expect(courseRoutesSource).not.toContain('Overview and key takeaways lessons cannot be removed from a course');
  });

  it('defaults new and restored course lessons to content instead of positional structural roles', () => {
    expect(courseServiceSource).toContain("lessonType: 'content'");
    expect(courseLessonServiceSource).toContain("lessonType: 'content'");
    expect(lessonServiceSource).toContain('Missing metadata defaults to content');
    expect(lessonServiceSource).not.toContain('link.topicOrder === bounds.max');
    expect(courseLessonsSource).not.toContain("if (topic.order === 0) return 'overview'");
    expect(courseLessonsSource).not.toContain("return 'key_takeaways';\\n    return 'content';");
  });

  it('allows reordering all lesson types and syncs courseLessons topic order', () => {
    expect(courseLessonsSource).toContain('reorderMutation.mutate({ topicId: getTopicIdentifier(topic), newOrder: targetTopic.order })');
    expect(courseRoutesSource).not.toContain('Cannot reorder overview or key takeaways topics');
    expect(courseRoutesSource).not.toContain('Cannot move a topic into the overview position');
    expect(courseRoutesSource).not.toContain('Cannot move a topic into the key takeaways position');
    expect(courseRoutesSource).toContain('topicOrder: t.order');
    expect(courseRoutesSource).toContain('lessonType,');
  });

  it('refreshes learner-facing course order caches after lesson reordering', () => {
    const reorderSuccessBlock = courseLessonsSource.match(/const reorderMutation = useMutation\(\{[\s\S]*?const setLessonTypeMutation = useMutation/)?.[0] || '';
    expect(reorderSuccessBlock).toContain('invalidateLessonCaches({ courseId: courseId || undefined })');
    expect(reorderSuccessBlock).toContain("queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false })");
    expect(queryClientSource).toContain('key[0] === `/api/courses/${options.courseId}`');
  });

  it('does not block content artifact generation on overview or key takeaways workflows', () => {
    expect(courseRoutesSource).toContain("if (lessonType !== 'key_takeaways') return null");
    expect(lessonServiceSource).toContain("if (links.some(l => l.lessonType === 'content'))");
    expect(lessonServiceSource).not.toContain('if (link.topicOrder === bounds.max');
  });

  it('keeps lesson material collapsed by default in the learner viewer', () => {
    expect(lessonViewerSource).toContain('const [isLessonMaterialExpanded, setIsLessonMaterialExpanded] = useState(false)');
    expect(lessonViewerSource).toContain('data-testid="button-toggle-lesson-material"');
    expect(lessonViewerSource).toContain('{isLessonMaterialExpanded && (');
  });

  it('uses Source DB content versions for quick access and activates them through the source current endpoint', () => {
    expect(courseLessonsSource).toContain('sourceContentVersions: ArtifactSelectorContentVersion[]');
    expect(courseLessonsSource).toContain('/content-versions');
    expect(courseLessonsSource).toContain('/source-document/set-current-version');
    expect(courseLessonsSource).toContain('setSourceContentCurrentVersionFromSelector');
    expect(courseLessonsSource).not.toContain("setActiveAction.onClick = () => { void setLessonVersionActiveFromSelector(targetLessonId, selectedDocVersionId); };");
  });
});
