import { useState, useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  FileQuestion, 
  GraduationCap, 
  Coins, 
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Info,
} from "lucide-react";
import { apiRequest, invalidateWalletCaches } from "@/lib/queryClient";
import { useHybridBalance } from "@/hooks/useWallet";
import { QUIZ_TIERS, type QuizTier } from "@shared/creditConstants";

interface QuizTierPricingData {
  tier: QuizTier;
  creditCost: number;
  questionCount: number;
  label: string;
}

interface QuizPricingResponse {
  tiers: QuizTierPricingData[];
  organizationId: string | null;
}

function getEffectiveTierCost(
  pricingData: QuizPricingResponse | undefined,
  tier: QuizTier
): number {
  if (!pricingData?.tiers) {
    return QUIZ_TIERS[tier].defaultCredits;
  }
  const tierPricing = pricingData.tiers.find((t) => t.tier === tier);
  return tierPricing?.creditCost ?? QUIZ_TIERS[tier].defaultCredits;
}

interface ChainPanelProps {
  lessonId: string;
  lessonTitle: string;
  onQuizGenerated?: (quizId: string) => void;
  onCourseGenerated?: (topicCount: number) => void;
}

interface OrchestrationCapabilities {
  canGenerateQuiz: boolean;
  canGenerateCourse: boolean;
  slideCount: number;
  keyPointCount: number;
  hasValidOverview: boolean;
  warnings: string[];
}

interface CreditCost {
  mode: string;
  stages: Array<{
    stage: string;
    estimatedCredits: number;
  }>;
  subtotal: number;
  bundleDiscount: number;
  total: number;
}

