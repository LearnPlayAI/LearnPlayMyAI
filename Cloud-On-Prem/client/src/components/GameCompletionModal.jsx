import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Target, Crown, Zap, Star, Flame, Award, Shield } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getLevelFromXP, getLevelProgress, getLevelColor } from '@shared/levelUtils';
import { getThemeConfettiColors } from '@/lib/themePalettes';

// Confetti animation for wins
const Confetti = ({ colors = getThemeConfettiColors() }) => {
  const confettiPieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    delay: Math.random() * 2,
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
          className="absolute w-2 h-2 rounded motion-reduce:animate-none"
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

const GameCompletionModal = ({ 
  isOpen, 
  gameResult, // 'win', 'lose', 'victory', 'game-over' 
  xpData, // { xpResult, playerStats, gameWon } - null for guests
  onBackToLobby,
  userIsAuthenticated = false
}) => {
  const [currentXP, setCurrentXP] = useState(0);
  const [animationPhase, setAnimationPhase] = useState('entering');
  const [showLevelChange, setShowLevelChange] = useState(false);
  
  if (!isOpen) return null;

  const getLevelIcon = (level) => {
    if (level >= 90) return Crown;
    if (level >= 70) return Trophy;
    if (level >= 50) return Award;
    if (level >= 30) return Shield;
    return Star;
  };

  // Determine display content based on game result
  const getDisplayContent = () => {
    const isWin = gameResult === 'win' || gameResult === 'victory';
    const isGameEnd = gameResult === 'victory' || gameResult === 'game-over';
    
    if (gameResult === 'victory') {
      return {
        title: "VICTORY!",
        subtitle: "You conquered all cards!",
        icon: Crown,
        bgColor: "bg-[var(--game-gold)]/30",
        textColor: "text-glow-gold",
        iconColor: "text-glow-gold",
        showConfetti: true
      };
    } else if (gameResult === 'win') {
      return {
        title: "You Won!",
        subtitle: userIsAuthenticated ? "Great job! XP earned!" : "Well played!",
        icon: Trophy,
        bgColor: "bg-success/20",
        textColor: "text-success",
        iconColor: "text-glow-gold",
        showConfetti: true
      };
    } else if (gameResult === 'game-over') {
      return {
        title: "Game Over",
        subtitle: userIsAuthenticated ? "Better luck next time!" : "Try again!",
        icon: Zap,
        bgColor: "bg-muted/30",
        textColor: "text-muted-foreground",
        iconColor: "text-muted-foreground",
        showConfetti: false
      };
    } else { // lose
      return {
        title: "You Lost",
        subtitle: userIsAuthenticated ? "Better luck next time!" : "Try again!",
        icon: Target,
        bgColor: "bg-destructive/20",
        textColor: "text-destructive",
        iconColor: "text-destructive",
        showConfetti: false
      };
    }
  };

  const content = getDisplayContent();
  const IconComponent = content.icon;
  
  // XP Animation Effect
  useEffect(() => {
    console.log('🌟 XP Animation useEffect triggered:', {
      isOpen,
      userIsAuthenticated,
      hasXPData: !!xpData,
      hasXPResult: !!xpData?.xpResult,
      xpData
    });
    
    if (!isOpen || !userIsAuthenticated || !xpData?.xpResult) {
      console.log('🌟 XP Animation skipped - conditions not met');
      return;
    }

    console.log('🌟 Starting XP animation with data:', xpData.xpResult);
    const startingXP = xpData.xpResult.newXP - xpData.xpResult.totalXPChange;
    setCurrentXP(startingXP);
    setAnimationPhase('entering');
    setShowLevelChange(false); // Reset level change banner

    // Animation sequence
    const timer1 = setTimeout(() => {
      console.log('🌟 XP Animation phase: xp-gain');
      setAnimationPhase('xp-gain');
      
      // Animate XP gain
      const duration = 2000; // 2 seconds
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
          console.log('🌟 XP Animation completed. Final XP:', xpData.xpResult.newXP);
          
          // Show level change if applicable
          if (xpData.xpResult.levelChanged) {
            console.log('🌟 Showing level change animation');
            setTimeout(() => {
              setShowLevelChange(true);
            }, 500);
          }
          
          setTimeout(() => {
            console.log('🌟 XP Animation phase: complete');
            setAnimationPhase('complete');
          }, xpData.xpResult.levelChanged ? 2000 : 1000);
        }
      }, duration / steps);
    }, 500);

    return () => {
      clearTimeout(timer1);
    };
  }, [isOpen, xpData, userIsAuthenticated]);

  // Get XP display data for authenticated users  
  let xpDisplayData = null;
  if (userIsAuthenticated && xpData?.xpResult && xpData?.playerStats) {
    console.log('🌟 Creating XP display data:', {
      currentXP,
      animationPhase,
      xpResult: xpData.xpResult,
      playerStats: xpData.playerStats
    });
    
    // Always calculate level from current XP for accurate animation display
    const currentLevel = getLevelFromXP(currentXP || xpData.xpResult.newXP);
    const levelProgressData = getLevelProgress(currentXP || xpData.xpResult.newXP, currentLevel);
    const LevelIcon = getLevelIcon(currentLevel);
    
    xpDisplayData = {
      xpResult: xpData.xpResult,
      playerStats: xpData.playerStats,
      levelProgressData,
      LevelIcon,
      currentLevel
    };
  } else {
    console.log('🌟 No XP display data created:', {
      userIsAuthenticated,
      hasXPData: !!xpData,
      hasXPResult: !!xpData?.xpResult,
      hasPlayerStats: !!xpData?.playerStats
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        className={`fixed inset-0 z-50 flex items-center justify-center ${content.bgColor} backdrop-blur-sm p-4`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        {content.showConfetti && <Confetti />}
        
        <motion.div
          initial={{ scale: 0, rotateY: 180 }}
          animate={{ scale: 1, rotateY: 0 }}
          exit={{ scale: 0, opacity: 0 }}
          transition={{
            type: "spring",
            damping: 12,
            stiffness: 200,
            duration: 0.5
          }}
        >
          <Card className="w-full max-w-md bg-[var(--modal-bg)] border border-[var(--modal-border)] backdrop-blur-md">
            <CardContent className="p-4 sm:p-6 text-center space-y-4 sm:space-y-6">
              {/* Game Result Header */}
              <motion.div
                className="space-y-4"
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
              >
                <div className={`w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full flex items-center justify-center ${
                  content.showConfetti ? 'bg-success/20' : 'bg-destructive/20'
                }`}>
                  <IconComponent className={`w-7 h-7 sm:w-8 sm:h-8 ${content.iconColor}`} />
                </div>
                
                <div>
                  <h2 className={`text-2xl sm:text-3xl font-bold ${content.textColor} mb-2`}>
                    {content.title}
                  </h2>
                  <p className="text-sm sm:text-base text-foreground/80">
                    {content.subtitle}
                  </p>
                </div>
              </motion.div>

              {/* XP Information for Authenticated Users */}
              {xpDisplayData && (
                <motion.div
                  className="space-y-3 sm:space-y-4 motion-reduce:animate-none motion-reduce:transition-none"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  {/* XP Change Summary */}
                  <div className="p-3 sm:p-4 bg-accent/10 rounded-lg border border-accent/20">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs sm:text-sm text-muted-foreground">XP Change</span>
                      <span className={`text-base sm:text-lg font-bold ${xpDisplayData.xpResult.totalXPChange >= 0 ? 'text-primary' : 'text-destructive'}`}>
                        {animationPhase === 'entering' ? '...' : (xpDisplayData.xpResult.totalXPChange >= 0 ? '+' : '')}{animationPhase === 'entering' ? '' : xpDisplayData.xpResult.totalXPChange}
                      </span>
                    </div>
                    
                    {xpDisplayData.xpResult.streakBonus > 0 && (
                      <div className="flex justify-between items-center text-xs sm:text-sm">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Flame className="w-3 h-3" />
                          Win Streak Bonus
                        </span>
                        <span className="text-warning">+{xpDisplayData.xpResult.streakBonus}</span>
                      </div>
                    )}
                  </div>

                  {/* Current Level and Progress */}
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      <xpDisplayData.LevelIcon className={`w-4 h-4 sm:w-5 sm:h-5 ${getLevelColor(xpDisplayData.currentLevel)}`} />
                      <Badge variant="secondary" className="px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm">
                        Level {xpDisplayData.currentLevel}
                      </Badge>
                    </div>
                    
                    <div className="space-y-1.5 sm:space-y-2">
                      <div className="flex justify-between text-xs sm:text-sm">
                        <span>XP: {currentXP.toLocaleString()}</span>
                        <span className="text-muted-foreground">
                          {xpDisplayData.levelProgressData.progress < 100 ? `${Math.round(xpDisplayData.levelProgressData.progress)}% to Level ${xpDisplayData.levelProgressData.nextLevel}` : 'Max Level!'}
                        </span>
                      </div>
                      <Progress 
                        value={xpDisplayData.levelProgressData.progress} 
                        className="h-2 bg-accent/20"
                      />
                    </div>
                  </div>

                  {/* Level Change Notification with Animation */}
                  {showLevelChange && xpDisplayData.xpResult.levelChanged && (
                    <motion.div 
                      className="p-2 sm:p-3 rounded-lg border-2 animate-pulse motion-reduce:animate-none bg-primary/20 border-primary/50 text-primary"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", damping: 15, stiffness: 300 }}
                    >
                      <div className="flex items-center justify-center gap-2 font-bold text-sm sm:text-base">
                        <Trophy className="w-4 h-4" />
                        LEVEL UP!
                      </div>
                      <p className="text-xs sm:text-sm mt-1">
                        Level {xpDisplayData.xpResult.previousLevel} → Level {xpDisplayData.xpResult.newLevel}
                      </p>
                    </motion.div>
                  )}
                </motion.div>
              )}

              {/* Back to Lobby Button */}
              <motion.div
                className="motion-reduce:animate-none motion-reduce:transition-none"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: userIsAuthenticated ? 0.8 : 0.4 }}
              >
                <Button onClick={onBackToLobby} className="w-full min-h-[48px] sm:min-h-[44px] font-semibold py-3 text-base sm:text-lg transition-all duration-200 transform hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none" data-testid="button-back-to-lobby" >
                  Back to Lobby
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default GameCompletionModal;
