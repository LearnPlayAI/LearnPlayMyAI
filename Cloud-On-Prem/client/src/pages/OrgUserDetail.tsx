import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, User, Mail, Globe, Gamepad2, BookOpen, Trophy, Target, Search, Filter, CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useAuth } from '@/hooks/useAuth';

interface UserProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  gamerName: string;
  country: string | null;
  profileImageUrl: string | null;
  bio: string | null;
}

interface CourseProgress {
  id: string;
  courseId: string;
  courseName: string;
  status: 'not_started' | 'in_progress' | 'completed';
  percentComplete: number;
  completedLessons: number;
  totalLessons: number;
  startedAt: string | null;
  completedAt: string | null;
}

interface QuizAttempt {
  id: string;
  gameId: string;
  collectionId: string;
  collectionName: string;
  lessonId: string | null;
  lessonName: string | null;
  courseId: string | null;
  courseName: string | null;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  percentage: number;
  passed: boolean;
  completedAt: string;
}

interface QuizAttemptGrouped {
  id: string;
  attemptNumber: number;
  score: number;
  correctAnswers: number;
  totalAnswers: number;
  percentage: number;
  passed: boolean;
  completedAt: string;
}

interface QuizPerformanceQuiz {
  collectionId: string;
  collectionName: string;
  lessonId: string | null;
  lessonName: string | null;
  attempts: QuizAttemptGrouped[];
}

interface QuizPerformanceCourse {
  courseId: string;
  courseName: string;
  quizzes: QuizPerformanceQuiz[];
}

interface UserDetailsResponse {
  user: UserProfile;
  courses: CourseProgress[];
  quizAttempts: QuizAttempt[];
  quizPerformance?: QuizPerformanceCourse[];
  quizSummary: {
    totalAttempts: number;
    totalPassed: number;
    averageScore: number;
  };
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge ><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
    case 'in_progress':
      return <Badge ><Clock className="w-3 h-3 mr-1" />In Progress</Badge>;
    default:
      return <Badge ><AlertCircle className="w-3 h-3 mr-1" />Not Started</Badge>;
  }
}

