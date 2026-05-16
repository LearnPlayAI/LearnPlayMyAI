import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Star, Trophy, Award, Shield, Crown, Target, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getLevelFromXP, getLevelProgress, getLevelColor } from '@shared/levelUtils';

const XPAnimationModal = ({ 
  isOpen, 
  onClose, 
  xpResult, 
  playerStats, 
  gameWon 
}) => {
  const [currentXP, setCurrentXP] = useState(0);
  const [animationPhase, setAnimationPhase] = useState('entering');
  const [showLevelChange, setShowLevelChange] = useState(false);

  const getLevelIcon = (level) => {
    if (level >= 90) return Crown;
    if (level >= 70) return Trophy;
    if (level >= 50) return Award;
    if (level >= 30) return Shield;
    return Star;
  };

  useEffect(() => {
    if (!isOpen || !xpResult) return;

    const startingXP = (xpResult.newXP - xpResult.totalXPChange);
    setCurrentXP(startingXP);
    setAnimationPhase('entering');
    setShowLevelChange(false); // Reset level change banner

    // Animation sequence
    const timer1 = setTimeout(() => {
      setAnimationPhase('xp-gain');
      
      // Animate XP gain
      const duration = 2000; // 2 seconds
      const steps = 60;
      const increment = xpResult.totalXPChange / steps;
      let step = 0;
      
      const xpTimer = setInterval(() => {
        step++;
        const newXP = startingXP + (increment * step);
        setCurrentXP(Math.round(newXP));
        
        if (step >= steps) {
          clearInterval(xpTimer);
          setCurrentXP(xpResult.newXP);
          
          // Show level change if applicable
          if (xpResult.levelChanged) {
            setTimeout(() => {
              setShowLevelChange(true);
            }, 500);
          }
          
          setTimeout(() => {
            setAnimationPhase('complete');
          }, xpResult.levelChanged ? 2000 : 1000);
        }
      }, duration / steps);
    }, 500);

    return () => {
      clearTimeout(timer1);
    };
  }, [isOpen, xpResult]);

  if (!isOpen || !xpResult || !playerStats) return null;

  // Always calculate level from current XP for accurate animation display
  const currentLevel = getLevelFromXP(currentXP || xpResult.newXP);
  const levelProgressData = getLevelProgress(currentXP || xpResult.newXP, currentLevel);
  const LevelIcon = getLevelIcon(currentLevel);

  return (
    <div className="fixed inset-0 bg-[var(--modal-overlay)] backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <Card className={`w-full max-w-sm sm:max-w-md lg:max-w-lg xl:max-w-xl bg-card border-2 border-accent/30 shadow-dialog transform transition-all duration-500 motion-reduce:transition-none motion-reduce:transform-none ${
        animationPhase === 'entering' ? 'scale-0 rotate-12 motion-reduce:scale-100 motion-reduce:rotate-0' : 'scale-100 rotate-0'
      }`}>
        <CardContent className="p-4 sm:p-6 lg:p-8 text-center space-y-4 sm:space-y-6">
          {/* Game Result Header */}
          <div className="space-y-2">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
              gameWon ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'
            } transition-all duration-300`}>
              {gameWon ? <Trophy className="w-8 h-8" /> : <Target className="w-8 h-8" />}
            </div>
            <h2 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${
              gameWon ? 'text-success' : 'text-destructive'
            }`}>
              {gameWon ? 'Victory!' : 'Defeat'}
            </h2>
            <p className="text-sm sm:text-base text-muted-foreground">
              {gameWon ? 'Well played! You earned XP!' : 'Better luck next time!'}
            </p>
          </div>

          {/* XP Breakdown */}
          <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-accent/10 rounded-lg border border-accent/20">
            <div className="flex justify-between items-center">
              <span className="text-xs sm:text-sm text-muted-foreground">Base XP</span>
              <span className={`text-sm sm:text-base font-bold ${xpResult.baseXP >= 0 ? 'text-primary' : 'text-destructive'}`}>
                {xpResult.baseXP >= 0 ? '+' : ''}{xpResult.baseXP}
              </span>
            </div>
            
            {xpResult.streakBonus > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  Win Streak Bonus
                </span>
                <span className="font-bold text-warning">
                  +{xpResult.streakBonus}
                </span>
              </div>
            )}
            
            <div className="border-t border-accent/20 pt-2">
              <div className="flex justify-between items-center">
                <span className="font-medium">Total XP Change</span>
                <span className={`font-bold text-lg ${xpResult.totalXPChange >= 0 ? 'text-primary' : 'text-destructive'}`}>
                  {xpResult.totalXPChange >= 0 ? '+' : ''}{xpResult.totalXPChange}
                </span>
              </div>
            </div>
          </div>

          {/* Current Level and XP */}
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-3">
              <LevelIcon className={`w-6 h-6 ${getLevelColor(currentLevel)}`} />
              <Badge variant="secondary" className="text-lg px-4 py-1">
                Level {currentLevel}
              </Badge>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>XP: {currentXP.toLocaleString()}</span>
                <span className="text-muted-foreground">
                  {levelProgressData.progress < 100
                    ? `${Math.round(levelProgressData.progress)}% to Level ${levelProgressData.nextLevel}` 
                    : 'Max Level!'}
                </span>
              </div>
              <Progress 
                value={levelProgressData.progress} 
                className="h-3 bg-accent/20"
              />
            </div>
          </div>

          {/* Level Change Animation */}
          {showLevelChange && xpResult.levelChanged && (
            <div className="p-3 sm:p-4 rounded-lg border-2 animate-pulse motion-reduce:animate-none bg-primary/20 border-primary/50 text-primary">
              <div className="flex items-center justify-center gap-2 text-base sm:text-lg font-bold">
                <Trophy className="w-4 h-4 sm:w-5 sm:h-5" />
                LEVEL UP!
              </div>
              <p className="text-xs sm:text-sm mt-1">
                Level {xpResult.previousLevel} → Level {xpResult.newLevel}
              </p>
            </div>
          )}

          {/* Close Button */}
          {animationPhase === 'complete' && (
            <Button onClick={onClose} className="w-full min-h-[48px] sm:min-h-[44px] mt-4 sm:mt-6 text-base sm:text-lg motion-reduce:transition-none" >
              Continue
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default XPAnimationModal;