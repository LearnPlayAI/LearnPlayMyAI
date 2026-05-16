/**
 * Canonical season pass tier definitions
 * These are the source of truth for season pass progression
 */

export interface SeasonPassTierDefinition {
  tier: number;
  xpRequired: number; // Cumulative XP needed to reach this tier
  rewardType: 'coins' | 'power_up' | 'cosmetic';
  rewardAmount?: number; // For coin rewards
  rewardLabel?: string; // Display label like "Power Up" or "Cosmetic"
}

export interface SeasonPassDefinition {
  seasonNumber: number;
  seasonName: string;
  description: string;
  scope: 'global' | 'organization';
  startDate: Date;
  endDate: Date;
  coinCost: number;
  coinMultiplier: string;
  xpMultiplier: string;
  advantages: string;
  tiers: SeasonPassTierDefinition[];
}

// Default Season 1 - Global Season Pass
export const DEFAULT_SEASON_PASS: SeasonPassDefinition = {
  seasonNumber: 1,
  seasonName: "Season 1",
  description: "Complete challenges and level up through tiers to earn rewards!",
  scope: "global",
  startDate: new Date('2024-01-01'),
  endDate: new Date('2025-12-31'),
  coinCost: 500,
  coinMultiplier: "1.25",
  xpMultiplier: "1.50",
  advantages: "Unlock exclusive rewards, earn 25% more coins, and gain 50% more XP!",
  tiers: [
    { tier: 1, xpRequired: 1000, rewardType: 'coins', rewardAmount: 60 },
    { tier: 2, xpRequired: 2000, rewardType: 'coins', rewardAmount: 70 },
    { tier: 3, xpRequired: 3000, rewardType: 'coins', rewardAmount: 80 },
    { tier: 4, xpRequired: 4000, rewardType: 'coins', rewardAmount: 90 },
    { tier: 5, xpRequired: 5000, rewardType: 'power_up', rewardLabel: 'Power Up' },
    { tier: 6, xpRequired: 6000, rewardType: 'coins', rewardAmount: 110 },
    { tier: 7, xpRequired: 7000, rewardType: 'coins', rewardAmount: 120 },
    { tier: 8, xpRequired: 8000, rewardType: 'coins', rewardAmount: 130 },
    { tier: 9, xpRequired: 9000, rewardType: 'coins', rewardAmount: 140 },
    { tier: 10, xpRequired: 10000, rewardType: 'cosmetic', rewardLabel: 'Cosmetic' },
    { tier: 11, xpRequired: 11000, rewardType: 'coins', rewardAmount: 160 },
    { tier: 12, xpRequired: 12000, rewardType: 'coins', rewardAmount: 170 },
  ],
};
