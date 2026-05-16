import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, X, Zap, Users, Lightbulb } from 'lucide-react';
import { ExplanationModal } from './ExplanationModal';

interface QuizRoundResultModalProps {
  isOpen: boolean;
  roundResult: {
    result: string;
    correctIndex: number;
    correctAnswerIndex?: number;
    player1Answer: number;
    player2Answer?: number;
    player1Correct: boolean;
    player2Correct?: boolean;
    player1Score: number;
    player2Score: number;
    correctMatchPairs?: Array<{ left: string; right: string }>;
    correctAnswer?: string;
  } | null;
  currentCard: {
    id?: string;
    question: string;
    questionType?: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank';
    answers?: string[];
    correctAnswerIndex?: number;
    matchPairs?: { left: string; right?: string }[];
    rightItems?: Array<{ text: string; originalIndex: number }>;
    correctAnswer?: string;
  } | null;
  onNext: () => void;
  isMultiplayer?: boolean;
  activePowerUps?: any[];
  isLastQuestion?: boolean;
  isShowcaseMode?: boolean;
}

export function QuizRoundResultModal({ 
  isOpen, 
  roundResult, 
  currentCard, 
  onNext,
  isMultiplayer = false,
  activePowerUps = [],
  isLastQuestion = false,
  isShowcaseMode = false
}: QuizRoundResultModalProps) {
  const [showExplanation, setShowExplanation] = useState(false);

  if (!isOpen || !roundResult || !currentCard) return null;

  // Handle different question types
  const isMatch = currentCard.questionType === 'match';
  const isFillBlank = currentCard.questionType === 'fill-blank';
  
  let correctAnswer = '';
  let playerAnswered = '';
  let opponentAnswered: string | null = null;

  if (isMatch) {
    // For match questions, we'll render pairs as a list (not a string)
    playerAnswered = roundResult.player1Correct ? 'All pairs matched correctly!' : 'Some pairs were incorrect';
  } else if (isFillBlank) {
    correctAnswer = roundResult.correctAnswer || currentCard.correctAnswer || '';
    playerAnswered = roundResult.player1Correct ? correctAnswer : 'Incorrect answer';
  } else {
    // Multiple choice or true/false - use correctAnswerIndex (normalized 0-based) or correctIndex
    const correctIdx = roundResult.correctAnswerIndex ?? roundResult.correctIndex;
    correctAnswer = roundResult.correctAnswer || currentCard.answers?.[correctIdx] || '';
    // Get player's answered text - use player1Answer index if available
    const playerAnswerIdx = roundResult.player1Answer;
    playerAnswered = (playerAnswerIdx !== undefined && currentCard.answers?.[playerAnswerIdx]) 
      ? currentCard.answers[playerAnswerIdx] 
      : (roundResult.player1Correct ? correctAnswer : '(No answer recorded)');
    opponentAnswered = roundResult.player2Answer !== undefined && currentCard.answers ? currentCard.answers[roundResult.player2Answer] : null;
  }

  const isCorrect = roundResult.player1Correct;
  const isBothCorrect = roundResult.player1Correct && roundResult.player2Correct === true;

  const handleExplainClick = () => {
    setShowExplanation(true);
  };

  const handleNextQuestion = () => {
    setShowExplanation(false);
    onNext();
  };

  return (
    <div className="fixed inset-0 bg-[var(--modal-overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
      <Card className="w-full max-w-2xl h-[90vh] flex flex-col bg-game-surface-base backdrop-blur-xl border border-primary/30 shadow-dialog">
        <CardContent className="p-4 sm:p-6 md:p-8 flex flex-col h-full overflow-hidden">
          {/* Fixed Result Header */}
          <div className="text-center mb-4 sm:mb-6 flex-shrink-0">
            <div className="text-5xl sm:text-7xl mb-2 sm:mb-4 animate-bounce motion-reduce:animate-none">
              {isCorrect ? '🎉' : '😔'}
            </div>
            <h2 className={`text-2xl sm:text-4xl font-bold mb-2 sm:mb-3 ${
              isCorrect ? 'text-success' : 'text-destructive'
            }`}>
              {isBothCorrect ? 'Both Correct!' : isCorrect ? 'Correct!' : 'Wrong Answer'}
            </h2>
            <p className="text-base sm:text-lg text-primary/70 dark:text-primary/70">
              {isCorrect ? 'Great job! Keep it up!' : 'Don\'t give up! Review and try again.'}
            </p>
          </div>

          {/* Question Display */}
          <div className="mb-4 p-3 sm:p-4 bg-primary/10 border border-primary/30 rounded-xl flex-shrink-0">
            <p className="text-xs sm:text-sm text-primary mb-2">Question:</p>
            <p className="text-sm sm:text-lg font-semibold text-foreground leading-relaxed">
              {currentCard.question}
            </p>
          </div>

          {/* Scrollable Content Area */}
          <ScrollArea className="flex-1 min-h-0 -mx-4 sm:-mx-6 md:-mx-8 px-4 sm:px-6 md:px-8">
            <div className="space-y-4 sm:space-y-6">
              {/* Correct Answer Display (for wrong answers) */}
              {!isCorrect && (
                <div className="p-3 sm:p-4 bg-primary/15 border-2 border-primary/50 rounded-xl">
                  <p className="text-xs sm:text-sm text-primary/70 mb-2">The correct answer was:</p>
                  {isMatch && (roundResult.correctMatchPairs || currentCard.matchPairs) ? (
                    <div className="space-y-2" data-testid="correct-answer-display">
                      <p className="text-sm sm:text-base font-semibold text-primary mb-2">Correct pairs:</p>
                      <div className="space-y-1.5">
                        {(roundResult.correctMatchPairs || currentCard.matchPairs || []).map((pair, index) => {
                          const rightText = pair.right || currentCard.rightItems?.find(item => item.originalIndex === index)?.text || '';
                          return (
                            <div key={index} className="text-sm sm:text-base text-primary/70 bg-primary/10 p-2 rounded-lg border border-primary/30">
                              <span className="font-medium">{pair.left}</span>
                              <span className="mx-2 text-primary">→</span>
                              <span>{rightText}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="text-lg sm:text-2xl font-bold text-primary break-words" data-testid="correct-answer-display">
                      {correctAnswer}
                    </p>
                  )}
                </div>
              )}
              
              {isCorrect && (
                <p className="text-base sm:text-lg text-primary/70 text-center">
                  Great job! Keep it up!
                </p>
              )}

              {/* Answer Details */}
              <div className="space-y-3 sm:space-y-4">
                {/* Player's Answer */}
                <div className={`p-3 sm:p-4 rounded-xl border-2 ${
                  roundResult.player1Correct 
                    ? 'bg-success/10 border-[var(--success)]/50' 
                    : 'bg-destructive/10 border-[var(--destructive)]/50'
                }`}>
                  <div className="flex items-center gap-2 sm:gap-3">
                    {roundResult.player1Correct ? (
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
                        <Check className="w-5 h-5 sm:w-6 sm:h-6 text-success" />
                      </div>
                    ) : (
                      <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                        <X className="w-5 h-5 sm:w-6 sm:h-6 text-destructive" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs sm:text-sm text-muted-foreground mb-1">You answered:</div>
                      <div className="text-sm sm:text-base text-foreground font-semibold break-words">{playerAnswered}</div>
                    </div>
                    <div className={`text-xl sm:text-2xl font-bold flex-shrink-0 ${
                      roundResult.player1Correct ? 'text-success' : 'text-destructive'
                    }`}>
                      {roundResult.player1Correct ? '+1' : '-1'}
                    </div>
                  </div>
                </div>

                {/* Opponent's Answer (for multiplayer) */}
                {isMultiplayer && opponentAnswered && (
                  <div className={`p-3 sm:p-4 rounded-xl border-2 ${
                    roundResult.player2Correct 
                      ? 'bg-primary/10 border-primary/50' 
                      : 'bg-muted/30 border-border'
                  }`}>
                    <div className="flex items-center gap-2 sm:gap-3">
                      {roundResult.player2Correct ? (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                          <Check className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-muted/20 flex items-center justify-center flex-shrink-0">
                          <X className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs sm:text-sm text-muted-foreground mb-1 flex items-center gap-2">
                          <Users className="w-3 h-3 sm:w-4 sm:h-4" />
                          Opponent answered:
                        </div>
                        <div className="text-sm sm:text-base text-foreground font-semibold break-words">{opponentAnswered}</div>
                      </div>
                      <div className={`text-xl sm:text-2xl font-bold flex-shrink-0 ${
                        roundResult.player2Correct ? 'text-primary' : 'text-muted-foreground'
                      }`}>
                        {roundResult.player2Correct ? '+1' : '-1'}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Score Summary */}
              {isMultiplayer ? (
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="text-center p-3 sm:p-4 bg-stats-surface-emphasis rounded-xl border border-primary/20">
                    <div className="text-xs sm:text-sm text-stats-label mb-1">Your Score</div>
                    <div className="text-2xl sm:text-3xl font-bold text-stats-number">{roundResult.player1Score}</div>
                  </div>
                  <div className="text-center p-3 sm:p-4 bg-stats-surface-emphasis rounded-xl border border-primary/20">
                    <div className="text-xs sm:text-sm text-stats-label mb-1">Opponent</div>
                    <div className="text-2xl sm:text-3xl font-bold text-stats-number">{roundResult.player2Score}</div>
                  </div>
                </div>
              ) : (
                <div className="text-center p-3 sm:p-4 bg-stats-surface-emphasis rounded-xl border border-primary/20">
                  <div className="text-xs sm:text-sm text-stats-label mb-1">Your Score</div>
                  <div className="text-2xl sm:text-3xl font-bold text-stats-number">{roundResult.player1Score}</div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Fixed Action Buttons Footer */}
          <div className="space-y-2 sm:space-y-3 mt-4 flex-shrink-0">
            {/* Explain Button */}
            {currentCard.id && (
              <Button onClick={handleExplainClick} className="w-full min-h-[48px] sm:min-h-[44px] h-auto py-2 sm:py-3 text-sm sm:text-base border-2 font-semibold rounded-xl transition-all duration-300 motion-reduce:transition-none" data-testid="button-explain" >
                <Lightbulb className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
                Explain Answer
              </Button>
            )}

            {/* Next Question / Complete Quiz Button */}
            <Button onClick={handleNextQuestion} className="w-full min-h-[48px] sm:min-h-[44px] h-auto py-3 sm:py-4 text-base sm:text-lg font-semibold rounded-xl shadow-elevated hover:shadow-[var(--game-glow)] transition-all duration-300 motion-reduce:transition-none" data-testid="button-next" >
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 mr-2 flex-shrink-0" />
              {isLastQuestion ? 'Complete Quiz' : 'Next Question'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Explanation Modal */}
      {currentCard.id && (
        <ExplanationModal
          isOpen={showExplanation}
          onClose={() => setShowExplanation(false)}
          cardId={currentCard.id}
          onNextQuestion={handleNextQuestion}
          isShowcaseMode={isShowcaseMode}
        />
      )}
    </div>
  );
}
