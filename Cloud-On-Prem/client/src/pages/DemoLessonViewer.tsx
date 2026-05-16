import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Play,
  Lock,
  GraduationCap,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { VideoPlayer } from "@/components/VideoPlayer";
import { PremiumHeader } from "@/pages/landing";
import { useUser } from "@/hooks/use-user";

type DemoLessonData = {
  lesson: {
    id: string;
    title: string;
    description: string;
    generationStatus: string;
    videoUrl?: string;
    isDemo: boolean;
  };
  viewerUrl?: string;
  courseId: string;
  courseName: string;
};

export default function DemoLessonViewer() {
  const { courseId, lessonId } = useParams();
  const [, setLocation] = useLocation();
  const { user } = useUser();

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{
    isAdmin: boolean;
    isSuperAdmin: boolean;
    isOrgAdmin: boolean;
  }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  const { data: demoData, isLoading, error, refetch: refetchDemoLesson } = useQuery<DemoLessonData>({
    queryKey: ["/api/courses", courseId, "lessons", lessonId, "demo"],
    queryFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/lessons/${lessonId}/demo`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Demo lesson not available');
      }
      return response.json();
    },
    enabled: !!courseId && !!lessonId,
    retry: false,
    refetchInterval: (query) => {
      const data = query.state.data as DemoLessonData | undefined;
      const lesson = data?.lesson;
      const hasPlayableContent = Boolean(lesson?.videoUrl || data?.viewerUrl);
      if (hasPlayableContent) return false;
      const status = lesson?.generationStatus;
      return status === 'pending' || status === 'processing' || status === 'polling' || status === 'completed' ? 5000 : false;
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <PremiumHeader 
          isAuthenticated={isAuthenticated} 
          isAdmin={isAdmin} 
          isSuperAdmin={isSuperAdmin} 
          user={user} 
          isAdminLoading={adminLoading} 
        />
        <div className="pt-32 flex items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Loading demo lesson...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error || !demoData) {
    return (
      <div className="min-h-screen bg-background">
        <PremiumHeader 
          isAuthenticated={isAuthenticated} 
          isAdmin={isAdmin} 
          isSuperAdmin={isSuperAdmin} 
          user={user} 
          isAdminLoading={adminLoading} 
        />
        <div className="pt-32 container mx-auto px-4">
          <Card className="max-w-lg mx-auto">
            <CardHeader className="text-center">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <CardTitle>Demo Not Available</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-muted-foreground">
                {error instanceof Error ? error.message : 'This lesson is not available for preview.'}
              </p>
              <Link href={`/courses/${courseId}`}>
                <Button variant="outline" data-testid="button-back-to-course">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Course
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const lesson = demoData.lesson;

  return (
    <div className="min-h-screen bg-background">
      <PremiumHeader 
        isAuthenticated={isAuthenticated} 
        isAdmin={isAdmin} 
        isSuperAdmin={isSuperAdmin} 
        user={user} 
        isAdminLoading={adminLoading} 
      />
      
      <div className="pt-32 container mx-auto px-4 pb-8">
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href={`/courses/${courseId}`}>
              <Button variant="outline" size="icon" data-testid="button-back">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <p className="text-sm text-muted-foreground">{demoData.courseName}</p>
              <h1 className="text-xl sm:text-2xl font-bold" data-testid="demo-lesson-title">{lesson.title}</h1>
            </div>
          </div>
          <Badge variant="secondary" >
            <Play className="h-3 w-3 mr-1" />
            Free Preview
          </Badge>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardContent className="p-0">
                {lesson.videoUrl ? (
                  <div className="aspect-video">
                    <VideoPlayer 
                      videoUrl={lesson.videoUrl} 
                      title={lesson.title}
                    />
                  </div>
                ) : demoData.viewerUrl ? (
                  <div className="aspect-video">
                    <iframe
                      src={demoData.viewerUrl}
                      className="w-full h-full border-0 rounded-lg"
                      title={lesson.title}
                      allow="fullscreen"
                      data-testid="demo-lesson-iframe"
                    />
                  </div>
                ) : (
                  <div className="aspect-video flex items-center justify-center bg-muted rounded-lg">
                    <div className="text-center p-6">
                      <GraduationCap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-muted-foreground">
                        {lesson.generationStatus === 'completed' 
                          ? 'Content is being prepared...'
                          : 'This lesson is still being generated.'
                        }
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        This page refreshes automatically while content is being prepared.
                      </p>
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => refetchDemoLesson()}
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-2" />
                        Refresh now
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
            
            {lesson.description && (
              <Card className="mt-4">
                <CardHeader>
                  <CardTitle className="text-lg">About This Lesson</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground">{lesson.description}</p>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="lg:col-span-1">
            <Card className="bg-surface-raised border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5 text-primary" />
                  Unlock Full Course
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  You're previewing the first lesson. Enroll in the full course to access all lessons and content.
                </p>
                {isAuthenticated ? (
                  <Link href={`/courses/${courseId}`}>
                    <Button variant="gradient" className="w-full" data-testid="button-view-course">
                      <GraduationCap className="h-4 w-4 mr-2" />
                      View Full Course
                    </Button>
                  </Link>
                ) : (
                  <div className="space-y-2">
                    <Link href={`/courses/${courseId}`}>
                      <Button variant="gradient" className="w-full" data-testid="button-view-course">
                        <GraduationCap className="h-4 w-4 mr-2" />
                        View Full Course
                      </Button>
                    </Link>
                    <p className="text-xs text-center text-muted-foreground">
                      <Link href="/login" className="text-primary hover:underline">Sign in</Link>
                      {' '}or{' '}
                      <Link href="/register" className="text-primary hover:underline">create an account</Link>
                      {' '}to enroll
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
