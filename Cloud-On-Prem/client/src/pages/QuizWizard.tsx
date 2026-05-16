import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, ArrowRight, Wand2, Loader2, Save, Check, RefreshCw, Edit2, CheckCircle2, Coins, Building2, Users, GitBranch, Database, Presentation, FileText, Mic2, Sparkles, AlertCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest, invalidateWalletCaches } from "@/lib/queryClient";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import type { QuizDraft } from "@shared/schema";
import { QUIZ_TIERS, type QuizTier } from "@shared/creditConstants";
import { CourseBackLink } from "@/components/CourseBackLink";

const STEPS = [
  { id: 1, title: "Select Source", description: "Choose quiz content source" },
  { id: 2, title: "Quiz Criteria", description: "Define topic and parameters" },
  { id: 3, title: "Generate Questions", description: "AI creates your questions" },
  { id: 4, title: "Review & Edit", description: "Customize as needed" },
  { id: 5, title: "Publish", description: "Make it available" },
];

interface QuizTierPricing {
  tier: QuizTier;
  creditCost: number;
  questionCount: number;
  label: string;
}

interface QuizPricingResponse {
  tiers: QuizTierPricing[];
  organizationId: string | null;
}

type QuizSourceType = 'manual_topic' | 'sourcedb' | 'pptx' | 'word' | 'podcast';

const QUIZ_SOURCE_TYPE_ORDER: QuizSourceType[] = ["sourcedb", "pptx", "word", "podcast", "manual_topic"];
const QUIZ_SOURCE_TYPE_LABELS: Record<QuizSourceType, string> = {
  sourcedb: "Source Database",
  pptx: "PPTX",
  word: "Word Document",
  podcast: "Podcast Script",
  manual_topic: "Manual Topic",
};

interface QuizSourceOption {
  id: string;
  sourceType: QuizSourceType;
  versionRef: string;
  label: string;
  createdAt: string | null;
  languageCode: string;
  isActive: boolean;
  wordCount: number;
  description: string;
}

interface QuizSourceSelection {
  sourceType: QuizSourceType;
  versionRef: string;
  languageCode?: string;
}

interface QuizSourceContract {
  sourceType: QuizSourceType;
  versionRef: string;
  label: string;
  languageCode: string;
  createdAt: string | null;
  contentLength: number;
  contentHash: string;
  resolverVersion: string;
  selectedAt?: string;
  selectedBy?: string | null;
  warning?: string;
}

interface QuizSourcesResponse {
  lessonId: string;
  languageCode: string;
  defaultSelection: QuizSourceSelection;
  options: QuizSourceOption[];
}

interface LearningObjective {
  id: string;
  objective: string;
  bloomLevel?: string;
}

function getEffectiveCreditCost(
  tier: QuizTier,
  pricingData: QuizPricingResponse | undefined
): number {
  if (pricingData?.tiers) {
    const tierPricing = pricingData.tiers.find(t => t.tier === tier);
    if (tierPricing) {
      return tierPricing.creditCost;
    }
  }
  return QUIZ_TIERS[tier].defaultCredits;
}

// Helper function to normalize distribution to exactly 100%
// lockedKey: the key that should NOT be adjusted (the one user just changed)
function normalizeDistribution(
  multipleChoice: number,
  trueFalse: number,
  match: number,
  fillBlank: number,
  lockedKey: 'multipleChoice' | 'trueFalse' | 'match' | 'fillBlank'
): { multipleChoice: number; trueFalse: number; match: number; fillBlank: number } {
  const values = {
    multipleChoice: Math.round(multipleChoice),
    trueFalse: Math.round(trueFalse),
    match: Math.round(match),
    fillBlank: Math.round(fillBlank),
  };
  
  // Calculate current total
  const total = values.multipleChoice + values.trueFalse + values.match + values.fillBlank;
  const remainder = 100 - total;
  
  // If total is already 100, return the values
  if (remainder === 0) {
    return values;
  }
  
  // Get the keys that can be adjusted (all except the locked one)
  const adjustableKeys = (['multipleChoice', 'trueFalse', 'match', 'fillBlank'] as const)
    .filter(key => key !== lockedKey);
  
  // Sort adjustable keys by value (largest first)
  const sortedKeys = adjustableKeys.sort((a, b) => values[b] - values[a]);
  
  // Distribute the remainder across adjustable values
  let remainingToDistribute = Math.abs(remainder);
  let keyIndex = 0;
  
  while (remainingToDistribute > 0) {
    const key = sortedKeys[keyIndex % sortedKeys.length];
    
    if (remainder > 0) {
      // Add 1 to this key
      values[key]++;
      remainingToDistribute--;
    } else {
      // Subtract 1 from this key (only if it's > 0)
      if (values[key] > 0) {
        values[key]--;
        remainingToDistribute--;
      }
    }
    
    keyIndex++;
    
    // Safety check to prevent infinite loop
    if (keyIndex > 1000) break;
  }
  
  return values;
}

function getQuizSourceStorageKey(params: {
  organizationId: string;
  lessonId?: string;
  draftId?: string;
}) {
  return `quiz-source-selection:${params.organizationId}:${params.lessonId || 'no-lesson'}:${params.draftId || 'new'}`;
}

interface GeneratedQuestion {
  question: string;
  questionType?: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank';
  answers?: string[];
  correctIndex?: number;
  matchPairs?: { left: string; right: string }[];
  correctAnswer?: string;
  selected?: boolean;
  validatorStatus?: 'passed' | 'rejected' | 'regenerated';
  userDisposition?: 'pending' | 'accepted' | 'rejected';
  validatorReason?: string | null;
  validatorMissingTokens?: string[];
  phraseConfidence?: number | null;
  lexicalCoverage?: number | null;
  requestedRegenerationType?: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank';
  objectiveId?: string;
  rejectionReason?: string | null;
}

