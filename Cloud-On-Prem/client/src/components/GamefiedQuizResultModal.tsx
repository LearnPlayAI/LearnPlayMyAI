import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Trophy,
  Star,
  Zap,
  Award,
  Sparkles,
  Home,
  RotateCcw,
  Crown,
  Target,
  Flame,
  Swords,
  UserPlus,
  BookOpen,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { getLevelIconType, getLevelProgress, getXPForLevel } from '@shared/levelUtils';
import { getThemeConfettiColors } from '@/lib/themePalettes';

interface GamefiedQuizResultModalProps {
  open: boolean;
  onClose: () => void;
  playerScore: number;
  aiScore: number | null;
  totalQuestions: number;
  quizId?: string;
  lessonId?: string;
  courseId?: string;
  nextLessonId?: string;
  lessonTitle?: string;
  xpResult?: {
    baseXP: number;
    roundXP: number;
    streakBonus: number;
    quizPassBonus?: number;
    quizPerfectBonus?: number;
    totalXPChange: number;
    newXP: number;
    previousLevel: number;
    newLevel: number;
    levelChanged: boolean;
    wasPromotion: boolean;
    quizPassed?: boolean;
    quizPercentage?: number;
    requiredPassPercentage?: number;
    xpMultiplier?: number;
    seasonPassXPMultiplier?: number;
    combinedXPMultiplier?: number;
    powerUpXPMultiplier?: number;
    coinMultiplier?: number;
    seasonPassCoinMultiplier?: number;
    combinedCoinMultiplier?: number;
    powerUpCoinMultiplier?: number;
    coinsEarned?: number;
  };
  onPlayAgain?: () => void;
  user?: any;
  onNavigate?: (path: string) => void;
  isShowcaseMode?: boolean;
  variant?: 'dialog' | 'inline';
}

