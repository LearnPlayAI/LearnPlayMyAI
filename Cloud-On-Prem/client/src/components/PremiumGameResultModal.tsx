import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Target, Zap, Star, Flame, Sparkles, Award, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getLevelFromXP, getLevelProgress, getLevelColor as getSharedLevelColor } from '@shared/levelUtils';
import { getThemeConfettiColors } from '@/lib/themePalettes';

// Confetti animation for wins
const Confetti = ({ colors = getThemeConfettiColors() }) => {
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 2,
    x: Math.random() * 100,
    rotation: Math.random() * 360,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none motion-reduce:hidden">
      {confettiPieces.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute w-3 h-3 rounded motion-reduce:animate-none"
          style={{
            backgroundColor: piece.color,
            left: `${piece.x}%`,
            top: '-10px'
          }}
          initial={{ y: -20, rotate: 0, scale: 0 }}
          animate={{ 
            y: window.innerHeight + 20,
            rotate: piece.rotation * 4,
            scale: [0, 1, 1, 0],
            x: [0, Math.random() * 100 - 50, Math.random() * 200 - 100]
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
};

// Floating particles for lose animation
const FloatingParticles = () => {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    delay: Math.random() * 2,
    duration: 4 + Math.random() * 2,
    x: Math.random() * 100,
    y: Math.random() * 100
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none motion-reduce:hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute w-1 h-1 bg-destructive/30 rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1, 0],
            opacity: [0, 0.6, 0],
            y: [-20, -60],
            x: [0, Math.random() * 40 - 20]
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
};

// Sparkle animation for ties
const SparkleAnimation = () => {
  const sparkles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    delay: Math.random() * 2,
    x: Math.random() * 100,
    y: Math.random() * 100,
    scale: 0.5 + Math.random() * 0.5
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none motion-reduce:hidden">
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className="absolute text-glow-gold"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`,
            fontSize: `${sparkle.scale}rem`
          }}
          initial={{ scale: 0, rotate: 0 }}
          animate={{ 
            scale: [0, 1, 0],
            rotate: [0, 180, 360],
            opacity: [0, 1, 0]
          }}
          transition={{
            duration: 2,
            delay: sparkle.delay,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        >
          ✨
        </motion.div>
      ))}
    </div>
  );
};

// Icon mapping helper
const getLevelIcon = (level: number) => {
  if (level >= 90) return Crown;
  if (level >= 70) return Trophy;
  if (level >= 50) return Award;
  if (level >= 30) return Shield;
  return Star;
};

// Re-export for consistency
const getLevelColor = getSharedLevelColor;

interface PremiumGameResultModalProps {
  isOpen: boolean;
  type: 'win' | 'lose' | 'tie' | 'victory' | 'game-over' | 'penalty' | null;
  gameResult?: 'win' | 'lose' | 'victory' | 'game-over' | 'penalty' | null;
  xpData?: {
    xpResult: any;
    playerStats: any;
    gameWon: boolean;
  } | null;
  userIsAuthenticated?: boolean;
  onBackToLobby?: () => void;
  onContinue?: () => void;
  
  // Round-specific props (from GameOverlay)
  cardsFromTie?: number;
  
  // Additional display props
  duration?: number;
  showContinueButton?: boolean;
  customMessage?: string | null;
  reason?: string | null;
}

export const PremiumGameResultModal: React.FC<PremiumGameResultModalProps> = ({
  isOpen,
  type,
  gameResult,
  xpData,
  userIsAuthenticated = false,
  onBackToLobby,
  onContinue,
  cardsFromTie = 0,
  duration = 3000,
  showContinueButton = false,
  customMessage = null,
  reason = null
}) => {
  const [currentXP, setCurrentXP] = useState(0);
  const [animationPhase, setAnimationPhase] = useState('entering');
  const [showLevelChange, setShowLevelChange] = useState(false);
  const [showText, setShowText] = useState(false);

  // Determine if this is a round result or final game result
  const isRoundResult = type && !gameResult;
  const isFinalResult = gameResult || type === 'victory' || type === 'game-over';
  const resultType = gameResult || type;

  // Show text after brief delay for impact
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => setShowText(true), 300);
      return () => clearTimeout(timer);
    } else {
      setShowText(false);
    }
  }, [isOpen]);

  // XP Animation for final results
  useEffect(() => {
    if (!isOpen || !isFinalResult || !userIsAuthenticated || !xpData?.xpResult) {
      return;
    }

    const startingXP = xpData.xpResult.newXP - xpData.xpResult.totalXPChange;
    setCurrentXP(startingXP);
    setAnimationPhase('entering');
    setShowLevelChange(false); // Reset level change banner

    const timer1 = setTimeout(() => {
      setAnimationPhase('xp-gain');
      
      const duration = 2000;
      const steps = 60;
      const increment = xpData.xpResult.totalXPChange / steps;
      let step = 0;
      
      const xpTimer = setInterval(() => {
        step++;
        const newXP = startingXP + (increment * step);
        setCurrentXP(Math.round(newXP));
        
        if (step >= steps) {
          clearInterval(xpTimer);
          setCurrentXP(xpData.xpResult.newXP);
          
          if (xpData.xpResult.levelChanged) {
            setTimeout(() => setShowLevelChange(true), 500);
          }
          
          setTimeout(() => {
            setAnimationPhase('complete');
          }, xpData.xpResult.levelChanged ? 2000 : 1000);
        }
      }, duration / steps);
    }, 800);

    return () => clearTimeout(timer1);
  }, [isOpen, isFinalResult, xpData, userIsAuthenticated]);

  // Auto-close for round results
  useEffect(() => {
    if (isOpen && isRoundResult && !showContinueButton) {
      const timer = setTimeout(() => {
        if (onContinue) onContinue();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isRoundResult, showContinueButton, duration, onContinue]);

  const getDisplayContent = () => {
    switch (resultType) {
      case 'win':
        if (isRoundResult) {
          const intuitive_cards_won = cardsFromTie > 0 ? cardsFromTie + 1 : 1;
          const winSubtitle = cardsFromTie > 0 
            ? `+${intuitive_cards_won} Cards Won (${cardsFromTie} from ties!)`
            : `+${intuitive_cards_won} Card Won`;
          return {
            title: "Round Won!",
            subtitle: winSubtitle,
            icon: Trophy,
            bgGradient: "from-[var(--success)]/30",
            textColor: "text-success",
            iconColor: "text-glow-gold",
            glowColor: "shadow-[var(--success)]/50",
            showConfetti: true
          };
        } else {
          return {
            title: "You Won!",
            subtitle: customMessage || (userIsAuthenticated ? "Great job! XP earned!" : "Well played!"),
            icon: Trophy,
            bgGradient: "from-[var(--success)]/30",
            textColor: "text-success",
            iconColor: "text-glow-gold",
            glowColor: "shadow-[var(--success)]/50",
            showConfetti: true
          };
        }
      
      case 'lose':
        if (isRoundResult) {
          const intuitive_cards_lost = cardsFromTie > 0 ? cardsFromTie + 1 : 1;
          const loseSubtitle = cardsFromTie > 0
            ? `-${intuitive_cards_lost} Cards Lost (including ${cardsFromTie} from ties)`
            : `-${intuitive_cards_lost} Card Lost`;
          return {
            title: "Round Lost",
            subtitle: loseSubtitle,
            icon: Target,
            bgGradient: "from-[var(--destructive)]/30",
            textColor: "text-destructive",
            iconColor: "text-destructive",
            glowColor: "shadow-[var(--destructive)]/50",
            showConfetti: false
          };
        } else {
          return {
            title: "You Lost",
            subtitle: userIsAuthenticated ? "Better luck next time!" : "Try again!",
            icon: Target,
            bgGradient: "from-[var(--destructive)]/30",
            textColor: "text-destructive",
            iconColor: "text-destructive",
            glowColor: "shadow-[var(--destructive)]/50",
            showConfetti: false
          };
        }
      
      case 'tie':
        return {
          title: "It's a Tie!",
          subtitle: "Cards stay in play",
          icon: Sparkles,
          bgGradient: "from-[var(--action-secondary)]/30",
          textColor: "text-secondary",
          iconColor: "text-glow-gold",
          glowColor: "shadow-elevated",
          showConfetti: false
        };
      
      case 'victory':
        return {
          title: "VICTORY!",
          subtitle: customMessage || "You conquered all cards!",
          icon: Crown,
          bgGradient: "from-[var(--game-gold)]/40",
          textColor: "text-glow-gold",
          iconColor: "text-glow-gold",
          glowColor: "shadow-[var(--game-gold)]/50",
          showConfetti: true
        };
      
      case 'game-over':
        return {
          title: "Game Over",
          subtitle: customMessage || (userIsAuthenticated ? "Better luck next time!" : "Try again!"),
          icon: Zap,
          bgGradient: "from-[var(--surface-muted)]/30",
          textColor: "text-muted-foreground",
          iconColor: "text-muted-foreground",
          glowColor: "shadow-[var(--surface-muted)]/50",
          showConfetti: false
        };
      
      case 'penalty':
        return {
          title: "Game Abandoned",
          subtitle: customMessage || "Penalty applied for leaving early",
          icon: Shield,
          bgGradient: "from-[var(--warning)]/30",
          textColor: "text-warning",
          iconColor: "text-destructive",
          glowColor: "shadow-[var(--warning)]/50",
          showConfetti: false
        };
      
      default:
        return null;
    }
  };

  if (!isOpen || !resultType) return null;

  const content = getDisplayContent();
  if (!content) return null;

  const IconComponent = content.icon;

  // XP display data for authenticated users
  let xpDisplayData = null;
  if (isFinalResult && userIsAuthenticated && xpData?.xpResult && xpData?.playerStats) {
    // Always calculate level from current XP for accurate animation display
    const playerLevel = getLevelFromXP(currentXP || xpData.xpResult.newXP);
    const currentLevelData = getLevelProgress(currentXP || xpData.xpResult.newXP, playerLevel);
    const LevelIcon = getLevelIcon(playerLevel);
    
    xpDisplayData = {
      xpResult: xpData.xpResult,
      playerStats: xpData.playerStats,
      currentLevelData,
      LevelIcon,
      playerLevel
    };
  }

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 z-[100] flex items-center justify-center  ${content.bgGradient} backdrop-blur-sm px-2 sm:px-4`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Background animations */}
        {content.showConfetti && <Confetti />}
        {resultType === 'lose' && <FloatingParticles />}
        {resultType === 'tie' && <SparkleAnimation />}
        
        {/* Main modal */}
        <motion.div
          className="relative w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl max-h-[90vh] overflow-y-auto"
          initial={{ scale: 0, rotateY: 180 }}
          animate={{ scale: 1, rotateY: 0 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{
            type: "spring",
            damping: 15,
            stiffness: 200,
            duration: 0.6
          }}
        >
          <Card className={`bg-[var(--modal-bg)] border-2 border-[var(--modal-border)] backdrop-blur-xl ${content.glowColor} shadow-dialog overflow-hidden`}>
            <CardContent className="p-4 sm:p-6 md:p-8 text-center space-y-4 sm:space-y-6">
              
              {/* Result Header */}
              <motion.div
                className="space-y-4"
                initial={{ y: -30, opacity: 0 }}
                animate={showText ? { y: 0, opacity: 1 } : { y: -30, opacity: 0 }}
                transition={{ delay: 0.3, type: "spring", damping: 20 }}
              >
                <motion.div 
                  className={`w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full flex items-center justify-center  ${content.showConfetti ? 'from-[var(--success)]/20' : 'from-[var(--destructive)]/20'} border-2 border-[var(--modal-border)]`}
                  animate={{ 
                    scale: [1, 1.1, 1],
                    rotate: content.showConfetti ? [0, 5, -5, 0] : 0
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  <IconComponent className={`w-8 h-8 sm:w-10 sm:h-10 ${content.iconColor} drop-shadow-elevated`} />
                </motion.div>
                
                <div>
                  <motion.h1 
                    className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black ${content.textColor} mb-2 sm:mb-3 drop-shadow-elevated`}
                    animate={{ 
                      textShadow: content.showConfetti 
                        ? ["0 0 20px var(--success)", "0 0 30px var(--game-gold)", "0 0 20px var(--success)"]
                        : "0 0 10px color-mix(in srgb, var(--modal-fg) 40%, transparent)"
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    {content.title}
                  </motion.h1>
                  <motion.p 
                    className="text-sm sm:text-base md:text-lg text-modal-foreground font-medium"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5 }}
                  >
                    {content.subtitle}
                  </motion.p>
                </div>
              </motion.div>

              {/* XP Information for Final Results */}
              {isFinalResult && xpDisplayData && (
                <motion.div
                  className="space-y-6"
                  initial={{ y: 30, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  {/* XP Change Summary */}
                  <div className="p-4 sm:p-6 bg-[var(--game-xp)]/10 rounded-xl border border-[var(--game-xp)]/30 backdrop-blur-sm">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm sm:text-base md:text-lg text-[var(--modal-fg)]/80 font-medium">Total XP Change</span>
                      <motion.span 
                        className={`text-xl sm:text-2xl font-black ${xpDisplayData.xpResult.totalXPChange >= 0 ? 'text-[var(--game-xp)]' : 'text-destructive'}`}
                        animate={{ 
                          scale: animationPhase === 'xp-gain' ? [1, 1.2, 1] : 1 
                        }}
                        transition={{ duration: 0.5, repeat: animationPhase === 'xp-gain' ? Infinity : 0 }}
                      >
                        {animationPhase === 'entering' ? '...' : (xpDisplayData.xpResult.totalXPChange >= 0 ? '+' : '')}{animationPhase === 'entering' ? '' : xpDisplayData.xpResult.totalXPChange}
                      </motion.span>
                    </div>
                    
                    {/* Base XP Breakdown */}
                    <div className="space-y-2">
                      {xpDisplayData.xpResult.baseXP !== 0 && (
                        <motion.div 
                          className="flex justify-between items-center text-xs sm:text-sm md:text-base border-t border-[var(--modal-border)]/50 pt-3"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 1.0, type: "spring" }}
                        >
                          <span className="text-[var(--modal-fg)]/70">
                            {xpDisplayData.xpResult.baseXP > 0 ? 'Game Win' : 'Game Loss'}
                          </span>
                          <span className={`font-semibold ${xpDisplayData.xpResult.baseXP > 0 ? 'text-[var(--game-xp)]' : 'text-destructive'}`}>
                            {xpDisplayData.xpResult.baseXP > 0 ? '+' : ''}{xpDisplayData.xpResult.baseXP}
                          </span>
                        </motion.div>
                      )}
                      
                      {xpDisplayData.xpResult.roundXP > 0 && (
                        <motion.div 
                          className="flex justify-between items-center text-xs sm:text-sm md:text-base border-t border-[var(--modal-border)]/50 pt-3"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 1.1, type: "spring" }}
                        >
                          <span className="text-[var(--modal-fg)]/70 flex items-center gap-2">
                            <Trophy className="w-4 h-4 text-glow-gold" />
                            Round Wins
                          </span>
                          <span className="font-semibold text-[var(--game-xp)]">+{xpDisplayData.xpResult.roundXP}</span>
                        </motion.div>
                      )}
                      
                      {xpDisplayData.xpResult.streakBonus > 0 && (
                        <motion.div 
                          className="flex justify-between items-center text-xs sm:text-sm md:text-base border-t border-[var(--modal-border)]/50 pt-3"
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 1.2, type: "spring" }}
                        >
                          <span className="text-[var(--modal-fg)]/70 flex items-center gap-2">
                            <Flame className="w-4 h-4 text-warning" />
                            Win Streak Bonus
                          </span>
                          <span className="font-semibold text-warning">+{xpDisplayData.xpResult.streakBonus}</span>
                        </motion.div>
                      )}
                    </div>
                  </div>

                  {/* Current Level and Progress */}
                  <div className="space-y-4">
                    <motion.div 
                      className="flex items-center justify-center gap-4"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.8, type: "spring" }}
                    >
                      <xpDisplayData.LevelIcon className={`w-8 h-8 ${getLevelColor(xpDisplayData.playerLevel)}`} />
                      <Badge variant="secondary" className="px-3 sm:px-4 md:px-6 py-1 sm:py-2 text-sm sm:text-base md:text-lg font-bold">
                        Level {xpDisplayData.playerLevel}
                      </Badge>
                    </motion.div>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm sm:text-base md:text-lg font-medium">
                        <span className="text-modal-foreground">XP: {currentXP.toLocaleString()}</span>
                        <span className="text-[var(--modal-fg)]/70">
                          {xpDisplayData.currentLevelData.progress < 100 ? `${Math.round(xpDisplayData.currentLevelData.progress)}% to Level ${xpDisplayData.currentLevelData.nextLevel}` : 'Max Level!'}
                        </span>
                      </div>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: "100%" }}
                        transition={{ delay: 1, duration: 1 }}
                      >
                        <Progress 
                          value={xpDisplayData.currentLevelData.progress} 
                          className="h-4 bg-foreground/10 border border-foreground/20"
                        />
                      </motion.div>
                    </div>
                  </div>

                  {/* Level Change Animation */}
                  {showLevelChange && xpDisplayData.xpResult.levelChanged && (
                    <motion.div
                      className="p-4 sm:p-6 rounded-xl border-2 bg-[var(--game-gold)]/20 border-[var(--game-gold)]/50 text-glow-gold motion-reduce:animate-none motion-reduce:transition-none"
                      initial={{ scale: 0, rotate: -10 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: "spring", damping: 10 }}
                    >
                      <div className="flex items-center justify-center gap-2 sm:gap-3 font-bold text-base sm:text-lg md:text-xl">
                        <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
                        LEVEL UP!
                      </div>
                      <p className="text-xs sm:text-sm md:text-base lg:text-lg mt-2 font-medium">
                        Level {xpDisplayData.xpResult.previousLevel} → Level {xpDisplayData.xpResult.newLevel}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Action Buttons */}
              <motion.div
                className="pt-4 motion-reduce:animate-none motion-reduce:transition-none"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: isFinalResult ? 1.5 : 0.8 }}
              >
                {isFinalResult && onBackToLobby && (
                  <Button onClick={onBackToLobby} className="w-full min-h-[48px] sm:min-h-[44px] py-3 sm:py-4 text-base sm:text-lg font-bold border-2 shadow-elevated transition-all duration-300 transform hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none" data-testid="button-back-to-lobby" >
                    Back to Lobby
                  </Button>
                )}
                
                {isRoundResult && showContinueButton && onContinue && (
                  <Button onClick={onContinue} className="w-full min-h-[48px] sm:min-h-[44px] py-3 sm:py-4 text-base sm:text-lg font-bold border-2 shadow-elevated transition-all duration-300 transform hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none" data-testid="button-continue-game" >
                    Continue
                  </Button>
                )}
              </motion.div>

            </CardContent>
          </Card>

          {/* Pulsing border effect for major events */}
          {(resultType === 'victory' || resultType === 'game-over') && (
            <motion.div
              className="absolute inset-0 border-2 border-foreground/20 rounded-lg pointer-events-none motion-reduce:hidden"
              animate={{
                scale: [1, 1.02, 1],
                opacity: [0.3, 0.6, 0.3]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut"
              }}
            />
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default PremiumGameResultModal;
