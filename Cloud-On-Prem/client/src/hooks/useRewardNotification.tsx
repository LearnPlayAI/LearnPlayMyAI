import { useToast } from "./use-toast";
import { Coins, Trophy, Star, Zap, Sparkles, Gift, Crown, Award } from "lucide-react";

type RewardType = 
  | 'coins' 
  | 'powerup' 
  | 'cosmetic' 
  | 'levelup' 
  | 'challenge' 
  | 'seasonpass' 
  | 'achievement'
  | 'streak';

interface RewardNotificationOptions {
  type: RewardType;
  title: string;
  description?: string;
  amount?: number;
  tier?: 'common' | 'rare' | 'epic' | 'legendary';
  duration?: number;
}

const REWARD_ICONS = {
  coins: Coins,
  powerup: Zap,
  cosmetic: Sparkles,
  levelup: Trophy,
  challenge: Star,
  seasonpass: Crown,
  achievement: Award,
  streak: Gift,
};

const TIER_COLORS = {
  common: 'text-muted-foreground border-border bg-muted/90',
  rare: 'text-secondary border-[var(--action-secondary)]/30 bg-[var(--action-secondary)]/10',
  epic: 'text-primary border-[var(--action-primary)]/30 bg-[var(--action-primary)]/10',
  legendary: 'text-glow-gold border-[var(--game-gold)]/40 bg-[var(--game-gold)]/10',
};

const TIER_GLOWS = {
  common: '',
  rare: 'shadow-[0_0_20px_color-mix(in_srgb,_var(--action-secondary)_30%,_transparent)]',
  epic: 'shadow-[0_0_25px_color-mix(in_srgb,_var(--action-primary)_40%,_transparent)]',
  legendary: 'shadow-[0_0_30px_color-mix(in_srgb,_var(--game-gold)_50%,_transparent)] animate-pulse',
};

export function useRewardNotification() {
  const { toast } = useToast();

  const showReward = ({
    type,
    title,
    description,
    amount,
    tier = 'common',
    duration = 4000,
  }: RewardNotificationOptions) => {
    const Icon = REWARD_ICONS[type];
    const colorClass = TIER_COLORS[tier];
    const glowClass = TIER_GLOWS[tier];

    toast({
      duration,
      className: `border-2 ${colorClass} ${glowClass} backdrop-blur-sm animate-slide-in-top`,
      title: title,
      description: (
        <div className="flex items-center gap-3" data-testid={`notification-${type}`}>
          <div className={`p-2 rounded-full bg-current/10 ${tier === 'legendary' ? 'animate-bounce' : ''}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="font-bold text-base flex items-center gap-2">
              {tier === 'legendary' && <Sparkles className="w-4 h-4 animate-spin" />}
            </div>
            {description && (
              <div className="text-sm opacity-80 mt-0.5">{description}</div>
            )}
            {amount !== undefined && (
              <div className="text-lg font-bold mt-1 flex items-center gap-1">
                {type === 'coins' && <Coins className="w-5 h-5" />}
                +{amount.toLocaleString()}
                {type === 'coins' && ' coins'}
              </div>
            )}
          </div>
        </div>
      ),
    });
  };

  const showCoins = (amount: number, reason?: string) => {
    showReward({
      type: 'coins',
      title: 'Coins Earned!',
      description: reason,
      amount,
      tier: amount >= 1000 ? 'legendary' : amount >= 500 ? 'epic' : amount >= 100 ? 'rare' : 'common',
    });
  };

  const showLevelUp = (level: number) => {
    showReward({
      type: 'levelup',
      title: `Level ${level} Reached!`,
      description: 'Keep up the great work!',
      tier: 'epic',
      duration: 5000,
    });
  };

  const showPowerUp = (name: string, tier: 'common' | 'rare' | 'epic' | 'legendary' = 'common') => {
    showReward({
      type: 'powerup',
      title: 'Power-Up Unlocked!',
      description: name,
      tier,
      duration: 4000,
    });
  };

  const showCosmetic = (name: string, tier: 'common' | 'rare' | 'epic' | 'legendary') => {
    showReward({
      type: 'cosmetic',
      title: 'Cosmetic Unlocked!',
      description: name,
      tier,
      duration: 5000,
    });
  };

  const showChallenge = (name: string, reward: number) => {
    showReward({
      type: 'challenge',
      title: 'Challenge Complete!',
      description: name,
      amount: reward,
      tier: 'rare',
      duration: 4500,
    });
  };

  const showSeasonPass = (tier: number, reward: string) => {
    showReward({
      type: 'seasonpass',
      title: `Season Pass Tier ${tier}!`,
      description: `Unlocked: ${reward}`,
      tier: 'epic',
      duration: 5000,
    });
  };

  const showAchievement = (name: string, description?: string) => {
    showReward({
      type: 'achievement',
      title: name,
      description,
      tier: 'legendary',
      duration: 6000,
    });
  };

  const showStreak = (days: number) => {
    showReward({
      type: 'streak',
      title: `${days} Day Streak!`,
      description: 'Daily login bonus earned',
      tier: days >= 7 ? 'epic' : days >= 3 ? 'rare' : 'common',
      duration: 4000,
    });
  };

  return {
    showReward,
    showCoins,
    showLevelUp,
    showPowerUp,
    showCosmetic,
    showChallenge,
    showSeasonPass,
    showAchievement,
    showStreak,
  };
}
