import { useRoute, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, BookOpen, Eye, Loader2, AlertCircle, CheckCircle, Play } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { buildCourseLanguageQuery, buildCourseLessonsHref, getRequestedLanguageCodeFromSearch } from '@/lib/courseLanguageRouting';

interface Topic {
  id: string;
  order: number;
  name: string;
  description?: string;
  isOverview?: boolean;
  lessonId: string | null;
}

interface CourseFramework {
  id: string;
  courseId: string;
  topics: Topic[];
}

interface Course {
  id: string;
  title: string;
  description?: string;
  organizationId: string;
  status: string;
}

export default function CoursePreview() {
  const [, params] = useRoute('/course-builder/:id/preview');
  const courseId = params?.id;
  const selectedLanguageCode = getRequestedLanguageCodeFromSearch(window.location.search);
  const selectedLanguageQuery = buildCourseLanguageQuery(selectedLanguageCode);

  const { data: framework, isLoading: frameworkLoading } = useQuery<CourseFramework>({
    queryKey: ['/api/courses', courseId, 'framework'],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/framework`, {
        credentials: 'include',
      });
      if (!response.ok) {
        if (response.status === 404) {
          return { id: '', courseId: courseId || '', topics: [] };
        }
        throw new Error('Failed to load course framework');
      }
      return response.json();
    },
    enabled: !!courseId,
  });

  const { data: course, isLoading: courseLoading } = useQuery<Course>({
    queryKey: ['/api/courses', courseId, 'details', { languageCode: selectedLanguageCode || undefined }],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}${selectedLanguageQuery}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to load course details');
      }
      return response.json();
    },
    enabled: !!courseId,
  });

  const topics = (framework?.topics || []).sort((a, b) => a.order - b.order);
  const topicsWithLessons = topics.filter(t => t.lessonId);
  
  const isLoading = frameworkLoading || courseLoading;

  if (isLoading) {
    return (
      <QuizAdminLayout title="Course Preview">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Course Preview">
      <div className="space-y-6 pb-8">
        <div className="flex items-center justify-between">
          <Link href={`/course-builder/${courseId}/lessons${selectedLanguageQuery}`}>
            <Button variant="ghost" data-testid="button-back">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Lessons
            </Button>
          </Link>
          
          <Badge variant="outline" >
            <Eye className="h-3 w-3 mr-1" />
            Preview Mode
          </Badge>
        </div>

        <Card className="bg-surface-base border-border">
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-primary/20">
                <BookOpen className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-2xl text-foreground mb-2" data-testid="text-course-title">
                  {course?.title || 'Untitled Course'}
                </CardTitle>
                <CardDescription className="text-muted-foreground text-base">
                  {course?.description || 'No description provided'}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <BookOpen className="h-4 w-4" />
                {topicsWithLessons.length} lessons
              </span>
              <Badge variant={course?.status === 'active' ? 'default' : 'secondary'}>
                {course?.status === 'active' ? 'Published' : 'Draft'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Course Content</h2>
          
          {topics.length === 0 ? (
            <Card className="bg-card/50 border-border">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No lessons in this course yet</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {topics.map((topic, index) => (
                <Card 
                  key={topic.id} 
                  className={`transition-all ${
                    topic.lessonId 
                      ? 'bg-card/60 border-border hover:border-border' 
                      : 'bg-card/30 border-border/50 opacity-60'
                  }`}
                  data-testid={`card-lesson-preview-${index}`}
                >
                  <CardHeader className="py-4">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                        topic.lessonId 
                          ? 'bg-primary/20 text-primary' 
                          : 'bg-muted/50 text-muted-foreground'
                      }`}>
                        {topic.order + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-base text-foreground truncate">
                            {topic.name}
                          </CardTitle>
                          {topic.lessonId ? (
                            <CheckCircle className="h-4 w-4 text-primary flex-shrink-0" />
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Not ready
                            </Badge>
                          )}
                        </div>
                        {topic.description && (
                          <CardDescription className="text-sm text-muted-foreground truncate">
                            {topic.description}
                          </CardDescription>
                        )}
                      </div>
                      {topic.lessonId && typeof topic.lessonId === 'string' && (
                        <Link href={buildCourseLessonsHref({ lessonId: topic.lessonId, courseId: courseId || '', languageCode: selectedLanguageCode })}>
                          <Button size="sm" data-testid={`button-view-lesson-${index}`} >
                            <Play className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                      )}
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="bg-secondary/20 border-secondary/30">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Eye className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-secondary font-medium">Preview Mode</p>
                <p className="text-muted-foreground text-sm">
                  This is how your course will appear to learners. Lessons marked as "Not ready" will not be visible to them until generated.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
