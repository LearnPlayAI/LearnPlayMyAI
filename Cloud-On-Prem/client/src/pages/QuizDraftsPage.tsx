import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Plus, FileText, Clock, Edit, Trash2, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import QuizAdminLayout from "@/components/QuizAdminLayout";

import { queryClient, apiRequest } from "@/lib/queryClient";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import type { QuizDraft } from "@shared/schema";
import { tzFormat } from '@/utils/timezoneRuntime';

export default function QuizDraftsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [filterGradeId, setFilterGradeId] = useState<string>("all");
  const [filterSubjectId, setFilterSubjectId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const { terminology, isResolved: terminologyResolved } = useOrganizationTerminology();
  const { data: user } = useQuery<any>({ queryKey: ["/api/user-status"] });
  
  // Check if user is SuperAdmin
  const isSuperAdmin = user?.isSuperAdmin === true;
  
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: isSuperAdmin,
  });

  const { data: drafts, isLoading: draftsLoading } = useQuery<QuizDraft[]>({
    queryKey: [`/api/drafts?organizationId=${selectedOrgId}`],
    enabled: !!selectedOrgId,
  });

  const { data: publishedQuizzes = [], isLoading: publishedLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/quiz-collections', selectedOrgId],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const response = await fetch(`/api/admin/quiz-collections?organizationId=${selectedOrgId}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedOrgId,
  });

  const isLoading = draftsLoading || publishedLoading || !terminologyResolved;

  const { data: grades = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/organizations/${selectedOrgId}/units`],
    enabled: !!selectedOrgId,
  });

  const { data: filterSubjects = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/units/${filterGradeId}/subjects`],
    enabled: !!filterGradeId && filterGradeId !== "all",
  });

  // Fetch ALL subjects for the organization (for display purposes, not filtering)
  const { data: allOrgSubjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedOrgId, 'subjects'],
    enabled: !!selectedOrgId,
  });

  // Auto-populate organization from user data
  useEffect(() => {
    if (user && !selectedOrgId) {
      if (isSuperAdmin) {
        // SuperAdmins: use first organization from the list
        if (organizations.length > 0) {
          setSelectedOrgId(organizations[0].id);
        }
      } else {
        // Non-SuperAdmins: use their assigned organization
        const userOrgId = (user as any).organizationId;
        if (userOrgId) {
          setSelectedOrgId(userOrgId);
        }
      }
    }
  }, [user, organizations, selectedOrgId, isSuperAdmin]);

  // Reset subject filter when grade changes
  useEffect(() => {
    setFilterSubjectId("all");
  }, [filterGradeId]);

  // Reset grade and subject filters when organization changes
  useEffect(() => {
    if (selectedOrgId) {
      setFilterGradeId("all");
      setFilterSubjectId("all");
    }
  }, [selectedOrgId]);

  // Combine and transform data for unified display
  const combinedQuizzes = useMemo(() => {
    const items: any[] = [];
    
    // Add drafts with status
    if (drafts) {
      drafts.forEach(draft => {
        items.push({
          ...draft,
          status: 'draft',
          type: 'draft',
        });
      });
    }
    
    // Add published quizzes with status
    if (publishedQuizzes) {
      publishedQuizzes.forEach(quiz => {
        // Grade comes from backend (subject-unit assignment)
        items.push({
          id: quiz.id,
          name: quiz.name,
          description: quiz.description,
          gradeId: quiz.gradeId || null, // Grade from subject-unit assignment
          subjectId: quiz.subjectId,
          difficulty: quiz.difficulty,
          topic: quiz.description,
          totalCards: quiz.totalCards,
          updatedAt: quiz.updatedAt,
          status: 'published',
          type: 'published',
          assignments: quiz.assignments,
        });
      });
    }
    
    return items;
  }, [drafts, publishedQuizzes]);

  // Filter combined quizzes based on selected filters
  const filteredQuizzes = combinedQuizzes.filter((item) => {
    // Status filter
    if (filterStatus !== "all" && item.status !== filterStatus) {
      return false;
    }
    
    // Grade filter - check gradeId directly (from subject-unit assignment)
    if (filterGradeId !== "all") {
      if (item.gradeId !== filterGradeId) return false;
    }
    
    // Subject filter - check subjectId directly
    if (filterSubjectId !== "all") {
      if (item.subjectId !== filterSubjectId) return false;
    }
    
    return true;
  });

  const deleteMutation = useMutation({
    mutationFn: async (draftId: string) => {
      return apiRequest(`/api/drafts/${draftId}?organizationId=${selectedOrgId}`, { method: "DELETE" });
    },
    onSuccess: () => {
      // Invalidate all draft queries for this organization
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0]?.toString() || '';
          return key.includes('/api/drafts') && key.includes(selectedOrgId);
        }
      });
      toast({
        title: "Success",
        description: "Draft deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete draft",
        variant: "destructive",
      });
    },
  });

  const handleCreateNewDraft = () => {
    setLocation(`/quiz-wizard?org=${selectedOrgId}`);
  };

  const handleEditDraft = (draftId: string) => {
    setLocation(`/quiz-wizard/${draftId}?org=${selectedOrgId}`);
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!confirm("Are you sure you want to delete this draft?")) return;
    deleteMutation.mutate(draftId);
  };

  // Convert published quiz to draft mutation
  const convertToDraftMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      return apiRequest(`/api/quiz-collections/${collectionId}/to-draft`, {
        method: "POST",
        body: JSON.stringify({ organizationId: selectedOrgId }),
      });
    },
    onSuccess: (data: any) => {
      // Invalidate drafts queries to show the new draft when user returns
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0]?.toString() || '';
          return key.includes('/api/drafts') && key.includes(selectedOrgId);
        }
      });
      toast({
        title: "Success",
        description: "Quiz converted to draft for editing",
      });
      // Navigate to quiz wizard with the new draft
      setLocation(`/quiz-wizard/${data.draft.id}?org=${selectedOrgId}`);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to convert quiz to draft",
        variant: "destructive",
      });
    },
  });

  const handleEditPublishedQuiz = (collectionId: string) => {
    convertToDraftMutation.mutate(collectionId);
  };

  const getGradeName = (gradeId: string | null) => {
    if (!gradeId || !grades || grades.length === 0) return null;
    const grade = grades.find((g: any) => g.id === gradeId);
    return grade?.name;
  };

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return null;
    // Try filter subjects first (grade-specific), then fall back to all org subjects
    const subject = filterSubjects.find((s: any) => s.subjectId === subjectId) || 
                    allOrgSubjects.find((s: any) => s.id === subjectId);
    return subject?.subjectName || subject?.name;
  };

  // Get unique color for grade badge
  const getGradeColor = (gradeId: string): string => {
    if (!grades || grades.length === 0) return 'bg-muted';
    const colors = [
      'bg-secondary',
      'bg-primary',
      'bg-[var(--chart-2)]',
      'bg-[var(--chart-3)]',
      'bg-accent',
      'bg-primary/80',
      'bg-secondary/80',
      'bg-[var(--chart-4)]',
      'bg-[var(--chart-1)]',
      'bg-warning',
    ];
    
    // Use grade ID to consistently assign the same color to the same grade
    const gradeIndex = grades.findIndex((g: any) => g.id === gradeId);
    return gradeIndex >= 0 ? colors[gradeIndex % colors.length] : 'bg-muted';
  };

  return (
    <QuizAdminLayout title="AI Quiz Generator" description="Create engaging quizzes with AI assistance">
      <div className="space-y-[var(--space-lg)] p-[var(--container-padding)]">
        {/* Filters and Actions Bar */}
        <Card className="border-primary/20 dark:border-primary/30 p-[var(--card-padding)]">
          <CardContent className="p-0">
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)] items-end ${isSuperAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-4'}`}>
              {isSuperAdmin && (
                <div className="space-y-1.5">
                  <label className="text-[length:var(--text-sm)] font-medium text-foreground block">
                    Organization
                  </label>
                  <Select value={selectedOrgId} onValueChange={setSelectedOrgId}>
                    <SelectTrigger className="w-full min-h-[44px] touch-manipulation" data-testid="select-organization">
                      <SelectValue placeholder="Select Organization" />
                    </SelectTrigger>
                    <SelectContent>
                      {organizations?.map((org: any) => (
                        <SelectItem key={org.id} value={org.id} className="min-h-[44px]" data-testid={`org-option-${org.id}`}>
                          {org.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-1.5">
                <label className="text-[length:var(--text-sm)] font-medium text-foreground block">
                  Status
                </label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full min-h-[44px] touch-manipulation" data-testid="select-filter-status">
                    <SelectValue placeholder="All" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="min-h-[44px]">All</SelectItem>
                    <SelectItem value="draft" className="min-h-[44px]">Drafts Only</SelectItem>
                    <SelectItem value="published" className="min-h-[44px]">Published Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[length:var(--text-sm)] font-medium text-foreground block">
                  {terminology?.unit || 'Department'}
                </label>
                <Select value={filterGradeId} onValueChange={setFilterGradeId}>
                  <SelectTrigger className="w-full min-h-[44px] touch-manipulation" data-testid="select-filter-grade">
                    <SelectValue placeholder={`All ${terminology?.unitPlural || 'Departments'}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="min-h-[44px]">All {terminology?.unitPlural || 'Departments'}</SelectItem>
                    {grades?.map((grade: any) => (
                      <SelectItem key={grade.id} value={grade.id} className="min-h-[44px]" data-testid={`grade-option-${grade.id}`}>
                        {grade.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[length:var(--text-sm)] font-medium text-foreground block">
                  {terminology?.subject || 'Subject'}
                </label>
                <Select 
                  value={filterSubjectId} 
                  onValueChange={setFilterSubjectId}
                  disabled={filterGradeId === "all"}
                >
                  <SelectTrigger className="w-full min-h-[44px] touch-manipulation" data-testid="select-filter-subject">
                    <SelectValue placeholder={filterGradeId === "all" ? `Select ${terminology?.unit?.toLowerCase() || 'department'} first` : `All ${terminology?.subjectPlural || 'Subjects'}`} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="min-h-[44px]">All {terminology?.subjectPlural || 'Subjects'}</SelectItem>
                    {filterSubjects?.map((subject: any) => (
                      <SelectItem key={subject.id} value={subject.subjectId} className="min-h-[44px]" data-testid={`subject-option-${subject.id}`}>
                        {subject.subjectName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="sm:col-span-2 lg:col-span-1">
                <Button onClick={handleCreateNewDraft} disabled={!selectedOrgId} className="w-full min-h-[44px] touch-manipulation" size="lg" data-testid="button-create-quiz" >
                  <Plus className="h-4 w-4 mr-2" />
                  Create New Quiz
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {!selectedOrgId && isSuperAdmin && (
          <Card className="border-secondary/20 dark:border-secondary/30 bg-secondary/5 dark:bg-secondary/10 p-[var(--card-padding)]">
            <CardContent className="p-0">
              <p className="text-[length:var(--text-sm)] text-secondary dark:text-secondary" data-testid="text-select-org-prompt">
                Please select an organization to view and create quiz drafts.
              </p>
            </CardContent>
          </Card>
        )}

        {selectedOrgId && (
          <>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
                {[1, 2, 3].map((i) => (
                  <Card key={i} className="p-[var(--card-padding)]">
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
            ) : filteredQuizzes && filteredQuizzes.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
                {filteredQuizzes.map((quiz) => (
                  <Card
                    key={quiz.id}
                    className="hover:shadow-elevated transition-shadow duration-200 cursor-pointer group p-[var(--card-padding)]"
                    onClick={() => quiz.type === 'draft' ? handleEditDraft(quiz.id) : setLocation(`/quiz-card-manager?collection=${quiz.id}`)}
                    data-testid={`card-quiz-${quiz.id}`}
                  >
                    <CardHeader className="p-0 pb-[var(--space-sm)]">
                      <div className="flex items-start justify-between gap-[var(--space-sm)]">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <CardTitle className="text-[length:var(--text-base)] sm:text-[length:var(--text-lg)] truncate" data-testid={`text-quiz-title-${quiz.id}`}>
                              {quiz.name || "Untitled Quiz"}
                            </CardTitle>
                          </div>
                          <div className="flex gap-2 flex-wrap">
                            <Badge variant={quiz.status === 'draft' ? 'secondary' : 'default'} className={quiz.status === 'draft' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'} data-testid={`badge-status-${quiz.id}`} >
                              {quiz.status === 'draft' ? 'Draft' : 'Published'}
                            </Badge>
                            {quiz.gradeId && getGradeName(quiz.gradeId) && (
                              <Badge className={`${getGradeColor(quiz.gradeId)} text-primary-foreground`} data-testid={`badge-grade-${quiz.id}`} >
                                {getGradeName(quiz.gradeId)}
                              </Badge>
                            )}
                            {getSubjectName(quiz.subjectId) && (
                              <Badge variant="outline" data-testid={`badge-subject-${quiz.id}`}>
                                {getSubjectName(quiz.subjectId)}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </div>
                    </CardHeader>
                    <CardContent className="p-0 space-y-[var(--space-sm)]">
                      <div className="flex flex-wrap gap-2 text-[length:var(--text-sm)] text-muted-foreground">
                        {getGradeName(quiz.gradeId) && (
                          <span className="flex items-center" data-testid={`text-grade-${quiz.id}`}>
                            {getGradeName(quiz.gradeId)}
                          </span>
                        )}
                        {quiz.difficulty && (
                          <span className="flex items-center capitalize" data-testid={`text-difficulty-${quiz.id}`}>
                            • {quiz.difficulty}
                          </span>
                        )}
                        {quiz.type === 'draft' && quiz.generatedQuestions && (() => {
                          let questions = quiz.generatedQuestions;
                          if (typeof questions === 'string') {
                            try {
                              questions = JSON.parse(questions);
                            } catch {
                              return null;
                            }
                          }
                          const count = Array.isArray(questions) ? questions.length : 0;
                          return count > 0 ? (
                            <span className="flex items-center" data-testid={`text-question-count-${quiz.id}`}>
                              • {count} questions
                            </span>
                          ) : null;
                        })()}
                        {quiz.type === 'published' && quiz.totalCards > 0 && (
                          <span className="flex items-center" data-testid={`text-question-count-${quiz.id}`}>
                            • {quiz.totalCards} questions
                          </span>
                        )}
                      </div>

                      {quiz.topic && quiz.type === 'draft' && (
                        <p className="text-[length:var(--text-sm)] text-muted-foreground line-clamp-2" data-testid={`text-topic-${quiz.id}`}>
                          Topic: {quiz.topic}
                        </p>
                      )}
                      
                      {quiz.description && quiz.type === 'published' && (
                        <p className="text-[length:var(--text-sm)] text-muted-foreground line-clamp-2" data-testid={`text-description-${quiz.id}`}>
                          {quiz.description}
                        </p>
                      )}

                      <div className="flex items-center text-[length:var(--text-xs)] text-muted-foreground" data-testid={`text-last-updated-${quiz.id}`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {quiz.updatedAt
                          ? `Updated ${tzFormat(quiz.updatedAt, "MMM d, yyyy")}`
                          : "Just created"}
                      </div>

                      <div className="flex flex-col sm:flex-row gap-2 pt-[var(--space-sm)] border-t">
                        {quiz.type === 'draft' ? (
                          <>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] touch-manipulation" onClick={(e) => {
                                e.stopPropagation();
                                handleEditDraft(quiz.id);
                              }}
                              data-testid={`button-edit-${quiz.id}`}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] touch-manipulation" onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteDraft(quiz.id);
                              }}
                              data-testid={`button-delete-${quiz.id}`}
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Delete
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] touch-manipulation" onClick={(e) => {
                                e.stopPropagation();
                                handleEditPublishedQuiz(quiz.id);
                              }}
                              data-testid={`button-edit-${quiz.id}`}
                            >
                              <Edit className="h-3 w-3 mr-1" />
                              Edit Quiz
                            </Button>
                            <Button variant="outline" size="sm" className="flex-1 min-h-[44px] touch-manipulation" onClick={(e) => {
                                e.stopPropagation();
                                setLocation(`/quiz-card-manager?collection=${quiz.id}`);
                              }}
                              data-testid={`button-manage-${quiz.id}`}
                            >
                              <FileText className="h-3 w-3 mr-1" />
                              <span className="hidden sm:inline">Manage Questions</span>
                              <span className="sm:hidden">Manage</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed p-[var(--card-padding)]">
                <CardContent className="flex flex-col items-center justify-center py-[var(--space-xl)] px-[var(--space-md)] p-0 text-center">
                  <FileText className="h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground mb-[var(--space-md)]" />
                  <h3 className="text-[length:var(--text-lg)] font-semibold text-foreground mb-[var(--space-sm)]" data-testid="text-no-drafts-title">
                    No drafts yet
                  </h3>
                  <p className="text-[length:var(--text-sm)] text-muted-foreground mb-[var(--space-md)] max-w-md" data-testid="text-no-drafts-description">
                    Start creating AI-powered quizzes by clicking the "Create New Quiz" button above
                  </p>
                  <Button onClick={handleCreateNewDraft} className="min-h-[44px] touch-manipulation" data-testid="button-create-first-quiz" >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Your First Quiz
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </QuizAdminLayout>
  );
}
