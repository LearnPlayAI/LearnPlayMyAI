import { useState, useEffect, useMemo } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  Search,
  Archive,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  BookOpen,
  FolderOpen,
} from "lucide-react";
import { useWalletBalance } from "@/hooks/useWallet";
import { useUser } from "@/hooks/use-user";
import { Skeleton } from "@/components/ui/skeleton";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import { LessonActionsMenu } from "@/components/LessonActionsMenu";

export default function LessonLibrary() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const { isOrgAdmin, isTeacher, isSuperAdmin, isLoading: authLoading, effectiveOrganizationId } = useAuth();
  const effectiveOrgId = effectiveOrganizationId || user?.organizationId;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [expandedCourses, setExpandedCourses] = useState<string[]>([]);

  // Redirect non-admin users
  const isAdmin = isSuperAdmin || isOrgAdmin || isTeacher;
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access lessons",
        variant: "destructive"
      });
      setLocation("/quiz-lobby");
    }
  }, [isAdmin, authLoading, setLocation, toast]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <QuizAdminLayout title="Lesson Library" description="Manage and view your AI-generated lessons" activeSection="lessons">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-foreground" />
        </div>
      </QuizAdminLayout>
    );
  }

  // Don't render if not admin
  if (!isAdmin) {
    return null;
  }

  // Fetch lessons
  const { data: lessonsData, isLoading } = useQuery({
    queryKey: [
      "/api/lessons",
      effectiveOrgId,
      search,
      statusFilter,
      showArchived,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        organizationId: effectiveOrgId || "",
      });
      if (search) params.append("search", search);
      if (statusFilter && statusFilter !== "all")
        params.append("generationStatus", statusFilter);
      if (showArchived) params.append("isArchived", "true");
      else params.append("isArchived", "false");

      return fetch(`/api/lessons?${params}`).then((r) => r.json());
    },
    enabled: !!effectiveOrgId,
    refetchInterval: (query) => {
      // Auto-poll every 5 seconds if there are lessons being generated
      const lessons = query.state.data?.lessons || [];
      const hasActiveLessons = lessons.some(
        (lesson: any) =>
          lesson.generationStatus === "pending" ||
          lesson.generationStatus === "processing" ||
          lesson.generationStatus === "polling"
      );
      return hasActiveLessons ? 5000 : false;
    },
  });

  // Fetch organization for dynamic labeling
  const { data: organization } = useQuery<{ organizationType: string }>({
    queryKey: ["/api/organizations", effectiveOrgId],
    enabled: !!effectiveOrgId,
  });

  // Compute if there are active lessons for wallet polling
  const hasActiveLessons = (lessonsData?.lessons || []).some(
    (lesson: any) =>
      lesson.generationStatus === "pending" ||
      lesson.generationStatus === "processing" ||
      lesson.generationStatus === "polling"
  );

  // Fetch wallet balance using shared hook
  const { data: creditBalance } = useWalletBalance({
    pollingInterval: hasActiveLessons ? 5000 : false,
  });

  const { terminology, isResolved } = useOrganizationTerminology();
  const gradeLevelLabel = terminology?.unit || "Grade";

  const getStatusBadge = (status: string, errorMessage?: string) => {
    switch (status) {
      case "completed":
        return (
          <Badge className="shadow-sm">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            Completed
          </Badge>
        );
      case "processing":
      case "polling":
        return (
          <Badge className="shadow-sm">
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
            Processing
          </Badge>
        );
      case "pending":
        return (
          <Badge variant="outline" >
            <Clock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        );
      case "failed":
        if (errorMessage?.includes("canceled") || errorMessage?.includes("Canceled")) {
          return (
            <Badge variant="outline" >
              <AlertCircle className="mr-1 h-3 w-3" />
              Canceled
            </Badge>
          );
        }
        return (
          <Badge className="shadow-sm">
            <XCircle className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const getPublishStatusBadge = (isPublished: boolean) => {
    if (isPublished) {
      return (
        <Badge className="shadow-sm" data-testid="badge-published">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Published
        </Badge>
      );
    }
    return (
      <Badge variant="outline" data-testid="badge-not-published">
        <FileText className="mr-1 h-3 w-3" />
        Draft
      </Badge>
    );
  };

  const getAssignmentStatusBadge = (assignmentCount: number) => {
    if (assignmentCount > 0) {
      return (
        <Badge className="shadow-sm" data-testid="badge-assigned">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Assigned
        </Badge>
      );
    }
    return (
      <Badge variant="outline" data-testid="badge-not-assigned">
        <XCircle className="mr-1 h-3 w-3" />
        Not Assigned
      </Badge>
    );
  };

  const lessons = lessonsData?.lessons || [];

  // Group lessons by course, sorted by topicOrder within each group
  const groupedLessons = useMemo(() => {
    const groups: Map<string, {
      courseId: string | null;
      courseTitle: string;
      lessons: any[];
    }> = new Map();

    // Initialize with "Unassigned" group
    groups.set("unassigned", {
      courseId: null,
      courseTitle: "Unassigned Lessons",
      lessons: []
    });

    lessons.forEach((lesson: any) => {
      const linkedCourse = lesson.linkedCourse;
      
      if (linkedCourse?.courseId) {
        const courseId = linkedCourse.courseId;
        if (!groups.has(courseId)) {
          groups.set(courseId, {
            courseId: courseId,
            courseTitle: linkedCourse.courseTitle || "Unknown Course",
            lessons: []
          });
        }
        groups.get(courseId)!.lessons.push({
          ...lesson,
          topicOrder: linkedCourse.topicOrder || 0
        });
      } else {
        groups.get("unassigned")!.lessons.push(lesson);
      }
    });

    // Sort lessons within each group by topicOrder
    groups.forEach((group) => {
      group.lessons.sort((a, b) => (a.topicOrder || 0) - (b.topicOrder || 0));
    });

    // Convert to array and sort: courses first (alphabetically), then unassigned at the end
    const result = Array.from(groups.values())
      .filter(group => group.lessons.length > 0)
      .sort((a, b) => {
        if (a.courseId === null) return 1;
        if (b.courseId === null) return -1;
        return a.courseTitle.localeCompare(b.courseTitle);
      });

    return result;
  }, [lessons]);

  // Initialize expanded state to show all courses expanded by default
  useEffect(() => {
    if (groupedLessons.length > 0 && expandedCourses.length === 0) {
      setExpandedCourses(groupedLessons.map(g => g.courseId || "unassigned"));
    }
  }, [groupedLessons, expandedCourses.length]);

  // Wait for terminology to resolve before rendering
  if (!isResolved) {
    return (
      <QuizAdminLayout title="Lesson Library" description="Manage and view your AI-generated lessons" activeSection="lessons">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Lesson Library" description="Manage and view your AI-generated lessons" activeSection="lessons">
      {/* Header: Stack on mobile, row on sm+ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-[var(--space-md)] mb-[var(--space-lg)]">
        <Button onClick={() => setLocation("/lessons/new")}
          className="min-h-[44px] touch-manipulation w-full sm:w-auto bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transition-all duration-200"
          data-testid="button-create-lesson"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Lesson
        </Button>
        
        {/* Credit Balance Display */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-[var(--space-sm)] w-full sm:w-auto">
          <div className="flex items-center justify-between sm:justify-start gap-2 px-[var(--space-md)] py-[var(--space-sm)] bg-primary/20 border border-primary/30 rounded-lg" data-testid="credit-balance-display">
            <div className="text-[length:var(--text-sm)] text-foreground/80">
              Credits:
            </div>
            {creditBalance?.balance !== undefined && creditBalance?.balance !== null ? (
              <div className="text-[length:var(--text-lg)] font-bold text-foreground" data-testid="text-credit-balance">
                {creditBalance.balance.toLocaleString()}
              </div>
            ) : (
              <div className="text-[length:var(--text-lg)] font-bold text-foreground" data-testid="text-credit-balance">
                0
              </div>
            )}
          </div>
          <Link href="/buy-credits" className="w-full sm:w-auto">
            <Button variant="outline" className="min-h-[44px] touch-manipulation w-full sm:w-auto transition-all duration-200" data-testid="link-buy-credits-library">
              <Plus className="mr-2 h-4 w-4" />
              Buy Credits
            </Button>
          </Link>
        </div>
      </div>

      {/* Filters: Stack on mobile, row on sm+ */}
      <div className="flex flex-col sm:flex-row gap-[var(--space-sm)] mb-[var(--space-lg)] p-[var(--space-md)] bg-surface-raised shadow-card rounded-lg">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search lessons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 min-h-[44px]"
            data-testid="input-search"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-[var(--space-sm)]">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[180px] min-h-[44px]" data-testid="select-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived(!showArchived)}
            className="min-h-[44px] touch-manipulation w-full sm:w-auto"
            data-testid="button-toggle-archived"
          >
            <Archive className="mr-2 h-4 w-4" />
            <span className="sm:inline">{showArchived ? "Hide Archived" : "Show Archived"}</span>
          </Button>
        </div>
      </div>

      {/* Lessons Grid: Grouped by course with collapsible accordions */}
      {isLoading ? (
        <div className="space-y-[var(--space-md)]">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-[var(--space-sm)]">
              <Skeleton className="h-12 w-full rounded-lg" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
                {[1, 2, 3].map((j) => (
                  <Card key={j} surface="raised" className="p-[var(--card-padding)]">
                    <CardHeader className="p-0 pb-[var(--space-sm)]">
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-1/2 mt-2" />
                    </CardHeader>
                    <CardContent className="p-0">
                      <Skeleton className="h-20 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : lessons.length === 0 ? (
        <Card surface="raised" className="p-[var(--card-padding)] bg-surface-raised border-[var(--stroke-default)]">
          <CardContent className="flex flex-col items-center justify-center py-[var(--space-2xl)] px-[var(--space-md)]">
            <div className="w-20 h-20 rounded-full bg-surface-raised flex items-center justify-center mb-[var(--space-md)]">
              <FileText className="h-10 w-10 text-primary" />
            </div>
            <h3 className="text-[length:var(--text-lg)] font-semibold mb-[var(--space-sm)]">No lessons found</h3>
            <p className="text-muted-foreground text-center mb-[var(--space-md)] text-[length:var(--text-sm)]">
              {search
                ? "No lessons match your search criteria"
                : "Get started by creating your first lesson"}
            </p>
            {!search && (
              <Button onClick={() => setLocation("/lessons/new")}
                className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90 shadow-md hover:shadow-lg transition-all duration-200"
                data-testid="button-create-first-lesson"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Lesson
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Accordion
          type="multiple"
          value={expandedCourses}
          onValueChange={setExpandedCourses}
          className="space-y-[var(--space-md)]"
        >
          {groupedLessons.map((group) => (
            <AccordionItem
              key={group.courseId || "unassigned"}
              value={group.courseId || "unassigned"}
              className="border rounded-lg bg-surface-raised shadow-card overflow-hidden"
            >
              <AccordionTrigger className="px-[var(--space-md)] py-[var(--space-sm)] hover:no-underline hover:bg-primary/5">
                <div className="flex items-center gap-[var(--space-sm)] flex-1">
                  {group.courseId ? (
                    <BookOpen className="h-5 w-5 text-primary" />
                  ) : (
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                  )}
                  <span className="font-semibold text-[length:var(--text-base)] sm:text-[length:var(--text-lg)] text-left">
                    {group.courseTitle}
                  </span>
                  <Badge variant="secondary" className="ml-2">
                    {group.lessons.length} {group.lessons.length === 1 ? 'lesson' : 'lessons'}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-[var(--space-md)] pb-[var(--space-md)]">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
                  {group.lessons.map((lesson: any) => (
                    <Card
                      key={lesson.id}
                      surface="raised"
                      className="hover:shadow-card-hover transition-all duration-200 bg-surface-raised border-[var(--stroke-default)] hover:border-primary/30 hover:scale-[1.01]"
                      data-testid={`card-lesson-${lesson.id}`}
                    >
                      <CardHeader className="p-[var(--card-padding)] pb-[var(--space-sm)]">
                        <div className="flex justify-between items-start gap-[var(--space-sm)]">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              {group.courseId && typeof lesson.topicOrder === 'number' && (
                                <Badge variant="outline" className="text-[length:var(--text-xs)] shrink-0">
                                  #{lesson.topicOrder + 1}
                                </Badge>
                              )}
                              <CardTitle className="line-clamp-2 text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">
                                {lesson.title}
                              </CardTitle>
                            </div>
                            <CardDescription className="mt-[var(--space-xs)] text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)]">
                              {(lesson.gradeLevelName || lesson.departmentName) && (
                                <span className="mr-2">
                                  {gradeLevelLabel}: {lesson.gradeLevelName || lesson.departmentName}
                                </span>
                              )}
                              {(lesson.subjectName || lesson.unitName) && (
                                <span>{lesson.subjectName || lesson.unitName}</span>
                              )}
                            </CardDescription>
                          </div>
                          <LessonActionsMenu
                            lesson={lesson}
                            context="library"
                            organizationId={effectiveOrgId || ""}
                            organizationType={organization?.organizationType}
                          />
                        </div>
                      </CardHeader>
                      <CardContent className="p-[var(--card-padding)] pt-0">
                        <div className="space-y-[var(--space-sm)]">
                          {lesson.description && (
                            <p className="text-[length:var(--text-sm)] text-muted-foreground line-clamp-2">
                              {lesson.description}
                            </p>
                          )}
                          <div className="flex flex-col gap-[var(--space-xs)]">
                            <div className="flex flex-wrap items-center justify-between gap-[var(--space-xs)]">
                              {getStatusBadge(lesson.generationStatus, lesson.errorMessage)}
                              {lesson.slideCount && (
                                <span className="text-[length:var(--text-sm)] text-muted-foreground">
                                  {lesson.slideCount} slides
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-[var(--space-xs)]">
                              {getPublishStatusBadge(lesson.isPublished)}
                              {getAssignmentStatusBadge(lesson.assignmentCount || 0)}
                            </div>
                            <div className="flex flex-wrap gap-[var(--space-xs)]">
                              {lesson.linkedQuizName ? (
                                <Badge variant="outline" className="text-[length:var(--text-xs)]">
                                  Quiz: {lesson.linkedQuizName}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[length:var(--text-xs)]">
                                  No Linked Quiz
                                </Badge>
                              )}
                              {lesson.creditsUsed && lesson.creditsUsed > 0 && (
                                <Badge variant="outline" className="text-[length:var(--text-xs)]">
                                  {lesson.creditsUsed} credits
                                </Badge>
                              )}
                            </div>
                          </div>
                          {(lesson.generationStatus === "processing" || lesson.generationStatus === "polling") && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Generation in progress...</span>
                                <Loader2 className="h-3 w-3 animate-spin" />
                              </div>
                              <Progress value={50} className="h-1.5" />
                            </div>
                          )}
                          {lesson.generationStatus === "pending" && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>Preparing lesson generation...</span>
                                <Loader2 className="h-3 w-3 animate-spin" />
                              </div>
                              <Progress value={10} className="h-1.5" />
                            </div>
                          )}
                          {lesson.generationStatus === "failed" && !lesson.inputText && (
                            <div className="flex items-start gap-2 p-2 bg-[var(--chart-4)]/10 rounded text-xs text-chart-4">
                              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">No content provided - please delete this lesson and create a new one with content</span>
                            </div>
                          )}
                          {lesson.generationStatus === "failed" && lesson.inputText && (
                            <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-xs text-destructive">
                              <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                              <span className="line-clamp-2">Generation failed - click "Regenerate" to try again</span>
                            </div>
                          )}
                          {lesson.isArchived && (
                            <Badge variant="outline" className="w-full justify-center">
                              <Archive className="mr-1 h-3 w-3" />
                              Archived
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </QuizAdminLayout>
  );
}
