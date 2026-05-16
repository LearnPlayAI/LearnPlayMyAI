/**
 * Shared level calculation utilities for both client and server
 * Uses progressive XP formula: XP for level N = 50 * N^1.5 (rounded)
 */

export interface LevelThreshold {
  level: number;
  xpRequired: number; // Cumulative XP to reach this level
}

export interface LevelProgress {
  currentLevel: number;
  xpInCurrentLevel: number; // XP earned within current level
  xpNeededForNextLevel: number; // XP needed to reach next level
  progress: number; // Percentage progress (0-100)
  nextLevel: number;
}

/**
 * Get XP required to reach a specific level (cumulative)
 * @param level The target level (1-100)
 * @returns Cumulative XP required to reach that level
 */
export function getXPForLevel(level: number): number {
  if (level <= 1) return 0;
  if (level > 100) level = 100;
  
  // Calculate cumulative XP for all levels up to the target level
  let cumulativeXP = 0;
  for (let l = 2; l <= level; l++) {
    cumulativeXP += Math.round(50 * Math.pow(l, 1.5));
  }
  return cumulativeXP;
}

/**
 * Get current level from total XP
 * @param xp Total XP amount
 * @returns Current level (1-100)
 */
export function getLevelFromXP(xp: number): number {
  if (xp < 0) return 1;
  
  // Find the highest level where cumulative XP <= player's XP
  for (let level = 1; level <= 100; level++) {
    const xpForNextLevel = getXPForLevel(level + 1);
    if (xp < xpForNextLevel) {
      return level;
    }
  }
  return 100; // Max level
}

/**
 * Get XP needed for next level
 * @param currentLevel Current player level
 * @returns XP needed to reach the next level
 */
export function getXPForNextLevel(currentLevel: number): number {
  if (currentLevel >= 100) return 0;
  const currentLevelXP = getXPForLevel(currentLevel);
  const nextLevelXP = getXPForLevel(currentLevel + 1);
  return nextLevelXP - currentLevelXP;
}

/**
 * Get detailed progress information for current level
 * @param currentXP Total XP amount
 * @param currentLevel Current player level
 * @returns Level progress details
 */
export function getLevelProgress(currentXP: number, currentLevel: number): LevelProgress {
  if (currentLevel >= 100) {
    return {
      currentLevel: 100,
      xpInCurrentLevel: 0,
      xpNeededForNextLevel: 0,
      progress: 100,
      nextLevel: 100
    };
  }
  
  const currentLevelXP = getXPForLevel(currentLevel);
  const nextLevelXP = getXPForLevel(currentLevel + 1);
  const xpInCurrentLevel = currentXP - currentLevelXP;
  const xpNeededForNextLevel = nextLevelXP - currentLevelXP;
  const progress = (xpInCurrentLevel / xpNeededForNextLevel) * 100;
  
  return {
    currentLevel,
    xpInCurrentLevel: Math.max(0, xpInCurrentLevel),
    xpNeededForNextLevel,
    progress: Math.min(100, Math.max(0, progress)),
    nextLevel: currentLevel + 1
  };
}

/**
 * Generate all level thresholds (1-100)
 * @returns Array of level thresholds with cumulative XP
 */
export function getAllLevelThresholds(): LevelThreshold[] {
  const thresholds: LevelThreshold[] = [];
  for (let level = 1; level <= 100; level++) {
    thresholds.push({
      level,
      xpRequired: getXPForLevel(level)
    });
  }
  return thresholds;
}

/**
 * Get level icon component name based on level
 * @param level Current level
 * @returns Icon identifier string
 */
export function getLevelIconType(level: number): string {
  if (level >= 90) return 'crown';
  if (level >= 70) return 'trophy';
  if (level >= 50) return 'award';
  if (level >= 30) return 'shield';
  return 'star';
}

/**
 * Get level color class based on level
 * @param level Current level
 * @returns Tailwind CSS color class
 */
export function getLevelColor(level: number): string {
  if (level >= 90) return 'text-[var(--leaderboard-gold)]';
  if (level >= 70) return 'text-[var(--action-accent)]';
  if (level >= 50) return 'text-[var(--action-primary)]';
  if (level >= 30) return 'text-[var(--success)]';
  return 'text-[var(--text-muted)]';
}