export default function OrgUserDetail() {
  const params = useParams<{ orgId: string; userId: string }>();
  const { orgId, userId } = params;
  const { effectiveOrganizationId } = useAuth();
  
  const organizationId = orgId || effectiveOrganizationId;
  
  const [courseSearch, setCourseSearch] = useState('');
  const [courseStatusFilter, setCourseStatusFilter] = useState<string>('all');
  const [quizCourseFilter, setQuizCourseFilter] = useState<string>('all');
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set());
  const hasInitializedExpandedCourses = useRef(false);

  const { data, isLoading, error } = useQuery<UserDetailsResponse>({
    queryKey: ['/api/organization', organizationId, 'users', userId, 'details'],
    enabled: !!organizationId && !!userId,
  });

  if (!organizationId) {
    return (
      <QuizAdminLayout title="User Details" description="No organization context">
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-muted-foreground">No organization context available</p>
            <Link href="/org-management">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Organization
              </Button>
            </Link>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  if (orgId && effectiveOrganizationId && orgId !== effectiveOrganizationId) {
    return (
      <QuizAdminLayout title="User Details" description="Access denied">
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-muted-foreground">You don't have access to view users in this organization</p>
            <Link href="/org-management">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Your Organization
              </Button>
            </Link>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  const filteredCourses = useMemo(() => {
    if (!data?.courses) return [];
    return data.courses.filter(course => {
      const matchesSearch = course.courseName.toLowerCase().includes(courseSearch.toLowerCase());
      const matchesStatus = courseStatusFilter === 'all' || course.status === courseStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [data?.courses, courseSearch, courseStatusFilter]);

  const quizPerformanceData = useMemo((): QuizPerformanceCourse[] => {
    if (data?.quizPerformance && data.quizPerformance.length > 0) {
      return data.quizPerformance;
    }
    
    if (!data?.quizAttempts || data.quizAttempts.length === 0) return [];
    
    const grouped: Record<string, { courseId: string; courseName: string; quizzes: Record<string, QuizPerformanceQuiz> }> = {};
    
    data.quizAttempts.forEach(attempt => {
      const courseKey = attempt.courseId || 'uncategorized';
      const courseName = attempt.courseName || 'Uncategorized';
      
      if (!grouped[courseKey]) {
        grouped[courseKey] = {
          courseId: courseKey,
          courseName: courseName,
          quizzes: {}
        };
      }
      
      const quizKey = attempt.collectionId;
      if (!grouped[courseKey].quizzes[quizKey]) {
        grouped[courseKey].quizzes[quizKey] = {
          collectionId: attempt.collectionId,
          collectionName: attempt.collectionName,
          lessonId: attempt.lessonId,
          lessonName: attempt.lessonName,
          attempts: []
        };
      }
      
      grouped[courseKey].quizzes[quizKey].attempts.push({
        id: attempt.id,
        attemptNumber: grouped[courseKey].quizzes[quizKey].attempts.length + 1,
        score: attempt.score,
        correctAnswers: attempt.correctAnswers,
        totalAnswers: attempt.totalAnswers,
        percentage: attempt.percentage,
        passed: attempt.passed,
        completedAt: attempt.completedAt
      });
    });
    
    return Object.values(grouped).map(course => ({
      ...course,
      quizzes: Object.values(course.quizzes)
    }));
  }, [data?.quizPerformance, data?.quizAttempts]);

  const filteredQuizPerformance = useMemo(() => {
    if (quizCourseFilter === 'all') return quizPerformanceData;
    return quizPerformanceData.filter(course => course.courseName === quizCourseFilter);
  }, [quizPerformanceData, quizCourseFilter]);

  const courseNames = useMemo(() => {
    return quizPerformanceData.map(course => course.courseName);
  }, [quizPerformanceData]);

  const getCourseStats = (course: QuizPerformanceCourse) => {
    let totalAttempts = 0;
    let totalScore = 0;
    course.quizzes.forEach(quiz => {
      quiz.attempts.forEach(attempt => {
        totalAttempts++;
        totalScore += attempt.percentage;
      });
    });
    const averageScore = totalAttempts > 0 ? totalScore / totalAttempts : 0;
    return { totalAttempts, averageScore };
  };

  const toggleCourse = (courseId: string) => {
    setExpandedCourses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(courseId)) {
        newSet.delete(courseId);
      } else {
        newSet.add(courseId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    if (
      !hasInitializedExpandedCourses.current &&
      filteredQuizPerformance.length > 0 &&
      expandedCourses.size === 0
    ) {
      hasInitializedExpandedCourses.current = true;
      setExpandedCourses(new Set([filteredQuizPerformance[0].courseId]));
    }
  }, [filteredQuizPerformance, expandedCourses.size]);

  if (isLoading) {
    return (
      <QuizAdminLayout title="User Details" description="Loading...">
        <div className="space-y-6">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </QuizAdminLayout>
    );
  }

  if (error || !data) {
    return (
      <QuizAdminLayout title="User Details" description="Error loading user">
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-64 gap-4">
            <AlertCircle className="w-12 h-12 text-destructive" />
            <p className="text-muted-foreground">Failed to load user details</p>
            <Link href="/org-management">
              <Button variant="outline">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Organization
              </Button>
            </Link>
          </CardContent>
        </Card>
      </QuizAdminLayout>
    );
  }

  const { user, courses, quizSummary } = data;

  return (
    <QuizAdminLayout
      title={`${user.firstName} ${user.lastName}`}
      description="User profile and learning progress"
    >
      <div className="mb-4">
        <Link href="/org-management">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Organization Hub
          </Button>
        </Link>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-6">
              <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                {user.profileImageUrl ? (
                  <img src={user.profileImageUrl} alt={user.firstName} className="w-full h-full rounded-full object-cover" />
                ) : (
                  <User className="w-12 h-12 text-primary" />
                )}
              </div>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Full Name</p>
                  <p className="font-medium">{user.firstName} {user.lastName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Mail className="w-3 h-3" /> Email
                  </p>
                  <p className="font-medium">{user.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Gamepad2 className="w-3 h-3" /> Gamer Name
                  </p>
                  <p className="font-medium">{user.gamerName || 'Not set'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Globe className="w-3 h-3" /> Country
                  </p>
                  <p className="font-medium">{user.country || 'Not specified'}</p>
                </div>
                {user.bio && (
                  <div className="md:col-span-2 lg:col-span-3">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">Bio</p>
                    <p className="font-medium">{user.bio}</p>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/20">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{courses.length}</p>
                  <p className="text-sm text-muted-foreground">Assigned Courses</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-success/20">
                  <Trophy className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{quizSummary.totalPassed}/{quizSummary.totalAttempts}</p>
                  <p className="text-sm text-muted-foreground">Quizzes Passed</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-primary/20">
                  <Target className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{quizSummary.averageScore.toFixed(0)}%</p>
                  <p className="text-sm text-muted-foreground">Average Quiz Score</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="courses" className="w-full">
          <TabsList>
            <TabsTrigger value="courses" className="flex items-center gap-2">
              <BookOpen className="w-4 h-4" />
              Courses ({courses.length})
            </TabsTrigger>
            <TabsTrigger value="quizzes" className="flex items-center gap-2">
              <Trophy className="w-4 h-4" />
              Quiz Performance ({quizSummary.totalAttempts})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="courses" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Assigned Courses</CardTitle>
                <CardDescription>Course progress and completion status</CardDescription>
                <div className="flex flex-col sm:flex-row gap-4 mt-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search courses..."
                      value={courseSearch}
                      onChange={(e) => setCourseSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={courseStatusFilter} onValueChange={setCourseStatusFilter}>
                    <SelectTrigger className="w-[180px]">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="not_started">Not Started</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredCourses.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No courses found</p>
                ) : (
                  <div className="space-y-4">
                    {filteredCourses.map((course) => (
                      <div key={course.id} className="p-4 rounded-lg border bg-card">
                        <div className="flex items-start justify-between gap-4 mb-3">
                          <div className="flex-1">
                            <h4 className="font-medium">{course.courseName}</h4>
                            <p className="text-sm text-muted-foreground">
                              {course.completedLessons} of {course.totalLessons} lessons completed
                            </p>
                          </div>
                          {getStatusBadge(course.status)}
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{course.percentComplete}%</span>
                          </div>
                          <Progress value={course.percentComplete} className="h-2" />
                        </div>
                        {course.startedAt && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Started: {new Date(course.startedAt).toLocaleDateString()}
                            {course.completedAt && ` · Completed: ${new Date(course.completedAt).toLocaleDateString()}`}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="quizzes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Quiz Performance</CardTitle>
                <CardDescription>Quiz attempts grouped by course and lesson</CardDescription>
                <div className="mt-4">
                  <Select value={quizCourseFilter} onValueChange={setQuizCourseFilter}>
                    <SelectTrigger className="w-[250px]">
                      <Filter className="w-4 h-4 mr-2" />
                      <SelectValue placeholder="Filter by course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Courses</SelectItem>
                      {courseNames.map((name) => (
                        <SelectItem key={name} value={name}>{name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                {filteredQuizPerformance.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No quiz attempts found</p>
                ) : (
                  <div className="space-y-4">
                    {filteredQuizPerformance.map((course) => {
                      const stats = getCourseStats(course);
                      const isExpanded = expandedCourses.has(course.courseId);
                      return (
                        <Collapsible
                          key={course.courseId}
                          open={isExpanded}
                          onOpenChange={() => toggleCourse(course.courseId)}
                        >
                          <div className="rounded-lg border bg-card">
                            <CollapsibleTrigger className="w-full">
                              <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors rounded-t-lg">
                                <div className="flex items-center gap-3">
                                  {isExpanded ? (
                                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                  )}
                                  <BookOpen className="w-4 h-4 text-primary" />
                                  <span className="font-medium text-lg">{course.courseName}</span>
                                </div>
                                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                  <span>{stats.totalAttempts} attempt{stats.totalAttempts !== 1 ? 's' : ''}</span>
                                  <Badge variant="outline" className="font-medium">
                                    Avg: {stats.averageScore.toFixed(0)}%
                                  </Badge>
                                </div>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent>
                              <div className="space-y-4 p-4 pt-0 border-t">
                                {course.quizzes.map((quiz) => (
                                  <div key={quiz.collectionId} className="space-y-2">
                                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                                      <span className="text-primary">└──</span>
                                      {quiz.lessonName ? (
                                        <span>{quiz.lessonName} - {quiz.collectionName}</span>
                                      ) : (
                                        <span>{quiz.collectionName}</span>
                                      )}
                                    </div>
                                    <div className="space-y-2 pl-6">
                                      {[...quiz.attempts]
                                        .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
                                        .map((attempt) => (
                                          <div key={attempt.id} className="p-4 rounded-lg border bg-card">
                                            <div className="flex items-start justify-between gap-4">
                                              <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                  <span className="font-medium">Attempt #{attempt.attemptNumber}</span>
                                                  {attempt.passed ? (
                                                    <Badge >Passed</Badge>
                                                  ) : (
                                                    <Badge >Failed</Badge>
                                                  )}
                                                </div>
                                                <p className="text-xs text-muted-foreground mt-1">
                                                  {attempt.correctAnswers}/{attempt.totalAnswers} correct
                                                </p>
                                              </div>
                                              <div className="text-right">
                                                <p className="text-2xl font-bold">{attempt.percentage.toFixed(0)}%</p>
                                                <p className="text-xs text-muted-foreground">
                                                  {new Date(attempt.completedAt).toLocaleString()}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </div>
                        </Collapsible>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </QuizAdminLayout>
  );
}