const Confetti = () => {
  const confettiPalette = getThemeConfettiColors();
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1200;
  const confettiPieces = Array.from({ length: 40 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.4,
    duration: 1.8 + Math.random() * 0.8,
    x: Math.random() * 100,
    rotation: Math.random() * 360,
    color: confettiPalette[Math.floor(Math.random() * confettiPalette.length)],
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {confettiPieces.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute w-2 h-2 rounded"
          style={{
            backgroundColor: piece.color,
            left: `${piece.x}%`,
            top: '-10px',
          }}
          initial={{ y: -20, rotate: 0, scale: 0 }}
          animate={{
            y: viewportHeight + 20,
            rotate: piece.rotation * 3,
            scale: [0, 1, 1, 0],
            x: [0, Math.random() * 80 - 40, Math.random() * 150 - 75],
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  );
};

const getLevelIcon = (level: number) => {
  const iconType = getLevelIconType(level);
  switch (iconType) {
    case 'crown':
      return Crown;
    case 'trophy':
      return Trophy;
    case 'award':
      return Award;
    default:
      return Star;
  }
};

export function GamefiedQuizResultModal({
  open,
  onClose,
  playerScore,
  aiScore,
  totalQuestions,
  lessonId,
  courseId,
  nextLessonId,
  xpResult,
  onPlayAgain,
  user,
  onNavigate,
  isShowcaseMode = false,
  variant = 'dialog',
}: GamefiedQuizResultModalProps) {
  const [showXPBreakdown, setShowXPBreakdown] = useState(false);
  const [showSecondaryStats, setShowSecondaryStats] = useState(false);

  const isSinglePlayer = aiScore === null;
  const percentage = totalQuestions > 0 ? (playerScore / totalQuestions) * 100 : 0;
  const passed = xpResult?.quizPassed ?? false;
  const requiredPercentage = xpResult?.requiredPassPercentage ?? 70;
  const levelChanged = xpResult?.wasPromotion ?? false;
  const LevelIcon = getLevelIcon(xpResult?.newLevel || 1);
  const normalizedXP = Number(xpResult?.newXP ?? 0);
  const currentLevel = Math.max(1, Number(xpResult?.newLevel ?? 1));
  const safeXP = Number.isFinite(normalizedXP) ? normalizedXP : 0;
  const levelFloorXP = getXPForLevel(currentLevel);
  const earnedXP = Math.max(0, Number(xpResult?.totalXPChange ?? 0));
  const displayedXP = xpResult && earnedXP > 0 && safeXP < levelFloorXP
    ? levelFloorXP + earnedXP
    : safeXP;
  const levelProgress = getLevelProgress(displayedXP, currentLevel);
  const levelProgressWidth = Math.max(
    0,
    Math.min(100, Number.isFinite(levelProgress.progress) ? levelProgress.progress : 0),
  );
  const hasAnyMultipliers =
    (xpResult?.xpMultiplier ?? 1) > 1 ||
    (xpResult?.seasonPassXPMultiplier ?? 1) > 1 ||
    (xpResult?.coinMultiplier ?? 1) > 1 ||
    (xpResult?.seasonPassCoinMultiplier ?? 1) > 1;

  useEffect(() => {
    if (open && xpResult) {
      setTimeout(() => setShowXPBreakdown(true), 400);
      setShowSecondaryStats(false);
    } else {
      setShowXPBreakdown(false);
      setShowSecondaryStats(false);
    }
  }, [open, xpResult]);

  if (!open) return null;

  const getPassFailMessage = () => {
    if (!xpResult) return '';
    if (percentage === 100) return 'Perfect score. Outstanding mastery.';
    if (passed && percentage >= 90) return 'Excellent performance.';
    if (passed && percentage >= 80) return 'Great result.';
    if (passed) return 'You passed this quiz.';
    return `Keep practicing. You need ${requiredPercentage}% to pass.`;
  };

  const getEncouragingMessage = () => {
    if (percentage === 100) return 'Perfect execution. You are unstoppable.';
    if (passed && percentage >= 90) return 'Amazing work. You are ready for the next challenge.';
    if (passed) return 'Great progress. Keep moving.';
    if (percentage >= 60) return "You're close. One more focused attempt can get you there.";
    return 'Every quiz improves mastery. Review and try again.';
  };

  const primaryAction = passed && nextLessonId && onNavigate
    ? {
        label: 'Continue to Next Lesson',
        icon: BookOpen,
        onClick: () => onNavigate(`/lessons/${nextLessonId}${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`),
        testId: 'button-continue-next-lesson',
        className:
          'bg-success text-btn-primary-foreground',
      }
    : !passed && lessonId && onNavigate
    ? {
        label: 'Review Lesson Material',
        icon: RotateCcw,
        onClick: () => onNavigate(`/lessons/${lessonId}${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ''}`),
        testId: 'button-review-lesson',
        className:
          'bg-warning text-warning-foreground',
      }
    : courseId && onNavigate
    ? {
        label: 'Back to Course',
        icon: Home,
        onClick: () => onNavigate(`/courses/${courseId}`),
        testId: 'button-back-to-course',
        className:
          'bg-primary hover:bg-primary/90 text-btn-primary-foreground',
      }
    : {
        label: 'Back to Lobby',
        icon: Home,
        onClick: onClose,
        testId: 'button-back-lobby',
        className:
          'bg-primary hover:bg-primary/90 text-btn-primary-foreground',
      };

  const ResultContent = (
    <div className="relative">
      {passed && <Confetti />}

      <div className={`${variant === 'inline' ? 'px-3 pt-3 md:px-6 md:pt-6 pb-28' : 'p-3 sm:p-4 md:p-6 lg:p-8'}`}>
        <div className="max-w-6xl mx-auto space-y-4 md:space-y-6">
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="text-center"
          >
            <div
              className="inline-flex p-3 sm:p-4 rounded-full mb-3"
              style={{
                background: passed
                  ? 'linear-gradient(135deg, var(--game-success), var(--game-gold))'
                  : 'linear-gradient(135deg, var(--timer-warning), var(--timer-critical))',
                boxShadow: passed ? '0 0 20px var(--game-gold)' : '0 0 12px var(--timer-warning)',
              }}
            >
              {passed ? <Trophy className="w-10 h-10 sm:w-12 sm:h-12 text-foreground" /> : <Target className="w-10 h-10 sm:w-12 sm:h-12 text-foreground" />}
            </div>
            <h2
              className="text-2xl sm:text-3xl font-bold"
              style={{ color: passed ? 'var(--game-success)' : 'var(--timer-warning)' }}
            >
              {passed ? 'Quiz Passed' : 'Quiz Complete'}
            </h2>
            <p className="text-sm sm:text-base text-primary/85 mt-1">{getPassFailMessage()}</p>
          </motion.div>

          <div className={`grid ${isSinglePlayer ? 'grid-cols-2' : 'grid-cols-3'} gap-2 sm:gap-3`}>
            <Card className={`bg-stats-surface-emphasis border border-primary/20 ${passed ? 'ring-1 ring-[var(--success)]/50' : ''}`}>
              <CardContent className="p-3">
                <div className="text-xs text-stats-label">Your Score</div>
                <div className="text-2xl font-bold text-stats-number">{playerScore}</div>
                <div className="text-xs text-muted-foreground">out of {totalQuestions}</div>
              </CardContent>
            </Card>

            <Card className="bg-stats-surface-emphasis border border-primary/20">
              <CardContent className="p-3">
                <div className="text-xs text-stats-label">Percentage</div>
                <div
                  className={`text-2xl font-bold ${
                    percentage >= 90
                      ? 'text-glow-gold'
                      : percentage >= requiredPercentage
                      ? 'text-stats-number'
                      : 'text-warning'
                  }`}
                >
                  {Math.round(percentage)}%
                </div>
                <div className="text-xs text-muted-foreground">{passed ? 'Passed' : `Need ${requiredPercentage}%`}</div>
              </CardContent>
            </Card>

            {!isSinglePlayer && (
              <Card className="bg-stats-surface-emphasis border border-primary/20 col-span-2 sm:col-span-1">
                <CardContent className="p-3">
                  <div className="text-xs text-stats-label">Opponent</div>
                  <div className="text-2xl font-bold text-stats-number">{aiScore}</div>
                  <div className="text-xs text-muted-foreground">score</div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <div className="lg:col-span-2 space-y-3">
              {xpResult && (
                <Card className="bg-stats-surface-emphasis border border-primary/20">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Zap className="w-4 h-4 text-stats-icon-accent" />
                        <h3 className="text-lg font-bold">XP Earned</h3>
                      </div>
                      <div className="text-3xl font-bold text-stats-number">+{xpResult.totalXPChange}</div>
                    </div>

                    <AnimatePresence>
                      {showXPBreakdown && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="space-y-1.5 text-sm"
                        >
                          {xpResult.baseXP !== 0 && (
                            <div className="flex items-center justify-between"><span className="text-muted-foreground">Base XP</span><span>+{xpResult.baseXP}</span></div>
                          )}
                          {xpResult.roundXP > 0 && (
                            <div className="flex items-center justify-between"><span className="text-muted-foreground">Correct Answers</span><span>+{xpResult.roundXP}</span></div>
                          )}
                          {xpResult.quizPassBonus && (
                            <div className="flex items-center justify-between rounded px-2 py-1 bg-primary/15"><span className="font-medium">Pass Bonus</span><span className="font-semibold">+{xpResult.quizPassBonus}</span></div>
                          )}
                          {xpResult.quizPerfectBonus && (
                            <div className="flex items-center justify-between rounded px-2 py-1 bg-[var(--game-gold)]/15"><span className="font-medium">Perfect Bonus</span><span className="font-semibold">+{xpResult.quizPerfectBonus}</span></div>
                          )}
                          {xpResult.streakBonus > 0 && (
                            <div className="flex items-center justify-between rounded px-2 py-1 bg-warning/15"><span className="font-medium">Streak Bonus</span><span className="font-semibold">+{xpResult.streakBonus}</span></div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              )}

              {xpResult && xpResult.coinsEarned && xpResult.coinsEarned > 0 && (
                <Card className="bg-stats-surface-emphasis border border-[var(--game-gold)]/30">
                  <CardContent className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-glow-gold" />
                      <h3 className="text-lg font-bold">Coins Earned</h3>
                    </div>
                    <div className="text-3xl font-bold text-stats-number">+{xpResult.coinsEarned}</div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-3">
              {xpResult && (
                <Card className="bg-card/50 border border-border">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <LevelIcon className="w-4 h-4 text-primary" />
                        <span className="text-sm">Level {xpResult.newLevel}</span>
                      </div>
                      {levelChanged && <Badge className="text-xs">Level Up</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${levelProgressWidth}%` }}
                          transition={{ duration: 0.8 }}
                          className="h-full bg-primary hover:bg-primary/90"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground min-w-[110px] text-right">
                        {levelProgress.xpInCurrentLevel}/{levelProgress.xpNeededForNextLevel} XP
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-card/40 border border-border">
                <CardContent className="p-3">
                  <button
                    onClick={() => setShowSecondaryStats((v) => !v)}
                    className="w-full flex items-center justify-between text-sm font-medium"
                    data-testid="button-toggle-secondary-stats"
                  >
                    <span>More Details</span>
                    {showSecondaryStats ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showSecondaryStats && (
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div>Pass Requirement: {requiredPercentage}%</div>
                      <div>Your Result: {Math.round(percentage)}% ({passed ? 'Passed' : 'Not Passed'})</div>
                      {xpResult?.powerUpXPMultiplier && xpResult.powerUpXPMultiplier > 1 && <div>Power-Up XP Multiplier: {xpResult.powerUpXPMultiplier}x</div>}
                      {xpResult?.seasonPassXPMultiplier && xpResult.seasonPassXPMultiplier > 1 && <div>Season Pass XP Multiplier: {xpResult.seasonPassXPMultiplier}x</div>}
                      {xpResult?.combinedXPMultiplier && xpResult.combinedXPMultiplier > 1 && <div>Combined XP Multiplier: {xpResult.combinedXPMultiplier}x</div>}
                      {xpResult?.powerUpCoinMultiplier && xpResult.powerUpCoinMultiplier > 1 && <div>Power-Up Coin Multiplier: {xpResult.powerUpCoinMultiplier}x</div>}
                      {xpResult?.seasonPassCoinMultiplier && xpResult.seasonPassCoinMultiplier > 1 && <div>Season Pass Coin Multiplier: {xpResult.seasonPassCoinMultiplier}x</div>}
                      {xpResult?.combinedCoinMultiplier && xpResult.combinedCoinMultiplier > 1 && <div>Combined Coin Multiplier: {xpResult.combinedCoinMultiplier}x</div>}
                      {!hasAnyMultipliers && <div>No active multipliers were applied on this run.</div>}
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>

          <p className="text-center text-sm sm:text-base text-primary/80">{getEncouragingMessage()}</p>

          {(isShowcaseMode || (user && !user.isAuthenticated)) && onNavigate && (
            <Card className="bg-warning/30 border border-[var(--warning)]/50">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl">🎮</div>
                  <div className="flex-1">
                    <h3 className="font-bold text-warning mb-1">Save Your Progress</h3>
                    <p className="text-sm text-warning/90 mb-3">Create an account to keep XP, achievements, and unlock additional game modes.</p>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button onClick={() => onNavigate('/register')} data-testid="button-register-prompt" className="flex-1">
                        <UserPlus className="w-4 h-4 mr-2" />
                        Create Free Account
                      </Button>
                      <Button onClick={() => onNavigate('/login')} variant="outline" className="flex-1" data-testid="button-login-prompt">
                        Sign In
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className={`${variant === 'inline' ? 'fixed bottom-0 left-0 right-0 z-40' : 'sticky bottom-0'} border-t border-primary/20 bg-game-surface-base/95 backdrop-blur p-3`}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row gap-2">
          <Button onClick={primaryAction.onClick} className={`flex-1 h-11 sm:h-12 font-semibold ${primaryAction.className}`} data-testid={primaryAction.testId} >
            <primaryAction.icon className="w-4 h-4 mr-2" />
            {primaryAction.label}
          </Button>

          {onPlayAgain && (
            <Button onClick={onPlayAgain} variant="outline" className="h-11 sm:h-12" data-testid="button-play-again" >
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
          )}

          <Button onClick={onClose} variant="outline" className="h-11 sm:h-12" data-testid="button-back-lobby" >
            <Home className="w-4 h-4 mr-2" />
            Back to Lobby
          </Button>
        </div>
      </div>
    </div>
  );

  if (variant === 'inline') {
    return <div className="min-h-screen bg-[var(--quiz-lobby-bg)]">{ResultContent}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[95vh] overflow-x-hidden overflow-y-auto border border-primary/30 p-0 bg-game-surface-base">
        <DialogTitle className="sr-only">Quiz Results</DialogTitle>
        <DialogDescription className="sr-only">Your quiz completion results including score, XP earned, and certificate information</DialogDescription>
        {ResultContent}
      </DialogContent>
    </Dialog>
  );
}
