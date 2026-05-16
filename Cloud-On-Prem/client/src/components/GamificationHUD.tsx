import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Coins, Zap, Trophy, Flame, Star, Wallet } from 'lucide-react';
import { motion } from 'framer-motion';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { WalletInventory } from './WalletInventory';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { SeasonPassProgressBar } from '@/components/SeasonPassProgressBar';

export function GamificationHUD() {
  const [walletOpen, setWalletOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  const { data: user } = useQuery<any>({ 
    queryKey: ['/api/user-status'],
    retry: false,
  });

  const { data: dashboard } = useQuery<any>({ 
    queryKey: ['/api/gamification/dashboard'],
    refetchInterval: 30000,
  });

  const { data: activePowerUps = [] } = useQuery<any[]>({ 
    queryKey: ['/api/gamification/powerups/active'],
    refetchInterval: 5000,
  });

  // Update current time every second for countdown timers
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!dashboard || !user) {
    return null;
  }

  const currentXP = dashboard.playerStats?.currentXP || 0;
  const MAX_LEVEL = 100;
  
  const derivedLevel = getLevelFromXP(currentXP);
  const currentLevel = Math.max(derivedLevel, 1);
  const isMaxLevel = currentLevel >= MAX_LEVEL;
  
  const xpForCurrentLevel = getXPForLevel(currentLevel);
  const xpForNextLevel = isMaxLevel ? xpForCurrentLevel : getXPForLevel(currentLevel + 1);
  const xpNeeded = isMaxLevel ? 1 : (xpForNextLevel - xpForCurrentLevel);
  
  const xpInLevel = Math.max(0, Math.min(currentXP - xpForCurrentLevel, xpNeeded));
  const xpProgress = isMaxLevel ? 100 : Math.max(0, Math.min((xpInLevel / xpNeeded) * 100, 100));

  return (
    <>
    <motion.div
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-card/95 backdrop-blur-md border border-primary/30 rounded-lg shadow-dialog mb-6 overflow-hidden"
    >
      <div className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Player Avatar & Name */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex flex-col items-center justify-center gap-2 bg-surface-raised rounded-lg p-3 border border-primary/30"
          >
            <PlayerAvatar 
              user={user} 
              size="lg" 
              showCountry={false}
              showGlow={false}
              showCosmetics={true}
              className="ring-2 ring-primary/30 shadow-elevated"
            />
            <div className="text-center">
              <div className="text-foreground font-bold text-sm truncate max-w-[120px]" data-testid="text-gamer-name">
                {user.gamerName}
              </div>
              <div className="text-primary/70 text-xs">
                Lvl {currentLevel}
              </div>
            </div>
          </motion.div>

          {/* Coins Counter */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            onClick={() => setWalletOpen(true)}
            className="flex items-center gap-3 bg-surface-raised rounded-lg p-3 border border-accent/30 cursor-pointer hover:border-accent/50 transition-colors"
            data-testid="button-open-wallet"
          >
            <div className="relative">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 bg-accent/20 rounded-full blur-md"
              />
              <Wallet className="w-8 h-8 text-accent relative z-10" data-testid="icon-coins" />
            </div>
            <div className="flex-1">
              <div className="!text-accent text-xs font-medium uppercase tracking-wide">
                Coins
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-coin-balance">
                {dashboard.coinBalance?.toLocaleString() || 0}
              </div>
            </div>
            <Coins className="w-5 h-5 text-accent/60" />
          </motion.div>

          {/* XP & Level Progress */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex flex-col gap-2 bg-surface-raised rounded-lg p-3 border border-secondary/30 md:col-span-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Star className="w-5 h-5 text-warning fill-warning" style={{ filter: 'drop-shadow(0 0 0.5px black) drop-shadow(0 0 0.5px black)' }} data-testid="icon-level" />
                <span className="text-secondary text-xs font-medium uppercase tracking-wide">
                  Level {currentLevel}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {isMaxLevel ? "MAX" : `${Math.max(0, Math.floor(xpInLevel)).toLocaleString()} / ${xpNeeded.toLocaleString()} XP`}
              </div>
            </div>
            <div className="relative">
              <Progress 
                value={xpProgress} 
                className="h-3 bg-muted/50 border border-secondary/30" 
                data-testid="progress-xp"
              />
              <motion.div
                className="absolute inset-0 bg-primary hover:bg-primary/90 rounded-full blur-sm"
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div className="text-xs text-muted-foreground text-center">
              {isMaxLevel ? "Max Level Reached" : `${Math.max(0, Math.ceil(xpNeeded - xpInLevel))} XP to Level ${currentLevel + 1}`}
            </div>
          </motion.div>

          {/* Login Streak */}
          <motion.div
            whileHover={{ scale: 1.05 }}
            className="flex items-center gap-3 bg-warning/40 rounded-lg p-3 border border-[var(--warning)]/30"
          >
            <div className="relative">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="absolute inset-0 bg-warning/30 rounded-full blur-md"
              />
              <Flame className="w-8 h-8 text-warning fill-warning relative z-10" style={{ filter: 'drop-shadow(0 0 0.5px black) drop-shadow(0 0 0.5px black)' }} data-testid="icon-streak" />
            </div>
            <div>
              <div className="!text-warning text-xs font-medium uppercase tracking-wide">
                Streak
              </div>
              <div className="text-2xl font-bold text-foreground" data-testid="text-streak-days">
                {dashboard.loginStreak?.currentStreak || 0} Days
              </div>
            </div>
          </motion.div>
        </div>

        {/* Active Power-Ups Bar - Call of Duty Style */}
        {activePowerUps && activePowerUps.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            className="mt-4 pt-4 border-t border-primary/20"
          >
            <div className="flex items-center gap-2 mb-3">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Zap className="w-5 h-5 text-primary" />
              </motion.div>
              <span className="text-sm font-bold uppercase tracking-wider text-primary">
                Active Power-Ups
              </span>
              <motion.div 
                className="flex-1 h-px bg-border"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="container-active-powerups">
              {activePowerUps.map((powerUp: any, index: number) => {
                const timeLeft = powerUp.expiresAt ? getTimeLeftSeconds(powerUp.expiresAt, currentTime) : null;
                const totalDuration = powerUp.duration || 3600;
                const progress = timeLeft ? (timeLeft / totalDuration) * 100 : 100;
                
                return (
                  <motion.div
                    key={powerUp.id}
                    initial={{ scale: 0, x: -20 }}
                    animate={{ scale: 1, x: 0 }}
                    transition={{ delay: index * 0.1, type: "spring" }}
                    className="relative overflow-hidden rounded-lg bg-primary hover:bg-primary/90 border border-primary/50 p-3"
                    data-testid={`powerup-active-${powerUp.id}`}
                  >
                    {/* Animated background glow */}
                    <motion.div
                      className="absolute inset-0 bg-primary hover:bg-primary/90"
                      animate={{ opacity: [0.3, 0.6, 0.3] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                    
                    <div className="relative z-10">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <motion.div
                            animate={{ scale: [1, 1.2, 1] }}
                            transition={{ duration: 1.5, repeat: Infinity }}
                          >
                            <Zap className="w-5 h-5 text-accent" />
                          </motion.div>
                          <div>
                            <div className="text-foreground font-bold text-sm">{powerUp.powerUpName}</div>
                            {powerUp.effectType && (
                              <div className="text-xs !text-primary/70">
                                {getEffectLabel(powerUp.effectType, powerUp.effectValue)}
                              </div>
                            )}
                          </div>
                        </div>
                        {powerUp.expiresAt && timeLeft && (
                          <div className="text-right">
                            <motion.div 
                              className={`text-lg font-bold tabular-nums ${timeLeft < 60 ? 'text-destructive' : 'text-success'}`}
                              animate={timeLeft < 60 ? { scale: [1, 1.1, 1] } : {}}
                              transition={{ duration: 1, repeat: Infinity }}
                            >
                              {getRemainingTime(powerUp.expiresAt, currentTime)}
                            </motion.div>
                          </div>
                        )}
                      </div>
                      
                      {/* Timer Progress Bar */}
                      {powerUp.expiresAt && (
                        <div className="relative h-2 bg-muted/50 rounded-full overflow-hidden">
                          <motion.div
                            className={`absolute inset-y-0 left-0 rounded-full ${
                              progress > 50 ? 'bg-success' : progress > 20 ? 'bg-warning' : 'bg-destructive'
                            }`}
                            style={{ width: `${progress}%` }}
                            animate={progress < 20 ? { opacity: [1, 0.5, 1] } : {}}
                            transition={{ duration: 0.5, repeat: Infinity }}
                          />
                          <motion.div
                            className="absolute inset-0 bg-transparent"
                            animate={{ x: ['-100%', '200%'] }}
                            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>

      {/* Animated glow effect */}
      <div className="absolute inset-0 pointer-events-none">
        <motion.div
          className="absolute top-0 left-0 right-0 h-px bg-transparent"
          animate={{ opacity: [0.3, 0.8, 0.3], x: [-100, 100] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      </div>
    </motion.div>

    {/* Season Pass Progress Bar */}
    <div className="mb-6">
      <SeasonPassProgressBar />
    </div>
    
    <WalletInventory open={walletOpen} onOpenChange={setWalletOpen} />
    </>
  );
}

function getLevelFromXP(xp: number): number {
  let level = 1;
  let cumulativeXP = 0;
  for (let l = 1; l <= 100; l++) {
    const xpForThisLevel = Math.round(50 * Math.pow(l, 1.5));
    if (cumulativeXP + xpForThisLevel > xp) {
      return l;
    }
    cumulativeXP += xpForThisLevel;
  }
  return 100;
}

// Calculate cumulative XP threshold for a given level (matches backend formula)
function getXPForLevel(level: number): number {
  let cumulativeXP = 0;
  for (let l = 1; l < level; l++) {
    const xpForLevel = Math.round(50 * Math.pow(l, 1.5));
    cumulativeXP += xpForLevel;
  }
  return cumulativeXP;
}

function getRemainingTime(expiresAt: string, currentTime: number): string {
  const expires = new Date(expiresAt).getTime();
  const remaining = Math.max(0, expires - currentTime);
  
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

function getTimeLeftSeconds(expiresAt: string, currentTime: number): number {
  const expires = new Date(expiresAt).getTime();
  return Math.max(0, Math.floor((expires - currentTime) / 1000));
}

function getEffectLabel(effectType: string, effectValue: number): string {
  switch (effectType) {
    case 'xp_multiplier':
      return `+${((effectValue - 1) * 100).toFixed(0)}% XP Boost`;
    case 'coin_multiplier':
      return `+${((effectValue - 1) * 100).toFixed(0)}% Coins`;
    case 'change_answer':
      return `${effectValue} Answer Change${effectValue > 1 ? 's' : ''}`;
    case 'hint_reveal':
      return `${effectValue} Hint${effectValue > 1 ? 's' : ''}`;
    default:
      return 'Active Effect';
  }
}
