import { useQuery, useMutation } from '@tanstack/react-query';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { Trophy, Coins, Sparkles, Gift, Lock, Check } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

interface Tier {
  id: string;
  tier: number;
  requiredXP: number;
  freeReward?: {
    type: string;
    amount: number;
    id?: string;
    name?: string;
  } | null;
  premiumReward?: {
    type: string;
    amount: number;
    id?: string;
    name?: string;
  } | null;
  rewards?: {
    type: string;
    amount: number;
    id?: string;
    name: string;
  };
  isUnlocked: boolean;
  isClaimed: boolean;
}

interface SeasonPassData {
  currentTier: number;
  currentXP: number;
  hasActivePass: boolean;
  tiers: Tier[];
  seasonPassConfigId?: string;
  seasonName?: string;
  coinCost?: number;
  startDate?: string;
  endDate?: string;
}

interface GamificationStats {
  coinBalance: number;
  playerStats: {
    currentXP: number;
    level: number;
  };
}

export function SeasonPassProgressBar() {
  const { toast } = useToast();

  const { data: seasonPassData, isLoading } = useQuery<SeasonPassData>({
    queryKey: ['/api/gamification/season-pass'],
  });

  const { data: stats } = useQuery<GamificationStats>({
    queryKey: ['/api/gamification/dashboard'],
  });

  const claimRewardMutation = useMutation({
    mutationFn: async (tierId: string) => {
      return await apiRequest('/api/gamification/season-pass/claim-tier', {
        method: 'POST',
        body: JSON.stringify({ tierId }),
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Reward Claimed!",
        description: `You received your ${data.reward?.type} reward!`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/season-pass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: "Claim Failed",
        description: error.message || "Could not claim reward",
        variant: "destructive",
      });
    },
  });

  const purchasePassMutation = useMutation({
    mutationFn: async (seasonPassConfigId: string) => {
      return await apiRequest('/api/gamification/season-pass/purchase', {
        method: 'POST',
        body: JSON.stringify({ seasonPassConfigId }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Season Pass Purchased!",
        description: "You now have access to premium rewards!",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/season-pass'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
    },
    onError: (error: any) => {
      toast({
        title: "Purchase Failed",
        description: error.message || "Could not purchase season pass",
        variant: "destructive",
      });
    },
  });

  if (isLoading || !seasonPassData) {
    return null;
  }

  const hasActivePass = seasonPassData.hasActivePass;
  const currentXP = seasonPassData.currentXP;
  const coinCost = seasonPassData.coinCost || 0;
  const userCoins = stats?.coinBalance || 0;
  const coinDeficit = Math.max(0, coinCost - userCoins);
  const canAffordPass = userCoins >= coinCost;
  
  const FREE_TIER_LIMIT = 4;
  const nextTier = seasonPassData.tiers.find(t => !t.isUnlocked);
  const progressToNext = nextTier 
    ? Math.min((currentXP / nextTier.requiredXP) * 100, 100)
    : 100;

  const claimableTiersCount = seasonPassData.tiers.filter(
    t => t.isUnlocked && !t.isClaimed && (!hasActivePass ? t.tier <= FREE_TIER_LIMIT : true)
  ).length;

  const getRewardIcon = (rewardType: string) => {
    switch (rewardType) {
      case 'coins': return <Coins className="w-4 h-4" />;
      case 'cosmetic': return <Sparkles className="w-4 h-4" />;
      case 'power_up': return <Gift className="w-4 h-4" />;
      default: return <Trophy className="w-4 h-4" />;
    }
  };

  const getTierReward = (tier: Tier) => {
    const isPremiumOnly = tier.tier > FREE_TIER_LIMIT;
    
    if (tier.freeReward || tier.premiumReward) {
      if (isPremiumOnly && tier.premiumReward) {
        return tier.premiumReward;
      }
      return tier.freeReward;
    }
    
    return tier.rewards || null;
  };

  const getRewardLabel = (tier: Tier) => {
    const reward = getTierReward(tier);
    if (!reward?.type) {
      return 'Reward';
    }
    if (reward.type === 'coins') {
      return `${reward.amount || 0} Coins`;
    }
    return reward.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const seasonTimeframe = seasonPassData.startDate && seasonPassData.endDate
    ? `${formatDate(seasonPassData.startDate)} - ${formatDate(seasonPassData.endDate)}`
    : '';

  return (
    <CollapsibleSection
      title={seasonPassData.seasonName || 'Season Pass'}
      description={seasonTimeframe}
      icon={Trophy}
      defaultOpen={false}
      badgeCount={claimableTiersCount}
      badgeLabel={claimableTiersCount === 1 ? "1 tier to claim!" : `${claimableTiersCount} tiers to claim!`}
      testId="season-pass-card"
      className="bg-surface-raised border-primary/50 shadow-elevated"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {hasActivePass ? (
              <Badge className="from-[var(--warning)] font-bold">
                PREMIUM
              </Badge>
            ) : (
              <Badge variant="outline" >
                FREE
              </Badge>
            )}
          </div>
          {!hasActivePass && seasonPassData.seasonPassConfigId && (
            <div className="flex flex-col items-end gap-1">
              <Button size="sm" className={`${ canAffordPass ? 'bg-warning' : 'bg-[var(--surface-muted)] cursor-not-allowed' } text-warning-foreground font-bold`} onClick={() => canAffordPass && purchasePassMutation.mutate(seasonPassData.seasonPassConfigId!)}
                disabled={purchasePassMutation.isPending || !canAffordPass}
                data-testid="button-purchase-season-pass"
              >
                {purchasePassMutation.isPending ? 'Purchasing...' : `Purchase (${coinCost.toLocaleString()} 🪙)`}
              </Button>
              {!canAffordPass && coinDeficit > 0 && (
                <span className="text-xs text-destructive" data-testid="text-coin-deficit">
                  Need {coinDeficit.toLocaleString()} more coins
                </span>
              )}
            </div>
          )}
        </div>

        {!hasActivePass && (
          <div className="bg-warning/15 border border-[var(--warning)]/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-sm text-warning/90">
              <Lock className="w-4 h-4" />
              <span className="font-semibold">Free Tier: Tiers 1-{FREE_TIER_LIMIT} Available</span>
            </div>
            <p className="text-xs text-warning/70 mt-1">
              Upgrade to Premium to unlock all {seasonPassData.tiers.length} tiers and claim exclusive rewards!
            </p>
          </div>
        )}
        
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              Tier {seasonPassData.currentTier} {nextTier && `→ Tier ${nextTier.tier}`}
            </span>
            <span className="text-muted-foreground">
              {currentXP} / {nextTier?.requiredXP || currentXP} XP
            </span>
          </div>
          <Progress value={progressToNext} className="h-3 bg-[var(--surface-muted)]">
            <div className="h-full bg-primary hover:bg-primary/90 transition-all duration-500" style={{ width: `${progressToNext}%` }} />
          </Progress>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
          {seasonPassData.tiers.slice(0, 12).map((tier) => {
            const isPremiumOnly = !hasActivePass && tier.tier > FREE_TIER_LIMIT;
            const canClaim = tier.isUnlocked && !tier.isClaimed && !isPremiumOnly;
            
            return (
              <div
                key={tier.id}
                className={`
                  relative p-2 rounded-lg border-2 transition-all duration-300
                  ${isPremiumOnly
                    ? 'border-[var(--warning)] bg-warning/10 opacity-60'
                    : tier.isUnlocked && !tier.isClaimed
                    ? 'border-accent bg-accent/20 animate-pulse'
                    : tier.isUnlocked && tier.isClaimed
                    ? 'border-[var(--success)] bg-success/10'
                    : 'border-[var(--stroke-default)] bg-[var(--surface-muted)]/50'
                  }
                `}
                data-testid={`season-tier-${tier.tier}`}
              >
                {isPremiumOnly && (
                  <div className="absolute -top-1 -right-1 bg-warning text-warning-foreground text-[8px] px-1 rounded font-bold">
                    PRO
                  </div>
                )}
                <div className="text-xs text-center mb-1 text-muted-foreground">
                  Tier {tier.tier}
                </div>
                <div className="flex items-center justify-center mb-1">
                  {tier.isClaimed ? (
                    <Check className="w-6 h-6 text-success" data-testid={`tier-claimed-${tier.tier}`} />
                  ) : tier.isUnlocked && !isPremiumOnly ? (
                    <div className="text-accent" data-testid={`tier-unlocked-${tier.tier}`}>
                      {getRewardIcon(getTierReward(tier)?.type || '')}
                    </div>
                  ) : (
                    <Lock className={`w-5 h-5 ${isPremiumOnly ? 'text-warning' : 'text-muted-foreground'}`} data-testid={`tier-locked-${tier.tier}`} />
                  )}
                </div>
                <div className={`text-[10px] text-center font-semibold truncate ${
                  tier.isClaimed ? 'text-success' : tier.isUnlocked && !isPremiumOnly ? 'text-accent' : isPremiumOnly ? 'text-warning' : 'text-muted-foreground'
                }`}>
                  {(() => {
                    const reward = getTierReward(tier);
                    return reward?.type === 'coins' && reward?.amount 
                      ? `${reward.amount} Coins` 
                      : getRewardLabel(tier);
                  })()}
                </div>
                {canClaim && (
                  <Button size="sm" className="w-full mt-1 h-6 font-bold" onClick={() => claimRewardMutation.mutate(tier.id)}
                    disabled={claimRewardMutation.isPending}
                    data-testid={`button-claim-tier-${tier.tier}`}
                  >
                    Claim
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {nextTier && nextTier.requiredXP && (
          <div className="bg-primary hover:bg-primary/90 border border-primary/30 rounded-lg p-3 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-accent">
                  {getRewardIcon(getTierReward(nextTier)?.type || '')}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Next Reward</div>
                  <div className="text-sm font-bold text-foreground">
                    {(() => {
                      const reward = getTierReward(nextTier);
                      return reward?.type === 'coins' ? `${reward.amount || 0} Coins` : getRewardLabel(nextTier);
                    })()}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Need</div>
                <div className="text-lg font-bold text-primary">
                  {Math.max(0, nextTier.requiredXP - currentXP).toLocaleString()} XP
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </CollapsibleSection>
  );
}
