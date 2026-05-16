import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatsGrid, type StatItem } from '@/components/ui/stats-grid';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { BookOpen, Trophy, TrendingUp, Play, CheckCircle2, Clock, Home, ArrowRight } from 'lucide-react';
import { useLocation } from 'wouter';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useBrandingCopy } from '@/contexts/BrandingContext';

export default function StudentDashboard() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('assigned');
  const isMobile = useIsMobile();
  const { dashboardWelcome } = useBrandingCopy();

  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();

  const { data: user } = useQuery<any>({ queryKey: ['/api/user'] });
  const { data: assignedQuizzes = [], isLoading: quizzesLoading } = useQuery<any[]>({
    queryKey: ['/api/quiz/assigned'],
  });
  const { data: progress = [], isLoading: progressLoading } = useQuery<any[]>({
    queryKey: ['/api/quiz/my-progress'],
  });
  const { data: organization } = useQuery<any>({
    queryKey: ['/api/my-organization'],
    enabled: !!user?.organizationId,
  });

  const completedQuizzes = progress.filter((p: any) => p.completionRate === 100);
  const inProgressQuizzes = progress.filter((p: any) => p.completionRate > 0 && p.completionRate < 100);
  const averageScore = progress.length > 0
    ? Math.round(progress.reduce((acc: number, p: any) => acc + (p.averageScore || 0), 0) / progress.length)
    : 0;

  const getProgressForQuiz = (quizId: string) => {
    return progress.find((p: any) => p.collectionId === quizId);
  };

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy': return 'bg-success/20 text-success border-[var(--success)]/30';
      case 'medium': return 'bg-warning/20 text-warning border-[var(--warning)]/30';
      case 'hard': return 'bg-destructive/20 text-destructive border-[var(--destructive)]/30';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const stats: StatItem[] = [
    {
      label: 'Assigned Quizzes',
      value: assignedQuizzes.length,
      icon: BookOpen,
    },
    {
      label: 'Completed',
      value: completedQuizzes.length,
      icon: CheckCircle2,
    },
    {
      label: 'Average Score',
      value: `${averageScore}%`,
      icon: Trophy,
    },
  ];

  const renderQuizCard = (quiz: any) => {
    const quizProgress = getProgressForQuiz(quiz.id);
    const isCompleted = quizProgress?.completionRate === 100;
    const isStarted = quizProgress && quizProgress.completionRate > 0;

    return (
      <Card 
        key={quiz.id} 
        className="bg-surface-raised shadow-card border-l-4 border-l-primary transition-shadow duration-200 hover:shadow-elevated hover:shadow-primary/5"
        data-testid={`card-quiz-${quiz.id}`}
      >
        <CardHeader className="p-[var(--card-padding)]">
          <div className="flex items-start justify-between gap-3">
            <CardTitle className="text-lg text-foreground" data-testid={`text-quiz-${quiz.id}`}>
              {quiz.name}
            </CardTitle>
            {isCompleted && (
              <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
            )}
          </div>
          <CardDescription className="text-muted-foreground">{quiz.description || 'No description'}</CardDescription>
        </CardHeader>
        <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge className={getDifficultyColor(quiz.difficulty)}>
              {quiz.difficulty || 'medium'}
            </Badge>
            {isCompleted ? (
              <Badge >
                Completed
              </Badge>
            ) : isStarted ? (
              <Badge >
                In Progress
              </Badge>
            ) : (
              <Badge >
                Not Started
              </Badge>
            )}
          </div>

          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <BookOpen className="h-4 w-4" />
            <span>{quiz.totalCards || 0} questions</span>
          </div>

          {quizProgress && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="font-semibold text-foreground">{quizProgress.completionRate}%</span>
              </div>
              <Progress value={quizProgress.completionRate} className="h-2" />
              {quizProgress.averageScore !== null && (
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                  <Trophy className="h-4 w-4" />
                  <span>Average: {Math.round(quizProgress.averageScore)}%</span>
                </div>
              )}
            </div>
          )}

          <Button onClick={() => setLocation(`/quiz-single/${quiz.id}`)}
            className="w-full min-h-[44px]"
            variant={isCompleted ? 'outline' : 'default'}
            data-testid={`button-start-quiz-${quiz.id}`}
          >
            {isCompleted ? (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Review Again
              </>
            ) : isStarted ? (
              <>
                <Play className="mr-2 h-4 w-4" />
                Continue
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Start Quiz
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  const renderProgressItem = (item: any) => (
    <Card key={item.collectionId} className="bg-surface-raised shadow-card border-l-4 border-l-primary">
      <CardContent className="p-[var(--card-padding)]">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-foreground mb-2 truncate" data-testid={`text-progress-${item.collectionId}`}>
              {item.collectionName}
            </h3>
            <div className="flex flex-wrap gap-2 mb-3">
              <Badge variant="outline" >
                <BookOpen className="h-3 w-3 mr-1" />
                {item.questionsAnswered} / {item.totalQuestions} answered
              </Badge>
              <Badge variant="outline" >
                <Clock className="h-3 w-3 mr-1" />
                {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}
              </Badge>
              {item.averageScore !== null && (
                <Badge className={item.averageScore >= 70 ? 'bg-success/20 text-success border-[var(--success)]/30' : 'bg-warning/20 text-warning border-[var(--warning)]/30'}>
                  <Trophy className="h-3 w-3 mr-1" />
                  {Math.round(item.averageScore)}% average
                </Badge>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Completion</span>
                <span className="font-semibold text-foreground">{item.completionRate}%</span>
              </div>
              <Progress value={item.completionRate} className="h-2" />
            </div>
          </div>
          <Button onClick={() => setLocation(`/quiz-single/${item.collectionId}`)}
            variant="outline"
            className="min-h-[44px] min-w-[44px] shrink-0"
            data-testid={`button-continue-${item.collectionId}`}
          >
            {item.completionRate === 100 ? 'Review' : 'Continue'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  if (!isResolved || !terminology) {
    return (
      <div className="min-h-screen bg-background p-[var(--container-padding)]">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-[var(--container-padding)]">
      <div className="max-w-7xl mx-auto space-y-[var(--space-xl)]">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="min-w-0">
            <h1 
              className="text-[length:var(--text-3xl)] font-bold text-foreground mb-1 truncate"
              data-testid="text-welcome"
            >
              {dashboardWelcome}
            </h1>
            <p className="text-[length:var(--text-base)] text-muted-foreground">
              {organization ? `${organization.name} - ` : ''}{terminology.learner} Dashboard
            </p>
          </div>
          <Button onClick={() => setLocation('/')} 
            variant="outline" 
            className="min-h-[44px] min-w-[44px] shrink-0"
            data-testid="button-home"
          >
            <Home className="mr-2 h-4 w-4" />
            Home
          </Button>
        </div>

        <StatsGrid 
          stats={stats} 
          columns={3}
          isLoading={quizzesLoading || progressLoading}
          data-testid="stats-grid-dashboard"
        />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-[var(--space-lg)]">
          <div className="overflow-x-auto scrollbar-hide">
            <TabsList className="inline-flex sm:grid w-full sm:w-full min-w-max sm:min-w-0 sm:grid-cols-2 bg-muted/50 p-1">
              <TabsTrigger 
                value="assigned" 
                className="flex items-center gap-2 min-h-[44px]"
                data-testid="tab-assigned"
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden sm:inline">Assigned</span> Quizzes
              </TabsTrigger>
              <TabsTrigger 
                value="progress" 
                className="flex items-center gap-2 min-h-[44px]"
                data-testid="tab-progress"
              >
                <TrendingUp className="h-4 w-4" />
                My Progress
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="assigned" className="mt-0">
            {quizzesLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading assigned quizzes...</div>
            ) : assignedQuizzes.length > 0 ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-[var(--card-gap)]">
                {assignedQuizzes.map(renderQuizCard)}
              </div>
            ) : (
              <Card className="bg-surface-raised shadow-card">
                <CardContent className="py-12 text-center">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No Quizzes Assigned
                  </h3>
                  <p className="text-muted-foreground">
                    Your teacher hasn't assigned any quizzes yet. Check back later!
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="progress" className="mt-0">
            {progressLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading progress data...</div>
            ) : progress.length > 0 ? (
              isMobile ? (
                <div className="space-y-[var(--space-md)]">
                  {progress.map((item: any) => (
                    <CollapsibleSection
                      key={item.collectionId}
                      title={item.collectionName}
                      description={`${item.completionRate}% complete • ${Math.round(item.averageScore || 0)}% avg`}
                      icon={item.completionRate === 100 ? CheckCircle2 : TrendingUp}
                      defaultOpen={false}
                    >
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" >
                            <BookOpen className="h-3 w-3 mr-1" />
                            {item.questionsAnswered} / {item.totalQuestions} answered
                          </Badge>
                          <Badge variant="outline" >
                            <Clock className="h-3 w-3 mr-1" />
                            {item.attempts} attempt{item.attempts !== 1 ? 's' : ''}
                          </Badge>
                          {item.averageScore !== null && (
                            <Badge className={item.averageScore >= 70 ? 'bg-success/20 text-success border-[var(--success)]/30' : 'bg-warning/20 text-warning border-[var(--warning)]/30'}>
                              <Trophy className="h-3 w-3 mr-1" />
                              {Math.round(item.averageScore)}% average
                            </Badge>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Completion</span>
                            <span className="font-semibold text-foreground">{item.completionRate}%</span>
                          </div>
                          <Progress value={item.completionRate} className="h-2" />
                        </div>
                        <Button onClick={() => setLocation(`/quiz-single/${item.collectionId}`)}
                          variant="outline"
                          className="w-full min-h-[44px]"
                          data-testid={`button-continue-${item.collectionId}`}
                        >
                          {item.completionRate === 100 ? 'Review' : 'Continue'}
                          <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                      </div>
                    </CollapsibleSection>
                  ))}
                </div>
              ) : (
                <div className="space-y-[var(--space-md)]">
                  {progress.map(renderProgressItem)}
                </div>
              )
            ) : (
              <Card className="bg-surface-raised shadow-card">
                <CardContent className="py-12 text-center">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    No Progress Yet
                  </h3>
                  <p className="text-muted-foreground">
                    Start a quiz to see your progress here
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
