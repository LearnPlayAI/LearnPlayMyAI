import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Award, Coins, Lock, Unlock, Star, Zap, Sparkles, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useToast } from '@/hooks/use-toast';
import { useRewardNotification } from '@/hooks/useRewardNotification';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface SeasonPassTier {
  tier: number;
  requiredXP: number;
  coinCost: number;
  freeReward: {
    type: string | null;
    amount: number | null;
    id: string | null;
  };
  premiumReward: {
    type: string | null;
    amount: number | null;
    id: string | null;
  };
  isUnlocked: boolean;
  isClaimed: boolean;
}

interface SeasonPassData {
  currentTier: number;
  currentXP: number;
  tiers: SeasonPassTier[];
}

const TIER_ICONS: Record<string, any> = {
  coins: Coins,
  powerup: Zap,
  cosmetic: Sparkles,
  xp_boost: Star,
};

interface SeasonPassConfig {
  id: string;
  seasonNumber: number;
  seasonName: string;
  description: string;
  startDate: string;
  endDate: string;
  coinCost: number;
  coinMultiplier: number;
  xpMultiplier: number;
  isActive: boolean;
  createdAt: string;
}

interface ActiveSeasonPass {
  id: string;
  seasonPassConfigId: string;
  purchasedAt: string;
  expiresAt: string;
  seasonNumber: number;
  seasonName: string;
}

