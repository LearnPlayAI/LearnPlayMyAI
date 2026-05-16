import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Star, Coins, RefreshCw, Lightbulb } from 'lucide-react';

export function ActivePowerUpsOverlay() {
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  const { data: activePowerUps = [] } = useQuery<any[]>({ 
    queryKey: ['/api/gamification/powerups/active'],
    refetchInterval: 5000,
    structuralSharing: false,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter out expired power-ups locally
  const activePowerUpsFiltered = activePowerUps.filter((powerUp: any) => {
    if (!powerUp.expiresAt) return true;
    const timeLeft = getTimeLeftSeconds(powerUp.expiresAt, currentTime);
    return timeLeft > 0;
  });

  if (!activePowerUpsFiltered || activePowerUpsFiltered.length === 0) {
    return null;
  }

  return (
    <div className="fixed bottom-20 right-2 md:top-4 md:right-4 md:bottom-auto z-40 flex flex-col items-end gap-2" data-testid="overlay-active-powerups">
      <AnimatePresence>
        {activePowerUpsFiltered.map((powerUp: any, index: number) => {
          const timeLeft = powerUp.expiresAt ? getTimeLeftSeconds(powerUp.expiresAt, currentTime) : null;
          const totalDuration = powerUp.duration || 3600;
          const progress = timeLeft !== null ? Math.max(0, (timeLeft / totalDuration) * 100) : 100;
          const isExpanded = expandedId === powerUp.id;
          
          return (
            <motion.div
              key={powerUp.id}
              initial={{ x: 100, opacity: 0, scale: 0.8 }}
              animate={{ x: 0, opacity: 1, scale: 1 }}
              exit={{ x: 100, opacity: 0, scale: 0.8 }}
              transition={{ delay: index * 0.1, type: "spring" }}
              onClick={() => setExpandedId(isExpanded ? null : powerUp.id)}
              className={`relative bg-primary hover:bg-primary/90 backdrop-blur-md border-2 border-primary/50 rounded-full md:rounded-lg p-2 shadow-dialog cursor-pointer transition-all ${
                isExpanded ? 'w-64 rounded-lg' : 'w-14 h-14 md:w-auto md:h-auto md:min-w-[120px]'
              }`}
              data-testid={`overlay-powerup-${powerUp.id}`}
            >
              <motion.div
                className="absolute inset-0 bg-primary hover:bg-primary/90 rounded-full md:rounded-lg"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              
              {/* Compact Icon View (Mobile) */}
              {!isExpanded && (
                <div className="relative z-10 flex items-center justify-center md:hidden">
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                  >
                    {getPowerUpIcon(powerUp.effectType)}
                  </motion.div>
                </div>
              )}

              {/* Compact Badge View (Desktop) */}
              {!isExpanded && (
                <div className="relative z-10 hidden md:flex items-center gap-1.5 px-1.5">
                  <motion.div
                    animate={{ rotate: [0, 360] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="flex-shrink-0"
                  >
                    {getPowerUpIcon(powerUp.effectType, 'sm')}
                  </motion.div>
                  {powerUp.expiresAt && timeLeft !== null && (
                    <span className={`text-xs font-bold tabular-nums ${timeLeft < 60 ? 'text-destructive' : 'text-success'}`}>
                      {formatTime(timeLeft)}
                    </span>
                  )}
                </div>
              )}

              {/* Expanded Card View */}
              {isExpanded && (
                <div className="relative z-10 p-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <motion.div
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                      >
                        {getPowerUpIcon(powerUp.effectType)}
                      </motion.div>
                      <div>
                        <div className="text-foreground font-bold text-sm">{powerUp.powerUpName}</div>
                        {powerUp.effectType && (
                          <div className="text-xs text-primary/70">
                            {getEffectLabel(powerUp.effectType, powerUp.effectValue)}
                          </div>
                        )}
                      </div>
                    </div>
                    {powerUp.expiresAt && timeLeft !== null && (
                      <motion.div 
                        className={`text-base font-bold tabular-nums ${timeLeft < 60 ? 'text-destructive' : 'text-success'}`}
                        animate={timeLeft < 60 ? { scale: [1, 1.15, 1] } : {}}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        {formatTime(timeLeft)}
                      </motion.div>
                    )}
                  </div>
                  
                  {powerUp.expiresAt && (
                    <div className="relative h-1.5 bg-muted/70 rounded-full overflow-hidden">
                      <motion.div
                        className={`absolute inset-y-0 left-0 rounded-full ${
                          progress > 50 ? 'bg-success' : progress > 20 ? 'bg-warning' : 'bg-destructive'
                        }`}
                        style={{ width: `${progress}%` }}
                        animate={progress < 20 ? { opacity: [1, 0.4, 1] } : {}}
                        transition={{ duration: 0.5, repeat: Infinity }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Time remaining badge for mobile compact view */}
              {!isExpanded && powerUp.expiresAt && timeLeft !== null && (
                <div className="absolute -top-1 -right-1 md:hidden">
                  <div className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-elevated ${
                    timeLeft < 60 ? 'bg-destructive' : 'bg-success'
                  } text-primary-foreground`}>
                    {formatTime(timeLeft)}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

function getTimeLeftSeconds(expiresAt: string, now: number): number {
  const expires = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((expires - now) / 1000));
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins > 0) {
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  return `${secs}s`;
}

function getPowerUpIcon(effectType: string, size: 'sm' | 'md' = 'md') {
  const iconSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  
  switch (effectType) {
    case 'xp_multiplier':
      return <Star className={`${iconSize} text-[var(--game-xp)]`} />;
    case 'coin_multiplier':
      return <Coins className={`${iconSize} text-glow-gold`} />;
    case 'change_answer':
      return <RefreshCw className={`${iconSize} text-primary`} />;
    case 'hint_reveal':
      return <Lightbulb className={`${iconSize} text-warning`} />;
    default:
      return <Zap className={`${iconSize} text-glow-gold`} />;
  }
}

function getEffectLabel(effectType: string, effectValue: number): string {
  switch (effectType) {
    case 'xp_multiplier':
      return `+${((effectValue - 1) * 100).toFixed(0)}% XP`;
    case 'coin_multiplier':
      return `+${((effectValue - 1) * 100).toFixed(0)}% Coins`;
    case 'change_answer':
      return `${effectValue} Change${effectValue > 1 ? 's' : ''}`;
    case 'hint_reveal':
      return `${effectValue} Hint${effectValue > 1 ? 's' : ''}`;
    default:
      return 'Active';
  }
}