interface QuestionCardProps {
  question: GeneratedQuestion;
  index: number;
  onToggleSelect: (index: number) => void;
  onEdit: (index: number, question: GeneratedQuestion) => void;
  onRegenerateQuestion: (index: number, questionType?: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank') => Promise<void>;
  onRegenerateAnswers: (index: number) => Promise<void>;
  onAcceptRejected: (index: number) => void;
  onLoadEvidence: (index: number) => Promise<{ snippets: string[]; sourceLabel?: string | null; sourceTimestamp?: string | null }>;
  isRegeneratingQuestion?: boolean;
  isRegeneratingAnswers?: boolean;
  objectiveLookup?: Record<string, string>;
}

function QuestionCard({ question, index, onToggleSelect, onEdit, onRegenerateQuestion, onRegenerateAnswers, onAcceptRejected, onLoadEvidence, isRegeneratingQuestion, isRegeneratingAnswers, objectiveLookup }: QuestionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const questionType = question.questionType || 'multiple-choice';
  const [regenerateAsType, setRegenerateAsType] = useState<'multiple-choice' | 'true-false' | 'match' | 'fill-blank'>(questionType);
  const [showEvidence, setShowEvidence] = useState(false);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [evidenceSnippets, setEvidenceSnippets] = useState<string[]>([]);
  const [evidenceSourceLabel, setEvidenceSourceLabel] = useState<string | null>(null);
  const [evidenceSourceTimestamp, setEvidenceSourceTimestamp] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [editedQuestion, setEditedQuestion] = useState(question.question);
  const [editedAnswers, setEditedAnswers] = useState([...(question.answers || [])]);
  const [editedCorrectIndex, setEditedCorrectIndex] = useState(question.correctIndex || 0);
  const [editedMatchPairs, setEditedMatchPairs] = useState([...(question.matchPairs || [])]);
  const [editedCorrectAnswer, setEditedCorrectAnswer] = useState(question.correctAnswer || '');

  // Sync local edit state with incoming question prop changes
  useEffect(() => {
    if (!isEditing) {
      setEditedQuestion(question.question);
      setEditedAnswers([...(question.answers || [])]);
      setEditedCorrectIndex(question.correctIndex || 0);
      setEditedMatchPairs([...(question.matchPairs || [])]);
      setEditedCorrectAnswer(question.correctAnswer || '');
      setRegenerateAsType((question.questionType || 'multiple-choice') as 'multiple-choice' | 'true-false' | 'match' | 'fill-blank');
      setShowEvidence(false);
      setIsLoadingEvidence(false);
      setEvidenceSnippets([]);
      setEvidenceSourceLabel(null);
      setEvidenceSourceTimestamp(null);
      setEvidenceError(null);
    }
  }, [question, isEditing]);

  const resolutionLabel = question.validatorStatus === 'rejected'
    ? (question.userDisposition === 'accepted'
      ? 'Reviewed Accepted'
      : 'Needs Review')
    : (question.validatorStatus === 'regenerated' ? 'Regenerated' : 'Ready');

  const guidanceSummary = question.validatorStatus === 'rejected'
    ? "Generated quiz wording will not always match source text verbatim. Focus on whether meaning is grounded in the selected source."
    : null;
  const isPendingSourceReview = question.validatorStatus === 'rejected' && question.userDisposition === 'pending';

  const handleToggleEvidence = async () => {
    const nextShow = !showEvidence;
    setShowEvidence(nextShow);
    if (!nextShow || evidenceSnippets.length > 0 || isLoadingEvidence) {
      return;
    }
    try {
      setIsLoadingEvidence(true);
      setEvidenceError(null);
      const result = await onLoadEvidence(index);
      setEvidenceSnippets(result.snippets || []);
      setEvidenceSourceLabel(result.sourceLabel || null);
      setEvidenceSourceTimestamp(result.sourceTimestamp || null);
    } catch (error: any) {
      setEvidenceError(error?.message || "Could not load source evidence right now.");
    } finally {
      setIsLoadingEvidence(false);
    }
  };

  const handleSave = () => {
    // Spread original question to preserve all properties, then override with edited values
    const updatedQuestion: GeneratedQuestion = {
      ...question, // Preserve any existing properties (id, metadata, etc.)
      question: editedQuestion,
      questionType,
      selected: question.selected,
    };

    if (questionType === 'multiple-choice' || questionType === 'true-false') {
      updatedQuestion.answers = [...editedAnswers]; // Create new array reference
      updatedQuestion.correctIndex = editedCorrectIndex;
    } else if (questionType === 'match') {
      updatedQuestion.matchPairs = editedMatchPairs.map(p => ({ ...p })); // Deep copy pairs
    } else if (questionType === 'fill-blank') {
      updatedQuestion.correctAnswer = editedCorrectAnswer;
    }

    console.log('[QuizWizard] Saving question edits:', { index, before: question, after: updatedQuestion });
    onEdit(index, updatedQuestion);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedQuestion(question.question);
    setEditedAnswers([...(question.answers || [])]);
    setEditedCorrectIndex(question.correctIndex || 0);
    setEditedMatchPairs([...(question.matchPairs || [])]);
    setEditedCorrectAnswer(question.correctAnswer || '');
    setIsEditing(false);
  };

  const getQuestionTypeBadge = () => {
    const types = {
      'multiple-choice': { label: 'Multiple Choice', color: 'bg-secondary/10 dark:bg-secondary/20 text-secondary dark:text-secondary/80' },
      'true-false': { label: 'True/False', color: 'bg-success/10 dark:bg-success/20 text-success dark:text-success/80' },
      'match': { label: 'Match Pairs', color: 'bg-primary/10 dark:bg-primary/20 text-primary dark:text-primary/80' },
      'fill-blank': { label: 'Fill Blank', color: 'bg-accent/10 dark:bg-accent/20 text-accent dark:text-accent/80' },
    };
    const typeInfo = types[questionType];
    return (
      <Badge className={`${typeInfo.color} border-0`} data-testid={`badge-type-${index}`}>
        {typeInfo.label}
      </Badge>
    );
  };

  const renderQuestionDisplay = () => {
    if (questionType === 'multiple-choice' || questionType === 'true-false') {
      return (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
            {(question.answers || []).map((answer, answerIdx) => (
              <div
                key={answerIdx}
                className={`flex items-center gap-2 p-2 rounded-md text-sm ${
                  question.correctIndex === answerIdx
                    ? "bg-success/10 dark:bg-success/15 border border-[var(--success)]/30 dark:border-[var(--success)]/40"
                    : "bg-muted"
                }`}
                data-testid={`answer-${index}-${answerIdx}`}
              >
                {question.correctIndex === answerIdx && (
                  <CheckCircle2 className="h-4 w-4 text-success dark:text-success/80 flex-shrink-0" />
                )}
                <span className="flex-1 text-foreground">{answer}</span>
              </div>
            ))}
          </div>
          {questionType === 'multiple-choice' && (
            <Button variant="outline" size="sm" onClick={() => onRegenerateAnswers(index)}
              disabled={isRegeneratingAnswers}
              className="mt-3 min-h-[44px] touch-manipulation bg-secondary/10 hover:bg-secondary/15 dark:bg-secondary/10 dark:hover:bg-secondary/20 text-secondary dark:text-secondary/80 border-secondary/30 dark:border-secondary/40"
              data-testid={`button-regenerate-answers-${index}`}
            >
              {isRegeneratingAnswers ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              <span className="hidden sm:inline">Regenerate Answers Only</span>
              <span className="sm:hidden">Regenerate</span>
            </Button>
          )}
        </>
      );
    } else if (questionType === 'match') {
      return (
        <div className="mt-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Match Pairs</Label>
          {(question.matchPairs || []).map((pair, pairIdx) => (
            <div key={`pair-${pairIdx}-${pair.left}-${pair.right}`} className="flex items-center gap-2 p-2 bg-muted rounded-md" data-testid={`pair-${index}-${pairIdx}`}>
              <span className="flex-1 text-foreground">{pair.left}</span>
              <span className="text-muted-foreground">↔</span>
              <span className="flex-1 text-foreground">{pair.right}</span>
            </div>
          ))}
        </div>
      );
    } else if (questionType === 'fill-blank') {
      return (
        <div className="mt-3 p-3 bg-success/10 dark:bg-success/15 border border-[var(--success)]/30 dark:border-[var(--success)]/40 rounded-md">
          <Label className="text-xs text-muted-foreground">Correct Answer</Label>
          <p className="text-foreground font-medium" data-testid={`correct-answer-${index}`}>
            {question.correctAnswer}
          </p>
        </div>
      );
    }
  };

  const renderQuestionEdit = () => {
    if (questionType === 'multiple-choice' || questionType === 'true-false') {
      return (
        <div>
          <Label className="text-xs">{questionType === 'true-false' ? 'Answers (2 options)' : 'Answers (6 options)'}</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
            {editedAnswers.map((answer, answerIdx) => (
              <div key={answerIdx} className="flex items-center gap-2">
                <Checkbox
                  checked={editedCorrectIndex === answerIdx}
                  onCheckedChange={() => setEditedCorrectIndex(answerIdx)}
                  data-testid={`checkbox-correct-${index}-${answerIdx}`}
                />
                <Textarea
                  value={answer}
                  onChange={(e) => {
                    const updated = [...editedAnswers];
                    updated[answerIdx] = e.target.value;
                    setEditedAnswers(updated);
                  }}
                  placeholder={`Option ${answerIdx + 1}`}
                  className="flex-1 min-h-[44px] resize-y py-2"
                  rows={2}
                  data-testid={`input-answer-${index}-${answerIdx}`}
                />
              </div>
            ))}
          </div>
        </div>
      );
    } else if (questionType === 'match') {
      return (
        <div>
          <Label className="text-xs">Match Pairs</Label>
          <div className="space-y-2 mt-1">
            {editedMatchPairs.map((pair, pairIdx) => (
              <div key={pairIdx} className="flex items-center gap-2">
                <Textarea
                  value={pair.left}
                  onChange={(e) => {
                    const updated = [...editedMatchPairs];
                    updated[pairIdx] = { ...updated[pairIdx], left: e.target.value };
                    setEditedMatchPairs(updated);
                  }}
                  placeholder="Left item"
                  className="flex-1 min-h-[44px] resize-y py-2"
                  rows={2}
                  data-testid={`input-left-${index}-${pairIdx}`}
                />
                <span className="text-muted-foreground">↔</span>
                <Textarea
                  value={pair.right}
                  onChange={(e) => {
                    const updated = [...editedMatchPairs];
                    updated[pairIdx] = { ...updated[pairIdx], right: e.target.value };
                    setEditedMatchPairs(updated);
                  }}
                  placeholder="Right item"
                  className="flex-1 min-h-[44px] resize-y py-2"
                  rows={2}
                  data-testid={`input-right-${index}-${pairIdx}`}
                />
              </div>
            ))}
          </div>
        </div>
      );
    } else if (questionType === 'fill-blank') {
      return (
        <div>
          <Label className="text-xs">Correct Answer</Label>
          <Textarea
            value={editedCorrectAnswer}
            onChange={(e) => setEditedCorrectAnswer(e.target.value)}
            placeholder="Enter the correct answer"
            className="mt-1 min-h-[44px] resize-y py-2"
            rows={2}
            data-testid={`input-correct-answer-${index}`}
          />
        </div>
      );
    }
  };

  return (
    <Card
      className={`${question.selected === false ? "opacity-60" : ""} p-[var(--card-padding)]`}
      style={{
        backgroundColor: "var(--question-card-bg)",
        color: "var(--question-card-fg)",
        borderColor: "var(--question-card-border)",
      }}
      data-testid={`question-card-${index}`}
    >
      <CardHeader className="pb-3 p-0">
        <div className="flex items-start gap-[var(--space-md)]">
          <Checkbox
            checked={question.selected !== false}
            onCheckedChange={() => onToggleSelect(index)}
            className="mt-1 min-h-[44px] min-w-[44px] h-6 w-6 touch-manipulation"
            data-testid={`checkbox-select-${index}`}
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">Question {index + 1}</span>
                {getQuestionTypeBadge()}
                {isPendingSourceReview && (
                  <Badge variant="destructive" data-testid={`badge-rejected-${index}`}>Needs Source Review</Badge>
                )}
                {question.validatorStatus === 'regenerated' && (
                  <Badge className="border-0" data-testid={`badge-regenerated-${index}`}>
                    Regenerated
                  </Badge>
                )}
                {question.userDisposition === 'accepted' && question.validatorStatus === 'rejected' && (
                  <Badge className="border-0" data-testid={`badge-accepted-override-${index}`}>
                    Reviewed Accepted
                  </Badge>
                )}
                <Badge variant="outline" data-testid={`badge-resolution-${index}`}>
                  {resolutionLabel}
                </Badge>
                {question.objectiveId && (
                  <Badge variant="outline" className="max-w-full">
                    Objective: {objectiveLookup?.[question.objectiveId] || question.objectiveId}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0">
                {!isEditing && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => setIsEditing(true)}
                      className="min-h-[44px] min-w-[44px] touch-manipulation"
                      data-testid={`button-edit-${index}`}
                    >
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => onRegenerateQuestion(index, regenerateAsType)}
                      disabled={isRegeneratingQuestion}
                      className="min-h-[44px] touch-manipulation bg-primary/10 hover:bg-primary/20 dark:bg-primary/20 dark:hover:bg-primary/30 text-primary dark:text-primary/80"
                      data-testid={`button-regenerate-question-${index}`}
                    >
                      {isRegeneratingQuestion ? (
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-1" />
                      )}
                      <span className="hidden sm:inline">Regenerate</span>
                    </Button>
                  </>
                )}
              </div>
            </div>

            {!isEditing && (
              <div className="mt-2 flex flex-col sm:flex-row gap-2 sm:items-center">
                <Select
                  value={regenerateAsType}
                  onValueChange={(value) => setRegenerateAsType(value as 'multiple-choice' | 'true-false' | 'match' | 'fill-blank')}
                >
                  <SelectTrigger className="h-9 w-full sm:w-[220px]" data-testid={`select-regenerate-type-${index}`}>
                    <SelectValue placeholder="Regenerate as type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="multiple-choice">Multiple Choice</SelectItem>
                    <SelectItem value="true-false">True False</SelectItem>
                    <SelectItem value="match">Match Left to Right</SelectItem>
                    <SelectItem value="fill-blank">Fill in the Blank</SelectItem>
                  </SelectContent>
                </Select>
                {question.validatorStatus === 'rejected' && (
                  <div className="flex gap-2">
                    <Button variant={question.userDisposition === 'accepted' ? "secondary" : "outline"} size="sm" onClick={() => onAcceptRejected(index)}
                      className="h-9"
                      data-testid={`button-accept-rejected-${index}`}
                    >
                      Mark Reviewed & Accepted
                    </Button>
                  </div>
                )}
              </div>
            )}

            {question.validatorStatus === 'rejected' && !isEditing && (
              <div className="mt-3 rounded-md border border-[var(--destructive)]/35 bg-destructive/8 p-3">
                <p className="text-xs font-medium text-destructive">
                  {isPendingSourceReview
                    ? "Source alignment check flagged this question."
                    : "This question was reviewed after a source alignment check."}
                </p>
                {guidanceSummary && (
                  <p className="text-xs text-muted-foreground mt-1">{guidanceSummary}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  What to do: use this question anyway, edit it manually, or regenerate it as the question type you want.
                </p>
                {question.userDisposition !== 'accepted' && (
                  <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2">
                    <p className="text-xs font-medium text-destructive">
                      You can regenerate this flagged item now. It will be checked for source alignment again.
                    </p>
                    <Button size="sm" variant="destructive" onClick={() => onRegenerateQuestion(index, regenerateAsType)}
                      disabled={isRegeneratingQuestion}
                      data-testid={`button-regenerate-replacement-${index}`}
                    >
                      {isRegeneratingQuestion ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          Regenerating...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="h-4 w-4 mr-1" />
                          Regenerate and Recheck
                        </>
                      )}
                    </Button>
                  </div>
                )}
                <button
                  type="button"
                  className="mt-2 text-xs underline text-muted-foreground hover:text-foreground"
                  onClick={handleToggleEvidence}
                  data-testid={`button-toggle-technical-${index}`}
                >
                  {showEvidence ? "Hide source support details" : "Show source support details"}
                </button>
                {showEvidence && (
                  <div className="mt-2 space-y-1">
                    {isLoadingEvidence && (
                      <p className="text-xs text-muted-foreground">Loading source excerpts...</p>
                    )}
                    {!isLoadingEvidence && evidenceError && (
                      <p className="text-xs text-destructive/90">{evidenceError}</p>
                    )}
                    {!isLoadingEvidence && !evidenceError && evidenceSnippets.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Closest excerpts from your selected source:
                          {evidenceSourceLabel ? ` ${evidenceSourceLabel}` : ""}
                          {evidenceSourceTimestamp ? ` (${new Date(evidenceSourceTimestamp).toLocaleString()})` : ""}
                        </p>
                        <ul className="space-y-1">
                          {evidenceSnippets.map((snippet, snippetIndex) => (
                            <li key={`${index}-evidence-${snippetIndex}`} className="text-xs text-foreground bg-background/70 rounded p-2 border border-border">
                              {snippet}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {!isLoadingEvidence && !evidenceError && evidenceSnippets.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No close source excerpt was found. Try regenerating this question or editing it to align with the selected source.
                      </p>
                    )}
                    {question.validatorReason && (
                      <p className="text-xs text-muted-foreground">{question.validatorReason}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {isEditing ? (
              <div className="space-y-3 mt-3">
                <div>
                  <Label className="text-xs">Question Text</Label>
                  <Textarea
                    value={editedQuestion}
                    onChange={(e) => setEditedQuestion(e.target.value)}
                    rows={2}
                    className="mt-1"
                    data-testid={`textarea-question-${index}`}
                  />
                </div>

                {renderQuestionEdit()}

                <div className="flex flex-col sm:flex-row gap-2 justify-end pt-2">
                  <Button variant="outline" size="sm" onClick={handleCancel} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-cancel-${index}`}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-save-${index}`}>
                    <Check className="h-4 w-4 mr-1" />
                    Save
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-foreground mt-2 font-medium" data-testid={`text-question-${index}`}>
                  {question.question}
                </p>

                {renderQuestionDisplay()}
              </>
            )}
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}

export default function QuizWizard() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/quiz-wizard/:id");
  const { toast } = useToast();

  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();

  const urlParams = new URLSearchParams(window.location.search);
  const urlOrganizationId = urlParams.get("org") || urlParams.get("organizationId") || "";
  const lessonId = urlParams.get("lessonId") || "";
  const courseId = urlParams.get("courseId") || "";
  const returnTo = urlParams.get("returnTo") || "";
  const rawDraftId = params?.id;
  
  // Treat "new" as creating a new draft, not loading an existing one
  const draftId = rawDraftId === "new" ? undefined : rawDraftId;

  const [currentStep, setCurrentStep] = useState(1);
  const [sourceLessonId, setSourceLessonId] = useState(lessonId); // Track source lesson for auto-linking
  const [selectedSource, setSelectedSource] = useState<QuizSourceSelection | null>(null);
  const [lastGeneratedSourceContract, setLastGeneratedSourceContract] = useState<QuizSourceContract | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    gradeId: "",
    subjectId: "",
    gradeName: "", // Store name for Step 2 fallback display
    subjectName: "", // Store name for Step 2 fallback display
    topic: "", // Legacy support for old drafts
    primaryTopic: "",
    subtopic1: "",
    subtopic2: "",
    quizTier: "10" as QuizTier,
    difficulty: "medium" as "easy" | "medium" | "hard",
    requiredPassPercentage: 70,
    isPublic: false, // Default to not public
    questionTypeDistribution: {
      multipleChoice: 40,
      trueFalse: 20,
      match: 20,
      fillBlank: 20,
    },
  });
  
  // Ref to store lessonParams for re-applying when grades/subjects load
  const lessonParamsRef = useRef<any>(null);
  // Ref to track if we've already loaded questions from draft (prevents refetch overwriting edits)
  const questionsLoadedFromDraftRef = useRef<boolean>(false);
  // Prevent draft refetches from forcing step/form resets after initial hydration.
  const hydratedDraftIdRef = useRef<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<GeneratedQuestion[]>([]);
  const [regeneratingQuestionIndex, setRegeneratingQuestionIndex] = useState<number | null>(null);
  const [regeneratingAnswersIndex, setRegeneratingAnswersIndex] = useState<number | null>(null);
  const [aiMetadata, setAiMetadata] = useState<{ name: string; description: string } | null>(null);
  const [isGeneratingMetadata, setIsGeneratingMetadata] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const resolveReturnPath = () => {
    if (returnTo) return returnTo;
    if (courseId) return `/course-builder/${courseId}/lessons`;
    return "/quiz-drafts";
  };

  // Get current user to determine organization context
  const { data: user } = useQuery<any>({
    queryKey: ["/api/auth/user"],
  });

  // Fetch user's organization roles
  const { data: userRoles = [] } = useQuery<any[]>({
    queryKey: ['/api/user/roles'],
    enabled: !!user && !user?.isSuperAdmin,
  });

  // Check if user is SuperAdmin
  const isSuperAdmin = user?.isSuperAdmin === true;

  // Determine organizationId
  // SuperAdmins MUST provide org via URL param (passed from QuizDraftsPage)
  // Non-SuperAdmins use their assigned organization
  const organizationId = urlOrganizationId || (userRoles.length > 0 ? userRoles[0].organizationId : "");

  // Redirect SuperAdmin back if no org provided
  useEffect(() => {
    if (user && isSuperAdmin && !urlOrganizationId) {
      toast({
        title: "Organization Required",
        description: "Please select an organization first",
        variant: "destructive",
      });
      setLocation(resolveReturnPath());
    }
  }, [user, isSuperAdmin, urlOrganizationId, setLocation, toast, returnTo, courseId]);

  const { data: draft, isLoading: loadingDraft } = useQuery<QuizDraft>({
    queryKey: [`/api/drafts/${draftId}?organizationId=${organizationId}`],
    enabled: !!draftId && !!organizationId,
  });

  const { data: grades = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/organizations/${organizationId}/units`],
    enabled: !!organizationId && !!user,
  });

  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: [`/api/admin/units/${formData.gradeId}/subjects`],
    enabled: !!formData.gradeId,
  });

  // Fetch organization to get curriculum
  const { data: organization } = useQuery<any>({
    queryKey: [`/api/admin/organizations/${organizationId}`],
    enabled: !!organizationId,
  });

  // Fetch quiz pricing for this organization
  const { data: quizPricing, isLoading: loadingPricing } = useQuery<QuizPricingResponse>({
    queryKey: ['/api/quiz-pricing', organizationId],
    queryFn: async () => {
      const params = organizationId ? `?organizationId=${organizationId}` : '';
      const response = await fetch(`/api/quiz-pricing${params}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch quiz pricing');
      }
      return response.json();
    },
    enabled: !!organizationId,
  });

  // Fetch lesson quiz parameters if lessonId is provided
  const { data: lessonParams, isLoading: loadingLessonParams } = useQuery<any>({
    queryKey: [`/api/lessons/${lessonId}/quiz-params`, organizationId],
    queryFn: () => {
      const params = new URLSearchParams({ organizationId });
      return fetch(`/api/lessons/${lessonId}/quiz-params?${params}`).then(r => r.json());
    },
    enabled: !!lessonId && !!organizationId && !draftId, // Only load if we have lessonId and no draft
  });

  const { data: lessonQuizSources, isLoading: loadingQuizSources } = useQuery<QuizSourcesResponse>({
    queryKey: ["/api/lessons", sourceLessonId, "quiz-sources", organizationId],
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId });
      const response = await fetch(`/api/lessons/${sourceLessonId}/quiz-sources?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Failed to load lesson quiz sources");
      }
      return response.json();
    },
    enabled: !!sourceLessonId && !!organizationId,
  });

  const { data: sourceLessonData } = useQuery<any>({
    queryKey: ["/api/lessons", sourceLessonId, organizationId, courseId],
    queryFn: async () => {
      const params = new URLSearchParams({ organizationId });
      if (courseId) {
        params.set("courseId", courseId);
      }
      const response = await fetch(`/api/lessons/${sourceLessonId}?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        return null;
      }
      return response.json();
    },
    enabled: !!sourceLessonId && !!organizationId,
  });

  // Fetch course data for hierarchy display when quiz is linked to a lesson
  const { data: courseData } = useQuery<any>({
    queryKey: ["/api/courses", lessonId],
    enabled: !!lessonId && !!sourceLessonId,
  });

  // Fetch organization units (departments) for hierarchy display
  const { data: orgUnitsData } = useQuery<{ units: Array<{ id: string; name: string }> }>({
    queryKey: ["/api/organizations", organizationId, "units"],
    enabled: !!organizationId && !!sourceLessonId,
  });

  // Fetch organization sub-units for hierarchy display
  const { data: orgSubUnitsData } = useQuery<Array<{ id: string; name: string; unitId: string }>>({
    queryKey: ["/api/organizations", organizationId, "sub-units"],
    enabled: !!organizationId && !!sourceLessonId,
  });

  // Fetch teams for hierarchy display
  const { data: teamsData } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ["/api/organization/teams", courseData?.subUnitId],
    queryFn: async () => {
      if (!courseData?.subUnitId) return [];
      const res = await fetch(`/api/organization/teams/${courseData.subUnitId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!courseData?.subUnitId && !!sourceLessonId,
  });

  // Auto-populate form from lesson parameters
  // Store lessonParams in ref so it persists for re-application when grades/subjects load
  useEffect(() => {
    if (lessonParams && !draftId) {
      // Store params for later re-application when data loads
      lessonParamsRef.current = lessonParams;
      
      // Use direct gradeId from API if available (from course's unitId or lesson's gradeLevel)
      // Fall back to matching by name for backward compatibility
      let gradeId = lessonParams.gradeId || "";
      let gradeName = lessonParams.grade || "";
      
      if (!gradeId && grades.length > 0) {
        const matchingGrade = grades.find(g => g.name === lessonParams.grade);
        if (matchingGrade) {
          gradeId = matchingGrade.id;
          gradeName = matchingGrade.name;
        }
      }
      
      // Resolve subjectId - prioritize validation against subjects array
      let subjectId = "";
      let subjectName = lessonParams.subject || "";
      
      if (subjects.length > 0) {
        // Subjects have loaded - try to match by ID first
        const apiProvidedId = lessonParams.subjectId || lessonParams.unitId;
        if (apiProvidedId) {
          const directMatch = subjects.find(s => s.subjectId === apiProvidedId);
          if (directMatch) {
            subjectId = directMatch.subjectId;
            subjectName = directMatch.subjectName;
          }
        }
        
        // If not found by ID, match by name
        if (!subjectId && lessonParams.subject) {
          const nameMatch = subjects.find(s => s.subjectName === lessonParams.subject);
          if (nameMatch) {
            subjectId = nameMatch.subjectId;
            subjectName = nameMatch.subjectName;
          }
        }
      } else {
        // Subjects not loaded yet - use API-provided ID directly
        // It will be validated once subjects load
        subjectId = lessonParams.subjectId || lessonParams.unitId || "";
      }
      
      // Set grade and subject from lesson/course context (including names for Step 2 fallback)
      setFormData(prev => ({
        ...prev,
        gradeId,
        subjectId: subjectId || prev.subjectId, // Keep existing if not provided
        gradeName: gradeName || prev.gradeName, // Store name for Step 2 fallback
        subjectName: subjectName || prev.subjectName, // Store name for Step 2 fallback
        primaryTopic: lessonParams.primaryTopic || "",
        subtopic1: lessonParams.subtopic1 || "",
        subtopic2: lessonParams.subtopic2 || "",
        name: lessonParams.suggestedQuizName || "",
        description: lessonParams.suggestedDescription || "",
      }));
      
      // Store source lesson ID for auto-linking
      setSourceLessonId(lessonParams.sourceLessonId || lessonId);
    }
  }, [lessonParams, grades, subjects, draftId, lessonId]);

  // Re-apply stored lessonParams when grades array loads (fixes race condition)
  useEffect(() => {
    if (grades.length > 0 && lessonParamsRef.current && !draftId) {
      const params = lessonParamsRef.current;
      
      // Re-resolve gradeId now that grades are available
      let gradeId = params.gradeId || "";
      let gradeName = params.grade || "";
      
      // Try to find matching grade by ID first, then by name
      if (gradeId) {
        const directMatch = grades.find(g => g.id === gradeId);
        if (directMatch) {
          gradeName = directMatch.name;
        } else {
          // ID didn't match, try by name
          const nameMatch = grades.find(g => g.name === params.grade);
          if (nameMatch) {
            gradeId = nameMatch.id;
            gradeName = nameMatch.name;
          }
        }
      } else if (params.grade) {
        const nameMatch = grades.find(g => g.name === params.grade);
        if (nameMatch) {
          gradeId = nameMatch.id;
          gradeName = nameMatch.name;
        }
      }
      
      if (gradeId) {
        setFormData(prev => ({
          ...prev,
          gradeId,
          gradeName,
        }));
      }
    }
  }, [grades, draftId]);

  // Re-apply stored lessonParams when subjects array loads (fixes race condition)
  useEffect(() => {
    if (subjects.length > 0 && lessonParamsRef.current && !draftId) {
      const params = lessonParamsRef.current;
      
      // Re-resolve subjectId now that subjects are available
      let subjectId = "";
      let subjectName = params.subject || "";
      
      const apiProvidedId = params.subjectId || params.unitId;
      if (apiProvidedId) {
        const directMatch = subjects.find(s => s.subjectId === apiProvidedId);
        if (directMatch) {
          subjectId = directMatch.subjectId;
          subjectName = directMatch.subjectName;
        }
      }
      
      // If not found by ID, match by name
      if (!subjectId && params.subject) {
        const nameMatch = subjects.find(s => s.subjectName === params.subject);
        if (nameMatch) {
          subjectId = nameMatch.subjectId;
          subjectName = nameMatch.subjectName;
        }
      }
      
      if (subjectId) {
        setFormData(prev => ({
          ...prev,
          subjectId,
          subjectName,
        }));
      }
    }
  }, [subjects, draftId]);

  // Validate subject selection when grade changes (only clear if user manually changed it)
  useEffect(() => {
    if (formData.gradeId && formData.subjectId && subjects.length > 0) {
      // Check if the current subject is still valid for the selected grade
      const isSubjectValid = subjects.some(s => s.subjectId === formData.subjectId);
      if (!isSubjectValid) {
        // If subject is not valid, clear it (user needs to select a new one for this grade)
        setFormData(prev => ({ ...prev, subjectId: "" }));
      }
    }
  }, [formData.gradeId, subjects]);

  const toPersistedStep = (uiStep: number) => Math.max(1, uiStep - 1);
  const fromPersistedStep = (persistedStep: number | null | undefined) => {
    const normalized = Math.max(1, Number(persistedStep || 1));
    return Math.min(STEPS.length, normalized + 1);
  };

  useEffect(() => {
    if (!organizationId) return;

    const availableSourceOptions = (lessonQuizSources?.options || []).filter(
      (option) => !sourceLessonId || option.sourceType !== "manual_topic"
    );

    const storageKey = getQuizSourceStorageKey({
      organizationId,
      lessonId: sourceLessonId || lessonId,
      draftId,
    });

    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as QuizSourceSelection;
        if (parsed?.sourceType && parsed?.versionRef) {
          const matchesAvailable = availableSourceOptions.some(
            (option) =>
              option.sourceType === parsed.sourceType &&
              option.versionRef === parsed.versionRef
          );
          if (matchesAvailable) {
            setSelectedSource(parsed);
            return;
          }
        }
      }
    } catch (error) {
      console.warn("[QuizWizard] Failed to read cached quiz source selection:", error);
    }

    if (lessonQuizSources?.defaultSelection) {
      const defaultAllowed = availableSourceOptions.find(
        (option) =>
          option.sourceType === lessonQuizSources.defaultSelection.sourceType &&
          option.versionRef === lessonQuizSources.defaultSelection.versionRef
      );
      if (defaultAllowed) {
        setSelectedSource({
          sourceType: defaultAllowed.sourceType,
          versionRef: defaultAllowed.versionRef,
          languageCode: defaultAllowed.languageCode,
        });
        return;
      }
    }

    if (availableSourceOptions.length > 0) {
      const first = availableSourceOptions[0];
      setSelectedSource({
        sourceType: first.sourceType,
        versionRef: first.versionRef,
        languageCode: first.languageCode,
      });
    } else if (!sourceLessonId) {
      setSelectedSource({ sourceType: "manual_topic", versionRef: "manual_topic" });
    }
  }, [organizationId, sourceLessonId, lessonId, draftId, lessonQuizSources?.defaultSelection, lessonQuizSources?.options]);

  useEffect(() => {
    if (!selectedSource || !organizationId) return;
    const storageKey = getQuizSourceStorageKey({
      organizationId,
      lessonId: sourceLessonId || lessonId,
      draftId,
    });
    try {
      localStorage.setItem(storageKey, JSON.stringify(selectedSource));
    } catch (error) {
      console.warn("[QuizWizard] Failed to persist quiz source selection:", error);
    }
  }, [selectedSource, organizationId, sourceLessonId, lessonId, draftId]);

  useEffect(() => {
    if (!selectedSource || !lastGeneratedSourceContract) return;
    const matchesCurrentSelection =
      selectedSource.sourceType === lastGeneratedSourceContract.sourceType &&
      selectedSource.versionRef === lastGeneratedSourceContract.versionRef;
    if (!matchesCurrentSelection) {
      setLastGeneratedSourceContract(null);
    }
  }, [selectedSource, lastGeneratedSourceContract]);

  // Load draft data if editing
  useEffect(() => {
    if (draft) {
      if (hydratedDraftIdRef.current === draft.id) {
        return;
      }
      hydratedDraftIdRef.current = draft.id;

      // Parse questionTypeDistribution if it exists
      let questionTypeDistribution = {
        multipleChoice: 100,
        trueFalse: 0,
        match: 0,
        fillBlank: 0,
      };
      
      if (draft.questionTypeDistribution) {
        const dist = typeof draft.questionTypeDistribution === 'string' 
          ? JSON.parse(draft.questionTypeDistribution)
          : draft.questionTypeDistribution;
        questionTypeDistribution = { ...questionTypeDistribution, ...dist };
      }
      
      // Handle backward compatibility: if only 'topic' exists, use it as primaryTopic
      const legacyTopic = draft.topic || "";
      const hasPrimaryTopic = (draft as any).primaryTopic;
      
      const draftQuestionCount = draft.numberOfQuestions || 10;
      const mappedTier: QuizTier = draftQuestionCount >= 20 ? "20" : draftQuestionCount >= 15 ? "15" : "10";
      
      // Resolve grade/subject names from their IDs when loading draft
      const gradeName = draft.gradeId && grades.length > 0 
        ? grades.find(g => g.id === draft.gradeId)?.name || ""
        : "";
      const subjectName = draft.subjectId && subjects.length > 0
        ? subjects.find(s => s.subjectId === draft.subjectId)?.subjectName || ""
        : "";
      
      setFormData({
        name: draft.quizName || draft.name || "",
        description: draft.quizDescription || draft.description || "",
        gradeId: draft.gradeId || "",
        subjectId: draft.subjectId || "",
        gradeName,
        subjectName,
        topic: legacyTopic,
        primaryTopic: hasPrimaryTopic ? (draft as any).primaryTopic : legacyTopic,
        subtopic1: (draft as any).subtopic1 || "",
        subtopic2: (draft as any).subtopic2 || "",
        quizTier: mappedTier,
        difficulty: (draft.difficulty as "easy" | "medium" | "hard") || "medium",
        requiredPassPercentage: draft.passPercentage || draft.requiredPassPercentage || 70,
        isPublic: (draft as any).isPublic || false,
        questionTypeDistribution,
      });
      setCurrentStep(fromPersistedStep(draft.currentStep));
      
      // Restore source lesson ID from draft for quiz-lesson linking
      if ((draft as any).lessonId) {
        setSourceLessonId((draft as any).lessonId);
      }

      const draftSourceSelection = (draft as any)?.sourceSelection;
      if (draftSourceSelection?.sourceType && draftSourceSelection?.versionRef) {
        setSelectedSource({
          sourceType: draftSourceSelection.sourceType,
          versionRef: draftSourceSelection.versionRef,
          languageCode: draftSourceSelection.languageCode,
        });
      }

      const draftSourceContract = (draft as any)?.lastGeneratedSourceContract;
      if (draftSourceContract?.sourceType && draftSourceContract?.versionRef) {
        setLastGeneratedSourceContract(draftSourceContract as QuizSourceContract);
      }
      
      // Only load generated questions from draft if we haven't already loaded them
      // This prevents draft refetches from overwriting local edits
      if (draft.generatedQuestions && !questionsLoadedFromDraftRef.current) {
        try {
          // generatedQuestions is stored as JSONB, so it's already an object
          let questions = draft.generatedQuestions;
          
          // Handle legacy data that might be stringified
          if (typeof questions === 'string') {
            questions = JSON.parse(questions);
          }
          
          if (Array.isArray(questions)) {
            setGeneratedQuestions(questions);
            questionsLoadedFromDraftRef.current = true; // Mark as loaded to prevent overwrites
            console.log('[QuizWizard] Loaded questions from draft, preventing future overwrites');
          }
        } catch (error) {
          console.error("Failed to parse generated questions:", error);
        }
      }
    }
  }, [draft, grades, subjects]);

  const generateMetadataMutation = useMutation({
    mutationFn: async (): Promise<{ name: string; description: string }> => {
      return await apiRequest("/api/ai/generate-quiz-metadata", {
        method: "POST",
        body: JSON.stringify({
          primaryTopic: formData.primaryTopic,
          subtopic1: formData.subtopic1,
          subtopic2: formData.subtopic2,
          grade: grades.find((g) => g.id === formData.gradeId)?.name || "",
          subject: subjects.find((s) => s.subjectId === formData.subjectId)?.subjectName || "",
          organizationId,
        }),
      });
    },
    onSuccess: (data: { name: string; description: string }) => {
      setAiMetadata(data);
      invalidateWalletCaches();
      toast({
        title: "Metadata Generated",
        description: "AI has suggested a quiz name and description",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate metadata. Please try again.",
        variant: "destructive",
      });
    },
  });

      const generateQuestionsMutation = useMutation({
    mutationFn: async (): Promise<{
      questions: GeneratedQuestion[];
      warning?: string;
      usedSourceContract?: QuizSourceContract;
      needsReview?: boolean;
      groundingError?: string | null;
      groundingFailures?: Array<{ index: number; reason: string; missingTokens: string[]; phraseConfidence: number; lexicalCoverage: number }>;
    }> => {
      if (sourceLessonId && !selectedSource) {
        throw new Error("Select a quiz source before generating questions.");
      }

      // Validate and normalize distribution percentages
      const dist = formData.questionTypeDistribution;
      const total = dist.multipleChoice + dist.trueFalse + dist.match + dist.fillBlank;
      
      let normalizedDist = dist;
      let wasAdjusted = false;
      
      // Guard against invalid total (0 or negative)
      if (total <= 0) {
        // Reset to default distribution
        normalizedDist = {
          multipleChoice: 40,
          trueFalse: 20,
          match: 20,
          fillBlank: 20,
        };
        wasAdjusted = true;
        
        toast({
          title: "Distribution Reset",
          description: `Question type distribution was invalid (total was ${total}%). Reset to default: 40% MC, 20% T/F, 20% Match, 20% Fill-in-blank.`,
        });
      } else if (total !== 100) {
        // Normalize to sum to 100%
        const scale = 100 / total;
        normalizedDist = {
          multipleChoice: Math.round(dist.multipleChoice * scale),
          trueFalse: Math.round(dist.trueFalse * scale),
          match: Math.round(dist.match * scale),
          fillBlank: Math.round(dist.fillBlank * scale),
        };
        
        // Adjust for rounding errors
        const newTotal = normalizedDist.multipleChoice + normalizedDist.trueFalse + normalizedDist.match + normalizedDist.fillBlank;
        if (newTotal !== 100) {
          normalizedDist.multipleChoice += (100 - newTotal);
        }
        wasAdjusted = true;
        
        toast({
          title: "Distribution Adjusted",
          description: `Question type percentages were normalized to sum to 100%.`,
        });
      }
      
      // Update formData with normalized distribution to persist corrected values
      if (wasAdjusted) {
        setFormData(prev => ({
          ...prev,
          questionTypeDistribution: normalizedDist,
        }));
      }
      
      const effectiveCreditCost = getEffectiveCreditCost(formData.quizTier, quizPricing);
      
      return await apiRequest("/api/ai/generate-quiz", {
        method: "POST",
        body: JSON.stringify({
          topic: formData.topic, // Legacy support
          primaryTopic: formData.primaryTopic,
          subtopic1: formData.subtopic1,
          subtopic2: formData.subtopic2,
          numberOfQuestions: QUIZ_TIERS[formData.quizTier].questionCount,
          quizTier: formData.quizTier,
          difficulty: formData.difficulty,
          grade: grades.find((g) => g.id === formData.gradeId)?.name || "",
          subject: subjects.find((s) => s.subjectId === formData.subjectId)?.subjectName || "",
          description: formData.description || "",
          organizationId,
          questionTypeDistribution: normalizedDist,
          lessonId: sourceLessonId, // Include lesson ID for content-based generation
          sourceSelection: selectedSource,
          learningObjectives: normalizedLearningObjectives,
          creditCost: effectiveCreditCost, // Include actual credit cost from fetched pricing
        }),
      }) as {
        questions: GeneratedQuestion[];
        warning?: string;
        usedSourceContract?: QuizSourceContract;
        needsReview?: boolean;
        groundingError?: string | null;
        groundingFailures?: Array<{ index: number; reason: string; missingTokens: string[]; phraseConfidence: number; lexicalCoverage: number }>;
      };
    },
    onMutate: () => {
      setGenerationError(null);
    },
    onSuccess: async (data: {
      questions: GeneratedQuestion[];
      warning?: string;
      usedSourceContract?: QuizSourceContract;
      needsReview?: boolean;
      groundingError?: string | null;
      groundingFailures?: Array<{ index: number; reason: string; missingTokens: string[]; phraseConfidence: number; lexicalCoverage: number }>;
    }) => {
      setGeneratedQuestions(data.questions);
      setLastGeneratedSourceContract(data.usedSourceContract || null);
      invalidateWalletCaches();
      setCurrentStep(4);

      // Save the generated questions to draft, but don't block user progress if save fails.
      try {
        await saveDraftMutation.mutateAsync({
          ...formData,
          generatedQuestions: JSON.stringify(data.questions),
          sourceSelection: selectedSource,
          lastGeneratedSourceContract: data.usedSourceContract || lastGeneratedSourceContract,
          currentStep: 3, // Persisted step 3 = review/edit
        });
      } catch (saveError: any) {
        console.error("[QuizWizard] Failed to save generated questions after success:", saveError);
        toast({
          title: "Questions Generated (Unsaved Draft)",
          description: "Questions were generated, but saving the draft failed. Please click Save Draft.",
          variant: "destructive",
        });
      }

      if (data.needsReview) {
        toast({
          title: "Review Required",
          description: data.groundingError || "Some generated questions need source review. Resolve each by accepting, regenerating/rechecking, or manually editing then accepting.",
        });
      } else {
        toast({
          title: "Success",
          description: `Generated ${data.questions.length} questions!`,
        });
      }
      if (normalizedLearningObjectives.length > 0 && data.questions.length >= normalizedLearningObjectives.length) {
        const objectiveIds = new Set(normalizedLearningObjectives.map((obj) => obj.id));
        const covered = new Set(
          data.questions
            .map((q) => String(q.objectiveId || "").trim())
            .filter((objectiveId) => objectiveIds.has(objectiveId))
        );
        const gapCount = Math.max(0, objectiveIds.size - covered.size);
        if (gapCount > 0) {
          toast({
            title: "Coverage Optimization Suggested",
            description: `${gapCount} learning objective${gapCount === 1 ? "" : "s"} still need coverage. Regenerate and recheck flagged items to fill gaps.`,
          });
        }
      }
      if (data.warning) {
        toast({
          title: "Source Warning",
          description: data.warning,
        });
      }
    },
    onError: (error: Error) => {
      setGenerationError(
        error.message || "Failed to generate questions. Please review the selected source and try again."
      );
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate questions. Please try again.",
        variant: "destructive",
      });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (data: Partial<QuizDraft> & { name?: string; description?: string }): Promise<QuizDraft> => {
      // Convert empty strings to null for foreign key fields
      // Map frontend field names to backend field names
      const cleanedData = {
        ...data,
        gradeId: data.gradeId || null,
        subjectId: data.subjectId || null,
        quizName: data.name || data.quizName || "",
        quizDescription: data.description || data.quizDescription || "",
        passPercentage: data.requiredPassPercentage || data.passPercentage || 70,
      };
      
      // Remove frontend-only fields
      delete (cleanedData as any).name;
      delete (cleanedData as any).description;
      delete (cleanedData as any).requiredPassPercentage;
      
      if (draftId) {
        return apiRequest(`/api/drafts/${draftId}?organizationId=${organizationId}`, {
          method: "PATCH",
          body: JSON.stringify(cleanedData),
        });
      } else {
        return apiRequest("/api/drafts", {
          method: "POST",
          body: JSON.stringify({ ...cleanedData, organizationId }),
        });
      }
    },
    onSuccess: (response: QuizDraft) => {
      // Invalidate all draft queries for this organization
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0]?.toString();
          return key ? key.includes('/api/drafts') && key.includes(organizationId) : false;
        }
      });
      toast({
        title: "Saved",
        description: "Draft saved successfully",
      });
      // If creating new draft, navigate to edit mode
      if (!draftId && response?.id) {
        const params = new URLSearchParams();
        params.set("org", organizationId);
        if (sourceLessonId) params.set("lessonId", sourceLessonId);
        if (courseId) params.set("courseId", courseId);
        if (returnTo) params.set("returnTo", returnTo);
        setLocation(`/quiz-wizard/${response.id}?${params.toString()}`);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save draft",
        variant: "destructive",
      });
    },
  });

  const handleNext = async () => {
    if (currentStep === 1) {
      // Step 1 to 2: Source selection to quiz criteria
      setCurrentStep(2);
    } else if (currentStep === 2) {
      const normalizedPrimaryTopic = hasTopicForCriteria
        ? (formData.primaryTopic || formData.topic || "").trim()
        : (requiresTopicInCriteria ? "" : derivedTopicFallback);
      if (normalizedPrimaryTopic) {
        setFormData((prev) => ({
          ...prev,
          topic: normalizedPrimaryTopic,
          primaryTopic: normalizedPrimaryTopic,
        }));
      }

      // Step 2 to 3: Save criteria and move to generation
      // Include lessonId for quiz-lesson linking (both generated and manual quizzes)
      const draftData = {
        ...formData,
        topic: normalizedPrimaryTopic, // Legacy support for old drafts/APIs
        primaryTopic: normalizedPrimaryTopic,
        sourceSelection: selectedSource,
        lastGeneratedSourceContract,
        currentStep: toPersistedStep(3),
        lessonId: sourceLessonId || null, // Save source lesson for linking on publish
      };
      
      await saveDraftMutation.mutateAsync(draftData);
      setCurrentStep(3);
    } else if (currentStep === 3) {
      // Step 3 to 4: Generate questions (or move to review if already generated)
      if (generatedQuestions.length > 0) {
        // Questions already exist, just move to review
        setCurrentStep(4);
      } else {
        // Generate new questions
        try {
          await generateQuestionsMutation.mutateAsync();
        } catch {
          // Error already surfaced via mutation onError and inline state.
        }
      }
    } else if (currentStep === 4) {
      // Step 4 to 5: Save reviewed questions and move to publish
      if (unresolvedRejectedCount > 0) {
        toast({
          title: "Review Required",
          description: "Please resolve all flagged questions: accept, regenerate/recheck, or manually edit and accept.",
          variant: "destructive",
        });
        return;
      }
      if (hasObjectiveCoverageGap) {
        toast({
          title: "Objective Coverage Required",
          description: `At least one selected question is required for each learning objective. ${objectiveCoverageGaps.length} objective${objectiveCoverageGaps.length === 1 ? "" : "s"} are not yet covered.`,
          variant: "destructive",
        });
        return;
      }
      if (hasRequiredCountGap) {
        const delta = Math.abs(requiredQuestionCount - selectedQuestionCount);
        toast({
          title: "Question Count Incomplete",
          description: selectedQuestionCount < requiredQuestionCount
            ? `You still need ${delta} selected question${delta === 1 ? "" : "s"} before continuing.`
            : `You have ${delta} extra selected question${delta === 1 ? "" : "s"}. Keep exactly ${requiredQuestionCount} selected.`,
          variant: "destructive",
        });
        return;
      }

      const draftData = {
        ...formData,
        generatedQuestions: JSON.stringify(generatedQuestions),
        sourceSelection: selectedSource,
        lastGeneratedSourceContract,
        currentStep: toPersistedStep(5),
      };
      
      await saveDraftMutation.mutateAsync(draftData);
      setCurrentStep(5);
    } else {
      // Other steps: just move forward
      const draftData = {
        ...formData,
        sourceSelection: selectedSource,
        lastGeneratedSourceContract,
        currentStep: toPersistedStep(currentStep + 1),
      };
      
      await saveDraftMutation.mutateAsync(draftData);
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = async () => {
    if (currentStep > 1) {
      const previousStep = currentStep - 1;
      setCurrentStep(previousStep);

      // Persist backward navigation best-effort to avoid draft refetch snapping back.
      if (draftId) {
        try {
          await saveDraftMutation.mutateAsync({
            ...formData,
            sourceSelection: selectedSource,
            lastGeneratedSourceContract,
            currentStep: toPersistedStep(previousStep),
            lessonId: sourceLessonId || null,
          });
        } catch {
          // Non-blocking; UI already moved back.
        }
      }
    }
  };

  const handleSave = () => {
    const draftData: any = {
      ...formData,
      sourceSelection: selectedSource,
      lastGeneratedSourceContract,
      currentStep: toPersistedStep(currentStep),
      lessonId: sourceLessonId || null, // Save source lesson for linking on publish
    };
    
    // If we have generated questions, include them in the save
    if (generatedQuestions.length > 0) {
      draftData.generatedQuestions = JSON.stringify(generatedQuestions);
    }
    
    saveDraftMutation.mutate(draftData);
  };

  if (!organizationId) {
    return (
      <QuizAdminLayout title="Quiz Wizard" description="Create AI-powered quizzes">
        <div className="p-[var(--container-padding)]" data-testid="error-no-org">
          <Card className="border-[var(--destructive)]/30 bg-destructive/10 p-[var(--card-padding)]">
            <CardContent className="p-0 pt-[var(--space-md)]">
              <p className="text-sm text-destructive">
                Organization ID is required. Please go back and select an organization.
              </p>
              <Button onClick={() => setLocation(resolveReturnPath())}
                variant="outline"
                className="mt-[var(--space-md)] min-h-[44px] touch-manipulation"
                data-testid="button-back-to-drafts"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Drafts
              </Button>
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  // Show loading state until terminology is resolved
  if (!isResolved || !terminology || !terminologyLower) {
    return (
      <QuizAdminLayout title="Quiz Wizard" description="Loading...">
        <div className="flex items-center justify-center h-64 p-[var(--container-padding)]" data-testid="loading-terminology">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (loadingDraft) {
    return (
      <QuizAdminLayout title="Quiz Wizard" description="Create AI-powered quizzes">
        <div className="flex items-center justify-center py-12 p-[var(--container-padding)]" data-testid="loading-draft">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </QuizAdminLayout>
    );
  }

  const selectedSourceOption = (lessonQuizSources?.options || []).find(
    (option) =>
      selectedSource &&
      option.sourceType === selectedSource.sourceType &&
      option.versionRef === selectedSource.versionRef
  );

  const selectableLessonSources = (lessonQuizSources?.options || []).filter(
    (option) => option.sourceType !== "manual_topic"
  );

  const groupedSourceOptions = QUIZ_SOURCE_TYPE_ORDER
    .map((sourceType) => {
      const sourceTypeOptions = selectableLessonSources.filter((option) => option.sourceType === sourceType);
      const languages = Array.from(new Set(sourceTypeOptions.map((option) => option.languageCode || "en"))).sort();
      const byLanguage = languages.map((languageCode) => ({
        languageCode,
        options: sourceTypeOptions.filter((option) => (option.languageCode || "en") === languageCode),
      }));
      return {
        sourceType,
        label: QUIZ_SOURCE_TYPE_LABELS[sourceType],
        totalCount: sourceTypeOptions.length,
        byLanguage,
      };
    })
    .filter((group) => group.totalCount > 0);

  const selectedSourceTimestamp =
    selectedSourceOption?.createdAt ||
    (lastGeneratedSourceContract &&
    selectedSource &&
    lastGeneratedSourceContract.sourceType === selectedSource.sourceType &&
    lastGeneratedSourceContract.versionRef === selectedSource.versionRef
      ? lastGeneratedSourceContract.createdAt
      : null);

  const lessonDisplayName =
    sourceLessonData?.title ||
    lessonParams?.primaryTopic ||
    (sourceLessonId ? `Lesson ${sourceLessonId.slice(0, 8)}` : "N/A");

  const normalizedLearningObjectives: LearningObjective[] = Array.isArray(sourceLessonData?.learningObjectives)
    ? sourceLessonData.learningObjectives
        .map((obj: any, index: number) => ({
          id: String(obj?.id || `obj-${index + 1}`),
          objective: String(obj?.objective || "").trim(),
          bloomLevel: String(obj?.bloomLevel || "").trim() || "understand",
        }))
        .filter((obj: LearningObjective) => obj.objective.length > 0)
    : [];
  const objectiveLookup = Object.fromEntries(
    normalizedLearningObjectives.map((obj) => [obj.id, obj.objective])
  ) as Record<string, string>;
  const selectedQuestions = generatedQuestions.filter((q) => q.selected !== false);
  const objectiveCoverageById = new Map<string, number>();
  for (const q of selectedQuestions) {
    const objectiveId = String(q.objectiveId || "").trim();
    if (!objectiveId) continue;
    objectiveCoverageById.set(objectiveId, (objectiveCoverageById.get(objectiveId) || 0) + 1);
  }
  const requiredQuestionCount = QUIZ_TIERS[formData.quizTier].questionCount;
  const objectiveCoverageGaps = normalizedLearningObjectives.filter(
    (obj) => (objectiveCoverageById.get(obj.id) || 0) === 0
  );
  const shouldEnforceObjectiveCoverage =
    normalizedLearningObjectives.length > 0 && requiredQuestionCount >= normalizedLearningObjectives.length;
  const hasObjectiveCoverageGap = shouldEnforceObjectiveCoverage && objectiveCoverageGaps.length > 0;
  const selectedQuestionCount = selectedQuestions.length;
  const rejectedQuestions = generatedQuestions.filter((q) => q.validatorStatus === 'rejected');
  const unresolvedRejectedCount = rejectedQuestions.filter((q) => q.userDisposition !== 'accepted').length;
  const acceptedRejectedCount = rejectedQuestions.filter((q) => q.userDisposition === 'accepted').length;
  const readySelectedCount = generatedQuestions.filter(
    (q) => q.validatorStatus !== 'rejected' && q.selected !== false
  ).length;
  const reviewedAcceptedCount = acceptedRejectedCount;
  const hasRequiredCountGap = selectedQuestionCount !== requiredQuestionCount;
  const missingQuestionCount = Math.max(0, requiredQuestionCount - selectedQuestionCount);
  const hasExtraSelectedCount = selectedQuestionCount > requiredQuestionCount;
  const nextBlockedInReviewStep = currentStep === 4 && (unresolvedRejectedCount > 0 || hasRequiredCountGap || hasObjectiveCoverageGap);
  const hasTopicForCriteria = ((formData.primaryTopic || formData.topic || "").trim().length > 0);
  const requiresTopicInCriteria = !sourceLessonId;

  const firstPendingRejectedIndex = generatedQuestions.findIndex(
    (q) => q.validatorStatus === 'rejected' && q.userDisposition !== 'accepted'
  );
  const firstUnselectedIndex = generatedQuestions.findIndex((q) => q.selected === false);
  const firstSelectedIndex = generatedQuestions.findIndex((q) => q.selected !== false);

  const jumpToQuestion = (idx: number) => {
    if (idx < 0) return;
    const target = document.querySelector(`[data-testid="question-card-${idx}"]`);
    if (target instanceof HTMLElement) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("ring-2", "ring-primary/40");
      window.setTimeout(() => {
        target.classList.remove("ring-2", "ring-primary/40");
      }, 1400);
    }
  };

  const getPreferredObjectiveIdForRegeneration = (questionIndex: number) => {
    const currentQuestion = generatedQuestions[questionIndex];
    const currentObjectiveId = String(currentQuestion?.objectiveId || "").trim();
    if (currentObjectiveId && objectiveLookup[currentObjectiveId]) {
      return currentObjectiveId;
    }
    if (objectiveCoverageGaps.length > 0) {
      return objectiveCoverageGaps[0].id;
    }
    return normalizedLearningObjectives[0]?.id || null;
  };

  const derivedTopicFallback =
    lessonParams?.primaryTopic?.trim() ||
    sourceLessonData?.title?.trim() ||
    selectedSourceOption?.label?.trim() ||
    lessonDisplayName?.trim() ||
    "Lesson-based quiz";

  let reviewBlockMessage: string | null = null;
  let reviewBlockActionLabel: string | null = null;
  let reviewBlockActionIndex = -1;
  if (currentStep === 4) {
    if (unresolvedRejectedCount > 0) {
      reviewBlockMessage = `Next is disabled until ${unresolvedRejectedCount} source-review item${unresolvedRejectedCount === 1 ? "" : "s"} are resolved by accepting, regenerating/rechecking, or manually editing then accepting.`;
      reviewBlockActionLabel = "Go to first pending review";
      reviewBlockActionIndex = firstPendingRejectedIndex;
    } else if (hasObjectiveCoverageGap) {
      reviewBlockMessage = `Next is disabled until each learning objective has at least one selected quiz item. ${objectiveCoverageGaps.length} objective${objectiveCoverageGaps.length === 1 ? "" : "s"} still need coverage.`;
      reviewBlockActionLabel = "Go to first selected question";
      reviewBlockActionIndex = firstSelectedIndex;
    } else if (missingQuestionCount > 0) {
      reviewBlockMessage = `Next is disabled until ${missingQuestionCount} more question${missingQuestionCount === 1 ? "" : "s"} are selected.`;
      reviewBlockActionLabel = "Go to first unselected";
      reviewBlockActionIndex = firstUnselectedIndex;
    } else if (hasExtraSelectedCount) {
      const extraCount = selectedQuestionCount - requiredQuestionCount;
      reviewBlockMessage = `Next is disabled because ${extraCount} extra question${extraCount === 1 ? "" : "s"} ${extraCount === 1 ? "is" : "are"} selected. Deselect down to exactly ${requiredQuestionCount}.`;
      reviewBlockActionLabel = "Go to selected questions";
      reviewBlockActionIndex = firstSelectedIndex;
    }
  }

  return (
    <QuizAdminLayout title="Quiz Wizard" description="Create AI-powered quizzes">
      <CourseBackLink className="mb-4 block" />
      <div className="w-full max-w-6xl mx-auto p-[var(--container-padding)] space-y-[var(--space-lg)]" data-testid="quiz-wizard-container">
        {/* Progress Steps */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)] sm:gap-0 mb-[var(--space-xl)]" data-testid="progress-steps">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex-1 w-full sm:w-auto">
              <div className="flex items-center">
                <div
                  className={`flex items-center justify-center w-10 h-10 sm:w-8 sm:h-8 min-w-[40px] sm:min-w-[32px] rounded-full border-2 transition-colors ${
                    currentStep >= step.id
                      ? "border-primary bg-primary text-btn-primary-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                  style={
                    currentStep >= step.id
                      ? {
                          backgroundColor: "var(--stepper-circle-active-bg)",
                          color: "var(--stepper-circle-active-fg)",
                          borderColor: "var(--stepper-circle-active-bg)",
                        }
                      : {
                          backgroundColor: "var(--stepper-circle-bg)",
                          color: "var(--stepper-circle-fg)",
                          borderColor: "var(--stepper-line)",
                        }
                  }
                  data-testid={`step-indicator-${step.id}`}
                >
                  {currentStep > step.id ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-sm font-medium">{step.id}</span>
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-2 transition-colors hidden sm:block ${
                      currentStep > step.id ? "bg-primary" : "bg-muted"
                    }`}
                    style={{
                      backgroundColor:
                        currentStep > step.id ? "var(--stepper-line-active)" : "var(--stepper-line)",
                    }}
                  />
                )}
                <div className="ml-3 sm:hidden">
                  <p
                    className="text-sm font-medium"
                    style={{
                      color: currentStep >= step.id ? "var(--stepper-label-active)" : "var(--stepper-label)",
                    }}
                  >
                    {step.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
              </div>
              <div className="mt-2 hidden sm:block">
                <p
                  className="text-xs font-medium"
                  style={{
                    color: currentStep >= step.id ? "var(--stepper-label-active)" : "var(--stepper-label)",
                  }}
                >
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Step 1: Select Source */}
        {currentStep === 1 && (
          <Card
            className="p-[var(--card-padding)]"
            style={{
              backgroundColor: "var(--step-card-bg)",
              color: "var(--step-card-fg)",
              borderColor: "var(--step-card-border)",
            }}
            data-testid="step-source-selection"
          >
            <CardHeader className="p-0 pb-[var(--space-md)]">
              <CardTitle className="text-[length:var(--text-2xl)]">Select Quiz Source</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-[var(--space-md)]">
              <p className="text-sm text-muted-foreground">
                Select the exact content source and version to ensure quiz generation stays grounded and reproducible.
              </p>

              {!sourceLessonId && (
                <div className="rounded-lg border border-border bg-muted/30 p-4">
                  <p className="text-sm text-foreground">
                    This quiz is not linked to a lesson. Questions will be generated from your topic criteria only.
                  </p>
                </div>
              )}

              {sourceLessonId && loadingQuizSources && (
                <div className="flex items-center gap-2 py-4" data-testid="loading-quiz-sources">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading lesson source options...</span>
                </div>
              )}

              {sourceLessonId && !loadingQuizSources && (
                <div className="space-y-3">
                  <Accordion
                    type="multiple"
                    defaultValue={groupedSourceOptions.map((group) => `source-type-${group.sourceType}`)}
                    className="space-y-3"
                  >
                    {groupedSourceOptions.map((group) => (
                      <AccordionItem
                        key={`group-${group.sourceType}`}
                        value={`source-type-${group.sourceType}`}
                        className="rounded-lg border border-border bg-card px-3"
                      >
                        <AccordionTrigger className="py-3 hover:no-underline" data-testid={`source-group-${group.sourceType}`}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{group.label}</span>
                            <Badge variant="outline" className="text-xs">{group.totalCount} version{group.totalCount === 1 ? "" : "s"}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-3 space-y-3">
                          {group.byLanguage.map((language) => (
                            <div key={`language-${group.sourceType}-${language.languageCode}`} className="rounded-md border border-border/80 p-3 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="secondary" className="text-xs">{language.languageCode.toUpperCase()}</Badge>
                                <p className="text-xs text-muted-foreground">{language.options.length} content version{language.options.length === 1 ? "" : "s"}</p>
                              </div>
                              <div className="space-y-2">
                                {language.options.map((option) => {
                                  const isSelected =
                                    selectedSource?.sourceType === option.sourceType &&
                                    selectedSource?.versionRef === option.versionRef;
                                  const Icon = option.sourceType === "sourcedb"
                                    ? Database
                                    : option.sourceType === "pptx"
                                      ? Presentation
                                      : option.sourceType === "word"
                                        ? FileText
                                        : option.sourceType === "podcast"
                                          ? Mic2
                                          : Sparkles;
                                  return (
                                    <button
                                      type="button"
                                      key={option.id}
                                      onClick={() =>
                                        setSelectedSource({
                                          sourceType: option.sourceType,
                                          versionRef: option.versionRef,
                                          languageCode: option.languageCode,
                                        })
                                      }
                                      className={`w-full rounded-xl border p-4 text-left transition relative ${
                                        isSelected
                                          ? "border-primary bg-primary/18 shadow-sm ring-2 ring-primary/30"
                                          : "border-border bg-card hover:border-primary/40"
                                      }`}
                                      data-testid={`source-option-${option.id}`}
                                    >
                                      {isSelected && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-xl bg-primary" />
                                      )}
                                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div className="flex items-start gap-3">
                                          <div className={`rounded-md p-2 ${isSelected ? "bg-primary/15" : "bg-muted"}`}>
                                            <Icon className="h-4 w-4" />
                                          </div>
                                          <div className="space-y-1">
                                            <p className={`text-sm font-medium ${isSelected ? "text-foreground" : "text-foreground"}`}>{option.label}</p>
                                            <p className={`text-xs ${isSelected ? "text-foreground/80" : "text-muted-foreground"}`}>{option.description}</p>
                                          </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2 items-center">
                                          {isSelected && (
                                            <Badge className="border-0">
                                              <CheckCircle2 className="h-3 w-3 mr-1" />
                                              Selected
                                            </Badge>
                                          )}
                                          {option.isActive && (
                                            <Badge >
                                              Active
                                            </Badge>
                                          )}
                                          <Badge variant="outline" className="text-xs">{option.languageCode.toUpperCase()}</Badge>
                                          {option.wordCount > 0 && <Badge variant="outline" className="text-xs">{option.wordCount} words</Badge>}
                                          {option.createdAt && (
                                            <Badge variant="outline" className="text-xs">
                                              {new Date(option.createdAt).toLocaleString()}
                                            </Badge>
                                          )}
                                        </div>
                                      </div>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 2: Quiz Criteria */}
        {currentStep === 2 && (() => {
          const hierarchyNames = {
            departmentName: courseData?.unitId 
              ? (orgUnitsData?.units || []).find(u => u.id === courseData.unitId)?.name 
              : undefined,
            unitName: courseData?.subUnitId 
              ? (orgSubUnitsData || []).find(u => u.id === courseData.subUnitId)?.name 
              : undefined,
            teamName: courseData?.teamId 
              ? (teamsData || []).find(t => t.id === courseData.teamId)?.name 
              : undefined,
          };
          
          return (
            <Card
              className="p-[var(--card-padding)]"
              style={{
                backgroundColor: "var(--step-card-bg)",
                color: "var(--step-card-fg)",
                borderColor: "var(--step-card-border)",
              }}
              data-testid="step-criteria"
            >
              <CardHeader className="p-0 pb-[var(--space-md)]">
                <CardTitle className="text-[length:var(--text-2xl)]">Define Quiz Parameters</CardTitle>
              </CardHeader>
              <CardContent className="p-0 space-y-[var(--space-lg)]">
                {selectedSource && (
                  <div className="rounded-lg border border-primary/30 bg-primary/6 p-3">
                    <p className="text-xs text-muted-foreground">Selected quiz source</p>
                    <p className="text-sm font-medium text-foreground">
                      {(lessonQuizSources?.options || []).find(
                        (option) => option.sourceType !== "manual_topic" &&
                          option.sourceType === selectedSource.sourceType &&
                          option.versionRef === selectedSource.versionRef
                      )?.label || `${selectedSource.sourceType} (${selectedSource.versionRef})`}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {selectedSourceTimestamp && (
                        <Badge variant="outline" className="text-xs">
                          {new Date(selectedSourceTimestamp).toLocaleString()}
                        </Badge>
                      )}
                      {selectedSourceOption?.languageCode && (
                        <Badge variant="outline" className="text-xs">
                          {selectedSourceOption.languageCode.toUpperCase()}
                        </Badge>
                      )}
                      {typeof selectedSourceOption?.wordCount === "number" && selectedSourceOption.wordCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {selectedSourceOption.wordCount} words
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Show hierarchy display if quiz is linked to a lesson */}
                {sourceLessonId && (hierarchyNames.departmentName || hierarchyNames.unitName || hierarchyNames.teamName) && (
                  <div className="space-y-2 mb-[var(--space-md)]">
                    <Label className="text-sm text-muted-foreground">Inherited from Lesson/Course</Label>
                    <div className="p-3 rounded-lg bg-muted/50 border border-border">
                      <div className="flex flex-wrap gap-3">
                        {hierarchyNames.departmentName && (
                          <div className="flex items-center gap-2 text-sm">
                            <Building2 className="h-4 w-4 text-primary" />
                            <span className="text-muted-foreground">{terminology.unit}:</span>
                            <span className="font-medium">{hierarchyNames.departmentName}</span>
                          </div>
                        )}
                        {hierarchyNames.unitName && (
                          <div className="flex items-center gap-2 text-sm">
                            <Users className="h-4 w-4 text-success" />
                            <span className="text-muted-foreground">{terminology.subUnit}:</span>
                            <span className="font-medium">{hierarchyNames.unitName}</span>
                          </div>
                        )}
                        {hierarchyNames.teamName && (
                          <div className="flex items-center gap-2 text-sm">
                            <GitBranch className="h-4 w-4 text-primary" />
                            <span className="text-muted-foreground">{terminology.team}:</span>
                            <span className="font-medium">{hierarchyNames.teamName}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Quizzes inherit their organization hierarchy from the parent lesson/course.
                      </p>
                    </div>
                  </div>
                )}

                {/* Show editable selects only if quiz is not linked to a lesson */}
                {!sourceLessonId && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                    <div className="space-y-2">
                      <Label htmlFor="gradeId">{terminology.unit}</Label>
                      <Select
                        value={formData.gradeId}
                        onValueChange={(value) => {
                          const selectedGrade = grades.find(g => g.id === value);
                          setFormData({ 
                            ...formData, 
                            gradeId: value,
                            gradeName: selectedGrade?.name || formData.gradeName,
                          });
                        }}
                      >
                        <SelectTrigger id="gradeId" className="min-h-[44px] touch-manipulation" data-testid="select-grade">
                          <SelectValue placeholder={`Select ${terminologyLower.unit}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {grades.map((grade) => (
                            <SelectItem key={grade.id} value={grade.id} className="min-h-[44px]">
                              {grade.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subjectId">{terminology.subject}</Label>
                      <Select
                        value={formData.subjectId}
                        onValueChange={(value) => {
                          const selectedSubject = subjects.find(s => s.subjectId === value);
                          setFormData({ 
                            ...formData, 
                            subjectId: value,
                            subjectName: selectedSubject?.subjectName || formData.subjectName,
                          });
                        }}
                      >
                        <SelectTrigger id="subjectId" className="min-h-[44px] touch-manipulation" data-testid="select-subject">
                          <SelectValue placeholder={`Select ${terminologyLower.subject}`} />
                        </SelectTrigger>
                        <SelectContent>
                          {subjects.map((subject) => (
                            <SelectItem key={subject.subjectId} value={subject.subjectId} className="min-h-[44px]">
                              {subject.subjectName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

              <div className="space-y-[var(--space-md)]">
                <div className="space-y-2">
                  <Label htmlFor="primaryTopic">
                    Primary Topic {requiresTopicInCriteria ? "*" : "(Optional)"}
                  </Label>
                  <Input
                    id="primaryTopic"
                    value={formData.primaryTopic}
                    onChange={(e) => setFormData({ ...formData, primaryTopic: e.target.value })}
                    placeholder="e.g., Photosynthesis"
                    required={requiresTopicInCriteria}
                    className="min-h-[44px]"
                    data-testid="input-primary-topic"
                  />
                  <p className="text-xs text-muted-foreground">
                    {requiresTopicInCriteria
                      ? "Main topic for this quiz"
                      : "Optional. Leave blank to auto-use the lesson/source title."}
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                  <div className="space-y-2">
                    <Label htmlFor="subtopic1">Subtopic 1 (Optional)</Label>
                    <Input
                      id="subtopic1"
                      value={formData.subtopic1}
                      onChange={(e) => setFormData({ ...formData, subtopic1: e.target.value })}
                      placeholder="e.g., Light reactions"
                      className="min-h-[44px]"
                      data-testid="input-subtopic1"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subtopic2">Subtopic 2 (Optional)</Label>
                    <Input
                      id="subtopic2"
                      value={formData.subtopic2}
                      onChange={(e) => setFormData({ ...formData, subtopic2: e.target.value })}
                      placeholder="e.g., Calvin cycle"
                      className="min-h-[44px]"
                      data-testid="input-subtopic2"
                    />
                  </div>
                </div>
              </div>

              {/* Quiz Tier Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Question Count</Label>
                {loadingPricing ? (
                  <div className="flex items-center justify-center py-4" data-testid="loading-pricing">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <span className="ml-2 text-muted-foreground">Loading pricing...</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-3">
                    {(Object.keys(QUIZ_TIERS) as QuizTier[]).map((tier) => {
                      const tierInfo = QUIZ_TIERS[tier];
                      const effectiveCreditCost = getEffectiveCreditCost(tier, quizPricing);
                      const isSelected = formData.quizTier === tier;
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setFormData({ ...formData, quizTier: tier })}
                          data-testid={`tier-select-${tier}`}
                          className={`
                            relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all duration-200 min-h-[100px]
                            ${isSelected 
                              ? 'border-primary bg-surface-raised shadow-elevated shadow-elevated' 
                              : 'border-border bg-muted hover:border-border hover:bg-muted/80'
                            }
                          `}
                        >
                          {isSelected && (
                            <div className="absolute top-2 right-2">
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <span className={`text-2xl font-bold ${isSelected ? 'text-glow-gold' : 'text-foreground'}`}>
                            {tierInfo.questionCount}
                          </span>
                          <span className="text-xs text-muted-foreground mt-1">Questions</span>
                          <div className="flex items-center gap-1 mt-2">
                            <Coins className="h-3.5 w-3.5 text-glow-gold" />
                            <span className={`text-sm font-medium ${isSelected ? 'text-glow-gold' : 'text-muted-foreground'}`}>
                              {effectiveCreditCost} LP
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                <div className="space-y-2">
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select
                    value={formData.difficulty}
                    onValueChange={(value: "easy" | "medium" | "hard") =>
                      setFormData({ ...formData, difficulty: value })
                    }
                  >
                    <SelectTrigger id="difficulty" className="min-h-[44px] touch-manipulation" data-testid="select-difficulty">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy" className="min-h-[44px]">Easy</SelectItem>
                      <SelectItem value="medium" className="min-h-[44px]">Medium</SelectItem>
                      <SelectItem value="hard" className="min-h-[44px]">Hard</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="requiredPassPercentage">Pass Percentage (%)</Label>
                  <Input
                    id="requiredPassPercentage"
                    type="number"
                    min="0"
                    max="100"
                    value={formData.requiredPassPercentage}
                    onChange={(e) => setFormData({ ...formData, requiredPassPercentage: parseInt(e.target.value) || 70 })}
                    className="min-h-[44px]"
                    data-testid="input-pass-percentage"
                  />
                </div>
              </div>

              {/* AI Metadata Generation */}
              <div className="space-y-[var(--space-md)] border rounded-lg p-[var(--card-padding)] bg-muted dark:bg-secondary/10" data-testid="section-ai-metadata">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-sm)]">
                  <Label className="text-[length:var(--text-lg)] font-semibold">Quiz Name & Description</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => generateMetadataMutation.mutate()}
                    disabled={!formData.primaryTopic || generateMetadataMutation.isPending}
                    className="min-h-[44px] touch-manipulation w-full sm:w-auto bg-primary text-btn-primary-foreground hover:bg-primary/90 border-primary"
                    data-testid="button-generate-metadata"
                  >
                    {generateMetadataMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4 mr-2" />
                        Generate with AI
                      </>
                    )}
                  </Button>
                </div>

                {aiMetadata && (
                  <div className="space-y-[var(--space-sm)] p-[var(--space-md)] bg-card rounded border border-secondary/30 dark:border-secondary/40" data-testid="ai-metadata-suggestions">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 space-y-1 min-w-0">
                        <p className="text-xs text-muted-foreground">Suggested Name:</p>
                        <p className="font-medium text-foreground break-words">{aiMetadata.name}</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Suggested Description:</p>
                      <p className="text-sm text-foreground break-words">{aiMetadata.description}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button type="button" size="sm" onClick={() => {
                          setFormData({ ...formData, name: aiMetadata.name, description: aiMetadata.description });
                          setAiMetadata(null);
                        }}
                        className="flex-1 min-h-[44px] touch-manipulation"
                        data-testid="button-use-metadata"
                      >
                        Use These
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => generateMetadataMutation.mutate()}
                        className="flex-1 min-h-[44px] touch-manipulation"
                        data-testid="button-try-again-metadata"
                      >
                        Try Again
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="name">Quiz Name (Optional)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Give your quiz a name or generate one above"
                    className="min-h-[44px]"
                    data-testid="input-quiz-name"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <Label htmlFor="description" className="font-semibold text-foreground">Additional Curriculum Requirements (Optional)</Label>
                  <Badge variant="outline" className="text-xs flex-shrink-0">
                    Enhances Context
                  </Badge>
                </div>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Specify additional requirements to ensure quiz questions align with your specific curriculum outcomes and assessment standards (e.g., 'Focus on problem-solving skills', 'Include real-world applications', 'Cover Term 2 content only')"
                  rows={4}
                  className="min-h-[100px] placeholder:text-muted-foreground"
                  data-testid="textarea-description"
                />
                <p className="text-xs text-muted-foreground font-medium">
                  This helps the AI generate questions that precisely match your curriculum goals and assessment needs
                </p>
              </div>

              {/* Curriculum Display */}
              {organization?.curriculum && (
                <div className="bg-primary/5 dark:bg-primary/10 border border-primary/20 dark:border-primary/30 rounded-lg p-4">
                  <p className="text-sm text-primary dark:text-primary/80">
                    <strong>Curriculum:</strong> {organization.curriculum} - All questions will align with this curriculum standard
                  </p>
                </div>
              )}

              {/* Question Type Distribution */}
              <div className="space-y-[var(--space-md)] border-t pt-[var(--space-md)] bg-card/50 p-[var(--card-padding)] rounded-lg" data-testid="section-question-distribution">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <Label className="text-[length:var(--text-lg)] font-semibold">Question Type Distribution</Label>
                  <span className={`text-sm font-medium ${
                    formData.questionTypeDistribution.multipleChoice + 
                    formData.questionTypeDistribution.trueFalse + 
                    formData.questionTypeDistribution.match + 
                    formData.questionTypeDistribution.fillBlank === 100
                      ? "text-success"
                      : "text-destructive"
                  }`}>
                    Total: {formData.questionTypeDistribution.multipleChoice + 
                           formData.questionTypeDistribution.trueFalse + 
                           formData.questionTypeDistribution.match + 
                           formData.questionTypeDistribution.fillBlank}%
                  </span>
                </div>
                
                <div className="space-y-[var(--space-lg)]">
                  {/* Multiple Choice */}
                  <div className="space-y-[var(--space-sm)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <Label htmlFor="mc-percentage" className="text-foreground">Multiple Choice</Label>
                      <span className="text-sm font-medium text-foreground">
                        {formData.questionTypeDistribution.multipleChoice}% 
                        <span className="text-muted-foreground ml-1">
                          ({Math.round(QUIZ_TIERS[formData.quizTier].questionCount * formData.questionTypeDistribution.multipleChoice / 100)} questions)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-[var(--space-md)]">
                      <Slider
                        id="mc-percentage"
                        min={0}
                        max={100}
                        step={5}
                        value={[formData.questionTypeDistribution.multipleChoice]}
                        onValueChange={(value) => {
                          const newMC = value[0];
                          const currentTotal = formData.questionTypeDistribution.trueFalse + 
                                             formData.questionTypeDistribution.match + 
                                             formData.questionTypeDistribution.fillBlank;
                          const remaining = 100 - newMC;
                          
                          // Auto-adjust other sliders proportionally
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              newMC,
                              formData.questionTypeDistribution.trueFalse * scale,
                              formData.questionTypeDistribution.match * scale,
                              formData.questionTypeDistribution.fillBlank * scale,
                              'multipleChoice'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                multipleChoice: newMC
                              }
                            });
                          }
                        }}
                        className="flex-1 min-h-[44px] touch-manipulation"
                        data-testid="slider-mc-percentage"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.questionTypeDistribution.multipleChoice}
                        onChange={(e) => {
                          const newMC = parseInt(e.target.value) || 0;
                          const currentTotal = formData.questionTypeDistribution.trueFalse + 
                                             formData.questionTypeDistribution.match + 
                                             formData.questionTypeDistribution.fillBlank;
                          const remaining = 100 - newMC;
                          
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              newMC,
                              formData.questionTypeDistribution.trueFalse * scale,
                              formData.questionTypeDistribution.match * scale,
                              formData.questionTypeDistribution.fillBlank * scale,
                              'multipleChoice'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                multipleChoice: newMC
                              }
                            });
                          }
                        }}
                        className="w-16 sm:w-20 min-h-[44px] text-center"
                        data-testid="input-mc-percentage"
                      />
                    </div>
                  </div>

                  {/* True/False */}
                  <div className="space-y-[var(--space-sm)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <Label htmlFor="tf-percentage" className="text-foreground">True/False</Label>
                      <span className="text-sm font-medium text-foreground">
                        {formData.questionTypeDistribution.trueFalse}% 
                        <span className="text-muted-foreground ml-1">
                          ({Math.round(QUIZ_TIERS[formData.quizTier].questionCount * formData.questionTypeDistribution.trueFalse / 100)} questions)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-[var(--space-md)]">
                      <Slider
                        id="tf-percentage"
                        min={0}
                        max={100}
                        step={5}
                        value={[formData.questionTypeDistribution.trueFalse]}
                        onValueChange={(value) => {
                          const newTF = value[0];
                          const currentTotal = formData.questionTypeDistribution.multipleChoice + 
                                             formData.questionTypeDistribution.match + 
                                             formData.questionTypeDistribution.fillBlank;
                          const remaining = 100 - newTF;
                          
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              formData.questionTypeDistribution.multipleChoice * scale,
                              newTF,
                              formData.questionTypeDistribution.match * scale,
                              formData.questionTypeDistribution.fillBlank * scale,
                              'trueFalse'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                trueFalse: newTF
                              }
                            });
                          }
                        }}
                        className="flex-1 min-h-[44px] touch-manipulation"
                        data-testid="slider-tf-percentage"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.questionTypeDistribution.trueFalse}
                        onChange={(e) => {
                          const newTF = parseInt(e.target.value) || 0;
                          const currentTotal = formData.questionTypeDistribution.multipleChoice + 
                                             formData.questionTypeDistribution.match + 
                                             formData.questionTypeDistribution.fillBlank;
                          const remaining = 100 - newTF;
                          
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              formData.questionTypeDistribution.multipleChoice * scale,
                              newTF,
                              formData.questionTypeDistribution.match * scale,
                              formData.questionTypeDistribution.fillBlank * scale,
                              'trueFalse'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                trueFalse: newTF
                              }
                            });
                          }
                        }}
                        className="w-16 sm:w-20 min-h-[44px] text-center"
                        data-testid="input-tf-percentage"
                      />
                    </div>
                  </div>

                  {/* Match */}
                  <div className="space-y-[var(--space-sm)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <Label htmlFor="match-percentage" className="text-foreground">Match the Left to the Right</Label>
                      <span className="text-sm font-medium text-foreground">
                        {formData.questionTypeDistribution.match}% 
                        <span className="text-muted-foreground ml-1">
                          ({Math.round(QUIZ_TIERS[formData.quizTier].questionCount * formData.questionTypeDistribution.match / 100)} questions)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-[var(--space-md)]">
                      <Slider
                        id="match-percentage"
                        min={0}
                        max={100}
                        step={5}
                        value={[formData.questionTypeDistribution.match]}
                        onValueChange={(value) => {
                          const newMatch = value[0];
                          const currentTotal = formData.questionTypeDistribution.multipleChoice + 
                                             formData.questionTypeDistribution.trueFalse + 
                                             formData.questionTypeDistribution.fillBlank;
                          const remaining = 100 - newMatch;
                          
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              formData.questionTypeDistribution.multipleChoice * scale,
                              formData.questionTypeDistribution.trueFalse * scale,
                              newMatch,
                              formData.questionTypeDistribution.fillBlank * scale,
                              'match'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                match: newMatch
                              }
                            });
                          }
                        }}
                        className="flex-1 min-h-[44px] touch-manipulation"
                        data-testid="slider-match-percentage"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.questionTypeDistribution.match}
                        onChange={(e) => {
                          const newMatch = parseInt(e.target.value) || 0;
                          const currentTotal = formData.questionTypeDistribution.multipleChoice + 
                                             formData.questionTypeDistribution.trueFalse + 
                                             formData.questionTypeDistribution.fillBlank;
                          const remaining = 100 - newMatch;
                          
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              formData.questionTypeDistribution.multipleChoice * scale,
                              formData.questionTypeDistribution.trueFalse * scale,
                              newMatch,
                              formData.questionTypeDistribution.fillBlank * scale,
                              'match'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                match: newMatch
                              }
                            });
                          }
                        }}
                        className="w-16 sm:w-20 min-h-[44px] text-center"
                        data-testid="input-match-percentage"
                      />
                    </div>
                  </div>

                  {/* Fill in the Blank */}
                  <div className="space-y-[var(--space-sm)]">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                      <Label htmlFor="fb-percentage" className="text-foreground">Fill in the Blank</Label>
                      <span className="text-sm font-medium text-foreground">
                        {formData.questionTypeDistribution.fillBlank}% 
                        <span className="text-muted-foreground ml-1">
                          ({Math.round(QUIZ_TIERS[formData.quizTier].questionCount * formData.questionTypeDistribution.fillBlank / 100)} questions)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-[var(--space-md)]">
                      <Slider
                        id="fb-percentage"
                        min={0}
                        max={100}
                        step={5}
                        value={[formData.questionTypeDistribution.fillBlank]}
                        onValueChange={(value) => {
                          const newFB = value[0];
                          const currentTotal = formData.questionTypeDistribution.multipleChoice + 
                                             formData.questionTypeDistribution.trueFalse + 
                                             formData.questionTypeDistribution.match;
                          const remaining = 100 - newFB;
                          
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              formData.questionTypeDistribution.multipleChoice * scale,
                              formData.questionTypeDistribution.trueFalse * scale,
                              formData.questionTypeDistribution.match * scale,
                              newFB,
                              'fillBlank'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                fillBlank: newFB
                              }
                            });
                          }
                        }}
                        className="flex-1 min-h-[44px] touch-manipulation"
                        data-testid="slider-fb-percentage"
                      />
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        value={formData.questionTypeDistribution.fillBlank}
                        onChange={(e) => {
                          const newFB = parseInt(e.target.value) || 0;
                          const currentTotal = formData.questionTypeDistribution.multipleChoice + 
                                             formData.questionTypeDistribution.trueFalse + 
                                             formData.questionTypeDistribution.match;
                          const remaining = 100 - newFB;
                          
                          if (currentTotal > 0 && remaining >= 0) {
                            const scale = remaining / currentTotal;
                            const normalized = normalizeDistribution(
                              formData.questionTypeDistribution.multipleChoice * scale,
                              formData.questionTypeDistribution.trueFalse * scale,
                              formData.questionTypeDistribution.match * scale,
                              newFB,
                              'fillBlank'
                            );
                            setFormData({
                              ...formData,
                              questionTypeDistribution: normalized
                            });
                          } else {
                            setFormData({
                              ...formData,
                              questionTypeDistribution: {
                                ...formData.questionTypeDistribution,
                                fillBlank: newFB
                              }
                            });
                          }
                        }}
                        className="w-16 sm:w-20 min-h-[44px] text-center"
                        data-testid="input-fb-percentage"
                      />
                    </div>
                  </div>
                </div>

                {formData.questionTypeDistribution.multipleChoice + 
                 formData.questionTypeDistribution.trueFalse + 
                 formData.questionTypeDistribution.match + 
                 formData.questionTypeDistribution.fillBlank !== 100 && (
                  <div className="bg-warning/10 border border-[var(--warning)]/30 rounded-lg p-[var(--space-md)]" data-testid="warning-percentage-total">
                    <p className="text-sm text-warning">
                      ⚠️ Question type percentages must add up to exactly 100%
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
            );
          })()}

        {/* Step 3: Generate */}
        {currentStep === 3 && (
          <Card
            className="p-[var(--card-padding)]"
            style={{
              backgroundColor: "var(--step-card-bg)",
              color: "var(--step-card-fg)",
              borderColor: "var(--step-card-border)",
            }}
            data-testid="step-generate"
          >
            <CardHeader className="p-0 pb-[var(--space-md)]">
              <CardTitle className="text-[length:var(--text-2xl)]">Generate Questions with AI</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-[var(--space-lg)]">
              <div className="bg-secondary/10 dark:bg-secondary/10 border border-secondary/30 dark:border-secondary/40 rounded-lg p-[var(--card-padding)]">
                <div className="flex items-start gap-[var(--space-md)]">
                  <Wand2 className="h-5 w-5 text-secondary dark:text-secondary/80 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-secondary dark:text-secondary/80">Ready to Generate</h3>
                    <p className="text-sm text-secondary/80 dark:text-secondary/70 mt-1 break-words">
                      Click "Generate Questions" below to create {QUIZ_TIERS[formData.quizTier].questionCount} {formData.difficulty} questions about{" "}
                      <span className="font-semibold">{formData.primaryTopic || formData.topic}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Generation Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-[var(--space-md)]">
                {sourceLessonId ? (
                  <>
                    <div className="bg-muted rounded-lg p-[var(--space-md)]">
                      <p className="text-xs text-muted-foreground">Lesson</p>
                      <p className="font-medium text-foreground mt-1 break-words leading-snug">{lessonDisplayName}</p>
                    </div>
                    <div className="bg-muted rounded-lg p-[var(--space-md)]">
                      <p className="text-xs text-muted-foreground">Selected Source</p>
                      <p className="font-medium text-foreground mt-1 break-words leading-snug">
                        {selectedSourceOption?.label || (selectedSource ? `${selectedSource.sourceType} (${selectedSource.versionRef})` : "N/A")}
                      </p>
                      {selectedSourceTimestamp && (
                        <p className="text-[11px] text-muted-foreground mt-1 break-words leading-snug">
                          {new Date(selectedSourceTimestamp).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-muted rounded-lg p-[var(--space-md)]">
                      <p className="text-xs text-muted-foreground">{terminology.unit}</p>
                      <p className="font-medium text-foreground mt-1 break-words leading-snug">
                        {grades.find((g) => g.id === formData.gradeId)?.name || formData.gradeName || "N/A"}
                      </p>
                    </div>
                    <div className="bg-muted rounded-lg p-[var(--space-md)]">
                      <p className="text-xs text-muted-foreground">{terminology.subject}</p>
                      <p className="font-medium text-foreground mt-1 break-words leading-snug">
                        {subjects.find((s) => s.subjectId === formData.subjectId)?.subjectName || formData.subjectName || "N/A"}
                      </p>
                    </div>
                  </>
                )}
                <div className="bg-muted rounded-lg p-[var(--space-md)]">
                  <p className="text-xs text-muted-foreground">Questions</p>
                  <p className="font-medium text-foreground mt-1">{QUIZ_TIERS[formData.quizTier].questionCount}</p>
                </div>
                <div className="bg-muted rounded-lg p-[var(--space-md)]">
                  <p className="text-xs text-muted-foreground">Difficulty</p>
                  <p className="font-medium text-foreground mt-1 capitalize">{formData.difficulty}</p>
                </div>
                <div className="bg-muted rounded-lg p-[var(--space-md)]">
                  <p className="text-xs text-muted-foreground">Pass Percentage</p>
                  <p className="font-medium text-foreground mt-1">{formData.requiredPassPercentage}%</p>
                </div>
              </div>

              {generatedQuestions.length > 0 && (
                <div className="bg-success/10 border border-[var(--success)]/30 rounded-lg p-[var(--card-padding)]">
                  <div className="flex items-start gap-[var(--space-sm)]">
                    <Check className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-success">
                      {generatedQuestions.length} questions already generated. Click "Next" to review them, or regenerate to create new ones.
                    </p>
                  </div>
                </div>
              )}

              {generationError && (
                <div className="bg-destructive/10 border border-[var(--destructive)]/30 rounded-lg p-[var(--card-padding)]">
                  <div className="flex items-start gap-[var(--space-sm)]">
                    <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-destructive">Question generation failed</p>
                      <p className="text-sm text-destructive/90 break-words">{generationError}</p>
                      <p className="text-xs text-muted-foreground">
                        Tip: go Back to Step 1 and choose a different source/version, then retry.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Review & Edit */}
        {currentStep === 4 && (
          <div className="space-y-[var(--space-md)]" data-testid="step-review">
            <Card className="p-[var(--card-padding)]">
              <CardHeader className="p-0">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <CardTitle className="text-[length:var(--text-2xl)]">Review & Edit Questions</CardTitle>
                  <Badge variant="secondary" className="self-start sm:self-auto" data-testid="badge-question-count">
                    {selectedQuestionCount} / {requiredQuestionCount} selected
                  </Badge>
                </div>
              </CardHeader>
            </Card>

            {normalizedLearningObjectives.length > 0 && (
              <Card className="p-[var(--card-padding)] border-primary/25 bg-primary/6" data-testid="card-objective-coverage">
                <CardContent className="p-0 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Learning objective coverage
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={hasObjectiveCoverageGap ? "destructive" : "secondary"}>
                      Covered: {normalizedLearningObjectives.length - objectiveCoverageGaps.length}/{normalizedLearningObjectives.length}
                    </Badge>
                    {shouldEnforceObjectiveCoverage && (
                      <Badge variant={hasObjectiveCoverageGap ? "destructive" : "outline"}>
                        Minimum rule: 1 question per objective
                      </Badge>
                    )}
                  </div>
                  {hasObjectiveCoverageGap && (
                    <p className="text-xs text-destructive">
                      Missing coverage for: {objectiveCoverageGaps.map((obj) => obj.objective).join(" | ")}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {rejectedQuestions.length > 0 && (
              <Card className="p-[var(--card-padding)] border-[var(--warning)]/35 bg-warning/8" data-testid="card-rejected-summary">
                <CardContent className="p-0 space-y-2">
                  <p className="text-sm font-medium text-foreground">
                    Source alignment review required for {rejectedQuestions.length} question(s)
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Resolve each flagged question by accepting, regenerating/rechecking, or manually editing then accepting.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Needs Review: {unresolvedRejectedCount}</Badge>
                    <Badge variant="outline">Ready: {readySelectedCount}</Badge>
                    <Badge variant="outline">Reviewed Accepted: {reviewedAcceptedCount}</Badge>
                    <Badge variant={hasRequiredCountGap ? "destructive" : "secondary"}>
                      Selected: {selectedQuestionCount}/{requiredQuestionCount}
                    </Badge>
                  </div>
                  {(unresolvedRejectedCount > 0 || hasRequiredCountGap) && (
                    <p className="text-xs text-destructive">
                      Complete requirement before continuing: resolve all flagged questions and keep exactly {requiredQuestionCount} selected.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                        setGeneratedQuestions((prev) =>
                          prev.map((q) =>
                            q.validatorStatus === "rejected"
                              ? { ...q, selected: true, userDisposition: "accepted" }
                              : q
                          )
                        );
                        toast({
                          title: "Applied",
                          description: "All flagged questions marked as reviewed accepted.",
                        });
                      }}
                      data-testid="button-use-all-flagged"
                    >
                      Mark All Reviewed Accepted
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {generatedQuestions.length === 0 ? (
              <Card className="p-[var(--card-padding)]">
                <CardContent className="p-0 py-12 text-center">
                  <Wand2 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">
                    No questions generated yet. Go back to generate some.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-[var(--space-md)]">
                {generatedQuestions.map((question, index) => (
                  <QuestionCard
                    key={`question-${index}`}
                    question={question}
                    index={index}
                    objectiveLookup={objectiveLookup}
                    isRegeneratingQuestion={regeneratingQuestionIndex === index}
                    isRegeneratingAnswers={regeneratingAnswersIndex === index}
                    onToggleSelect={(idx) => {
                      const updated = [...generatedQuestions];
                      const nextSelected = !(updated[idx].selected !== false);
                      updated[idx] = {
                        ...updated[idx],
                        selected: nextSelected,
                        userDisposition: updated[idx].validatorStatus === 'rejected'
                          ? (nextSelected ? 'accepted' : 'pending')
                          : updated[idx].userDisposition || 'accepted',
                      };
                      setGeneratedQuestions(updated);
                    }}
                    onEdit={(idx, updatedQuestion) => {
                      console.log('[QuizWizard] onEdit called:', { idx, updatedQuestion });
                      // Use functional update to ensure we're working with the latest state
                      setGeneratedQuestions(prevQuestions => {
                        const updated = [...prevQuestions];
                        updated[idx] = { ...updatedQuestion }; // Create new object reference
                        console.log('[QuizWizard] State updated:', { idx, newAnswers: updated[idx].answers, newPairs: updated[idx].matchPairs });
                        return updated;
                      });
                    }}
                    onRegenerateQuestion={async (idx, questionType) => {
                      try {
                        setRegeneratingQuestionIndex(idx);
                        if (sourceLessonId && !selectedSource) {
                          throw new Error("Select a quiz source before regenerating questions.");
                        }
                        const data: {
                          question: GeneratedQuestion;
                          needsReview?: boolean;
                          groundingError?: string | null;
                        } = await apiRequest("/api/ai/regenerate-question", {
                          method: "POST",
                          body: JSON.stringify({
                            topic: formData.topic || formData.primaryTopic,
                            primaryTopic: formData.primaryTopic,
                            subtopic1: formData.subtopic1,
                            subtopic2: formData.subtopic2,
                            questionType,
                            difficulty: formData.difficulty,
                            grade: grades.find((g) => g.id === formData.gradeId)?.name || "",
                            subject: subjects.find((s) => s.subjectId === formData.subjectId)?.subjectName || "",
                            description: formData.description || "",
                            organizationId,
                            lessonId: sourceLessonId,
                            sourceSelection: selectedSource,
                            learningObjectives: normalizedLearningObjectives,
                            preferredObjectiveId: getPreferredObjectiveIdForRegeneration(idx),
                          }),
                        });

                        setGeneratedQuestions((prev) => {
                          const updated = [...prev];
                          const needsReview = !!data.needsReview || data.question?.validatorStatus === "rejected";
                          updated[idx] = {
                            ...data.question,
                            selected: true,
                            validatorStatus: needsReview ? "rejected" : "regenerated",
                            userDisposition: needsReview ? "pending" : "accepted",
                            validatorReason: data.question?.validatorReason || null,
                            validatorMissingTokens: data.question?.validatorMissingTokens || [],
                            requestedRegenerationType: questionType,
                          };
                          return updated;
                        });
                        invalidateWalletCaches();

                        if (data.needsReview || data.question?.validatorStatus === "rejected") {
                          toast({
                            title: "Review Required",
                            description:
                              data.groundingError ||
                              "Replacement still needs source review. Regenerate again, or edit and mark reviewed accepted.",
                          });
                        } else {
                          toast({
                            title: "Success",
                            description: "Question regenerated and selected.",
                          });
                        }
                      } catch (error) {
                        const message = error instanceof Error ? error.message : "Failed to regenerate question";
                        toast({
                          title: "Error",
                          description: message,
                          variant: "destructive",
                        });
                      } finally {
                        setRegeneratingQuestionIndex(null);
                      }
                    }}
                    onAcceptRejected={(idx) => {
                      setGeneratedQuestions((prev) => {
                        const updated = [...prev];
                        updated[idx] = {
                          ...updated[idx],
                          selected: true,
                          userDisposition: 'accepted',
                          rejectionReason: null,
                        };
                        return updated;
                      });
                      toast({
                        title: "Updated",
                        description: `Question ${idx + 1} marked reviewed and accepted.`,
                      });
                    }}
                    onLoadEvidence={async (idx) => {
                      if (!sourceLessonId || !selectedSource) {
                        return {
                          snippets: [],
                          sourceLabel: selectedSourceOption?.label || null,
                          sourceTimestamp: selectedSourceTimestamp,
                        };
                      }
                      const q = generatedQuestions[idx];
                      const evidence: {
                        snippets: string[];
                        source?: { label?: string; createdAt?: string | null };
                      } = await apiRequest("/api/ai/source-evidence", {
                        method: "POST",
                        body: JSON.stringify({
                          organizationId,
                          lessonId: sourceLessonId,
                          sourceSelection: selectedSource,
                          questionText: q.question,
                        }),
                      });
                      return {
                        snippets: evidence.snippets || [],
                        sourceLabel: evidence.source?.label || selectedSourceOption?.label || null,
                        sourceTimestamp: evidence.source?.createdAt || selectedSourceTimestamp,
                      };
                    }}
                    onRegenerateAnswers={async (idx) => {
                      try {
                        setRegeneratingAnswersIndex(idx);
                        if (sourceLessonId && !selectedSource) {
                          throw new Error("Select a quiz source before regenerating answers.");
                        }
                        const q = generatedQuestions[idx];
                        if (!q.answers || q.correctIndex === undefined) return;
                        const data: { answers: string[]; correctIndex: number } = await apiRequest("/api/ai/regenerate-answers", {
                          method: "POST",
                          body: JSON.stringify({
                            question: q.question,
                            correctAnswer: q.answers[q.correctIndex],
                            difficulty: formData.difficulty,
                            topic: formData.topic || formData.primaryTopic,
                            primaryTopic: formData.primaryTopic,
                            subtopic1: formData.subtopic1,
                            subtopic2: formData.subtopic2,
                            grade: grades.find((g) => g.id === formData.gradeId)?.name || "",
                            subject: subjects.find((s) => s.subjectId === formData.subjectId)?.subjectName || "",
                            description: formData.description || "",
                            organizationId,
                            lessonId: sourceLessonId,
                            sourceSelection: selectedSource,
                          }),
                        });

                        const updated = [...generatedQuestions];
                        updated[idx] = { ...q, answers: data.answers, correctIndex: data.correctIndex };
                        setGeneratedQuestions(updated);
                        invalidateWalletCaches();

                        toast({
                          title: "Success",
                          description: "Answers regenerated",
                        });
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Failed to regenerate answers",
                          variant: "destructive",
                        });
                      } finally {
                        setRegeneratingAnswersIndex(null);
                      }
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 5: Publish */}
        {currentStep === 5 && (
          <Card
            className="p-[var(--card-padding)]"
            style={{
              backgroundColor: "var(--step-card-bg)",
              color: "var(--step-card-fg)",
              borderColor: "var(--step-card-border)",
            }}
            data-testid="step-publish"
          >
            <CardHeader className="p-0 pb-[var(--space-md)]">
              <CardTitle className="text-[length:var(--text-2xl)]">Publish Quiz</CardTitle>
            </CardHeader>
            <CardContent className="p-0 space-y-[var(--space-lg)]">
              <div className="bg-success/10 border border-[var(--success)]/30 rounded-lg p-[var(--card-padding)]">
                <div className="flex items-start gap-[var(--space-md)]">
                  <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-success">Ready to Publish</h3>
                    <p className="text-sm text-success dark:text-success mt-1">
                      Your quiz with {selectedQuestionCount}/{requiredQuestionCount} selected questions is ready to be published and shared with students.
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-[var(--space-md)]">
                <div className="space-y-2">
                  <Label htmlFor="finalQuizName">Quiz Name *</Label>
                  <Input
                    id="finalQuizName"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter a name for your quiz"
                    required
                    className="min-h-[44px]"
                    data-testid="input-final-quiz-name"
                  />
                  <p className="text-xs text-muted-foreground">
                    This name will be visible to students
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="finalDescription">Description (Optional)</Label>
                  <Textarea
                    id="finalDescription"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Add a brief description"
                    rows={3}
                    className="min-h-[100px]"
                    data-testid="textarea-final-description"
                  />
                </div>

                <div className="space-y-2 pt-[var(--space-md)] border-t">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-sm)]">
                    <div className="space-y-0.5 flex-1">
                      <Label htmlFor="public-toggle">Make Quiz Public</Label>
                      <p className="text-xs text-muted-foreground">
                        Public quizzes are visible to everyone. By default, quizzes are only visible to your organization.
                      </p>
                    </div>
                    <Switch
                      id="public-toggle"
                      checked={formData.isPublic}
                      onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
                      className="min-h-[44px] min-w-[44px] touch-manipulation"
                      data-testid="switch-public-toggle"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-[var(--space-lg)]">
                <h4 className="font-medium text-foreground mb-[var(--space-md)]">Quiz Summary</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-[var(--space-md)]">
                  <div className="bg-muted rounded-lg p-[var(--space-md)]">
                    <p className="text-xs text-muted-foreground">Questions</p>
                    <p className="font-medium text-foreground mt-1">
                      {selectedQuestionCount}
                    </p>
                  </div>
                  <div className="bg-muted rounded-lg p-[var(--space-md)]">
                    <p className="text-xs text-muted-foreground">Topic</p>
                    <p className="font-medium text-foreground mt-1 truncate">
                      {formData.primaryTopic || formData.topic}
                    </p>
                  </div>
                  <div className="bg-muted rounded-lg p-[var(--space-md)]">
                    <p className="text-xs text-muted-foreground">Difficulty</p>
                    <p className="font-medium text-foreground mt-1 capitalize">
                      {formData.difficulty}
                    </p>
                  </div>
                  <div className="bg-muted rounded-lg p-[var(--space-md)]">
                    <p className="text-xs text-muted-foreground">{terminology.unit}</p>
                    <p className="font-medium text-foreground mt-1 truncate">
                      {grades.find((g) => g.id === formData.gradeId)?.name || formData.gradeName || "N/A"}
                    </p>
                  </div>
                  <div className="bg-muted rounded-lg p-[var(--space-md)] col-span-2 sm:col-span-1">
                    <p className="text-xs text-muted-foreground">Pass %</p>
                    <p className="font-medium text-foreground mt-1">
                      {formData.requiredPassPercentage}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-[var(--space-lg)]">
                <Button className="w-full min-h-[48px] touch-manipulation" size="lg" disabled={!formData.name || hasRequiredCountGap || unresolvedRejectedCount > 0 || hasObjectiveCoverageGap}
                  onClick={async () => {
                    try {
                      // Filter selected questions
                      const selectedQuestions = generatedQuestions.filter(q => q.selected !== false);
                      
                      if (unresolvedRejectedCount > 0) {
                        toast({
                          title: "Review Required",
                          description: "Resolve all flagged questions before publishing.",
                          variant: "destructive",
                        });
                        return;
                      }
                      if (hasObjectiveCoverageGap) {
                        toast({
                          title: "Objective Coverage Required",
                          description: `Cover all learning objectives before publishing. ${objectiveCoverageGaps.length} objective${objectiveCoverageGaps.length === 1 ? "" : "s"} still need at least one selected question.`,
                          variant: "destructive",
                        });
                        return;
                      }

                      if (selectedQuestions.length !== requiredQuestionCount) {
                        const delta = Math.abs(requiredQuestionCount - selectedQuestions.length);
                        toast({
                          title: "Question Count Incomplete",
                          description: selectedQuestions.length < requiredQuestionCount
                            ? `You still need ${delta} selected question${delta === 1 ? "" : "s"} before publishing.`
                            : `You have ${delta} extra selected question${delta === 1 ? "" : "s"}. Keep exactly ${requiredQuestionCount} selected.`,
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      // Save the draft with isPublic field before publishing
                      await saveDraftMutation.mutateAsync({
                        ...formData,
                        generatedQuestions: JSON.stringify(generatedQuestions),
                        sourceSelection: selectedSource,
                        lastGeneratedSourceContract,
                        isPublic: formData.isPublic,
                      });
                      
                      toast({
                        title: "Publishing...",
                        description: "Creating quiz collection...",
                      });
                      
                      // Call publish endpoint
                      await apiRequest(`/api/drafts/${draftId}/publish`, {
                        method: "POST",
                        body: JSON.stringify({
                          organizationId,
                          sourceLessonId, // Include lesson ID for auto-linking
                        }),
                      });
                      
                      // Invalidate queries to refresh quiz lobby and management hub
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/quiz-collections"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/quiz/collections"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/quiz/collections/public"] }); // Public quizzes in lobby
                      queryClient.invalidateQueries({ queryKey: ["/api/quiz/collections/organization"] }); // Org quizzes in lobby
                      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] }); // Org-specific collections for SuperAdmin
                      queryClient.invalidateQueries({ queryKey: ["/api/quiz/assignments"] }); // Quiz assignments
                      queryClient.invalidateQueries({ queryKey: ["/api/drafts"] });
                      queryClient.invalidateQueries({ queryKey: ["/api/lessons"] });
                      
                      toast({
                        title: "Success!",
                        description: `Quiz "${formData.name}" has been published`,
                      });
                      
                      setLocation(resolveReturnPath());
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to publish quiz",
                        variant: "destructive",
                      });
                    }
                  }}
                  data-testid="button-publish-quiz"
                >
                  <CheckCircle2 className="h-5 w-5 mr-2" />
                  Publish Quiz
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap justify-between items-stretch sm:items-center pt-[var(--space-lg)] border-t gap-[var(--space-md)]" data-testid="navigation-footer">
          {nextBlockedInReviewStep && reviewBlockMessage && (
            <div className="w-full rounded-md border border-[var(--warning)]/35 bg-warning/8 p-3 text-left sm:col-span-2">
              <p className="text-sm text-foreground">{reviewBlockMessage}</p>
              {reviewBlockActionLabel && reviewBlockActionIndex >= 0 && (
                <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => jumpToQuestion(reviewBlockActionIndex)}
                  data-testid="button-jump-to-blocker"
                >
                  {reviewBlockActionLabel}
                </Button>
              )}
            </div>
          )}
          <Button variant="outline" onClick={() => {
              setLocation(resolveReturnPath());
            }}
            className="min-h-[44px] touch-manipulation order-last sm:order-first"
            data-testid="button-cancel"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancel
          </Button>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={handleSave} disabled={saveDraftMutation.isPending} className="min-h-[44px] touch-manipulation" data-testid="button-save" >
              <Save className="h-4 w-4 mr-2" />
              Save Draft
            </Button>

            {currentStep > 1 && (
              <Button variant="outline" onClick={handleBack} disabled={generateQuestionsMutation.isPending} className="min-h-[44px] touch-manipulation" data-testid="button-back" >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}

            {currentStep < 5 && (
              <Button onClick={handleNext} disabled={ (currentStep === 1 && !selectedSource) || (currentStep === 2 && ((requiresTopicInCriteria && !hasTopicForCriteria) || Math.round( formData.questionTypeDistribution.multipleChoice + formData.questionTypeDistribution.trueFalse + formData.questionTypeDistribution.match + formData.questionTypeDistribution.fillBlank ) !== 100)) || (currentStep === 4 && (unresolvedRejectedCount > 0 || hasRequiredCountGap || hasObjectiveCoverageGap)) ||
                  saveDraftMutation.isPending ||
                  generateQuestionsMutation.isPending
                }
                className="min-h-[44px] touch-manipulation"
                data-testid="button-next"
              >
                {generateQuestionsMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : currentStep === 3 && generatedQuestions.length === 0 ? (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Questions
                  </>
                ) : currentStep === 1 ? (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                ) : (
                  <>
                    Next
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </QuizAdminLayout>
  );
}
