import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { 
  Sparkles, 
  ChevronDown, 
  ChevronUp, 
  AlertTriangle, 
  CheckCircle, 
  CheckCircle2,
  Circle,
  Target,
  BookOpen,
  MessageSquare,
  Lightbulb,
  RefreshCw,
  Loader2,
  Star,
  TrendingUp,
  Pencil,
  Eye,
  Wand2,
  Upload
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, invalidateLessonCaches, queryClient } from '@/lib/queryClient';

interface QualityDimension {
  name: string;
  score: number;
  feedback: string;
  suggestions: string[];
}

interface ImprovementSuggestion {
  id: string;
  priority: 'critical' | 'important' | 'nice-to-have';
  category: string;
  title: string;
  description: string;
  example?: string;
  estimatedEffort: 'quick' | 'medium' | 'significant';
  impactScore: number;
}

interface AbbreviationDetection {
  abbreviation: string;
  expandedForm: string;
  occurrences: number;
  alreadyDefined: boolean;
  confidence: number;
}

interface ContentCoachFeedback {
  lessonId: string;
  lessonTitle: string;
  overallScore: number;
  qualityGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  rubric: {
    structure: QualityDimension;
    depth: QualityDimension;
    bloomAlignment: QualityDimension;
    terminology: QualityDimension;
    examples: QualityDimension;
    engagement: QualityDimension;
    audienceFit: QualityDimension;
  };
  topImprovements: ImprovementSuggestion[];
  allSuggestions: ImprovementSuggestion[];
  strengths: string[];
  wordCount: number;
  targetWordCount: number;
  bloomLevelsCovered: string[];
  missingBloomLevels: string[];
  abbreviations: AbbreviationDetection[];
}

interface LessonDetails {
  id: string;
  title: string;
  inputText?: string;
  organizationId?: string;
}

interface ContentCoachPanelProps {
  lessonId: string;
  lessonTitle: string;
  compact?: boolean;
  onClose?: () => void;
  organizationId?: string;
  courseId?: string;
  onActionComplete?: () => void;
}

const priorityColors = {
  critical: 'bg-destructive/10 text-destructive border-destructive/20',
  important: 'bg-warning/10 text-warning border-[var(--warning)]/20',
  'nice-to-have': 'bg-primary/10 text-primary border-border',
};

const priorityLabels = {
  critical: 'Critical',
  important: 'Important',
  'nice-to-have': 'Nice to Have',
};

const effortLabels = {
  quick: '5-10 min',
  medium: '15-30 min',
  significant: '30+ min',
};

const gradeColors = {
  A: 'text-success',
  B: 'text-primary',
  C: 'text-warning',
  D: 'text-warning',
  F: 'text-destructive',
};