export function LearningAssetChainPanel({ 
  lessonId, 
  lessonTitle,
  onQuizGenerated,
  onCourseGenerated,
}: ChainPanelProps) {
  const [generateQuiz, setGenerateQuiz] = useState(false);
  const [generateCourse, setGenerateCourse] = useState(false);
  const [quizTier, setQuizTier] = useState<QuizTier>("10");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [enhanceCourseTopics, setEnhanceCourseTopics] = useState(false);

  const { data: capabilities, isLoading: isLoadingCapabilities } = useQuery<OrchestrationCapabilities>({
    queryKey: ['/api/lessons', lessonId, 'capabilities'],
    enabled: !!lessonId,
  });

  const { data: quizPricing, isLoading: isLoadingPricing } = useQuery<QuizPricingResponse>({
    queryKey: ['/api/quiz-pricing'],
  });

  const quizCredits = useMemo(
    () => getEffectiveTierCost(quizPricing, quizTier),
    [quizPricing, quizTier]
  );
  const courseCredits = 20 + (5 * 3);
  
  const estimatedCost: CreditCost = useMemo(() => {
    const subtotal = (generateQuiz ? quizCredits : 0) + (generateCourse ? courseCredits : 0);
    const bundleDiscount = (generateQuiz && generateCourse) ? 
      Math.floor((quizCredits + courseCredits) * 0.15) : 0;
    return {
      mode: generateQuiz && generateCourse ? 'full-chain' : 
            generateQuiz ? 'lesson-with-quiz' : 
            generateCourse ? 'lesson-with-course' : 'lesson-only',
      stages: [
        ...(generateQuiz ? [{ stage: 'Quiz Generation', estimatedCredits: quizCredits }] : []),
        ...(generateCourse ? [{ stage: 'Course Framework', estimatedCredits: courseCredits }] : []),
      ],
      subtotal,
      bundleDiscount,
      total: subtotal - bundleDiscount,
    };
  }, [generateQuiz, generateCourse, quizCredits, courseCredits]);

  const hybridBalance = useHybridBalance({ amount: estimatedCost.total });
  const hasEnoughCredits = hybridBalance.canAfford;

  const orchestrateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest(`/api/lessons/${lessonId}/orchestrate`, {
        method: 'POST',
        body: JSON.stringify({
          generateQuiz,
          generateCourse,
          quizTier,
          numberOfQuestions: QUIZ_TIERS[quizTier].questionCount,
          quizDifficulty: difficulty,
          enhanceCourseTopics,
        }),
      });
      return response;
    },
    onSuccess: (data: any) => {
      if (data.quiz && onQuizGenerated) {
        onQuizGenerated(data.quiz.id);
      }
      if (data.courseTopics && onCourseGenerated) {
        onCourseGenerated(data.courseTopics.length);
      }
      invalidateWalletCaches();
    },
  });

  if (isLoadingCapabilities || isLoadingPricing) {
    return (
      <Card data-testid="chain-panel-loading">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const canGenerate = generateQuiz || generateCourse;
  const isDisabled = !canGenerate || !hasEnoughCredits || orchestrateMutation.isPending;

  return (
    <Card className="bg-card/10 backdrop-blur-xl border border-border" data-testid="chain-panel">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-warning" />
          Extend Your Lesson
        </CardTitle>
        <CardDescription>
          Generate quizzes and course frameworks from your lesson content
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {capabilities?.warnings && capabilities.warnings.length > 0 && (
          <Alert variant="destructive" data-testid="chain-warnings">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {capabilities.warnings.join('. ')}
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4">
          <div className="flex items-center justify-between rounded-lg border p-4" data-testid="quiz-option">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-secondary/20 p-2">
                <FileQuestion className="h-5 w-5 text-secondary" />
              </div>
              <div>
                <Label htmlFor="generate-quiz" className="text-base font-medium">
                  Generate Quiz
                </Label>
                <p className="text-sm text-muted-foreground">
                  Create quiz questions from lesson content
                </p>
              </div>
            </div>
            <Switch
              id="generate-quiz"
              checked={generateQuiz}
              onCheckedChange={setGenerateQuiz}
              disabled={!capabilities?.canGenerateQuiz}
              data-testid="switch-generate-quiz"
            />
          </div>

          {generateQuiz && (
            <div className="ml-4 sm:ml-12 space-y-4 animate-in slide-in-from-top-2">
              <div className="space-y-3">
                <Label className="text-sm font-medium">Question Count</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(QUIZ_TIERS) as QuizTier[]).map((tier) => {
                    const tierInfo = QUIZ_TIERS[tier];
                    const tierCreditCost = getEffectiveTierCost(quizPricing, tier);
                    const isSelected = quizTier === tier;
                    return (
                      <button
                        key={tier}
                        type="button"
                        onClick={() => setQuizTier(tier)}
                        data-testid={`tier-select-${tier}`}
                        className={`
                          relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all duration-200 min-h-[80px]
                          ${isSelected 
                            ? 'border-primary bg-surface-raised shadow-elevated shadow-elevated' 
                            : 'border-border bg-muted/50 hover:border-primary/50 hover:bg-muted'
                          }
                        `}
                      >
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          </div>
                        )}
                        <span className={`text-xl font-bold ${isSelected ? 'text-glow-gold' : 'text-foreground'}`}>
                          {tierInfo.questionCount}
                        </span>
                        <span className="text-xs text-muted-foreground">Questions</span>
                        <div className="flex items-center gap-1 mt-1">
                          <Coins className="h-3 w-3 text-glow-gold" />
                          <span className={`text-xs font-medium ${isSelected ? 'text-glow-gold' : 'text-muted-foreground'}`}>
                            {tierCreditCost} LP
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Difficulty</Label>
                <div className="flex gap-2">
                  {(['easy', 'medium', 'hard'] as const).map((level) => (
                    <Button key={level} variant={difficulty === level ? 'default' : 'outline'} size="sm" onClick={() => setDifficulty(level)}
                      data-testid={`btn-difficulty-${level}`}
                      className={difficulty === level ? 'bg-primary hover:bg-primary/90' : ''}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg border p-4" data-testid="course-option">
            <div className="flex items-center gap-3">
              <div className="rounded-full bg-primary/20 p-2">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <Label htmlFor="generate-course" className="text-base font-medium">
                  Generate Course Framework
                </Label>
                <p className="text-sm text-muted-foreground">
                  Create course topics from lesson structure
                </p>
              </div>
            </div>
            <Switch
              id="generate-course"
              checked={generateCourse}
              onCheckedChange={setGenerateCourse}
              disabled={!capabilities?.canGenerateCourse}
              data-testid="switch-generate-course"
            />
          </div>

          {generateCourse && (
            <div className="ml-12 space-y-2 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="enhance-topics"
                  checked={enhanceCourseTopics}
                  onCheckedChange={setEnhanceCourseTopics}
                  data-testid="switch-enhance-topics"
                />
                <Label htmlFor="enhance-topics" className="text-sm">
                  AI-enhance topic descriptions
                </Label>
              </div>
            </div>
          )}
        </div>

        {canGenerate && (
          <>
            <Separator />
            
            <div className="space-y-3" data-testid="cost-summary">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated Cost</span>
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-warning" />
                  <span className="font-medium">{estimatedCost.subtotal} credits</span>
                </div>
              </div>
              
              {estimatedCost.bundleDiscount > 0 && (
                <div className="flex items-center justify-between text-sm text-success">
                  <span>Bundle Discount (15%)</span>
                  <span>-{estimatedCost.bundleDiscount} credits</span>
                </div>
              )}
              
              <div className="flex items-center justify-between font-medium">
                <span>Total</span>
                <div className="flex items-center gap-2">
                  <Coins className="h-4 w-4 text-warning" />
                  <span>{estimatedCost.total} credits</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Available Credits</span>
                <Badge variant={hasEnoughCredits ? 'default' : 'destructive'}>
                  {hybridBalance.totalAvailable} credits
                </Badge>
              </div>

              {!hasEnoughCredits && (
                <Alert variant="destructive" data-testid="insufficient-credits-alert">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    You need {estimatedCost.total - hybridBalance.totalAvailable} more credits
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <Button className="w-full" size="lg" disabled={isDisabled} onClick={() => orchestrateMutation.mutate()}
              data-testid="btn-generate"
            >
              {orchestrateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Generate {generateQuiz && generateCourse ? 'Quiz & Course' : 
                           generateQuiz ? 'Quiz' : 'Course Framework'}
                </>
              )}
            </Button>
          </>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="h-3 w-3" />
          <span>
            Content based on {capabilities?.slideCount ?? 0} slides with {capabilities?.keyPointCount ?? 0} key points
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