export function SeasonPass() {
  const { toast } = useToast();
  const { showSeasonPass, showCoins } = useRewardNotification();
  const [selectedPass, setSelectedPass] = useState<SeasonPassConfig | null>(null);

  const { data: availablePasses = [], isLoading: loadingPasses } = useQuery<SeasonPassConfig[]>({
    queryKey: ['/api/admin/season-pass/all'],
  });

  const { data: activePasses = [], isLoading: loadingActive } = useQuery<ActiveSeasonPass[]>({
    queryKey: ['/api/gamification/season-pass/active-purchases'],
  });

  const { data: seasonPass, isLoading: loadingProgress } = useQuery<SeasonPassData>({
    queryKey: ['/api/gamification/season-pass'],
    enabled: activePasses.length > 0,
  });

  const { data: dashboard } = useQuery<any>({
    queryKey: ['/api/gamification/dashboard'],
  });

  const purchaseMutation = useMutation({
    mutationFn: async (seasonPassConfigId: string) => {
      return apiRequest(`/api/gamification/season-pass/purchase`, {
        method: 'POST',
        body: JSON.stringify({ seasonPassConfigId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/season-pass/active-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/season-pass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
      toast({
        title: 'Season Pass Purchased!',
        description: 'You now have access to exclusive rewards and multipliers!',
      });
      setSelectedPass(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Not enough coins or pass already active.',
        variant: 'destructive',
      });
    },
  });

  const unlockMutation = useMutation({
    mutationFn: async (tier: number) => {
      return apiRequest(`/api/gamification/season-pass/tiers/${tier}/unlock`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/season-pass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
      toast({
        title: 'Tier Unlocked!',
        description: 'You can now claim your rewards.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Unlock Failed',
        description: error.message || 'Not enough coins or tier requirements not met.',
        variant: 'destructive',
      });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (tier: number) => {
      return apiRequest(`/api/gamification/season-pass/claim-tier`, {
        method: 'POST',
        body: JSON.stringify({ tierId: `tier-${tier}` }),
        headers: {
          'Content-Type': 'application/json',
        },
      });
    },
    onSuccess: (_data, tier) => {
      const tierData = seasonPass?.tiers.find(t => t.tier === tier);
      if (tierData) {
        const rewards = [];
        if (tierData.freeReward?.type) rewards.push('Free Reward');
        if (tierData.premiumReward?.type) rewards.push('Premium Reward');
        showSeasonPass(tier, rewards.join(', ') || 'Rewards');
        
        const coinReward = tierData.freeReward?.type === 'coins' ? tierData.freeReward : 
                          tierData.premiumReward?.type === 'coins' ? tierData.premiumReward : null;
        if (coinReward && coinReward.amount) {
          setTimeout(() => showCoins(coinReward.amount!, `Season Pass Tier ${tier}`), 500);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/season-pass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
    },
    onError: () => {
      toast({
        title: 'Claim Failed',
        description: 'Tier not unlocked or rewards already claimed.',
        variant: 'destructive',
      });
    },
  });

  const getTierProgress = (tier: SeasonPassTier | undefined) => {
    if (!seasonPass || !tier) return 100;
    if (seasonPass.currentXP >= tier.requiredXP) return 100;
    const prevTier = seasonPass.tiers.find(t => t.tier === tier.tier - 1);
    const prevXP = prevTier?.requiredXP || 0;
    const tierRange = tier.requiredXP - prevXP;
    const currentProgress = seasonPass.currentXP - prevXP;
    return Math.max(0, Math.min(100, (currentProgress / tierRange) * 100));
  };

  const getCurrentTierForDisplay = () => {
    if (!seasonPass) return null;
    const currentTierIndex = Math.min(seasonPass.currentTier, seasonPass.tiers.length - 1);
    return seasonPass.tiers[currentTierIndex] || seasonPass.tiers[seasonPass.tiers.length - 1];
  };

  const canUnlock = (tier: SeasonPassTier) => {
    if (!seasonPass || !dashboard) return false;
    return seasonPass.currentXP >= tier.requiredXP && 
           dashboard.coinBalance >= tier.coinCost && 
           !tier.isUnlocked;
  };

  const renderRewardIcon = (type: string) => {
    const Icon = TIER_ICONS[type] || Award;
    return <Icon className="w-4 h-4" />;
  };

  const isLoading = loadingPasses || loadingActive || loadingProgress;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 bg-muted/50 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  const isPassOwned = (passId: string) => {
    return activePasses.some(ap => ap.seasonPassConfigId === passId);
  };

  const canAffordPass = (cost: number) => {
    return dashboard && dashboard.coinBalance >= cost;
  };

  const unclaimedTiersCount = seasonPass?.tiers.filter(tier => tier.isUnlocked && !tier.isClaimed).length || 0;

  return (
    <div className="space-y-[var(--space-lg)] bg-card text-foreground p-6 rounded-xl border border-border">
      <div className="space-y-[var(--space-md)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-[var(--space-md)]">
          <div>
            <h2 className="text-[length:var(--text-2xl)] font-bold text-foreground flex items-center gap-2">
              <Award className="w-6 h-6 text-glow-gold flex-shrink-0" />
              Season Pass
            </h2>
            <p className="text-muted-foreground mt-1 text-[length:var(--text-sm)]">Purchase season passes for exclusive rewards and multipliers</p>
          </div>
          <div className="flex items-center gap-2 bg-card px-[var(--space-md)] py-[var(--space-sm)] rounded-lg border border-border shadow-sm w-fit">
            <Coins className="w-5 h-5 text-glow-gold flex-shrink-0" />
            <span className="text-[length:var(--text-xl)] font-bold text-foreground" data-testid="text-season-pass-balance">
              {dashboard?.coinBalance?.toLocaleString() || 0}
            </span>
          </div>
        </div>

        {activePasses.length > 0 && seasonPass && (
          <Card className="bg-primary hover:bg-primary/90 border-primary/30">
            <CardHeader>
              <CardTitle className="text-foreground">Current Progress</CardTitle>
              <CardDescription className="text-muted-foreground">
                Tier {seasonPass.currentTier} • {seasonPass.currentXP.toLocaleString()} XP
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {getCurrentTierForDisplay() ? (
                  <>
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Tier {getCurrentTierForDisplay()!.tier}</span>
                      {seasonPass.currentTier < seasonPass.tiers.length ? (
                        <span>Tier {seasonPass.currentTier + 1}</span>
                      ) : (
                        <span>Max Tier</span>
                      )}
                    </div>
                    <Progress 
                      value={getTierProgress(getCurrentTierForDisplay()!)}
                      className="h-3 bg-muted"
                    />
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">No active season pass</p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {activePasses.length === 0 && (
          <Card className="bg-primary hover:bg-primary/90 border-primary/30">
            <CardHeader>
              <CardTitle className="text-foreground">Current Progress</CardTitle>
              <CardDescription className="text-muted-foreground">
                Tier 0 • {seasonPass?.currentXP.toLocaleString() || 0} XP
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">No active season pass</p>
            </CardContent>
          </Card>
        )}
      </div>

      {availablePasses.length > 0 && (
        <div className="space-y-[var(--space-md)]">
          <h3 className="text-[length:var(--text-xl)] font-bold text-foreground">Available Season Passes</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--card-gap)]">
            {availablePasses.filter(pass => pass.isActive).map((pass, index) => {
              const owned = isPassOwned(pass.id);
              const canAfford = canAffordPass(pass.coinCost);
              
              return (
                <motion.div
                  key={pass.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className={`${
                    owned
                      ? 'bg-[var(--game-success)]/30 border-[var(--game-success)]/50'
                      : 'bg-surface-raised border-primary/50 hover:border-primary/70'
                  } transition-all hover:shadow-elevated`}>
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-foreground flex items-center gap-2">
                            <Award className="w-5 h-5 text-glow-gold" />
                            {pass.seasonName}
                          </CardTitle>
                          <CardDescription className="text-muted-foreground mt-1">
                            {pass.description}
                          </CardDescription>
                        </div>
                        {owned && (
                          <Badge >
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Active
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-muted-foreground">Benefits:</h4>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-foreground text-sm">
                            <Zap className="w-4 h-4 text-primary" />
                            <span>{pass.coinMultiplier}x Coin Multiplier</span>
                          </div>
                          <div className="flex items-center gap-2 text-foreground text-sm">
                            <Star className="w-4 h-4 text-secondary" />
                            <span>{pass.xpMultiplier}x XP Multiplier</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Season {pass.seasonNumber}</div>
                        <div>Valid until: {new Date(pass.endDate).toLocaleDateString()}</div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)] pt-2 border-t border-border">
                        <div className="flex items-center gap-2">
                          <Coins className="w-5 h-5 text-glow-gold flex-shrink-0" />
                          <span className="text-[length:var(--text-xl)] font-bold text-foreground">{pass.coinCost}</span>
                        </div>

                        {owned ? (
                          <Button disabled className="cursor-default min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-owned-${pass.id}`} >
                            <CheckCircle2 className="w-4 h-4 mr-2" />
                            Owned
                          </Button>
                        ) : canAfford ? (
                          <Button onClick={() => setSelectedPass(pass)}
                            className="bg-[var(--game-gold)] min-h-[44px] touch-manipulation w-full sm:w-auto"
                            data-testid={`button-purchase-${pass.id}`}
                          >
                            <Coins className="w-4 h-4 mr-2" />
                            Purchase
                          </Button>
                        ) : (
                          <Button disabled variant="outline" className="cursor-not-allowed min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid={`button-not-enough-coins-${pass.id}`} >
                            <Lock className="w-4 h-4 mr-2" />
                            <div className="flex flex-col items-start">
                              <span className="text-xs">Need {(pass.coinCost - (dashboard?.coinBalance || 0)).toLocaleString()} more</span>
                              <span className="text-xs opacity-70">Cost: {pass.coinCost.toLocaleString()}</span>
                            </div>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {availablePasses.length === 0 && (
        <div className="text-center py-12">
          <Award className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground">No Season Passes Available</h3>
          <p className="text-muted-foreground">Check back later for new seasons!</p>
        </div>
      )}

      {activePasses.length > 0 && seasonPass && (
        <CollapsibleSection
          title="Tier Progression"
          description={`${seasonPass.tiers.length} tiers available`}
          icon={Award}
          defaultOpen={false}
          badgeCount={unclaimedTiersCount}
          badgeLabel={unclaimedTiersCount === 1 ? "1 tier to claim!" : `${unclaimedTiersCount} tiers to claim!`}
          testId="season-pass-tiers"
          className="bg-muted/50 border-border mt-[var(--space-xl)]"
        >
          <div className="space-y-[var(--space-sm)] pb-[var(--space-lg)]">
              {seasonPass.tiers.map((tier, index) => {
            const isLocked = !tier.isUnlocked && seasonPass.currentXP < tier.requiredXP;
            const isUnlockable = canUnlock(tier);
            const isClaimed = tier.isClaimed;
            const isUnlocked = tier.isUnlocked;

            return (
              <motion.div
                key={tier.tier}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`${
                  isClaimed
                    ? 'bg-muted/30 border-border'
                    : isUnlocked
                    ? 'bg-[var(--game-success)]/20 border-[var(--game-success)]/50 shadow-[var(--game-success)]/20 shadow-elevated'
                    : isUnlockable
                    ? 'bg-[var(--game-gold)]/20 border-[var(--game-gold)]/50 shadow-[var(--game-gold)]/20 shadow-elevated animate-pulse'
                    : isLocked
                    ? 'bg-muted/50 border-border'
                    : 'bg-surface-raised border-primary/50'
                } hover:shadow-elevated transition-all`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-[var(--game-primary)]">
                            <span className="text-primary-foreground font-bold">{tier.tier}</span>
                          </div>
                          <CardTitle className="text-foreground">Tier {tier.tier}</CardTitle>
                        </div>
                        <CardDescription className="text-muted-foreground">
                          Requires {tier.requiredXP.toLocaleString()} XP
                        </CardDescription>
                      </div>
                      {isClaimed ? (
                        <Badge >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Claimed
                        </Badge>
                      ) : isUnlocked ? (
                        <Badge className="animate-pulse">
                          <Unlock className="w-3 h-3 mr-1" />
                          Unlocked
                        </Badge>
                      ) : isLocked ? (
                        <Badge >
                          <Lock className="w-3 h-3 mr-1" />
                          Locked
                        </Badge>
                      ) : (
                        <Badge >
                          <Star className="w-3 h-3 mr-1" />
                          Available
                        </Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <h4 className="text-sm font-semibold text-muted-foreground">Rewards:</h4>
                      
                      {tier.freeReward?.type && (
                        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 border border-border">
                          <Lock className="w-3 h-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground uppercase font-semibold">Free</span>
                          <div className="flex-1 flex items-center gap-2">
                            {renderRewardIcon(tier.freeReward.type)}
                            <span className="text-sm text-foreground">
                              {tier.freeReward.type === 'coins' 
                                ? `${tier.freeReward.amount?.toLocaleString()} Coins` 
                                : tier.freeReward.type === 'power_up' 
                                ? 'Power-Up'
                                : tier.freeReward.type === 'cosmetic'
                                ? 'Cosmetic'
                                : 'Reward'}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {tier.premiumReward?.type && (
                        <div className="flex items-center gap-2 bg-[var(--game-gold)]/20 rounded-lg px-3 py-2 border border-[var(--game-gold)]/50">
                          <Star className="w-3 h-3 text-glow-gold" />
                          <span className="text-xs text-glow-gold uppercase font-semibold">Premium</span>
                          <div className="flex-1 flex items-center gap-2">
                            {renderRewardIcon(tier.premiumReward.type)}
                            <span className="text-sm text-foreground font-semibold">
                              {tier.premiumReward.type === 'coins' 
                                ? `${tier.premiumReward.amount?.toLocaleString()} Coins` 
                                : tier.premiumReward.type === 'power_up' 
                                ? 'Power-Up'
                                : tier.premiumReward.type === 'cosmetic'
                                ? 'Cosmetic'
                                : 'Reward'}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {!tier.freeReward?.type && !tier.premiumReward?.type && (
                        <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 text-muted-foreground text-sm">
                          <Lock className="w-4 h-4" />
                          <span>No rewards configured</span>
                        </div>
                      )}
                    </div>

                    {!isClaimed && !isUnlocked && (
                      <div className="space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Your Progress</span>
                          <span>{getTierProgress(tier).toFixed(0)}%</span>
                        </div>
                        <Progress value={getTierProgress(tier)} className="h-2 bg-muted" />
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-sm)] pt-2 border-t border-border">
                      <div className="flex items-center gap-2">
                        <Coins className="w-5 h-5 text-glow-gold flex-shrink-0" />
                        <span className="text-[length:var(--text-xl)] font-bold text-foreground">{tier.coinCost}</span>
                        <span className="text-muted-foreground text-[length:var(--text-sm)]">to unlock</span>
                      </div>

                      {isUnlocked && !isClaimed ? (
                        <Button onClick={() => claimMutation.mutate(tier.tier)}
                          disabled={claimMutation.isPending}
                          className="bg-[var(--game-success)] min-h-[44px] touch-manipulation w-full sm:w-auto"
                          data-testid={`button-claim-tier-${tier.tier}`}
                        >
                          <Award className="w-4 h-4 mr-2" />
                          Claim Rewards
                        </Button>
                      ) : isUnlockable ? (
                        <Button onClick={() => unlockMutation.mutate(tier.tier)}
                          disabled={unlockMutation.isPending}
                          className="bg-[var(--game-gold)] animate-pulse min-h-[44px] touch-manipulation w-full sm:w-auto"
                          data-testid={`button-unlock-tier-${tier.tier}`}
                        >
                          <Unlock className="w-4 h-4 mr-2" />
                          Unlock Now
                        </Button>
                      ) : !isClaimed && (
                        <Button disabled variant="outline" className="cursor-not-allowed min-h-[44px] touch-manipulation w-full sm:w-auto" >
                          <Lock className="w-4 h-4 mr-2" />
                          {isLocked ? 'Keep Grinding' : 'Not Enough Coins'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
              })}
          </div>
        </CollapsibleSection>
      )}

      <AnimatePresence>
        {selectedPass && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 flex items-center justify-center z-50 p-[var(--container-padding)]"
            onClick={() => setSelectedPass(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-primary/30 max-w-md w-full p-[var(--dialog-padding)] space-y-[var(--space-md)] max-h-[var(--dialog-max-height)] overflow-y-auto"
            >
              <div className="text-center space-y-2">
                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full bg-surface-raised flex items-center justify-center">
                  <Award className="w-7 h-7 sm:w-8 sm:h-8 text-primary-foreground" />
                </div>
                <h3 className="text-[length:var(--text-2xl)] font-bold text-foreground">Purchase {selectedPass.seasonName}?</h3>
                <p className="text-muted-foreground text-[length:var(--text-sm)]">{selectedPass.description}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">You'll get:</h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-foreground">
                      <Zap className="w-4 h-4 text-primary" />
                      <span>{selectedPass.coinMultiplier}x Coin Multiplier</span>
                    </div>
                    <div className="flex items-center gap-2 text-foreground">
                      <Star className="w-4 h-4 text-secondary" />
                      <span>{selectedPass.xpMultiplier}x XP Multiplier</span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-muted-foreground">Cost:</span>
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-glow-gold" />
                    <span className="text-2xl font-bold text-foreground">{selectedPass.coinCost?.toLocaleString() || 0}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Your Balance:</span>
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-glow-gold" />
                    <span className="text-lg font-semibold text-foreground">{dashboard?.coinBalance || 0}</span>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                  Valid until: {new Date(selectedPass.endDate).toLocaleDateString()}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-[var(--space-sm)]">
                <Button onClick={() => setSelectedPass(null)}
                  variant="outline"
                  className="flex-1 border-border hover:bg-muted min-h-[44px] touch-manipulation"
                  data-testid="button-cancel-purchase"
                >
                  Cancel
                </Button>
                <Button onClick={() => purchaseMutation.mutate(selectedPass.id)}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 bg-[var(--game-gold)] min-h-[44px] touch-manipulation"
                  data-testid="button-confirm-purchase"
                >
                  {purchaseMutation.isPending ? (
                    'Purchasing...'
                  ) : (
                    <>
                      <Coins className="w-4 h-4 mr-2" />
                      Confirm Purchase
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