export function ContentCoachPanel({ 
  lessonId, 
  lessonTitle, 
  compact = false, 
  onClose,
  organizationId,
  courseId,
  onActionComplete
}: ContentCoachPanelProps) {
  const [isExpanded, setIsExpanded] = useState(!compact);
  const [showAllSuggestions, setShowAllSuggestions] = useState(false);
  const [shouldRefresh, setShouldRefresh] = useState(false);
  const [editContentDialogOpen, setEditContentDialogOpen] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [uploadDocumentDialogOpen, setUploadDocumentDialogOpen] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [editingAbbr, setEditingAbbr] = useState<number | null>(null);
  const [editedExpansions, setEditedExpansions] = useState<Record<number, string>>({});
  const [confirmedAbbrs, setConfirmedAbbrs] = useState<Set<number>>(new Set());
  const [aiFixSummaryDialogOpen, setAiFixSummaryDialogOpen] = useState(false);
  const [aiFixSummary, setAiFixSummary] = useState<{
    summary: string;
    improvements: string[];
    creditsCharged: number;
    originalWordCount: number;
    improvedWordCount: number;
  } | null>(null);
  const [prevAiStatus, setPrevAiStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: feedback, isLoading, error, refetch, isFetching } = useQuery<ContentCoachFeedback>({
    queryKey: ['/api/content', lessonId, 'coach'],
    queryFn: async () => {
      const url = shouldRefresh 
        ? `/api/content/${lessonId}/coach?refresh=true`
        : `/api/content/${lessonId}/coach`;
      const response = await fetch(url, { credentials: 'include' });
      setShouldRefresh(false);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to get feedback');
      }
      return response.json();
    },
    enabled: isExpanded,
    staleTime: 5 * 60 * 1000,
  });

  const { data: platformPricing } = useQuery<{ platformPricing: { creditsPerAiFix?: number } }>({
    queryKey: ['/api/admin/platform-pricing'],
    staleTime: 5 * 60 * 1000,
  });
  const aiFixCost = platformPricing?.platformPricing?.creditsPerAiFix ?? 25;

  const { data: feedbackPricingData } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/public/lesson-feedback-pricing'],
  });

  const { data: lessonDetails } = useQuery<LessonDetails>({
    queryKey: ['/api/lessons', lessonId, 'details'],
    queryFn: async () => {
      const orgParam = organizationId ? `?organizationId=${organizationId}` : '';
      const response = await fetch(`/api/lessons/${lessonId}${orgParam}`, { credentials: 'include' });
      if (!response.ok) {
        throw new Error('Failed to load lesson details');
      }
      return response.json();
    },
    enabled: isExpanded,
  });

  const { data: aiImproveStatus } = useQuery<{ status: string | null; result: any }>({
    queryKey: ['/api/lessons', lessonId, 'ai-improve-status'],
    enabled: isExpanded,
    refetchInterval: (query) => {
      const data = query.state.data as { status: string | null } | undefined;
      return data?.status === 'processing' ? 3000 : false;
    },
    staleTime: 5000,
  });

  const isAiImproving = aiImproveStatus?.status === 'processing';

  useEffect(() => {
    if (!aiImproveStatus) return;
    const currentStatus = aiImproveStatus.status;

    if (prevAiStatus === 'processing' && currentStatus === 'completed' && aiImproveStatus.result) {
      const result = aiImproveStatus.result;
      setAiFixSummary({
        summary: result.changesSummary?.summary || 'Content has been improved based on feedback',
        improvements: result.changesSummary?.improvements || [],
        creditsCharged: result.creditsCharged || 0,
        originalWordCount: result.originalWordCount || 0,
        improvedWordCount: result.improvedWordCount || 0,
      });
      setAiFixSummaryDialogOpen(true);

      invalidateLessonCaches({ lessonId, courseId });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'source-document'] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'versions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/content', lessonId, 'coach'] });
      onActionComplete?.();

      apiRequest(`/api/lessons/${lessonId}/ai-improve-reset`, { method: 'POST' }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'ai-improve-status'] });
    } else if (prevAiStatus === 'processing' && currentStatus === 'failed') {
      toast({
        title: 'AI Fix Failed',
        description: aiImproveStatus.result?.error || 'AI improvement failed. Please try again.',
        variant: 'destructive',
      });
      apiRequest(`/api/lessons/${lessonId}/ai-improve-reset`, { method: 'POST' }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'ai-improve-status'] });
    }

    setPrevAiStatus(currentStatus);
  }, [aiImproveStatus]);

  const updateContentMutation = useMutation({
    mutationFn: async (newContent: string) => {
      return await apiRequest(`/api/lessons/${lessonId}`, {
        method: 'PUT',
        body: JSON.stringify({ 
          inputText: newContent,
          organizationId 
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: 'Content updated',
        description: 'Lesson content has been updated successfully. Get fresh feedback to see your score.',
      });
      invalidateLessonCaches({ lessonId, courseId });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'source-document'] });
      queryClient.invalidateQueries({ queryKey: ['/api/content', lessonId, 'coach'] });
      setEditContentDialogOpen(false);
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update lesson content',
      });
    },
  });

  const uploadDocumentMutation = useMutation({
    mutationFn: async () => {
      if (!documentFile) {
        throw new Error('No file selected');
      }

      const formData = new FormData();
      formData.append('document', documentFile);

      const orgParam = organizationId ? `?organizationId=${organizationId}` : '';
      const response = await fetch(
        `/api/lessons/${lessonId}/supplement${orgParam}`,
        {
          method: 'POST',
          body: formData,
          credentials: 'include',
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload document');
      }

      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Document uploaded',
        description: `Successfully extracted ${data.extractedWordCount} words. Get fresh feedback to see your updated score.`,
      });
      invalidateLessonCaches({ lessonId, courseId });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId, 'source-document'] });
      queryClient.invalidateQueries({ queryKey: ['/api/content', lessonId, 'coach'] });
      setUploadDocumentDialogOpen(false);
      setDocumentFile(null);
      onActionComplete?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message || 'Failed to upload document',
      });
    },
  });

  const aiImproveMutation = useMutation({
    mutationFn: async () => {
      const selectedAbbrs = feedback?.abbreviations
        ?.map((a, idx) => ({ ...a, originalIdx: idx }))
        .filter(({ originalIdx, alreadyDefined }) => confirmedAbbrs.has(originalIdx) && !alreadyDefined)
        .map(({ abbreviation, expandedForm, originalIdx }) => ({
          abbreviation,
          expandedForm: editedExpansions[originalIdx] || expandedForm,
        })) || [];

      const response = await apiRequest(`/api/lessons/${lessonId}/ai-improve`, {
        method: 'POST',
        body: JSON.stringify({ 
          feedbackReport: feedback,
          abbreviations: selectedAbbrs.length > 0 ? selectedAbbrs : undefined,
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.async) {
        toast({
          title: 'AI Fix Started',
          description: 'Improving content in the background. This may take a minute...',
        });
      }
    },
    onError: (error: any) => {
      if (error.status === 409) {
        toast({
          title: 'Already Processing',
          description: 'AI Fix is already running for this lesson.',
          variant: 'destructive',
        });
      } else if (error.statusCode === 402 || error.status === 402) {
        toast({
          title: 'Insufficient Credits',
          description: `You need ${error.required || 'more'} credits but only have ${error.available ?? error.balance ?? 0}.`,
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'AI Fix Failed',
          description: error.message || 'Failed to start AI improvement',
          variant: 'destructive',
        });
      }
    },
  });

  const fixAbbreviationsMutation = useMutation({
    mutationFn: async () => {
      if (!feedback) throw new Error('No feedback available');
      const selectedAbbrs = feedback.abbreviations
        .map((a, idx) => ({ ...a, originalIdx: idx }))
        .filter(({ originalIdx, alreadyDefined }) => confirmedAbbrs.has(originalIdx) && !alreadyDefined)
        .map(({ abbreviation, expandedForm, originalIdx }) => ({
          abbreviation,
          expandedForm: editedExpansions[originalIdx] || expandedForm,
        }));
      return await apiRequest(`/api/lessons/${lessonId}/fix-abbreviations`, {
        method: 'POST',
        body: JSON.stringify({ abbreviations: selectedAbbrs }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Abbreviations fixed', description: 'The lesson content has been updated with expanded abbreviations.' });
      invalidateLessonCaches({ lessonId, courseId });
      queryClient.invalidateQueries({ queryKey: ['/api/lessons', lessonId] });
      queryClient.invalidateQueries({ queryKey: ['/api/content', lessonId, 'coach'] });
      setConfirmedAbbrs(new Set());
      setEditedExpansions({});
      onActionComplete?.();
    },
    onError: (error: any) => {
      if (error.statusCode === 402) {
        toast({
          title: 'Insufficient Credits',
          description: error.message || 'Not enough credits to fix abbreviations.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Fix failed', description: error.message, variant: 'destructive' });
      }
    },
  });

  // useEffect to trigger refetch when shouldRefresh changes - fixes closure issue
  useEffect(() => {
    if (shouldRefresh) {
      refetch();
    }
  }, [shouldRefresh, refetch]);

  const handleRefresh = () => {
    setShouldRefresh(true);
  };

  const handleOpenEditContent = () => {
    setEditContent(lessonDetails?.inputText || '');
    setEditContentDialogOpen(true);
  };

  const handleSaveContent = () => {
    updateContentMutation.mutate(editContent);
  };

  const handleViewLesson = () => {
    if (typeof lessonId === 'string') {
      setLocation(`/lessons/${lessonId}`);
    }
  };

  const handleAiFix = () => {
    aiImproveMutation.mutate();
  };

  const handleUploadDocument = () => {
    uploadDocumentMutation.mutate();
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  const getProgressColor = (score: number) => {
    if (score >= 80) return 'bg-success';
    if (score >= 60) return 'bg-warning';
    return 'bg-destructive';
  };

  if (compact && !isExpanded) {
    return (
      <Button variant="outline" size="sm" onClick={() => setIsExpanded(true)}
        className="gap-2"
      >
        <Sparkles className="h-4 w-4 text-primary" />
        Get Expert Feedback
      </Button>
    );
  }

  return (
    <>
      <Card className="border-border bg-primary/20">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Content Coach
            </CardTitle>
            <div className="flex items-center gap-2">
              {feedback && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={isFetching} >
                      <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Refresh feedback</TooltipContent>
                </Tooltip>
              )}
              {compact && (
                <Button variant="ghost" size="sm" onClick={() => setIsExpanded(false)}>
                  <ChevronUp className="h-4 w-4" />
                </Button>
              )}
              {onClose && (
                <Button variant="ghost" size="sm" onClick={onClose}>
                  ×
                </Button>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Expert analysis and actionable suggestions for "{lessonTitle}"
          </p>
        </CardHeader>

        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Analyzing your content...</span>
            </div>
          ) : error ? (
            <div className="text-center py-4">
              <AlertTriangle className="h-8 w-8 mx-auto text-warning mb-2" />
              <p className="text-sm text-muted-foreground">{(error as Error).message}</p>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-2">
                Try Again
              </Button>
            </div>
          ) : feedback ? (
            <>
              {/* Overall Score */}
              <div className="flex items-center gap-4 p-4 rounded-lg bg-card/50 border">
                <div className="text-center">
                  <div className={`text-4xl font-bold ${gradeColors[feedback.qualityGrade]}`}>
                    {feedback.qualityGrade}
                  </div>
                  <div className="text-xs text-muted-foreground">Grade</div>
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">Overall Quality Score</span>
                    <span className={`font-bold ${getScoreColor(feedback.overallScore)}`}>
                      {feedback.overallScore}/100
                    </span>
                  </div>
                  <Progress value={feedback.overallScore} className="h-2" />
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{feedback.wordCount} words</span>
                    <span>•</span>
                    <span>Target: {feedback.targetWordCount}+ words</span>
                  </div>
                </div>
              </div>

              {/* How to Improve Your Content */}
              {feedback.topImprovements.length > 0 && (
                <div className="p-3 rounded-lg bg-warning/10 border border-[var(--warning)]/20">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp className="h-4 w-4 text-warning" />
                    <span className="text-sm font-medium text-warning">How to Improve Your Content</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    Address these items to improve your content quality score. Items are listed by priority.
                  </p>
                  <div className="space-y-3">
                    {feedback.topImprovements.map((improvement, idx) => (
                      <div key={improvement.id} className={`p-3 rounded-lg border ${priorityColors[improvement.priority]}`}>
                        <div className="flex items-start gap-2 mb-2">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-warning/20 text-warning text-xs font-bold flex items-center justify-center mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <Badge variant="outline" className={priorityColors[improvement.priority]}>
                                {priorityLabels[improvement.priority]}
                              </Badge>
                              <span className="text-xs text-muted-foreground">{improvement.category}</span>
                            </div>
                            <h4 className="font-medium text-sm">{improvement.title}</h4>
                          </div>
                        </div>
                        <p className="text-sm text-muted-foreground ml-7">{improvement.description}</p>
                        {improvement.example && (
                          <div className="mt-2 ml-7 p-2 rounded bg-muted/50 text-sm">
                            <Lightbulb className="h-3 w-3 inline mr-1 text-warning" />
                            <span className="font-medium">Suggested approach: </span>
                            {improvement.example}
                          </div>
                        )}
                        <div className="mt-1 ml-7 text-xs text-muted-foreground">
                          Estimated effort: {effortLabels[improvement.estimatedEffort]}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Review the improvements above and edit your content accordingly. Then click "Get Feedback" again to see your updated score.
                  </p>
                </div>
              )}

              {/* Strengths */}
              {feedback.strengths.length > 0 && (
                <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="h-4 w-4 text-success" />
                    <span className="text-sm font-medium text-success">Strengths</span>
                  </div>
                  <ul className="text-sm space-y-1">
                    {feedback.strengths.map((strength, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <Star className="h-3 w-3 mt-1 text-success flex-shrink-0" />
                        <span>{strength}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Quality Dimensions */}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full justify-between">
                    <span className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Quality Breakdown
                    </span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2">
                  {Object.entries(feedback.rubric).map(([key, dimension]) => (
                    <div key={key} className="p-3 rounded-lg bg-card/50 border">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium">{dimension.name}</span>
                        <span className={`text-sm font-bold ${getScoreColor(dimension.score)}`}>
                          {dimension.score}/100
                        </span>
                      </div>
                      <Progress 
                        value={dimension.score} 
                        className={`h-1.5 mb-2`}
                      />
                      <p className="text-xs text-muted-foreground">{dimension.feedback}</p>
                      {dimension.suggestions.length > 0 && (
                        <ul className="mt-2 space-y-1">
                          {dimension.suggestions.map((suggestion, i) => (
                            <li key={i} className="text-xs flex items-start gap-1">
                              <MessageSquare className="h-3 w-3 mt-0.5 text-primary flex-shrink-0" />
                              {suggestion}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>

              {/* Bloom's Taxonomy Coverage */}
              {(feedback.bloomLevelsCovered.length > 0 || feedback.missingBloomLevels.length > 0) && (
                <div className="p-3 rounded-lg bg-card/50 border">
                  <div className="flex items-center gap-2 mb-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Bloom's Taxonomy Coverage</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {feedback.bloomLevelsCovered.map((level) => (
                      <Badge key={level} variant="outline" >
                        {level}
                      </Badge>
                    ))}
                    {feedback.missingBloomLevels.map((level) => (
                      <Badge key={level} variant="outline" >
                        {level}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Abbreviations Detected */}
              {feedback.abbreviations && feedback.abbreviations.length > 0 && (
                <div className="p-3 rounded-lg bg-card/50 border space-y-3">
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Abbreviations Detected ({feedback.abbreviations.length})</span>
                  </div>
                  <div className="space-y-2">
                    {feedback.abbreviations.map((abbr, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 rounded-md bg-muted/50 border border-border">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="font-mono">{abbr.abbreviation}</Badge>
                          <span className="text-sm text-muted-foreground">→</span>
                          {editingAbbr === idx ? (
                            <Input 
                              className="h-7 w-48 text-sm"
                              value={editedExpansions[idx] ?? abbr.expandedForm}
                              onChange={(e) => setEditedExpansions(prev => ({...prev, [idx]: e.target.value}))}
                              onBlur={() => setEditingAbbr(null)}
                              onKeyDown={(e) => e.key === 'Enter' && setEditingAbbr(null)}
                              autoFocus
                            />
                          ) : (
                            <span className="text-sm">{editedExpansions[idx] ?? abbr.expandedForm}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {abbr.alreadyDefined && (
                            <Badge variant="secondary" className="text-xs">Defined</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">×{abbr.occurrences}</span>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditingAbbr(idx)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => {
                              setConfirmedAbbrs(prev => {
                                const next = new Set(prev);
                                if (next.has(idx)) next.delete(idx);
                                else next.add(idx);
                                return next;
                              });
                            }}
                          >
                            {confirmedAbbrs.has(idx) ? (
                              <CheckCircle2 className="h-3 w-3 text-success" />
                            ) : (
                              <Circle className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {feedback.abbreviations.some((a, i) => confirmedAbbrs.has(i) && !a.alreadyDefined) && (
                    <Button size="sm" onClick={() => fixAbbreviationsMutation.mutate()}
                      disabled={fixAbbreviationsMutation.isPending}
                      className="w-full"
                    >
                      {fixAbbreviationsMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Fixing...</>
                      ) : (
                        <><Wand2 className="h-4 w-4 mr-2" />AI Fix Selected Abbreviations ({aiFixCost} LPC)</>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <Sparkles className="h-8 w-8 mx-auto text-primary mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                Get AI-powered expert feedback on your lesson content
              </p>
              <Button onClick={() => refetch()}>
                <Sparkles className="h-4 w-4 mr-2" />
                Analyze Content
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Lesson Content Dialog */}
      <Dialog open={editContentDialogOpen} onOpenChange={setEditContentDialogOpen}>
        <DialogContent className="w-[min(95vw,56rem)] max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Edit Lesson Content</DialogTitle>
            <DialogDescription>
              Edit the full lesson content body. This content is used for presentation generation and AI analysis.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 py-4">
            <Label htmlFor="lesson-content" className="text-sm font-medium mb-2 block">
              Lesson Content
            </Label>
            <Textarea
              id="lesson-content"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Enter your lesson content here..."
              className="min-h-[400px] resize-none font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground mt-2">
              {editContent.split(/\s+/).filter(Boolean).length} words
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditContentDialogOpen(false)}
              disabled={updateContentMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleSaveContent} disabled={updateContentMutation.isPending} >
              {updateContentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Content'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={uploadDocumentDialogOpen} onOpenChange={(open) => {
        setUploadDocumentDialogOpen(open);
        if (!open) setDocumentFile(null);
      }}>
        <DialogContent className="w-[min(95vw,28rem)]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>
              Upload a Word (.docx) or PowerPoint (.pptx) file to supplement your lesson content. The text will be extracted and added to your lesson.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="document-file" className="text-sm font-medium mb-2 block">
              Document File
            </Label>
            <Input
              id="document-file"
              ref={fileInputRef}
              type="file"
              accept=".docx,.pptx"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) setDocumentFile(file);
              }}
              className="min-h-[44px]"
            />
            {documentFile && (
              <p className="text-sm text-success mt-2">
                Selected: {documentFile.name} ({(documentFile.size / 1024 / 1024).toFixed(2)} MB)
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              Supported formats: .docx, .pptx (max 10MB)
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
                setUploadDocumentDialogOpen(false);
                setDocumentFile(null);
              }}
              disabled={uploadDocumentMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleUploadDocument} disabled={!documentFile || uploadDocumentMutation.isPending} >
              {uploadDocumentMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* AI Fix Summary Dialog */}
      <Dialog open={aiFixSummaryDialogOpen} onOpenChange={setAiFixSummaryDialogOpen}>
        <DialogContent className="w-[min(95vw,32rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              AI Improvement Complete
            </DialogTitle>
            <DialogDescription>
              {aiFixSummary?.summary || 'Your lesson content has been enhanced.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {aiFixSummary?.improvements && aiFixSummary.improvements.length > 0 && (
              <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-4 w-4 text-success" />
                  <span className="text-sm font-medium text-success">Improvements Made</span>
                </div>
                <ul className="text-sm space-y-1">
                  {aiFixSummary.improvements.map((improvement, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Star className="h-3 w-3 mt-1 text-success flex-shrink-0" />
                      <span>{improvement}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex justify-between text-sm text-muted-foreground px-1">
              <div className="flex items-center gap-4">
                <span>Words: {aiFixSummary?.originalWordCount || 0} → {aiFixSummary?.improvedWordCount || 0}</span>
              </div>
              {aiFixSummary?.creditsCharged ? (
                <span>{aiFixSummary.creditsCharged} credits used</span>
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setAiFixSummaryDialogOpen(false)}
              disabled={isFetching}
            >
              Close
            </Button>
            <Button onClick={() => {
                setAiFixSummaryDialogOpen(false);
                setShouldRefresh(true);
                setTimeout(() => refetch(), 100);
              }}
              className="gap-2"
              disabled={isFetching}
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Get New Feedback ({feedbackPricingData?.creditCost ?? 5} LPC)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
