import { storage } from "./storage";
import { PlayerStats, InsertPlayerStats } from "@shared/schema";
import { CHALLENGE_GOAL_TYPES } from "@shared/challengeConstants";

// XP Constants
const XP_CONFIG = {
  // Base XP per game type
  SINGLE_PLAYER_WIN: 15,
  SINGLE_PLAYER_LOSS: -5,
  MULTIPLAYER_WIN: 30,
  MULTIPLAYER_LOSS: -10,
  
  // Round-based XP
  ROUND_WIN: 1, // +1 XP per round win
  
  // Win streak bonuses
  STREAK_3_BONUS: 5,
  STREAK_5_BONUS: 10,
  STREAK_10_BONUS: 20,
  
  // Quiz bonuses
  QUIZ_PASS_BONUS: 25, // Bonus XP for passing a quiz (meeting pass rate requirement)
  QUIZ_PERFECT_BONUS: 50, // Extra bonus for 100% score on quiz
};

// Player level progression system (1-100)
// Generate XP thresholds dynamically using progressive formula
const generateLevelThresholds = () => {
  const levels = [];
  let cumulativeXP = 0;
  
  for (let level = 1; level <= 100; level++) {
    // Calculate XP required for this level using progressive formula
    // Formula: XP = 50 * level^1.5 (rounded)
    const xpForLevel = Math.round(50 * Math.pow(level, 1.5));
    const minXP = cumulativeXP;
    cumulativeXP += xpForLevel;
    const maxXP = level === 100 ? Infinity : cumulativeXP - 1;
    
    levels.push({ level, minXP, maxXP, xpRequired: xpForLevel });
  }
  
  return levels;
};

const LEVEL_THRESHOLDS = generateLevelThresholds();

export interface XPCalculationResult {
  baseXP: number;
  roundXP: number;
  streakBonus: number;
  quizPassBonus?: number; // Bonus for passing quiz
  quizPerfectBonus?: number; // Bonus for perfect quiz score
  totalXPChange: number;
  newXP: number;
  previousLevel: number;
  newLevel: number;
  levelChanged: boolean;
  wasPromotion: boolean;
  xpMultiplier?: number; // Power-up XP multiplier
  seasonPassXPMultiplier?: number; // Season pass XP multiplier
  combinedXPMultiplier?: number; // Final combined XP multiplier
  powerUpXPMultiplier?: number; // Combined power-up-only XP multiplier
  coinMultiplier?: number; // Power-up coin multiplier
  seasonPassCoinMultiplier?: number; // Season pass coin multiplier
  combinedCoinMultiplier?: number; // Final combined coin multiplier
  powerUpCoinMultiplier?: number; // Combined power-up-only coin multiplier
  coinsEarned?: number; // Total coins earned
}

export interface GameOutcome {
  playerId: string;
  won: boolean;
  tied?: boolean; // New flag for tie games
  gameMode: "single" | "1v1" | "4player";
  gameDuration: number;
  totalRounds: number;
  roundsWon?: number; // Number of rounds won during the game (for XP display)
  isAbandonment?: boolean; // Special flag for abandonment penalties
  // Quiz-specific fields
  isQuiz?: boolean; // Flag to indicate this is a quiz game
  quizPassed?: boolean; // Did player pass the quiz based on pass rate?
  quizPercentage?: number; // Quiz score percentage (0-100)
  quizScore?: number; // Number of correct answers
  totalQuestions?: number; // Total number of questions
}

export class XPService {
  
  /**
   * Calculate XP change for a game outcome
   */
  async calculateXPChange(outcome: GameOutcome): Promise<XPCalculationResult> {
    // Get current player stats
    const currentStats = await storage.getPlayerStats(outcome.playerId);
    const currentXP = currentStats?.currentXP || 0;
    const currentStreak = currentStats?.currentWinStreak || 0;
    const previousLevel = currentStats?.currentLevel || 1;
    
    // Calculate base XP
    let baseXP = 0;
    const isMultiplayer = outcome.gameMode === "1v1" || outcome.gameMode === "4player";
    
    // Special handling for abandonment penalty
    if (outcome.isAbandonment) {
      baseXP = -30; // Fixed -30 XP penalty for abandoning games
    } else if (outcome.won) {
      baseXP = isMultiplayer ? XP_CONFIG.MULTIPLAYER_WIN : XP_CONFIG.SINGLE_PLAYER_WIN;
    } else if (outcome.tied) {
      baseXP = 0; // Ties result in no XP change
    } else {
      baseXP = isMultiplayer ? XP_CONFIG.MULTIPLAYER_LOSS : XP_CONFIG.SINGLE_PLAYER_LOSS;
    }
    
    // Calculate round XP (1 XP per round won for single player, 2 XP for 1v1)
    const roundXPMultiplier = outcome.gameMode === "1v1" ? 2 : 1;
    const roundXP = (outcome.roundsWon || 0) * XP_CONFIG.ROUND_WIN * roundXPMultiplier;
    
    // Calculate streak bonus (only for wins, not for abandonment)
    let streakBonus = 0;
    if (outcome.won && !outcome.isAbandonment) {
      const newStreak = currentStreak + 1;
      if (newStreak >= 10) {
        streakBonus = XP_CONFIG.STREAK_10_BONUS;
      } else if (newStreak >= 5) {
        streakBonus = XP_CONFIG.STREAK_5_BONUS;
      } else if (newStreak >= 3) {
        streakBonus = XP_CONFIG.STREAK_3_BONUS;
      }
    }
    
    // Calculate quiz bonuses
    let quizPassBonus = 0;
    let quizPerfectBonus = 0;
    if (outcome.isQuiz) {
      // Bonus for passing the quiz
      if (outcome.quizPassed) {
        quizPassBonus = XP_CONFIG.QUIZ_PASS_BONUS;
      }
      // Extra bonus for perfect score
      if (outcome.quizPercentage === 100) {
        quizPerfectBonus = XP_CONFIG.QUIZ_PERFECT_BONUS;
      }
    }
    
    let baseTotal = baseXP + roundXP + streakBonus + quizPassBonus + quizPerfectBonus;
    
    // Apply active XP multiplier power-ups
    const xpMultipliers: number[] = [];
    try {
      const { gamificationService } = await import("./gamificationService");
      const activePowerUps = await gamificationService.getUserActivePowerUps(outcome.playerId);
      
      // Collect all XP multipliers from active powerups
      for (const powerUp of activePowerUps) {
        const effect = powerUp.effect as any;
        const type = (powerUp as any).effectType;
        if (type === 'xp_boost' && effect?.multiplier) {
          const parsed = parseFloat(effect.multiplier);
          if (Number.isFinite(parsed) && parsed > 0) {
            xpMultipliers.push(parsed);
          }
        }
      }
      
      if (xpMultipliers.length > 0) {
        console.log(`⚡ XP Boost powerups active! Multipliers: ${xpMultipliers.join(', ')}x`);
      }
    } catch (error) {
      console.error("Error fetching active power-ups for XP calculation:", error);
    }
    
    // Apply active Season Pass XP multiplier
    let seasonPassXPMultiplier = 1.0;
    try {
      const { gamificationService } = await import("./gamificationService");
      const activeSeasonPass = await gamificationService.getUserActiveSeasonPass(outcome.playerId);
      
      if (activeSeasonPass && activeSeasonPass.xpMultiplier) {
        const parsedSeasonPass = parseFloat(activeSeasonPass.xpMultiplier as any);
        if (Number.isFinite(parsedSeasonPass) && parsedSeasonPass > 0) {
          seasonPassXPMultiplier = parsedSeasonPass;
          console.log(`🎖️ Season Pass active! XP Multiplier: ${seasonPassXPMultiplier}x`);
        }
      }
    } catch (error) {
      console.error("Error fetching active season pass for XP calculation:", error);
    }
    
    // Combine multipliers multiplicatively: power-ups × season pass
    const powerUpXPMultiplier = xpMultipliers.length > 0
      ? xpMultipliers.reduce((product, m) => product * m, 1.0)
      : 1.0;
    const combinedXPMultiplier = powerUpXPMultiplier * seasonPassXPMultiplier;
    
    // Apply multiplier only if positive XP
    const totalXPChange = baseTotal > 0 ? Math.floor(baseTotal * combinedXPMultiplier) : baseTotal;
    const newXP = Math.max(0, currentXP + totalXPChange); // Don't allow negative XP
    
    // Determine new level
    const newLevel = this.getLevelFromXP(newXP);
    const levelChanged = newLevel !== previousLevel;
    const wasPromotion = levelChanged && newLevel > previousLevel;
    
    // Calculate coin rewards (only for quiz games that were passed)
    let coinsEarned = 0;
    const coinMultipliers: number[] = [];
    let seasonPassCoinMultiplier = 1.0;
    let powerUpCoinMultiplier = 1.0;
    let combinedCoinMultiplier = 1.0;
    
    if (outcome.isQuiz && outcome.quizPassed && !outcome.isAbandonment) {
      // Get player's organization for economy rules lookup
      let baseCoins = 0;
      try {
        const player = await storage.getUser(outcome.playerId);
        const playerRoles = await storage.getUserRoles(outcome.playerId);
        const organizationId = playerRoles && playerRoles.length > 0 ? playerRoles[0].organizationId : 'global';
        
        // Get economy rules for the organization
        const economyRules = await storage.getGamificationEconomyRules(organizationId);
        
        // Determine which action type applies based on quiz performance
        let actionType = 'quiz_win';
        if (outcome.quizPercentage === 100) {
          actionType = 'perfect_score';
        }
        
        // Find the matching rule
        const rule = economyRules.find(r => r.actionType === actionType && r.isActive);
        
        if (rule && rule.coinReward) {
          baseCoins = rule.coinReward;
          console.log(`💰 Using economy rule '${actionType}': ${baseCoins} base coins`);
        } else {
          // Fallback to formula if no rule found
          baseCoins = Math.floor(Math.abs(baseTotal) / 10);
          console.log(`⚠️ No economy rule found for '${actionType}', using formula: ${baseCoins} coins`);
        }
      } catch (error) {
        console.error("Error fetching economy rules:", error);
        // Fallback to formula on error
        baseCoins = Math.floor(Math.abs(baseTotal) / 10);
      }
      
      // Get power-up coin multipliers
      try {
        const { gamificationService } = await import("./gamificationService");
        const activePowerUps = await gamificationService.getUserActivePowerUps(outcome.playerId);
        
        for (const powerUp of activePowerUps) {
          const effect = powerUp.effect as any;
          const type = (powerUp as any).effectType;
          if (type === 'coin_multiplier' && effect?.multiplier) {
            const parsed = parseFloat(effect.multiplier);
            if (Number.isFinite(parsed) && parsed > 0) {
              coinMultipliers.push(parsed);
            }
          }
        }
        
        if (coinMultipliers.length > 0) {
          console.log(`💰 Coin Boost powerups active! Multipliers: ${coinMultipliers.join(', ')}x`);
        }
      } catch (error) {
        console.error("Error fetching active power-ups for coin calculation:", error);
      }
      
      // Get season pass coin multiplier
      try {
        const { gamificationService } = await import("./gamificationService");
        const activeSeasonPass = await gamificationService.getUserActiveSeasonPass(outcome.playerId);
        
        if (activeSeasonPass && activeSeasonPass.coinMultiplier) {
          const parsedSeasonPass = parseFloat(activeSeasonPass.coinMultiplier as any);
          if (Number.isFinite(parsedSeasonPass) && parsedSeasonPass > 0) {
            seasonPassCoinMultiplier = parsedSeasonPass;
            console.log(`🎖️ Season Pass coin bonus! Multiplier: ${seasonPassCoinMultiplier}x`);
          }
        }
      } catch (error) {
        console.error("Error fetching active season pass for coin calculation:", error);
      }
      
      // Combine multipliers multiplicatively: power-ups × season pass
      powerUpCoinMultiplier = coinMultipliers.length > 0
        ? coinMultipliers.reduce((product, m) => product * m, 1.0)
        : 1.0;
      combinedCoinMultiplier = powerUpCoinMultiplier * seasonPassCoinMultiplier;
      coinsEarned = Math.floor(baseCoins * combinedCoinMultiplier);
      
      // Award coins to player
      if (coinsEarned > 0) {
        try {
          const { gamificationService } = await import("./gamificationService");
          await gamificationService.awardCoins(
            outcome.playerId,
            coinsEarned,
            'quiz_completion',
            `Earned from quiz completion (${outcome.quizPercentage}%)`
          );
          console.log(`💰 Awarded ${coinsEarned} coins to player ${outcome.playerId}`);
        } catch (error) {
          console.error("Error awarding coins:", error);
        }
      }
    }
    
    // Award participation coins for failed quizzes (if not abandoned)
    if (outcome.isQuiz && !outcome.quizPassed && !outcome.isAbandonment) {
      try {
        const playerRoles = await storage.getUserRoles(outcome.playerId);
        const organizationId = playerRoles && playerRoles.length > 0 ? playerRoles[0].organizationId : 'global';
        
        // Get economy rules for the organization
        const economyRules = await storage.getGamificationEconomyRules(organizationId);
        
        // Find the quiz participation rule
        const rule = economyRules.find(r => r.actionType === 'quiz_participation' && r.isActive);
        
        if (rule && rule.coinReward && rule.coinReward > 0) {
          // Award participation coins (no multipliers for failed quizzes)
          const { gamificationService } = await import("./gamificationService");
          await gamificationService.awardCoins(
            outcome.playerId,
            rule.coinReward,
            'quiz_participation',
            `Participation reward for attempting quiz`
          );
          coinsEarned = rule.coinReward;
          console.log(`💰 Awarded ${rule.coinReward} participation coins to player ${outcome.playerId}`);
        }
      } catch (error) {
        console.error("Error awarding participation coins:", error);
      }
    }
    
    return {
      baseXP,
      roundXP,
      streakBonus,
      quizPassBonus: quizPassBonus > 0 ? quizPassBonus : undefined,
      quizPerfectBonus: quizPerfectBonus > 0 ? quizPerfectBonus : undefined,
      totalXPChange,
      newXP,
      previousLevel,
      newLevel,
      levelChanged,
      wasPromotion,
      xpMultiplier: powerUpXPMultiplier > 1 ? powerUpXPMultiplier : undefined,
      seasonPassXPMultiplier: seasonPassXPMultiplier > 1 ? seasonPassXPMultiplier : undefined,
      combinedXPMultiplier: combinedXPMultiplier > 1 ? combinedXPMultiplier : undefined,
      powerUpXPMultiplier: powerUpXPMultiplier > 1 ? powerUpXPMultiplier : undefined,
      coinMultiplier: powerUpCoinMultiplier > 1 ? powerUpCoinMultiplier : undefined,
      seasonPassCoinMultiplier: seasonPassCoinMultiplier > 1 ? seasonPassCoinMultiplier : undefined,
      combinedCoinMultiplier: combinedCoinMultiplier > 1 ? combinedCoinMultiplier : undefined,
      powerUpCoinMultiplier: powerUpCoinMultiplier > 1 ? powerUpCoinMultiplier : undefined,
      coinsEarned: coinsEarned > 0 ? coinsEarned : undefined,
    };
  }
  
  /**
   * Update player stats after a game
   * 
   * IMPORTANT: 
   * - Quiz games: Full stats tracking for quiz leaderboard system
   * - Battle cards: XP progression only (no competitive stats/leaderboard)
   */
  async updatePlayerStatsAfterGame(outcome: GameOutcome): Promise<{
    updatedStats: PlayerStats;
    xpResult: XPCalculationResult;
  }> {
    const xpResult = await this.calculateXPChange(outcome);
    const currentStats = await storage.getPlayerStats(outcome.playerId);
    
    // Battle cards: Update XP progression only (no competitive stats)
    if (!outcome.isQuiz) {
      console.log(`🎮 Battle card game - updating XP only (no competitive stats)`);
      
      // Save XP and level changes ONLY - no wins/losses/streaks
      const updates: Partial<InsertPlayerStats> = {
        currentXP: xpResult.newXP,
        currentLevel: xpResult.newLevel,
        totalXPEarned: (currentStats?.totalXPEarned || 0) + Math.max(0, xpResult.totalXPChange),
        totalXPLost: (currentStats?.totalXPLost || 0) + Math.max(0, -xpResult.totalXPChange),
        lastLevelChangeAt: xpResult.levelChanged ? new Date() : currentStats?.lastLevelChangeAt,
      };
      
      const updatedStats = await storage.upsertPlayerStats(outcome.playerId, updates);
      
      // Update season pass XP for battle card games too
      if (xpResult.totalXPChange > 0) {
        await this.updateSeasonPassXPForUser(outcome.playerId, xpResult.totalXPChange);
      }
      
      // No leaderboard update for battle cards
      return {
        updatedStats,
        xpResult,
      };
    }
    
    // QUIZ GAMES: Track all stats for quiz leaderboard system
    console.log(`🎓 Quiz game - updating playerStats for leaderboard`);
    
    const isMultiplayer = outcome.gameMode === "1v1" || outcome.gameMode === "4player";
    const isSinglePlayer = outcome.gameMode === "single";
    
    const updates: Partial<InsertPlayerStats> = {
      currentXP: xpResult.newXP,
      currentLevel: xpResult.newLevel,
      totalGamesPlayed: (currentStats?.totalGamesPlayed || 0) + 1,
      totalWins: (currentStats?.totalWins || 0) + (outcome.won ? 1 : 0),
      totalLosses: (currentStats?.totalLosses || 0) + (outcome.won ? 0 : 1),
      currentWinStreak: outcome.won ? (currentStats?.currentWinStreak || 0) + 1 : 0,
      bestWinStreak: outcome.won 
        ? Math.max(currentStats?.bestWinStreak || 0, (currentStats?.currentWinStreak || 0) + 1)
        : currentStats?.bestWinStreak || 0,
      singlePlayerGames: (currentStats?.singlePlayerGames || 0) + (isSinglePlayer ? 1 : 0),
      singlePlayerWins: (currentStats?.singlePlayerWins || 0) + (isSinglePlayer && outcome.won ? 1 : 0),
      multiplayerGames: (currentStats?.multiplayerGames || 0) + (isMultiplayer ? 1 : 0),
      multiplayerWins: (currentStats?.multiplayerWins || 0) + (isMultiplayer && outcome.won ? 1 : 0),
      totalXPEarned: (currentStats?.totalXPEarned || 0) + Math.max(0, xpResult.totalXPChange),
      totalXPLost: (currentStats?.totalXPLost || 0) + Math.max(0, -xpResult.totalXPChange),
      lastGameAt: new Date(),
      lastLevelChangeAt: xpResult.levelChanged ? new Date() : currentStats?.lastLevelChangeAt,
    };
    
    // Calculate win percentage
    const totalGames = updates.totalGamesPlayed!;
    const totalWins = updates.totalWins!;
    updates.winPercentage = totalGames > 0 ? ((totalWins / totalGames) * 100).toFixed(2) : "0.00";
    
    // Calculate average game duration
    const currentTotalDuration = (currentStats?.averageGameDuration || 0) * (currentStats?.totalGamesPlayed || 0);
    const newTotalDuration = currentTotalDuration + outcome.gameDuration;
    updates.averageGameDuration = Math.round(newTotalDuration / totalGames);
    
    const updatedStats = await storage.upsertPlayerStats(outcome.playerId, updates);
    
    // Update leaderboard entry for quiz players
    await this.updateLeaderboardEntry(outcome.playerId, updatedStats);
    
    // Update season pass XP for quiz games when positive XP is earned
    if (xpResult.totalXPChange > 0) {
      await this.updateSeasonPassXPForUser(outcome.playerId, xpResult.totalXPChange);
    }
    
    // Track challenge progress for quiz completion
    try {
      const { gamificationService } = await import("./gamificationService");
      
      // Ensure challenge progress records exist BEFORE getting them
      // This is critical for users who haven't viewed their challenges page yet
      await gamificationService.ensureChallengeProgress(outcome.playerId);
      
      // Get all active challenges for this user
      const userChallenges = await gamificationService.getUserChallengeProgress(outcome.playerId);
      
      // Update progress for quiz_completions challenges (ANY quiz completion, pass or fail)
      if (outcome.isQuiz) {
        for (const challenge of userChallenges) {
          if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.QUIZ_COMPLETIONS && !challenge.isCompleted && !challenge.isClaimed) {
            await gamificationService.updateChallengeProgress(
              outcome.playerId,
              challenge.challengeId,
              1
            );
            console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (quiz_completions)`);
          }
        }
      }
      
      // Update progress for quiz_wins challenges (if quiz passed)
      if (outcome.quizPassed) {
        for (const challenge of userChallenges) {
          if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.QUIZ_WINS && !challenge.isCompleted && !challenge.isClaimed) {
            await gamificationService.updateChallengeProgress(
              outcome.playerId,
              challenge.challengeId,
              1
            );
            console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (quiz_wins)`);
          }
          // Also check for legacy quiz_passes challenges
          if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.QUIZ_PASSES && !challenge.isCompleted && !challenge.isClaimed) {
            await gamificationService.updateChallengeProgress(
              outcome.playerId,
              challenge.challengeId,
              1
            );
            console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (quiz_passes)`);
          }
        }
      }
      
      // Update progress for perfect_scores challenges (if quiz had 100% score)
      if (outcome.quizPassed && outcome.quizPercentage === 100) {
        for (const challenge of userChallenges) {
          if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.PERFECT_SCORES && !challenge.isCompleted && !challenge.isClaimed) {
            await gamificationService.updateChallengeProgress(
              outcome.playerId,
              challenge.challengeId,
              1
            );
            console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (perfect_scores)`);
          }
        }
      }
      
      // Update progress for correct_answers challenges (increment by number of correct answers)
      if (outcome.isQuiz && outcome.quizScore && outcome.quizScore > 0) {
        for (const challenge of userChallenges) {
          if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.CORRECT_ANSWERS && !challenge.isCompleted && !challenge.isClaimed) {
            await gamificationService.updateChallengeProgress(
              outcome.playerId,
              challenge.challengeId,
              outcome.quizScore
            );
            console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (correct_answers: +${outcome.quizScore})`);
          }
        }
      }
      
      // Update progress for xp_earned challenges (if XP was gained)
      if (xpResult.totalXPChange > 0) {
        for (const challenge of userChallenges) {
          if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.XP_EARNED && !challenge.isCompleted && !challenge.isClaimed) {
            await gamificationService.updateChallengeProgress(
              outcome.playerId,
              challenge.challengeId,
              xpResult.totalXPChange
            );
            console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (xp_earned: +${xpResult.totalXPChange} XP)`);
          }
        }
      }
    } catch (error) {
      console.error("Error updating challenge progress:", error);
    }
    
    return {
      updatedStats,
      xpResult,
    };
  }
  
  /**
   * Get level from XP amount
   */
  getLevelFromXP(xp: number): number {
    for (const threshold of LEVEL_THRESHOLDS) {
      if (xp >= threshold.minXP && xp <= threshold.maxXP) {
        return threshold.level;
      }
    }
    return 100; // Fallback for max level
  }
  
  /**
   * Get XP needed for next level
   */
  getXPForNextLevel(currentXP: number): { nextLevel: number; xpNeeded: number; xpProgress: number; xpRequired: number } | null {
    const currentLevelIndex = LEVEL_THRESHOLDS.findIndex(l => 
      currentXP >= l.minXP && currentXP <= l.maxXP
    );
    
    if (currentLevelIndex === -1 || currentLevelIndex >= LEVEL_THRESHOLDS.length - 1) {
      return null; // Already at max level
    }
    
    const nextLevel = LEVEL_THRESHOLDS[currentLevelIndex + 1];
    const currentLevel = LEVEL_THRESHOLDS[currentLevelIndex];
    
    const xpNeeded = nextLevel.minXP - currentXP;
    const xpProgress = currentXP - currentLevel.minXP;
    
    return {
      nextLevel: nextLevel.level,
      xpNeeded,
      xpProgress,
      xpRequired: currentLevel.xpRequired,
    };
  }
  
  /**
   * Update leaderboard entry to keep it in sync with player stats
   */
  private async updateLeaderboardEntry(playerId: string, playerStats: PlayerStats): Promise<void> {
    const user = await storage.getUser(playerId);
    if (!user) return;
    
    const leaderboardData = {
      gamerName: playerStats.gamerName,
      avatarImageUrl: user.avatarImageUrl,
      country: user.country,
      playerTitle: `Level ${playerStats.currentLevel}`,
      totalWins: playerStats.totalWins,
      totalGames: playerStats.totalGamesPlayed,
      winPercentage: playerStats.winPercentage,
      bestWinStreak: playerStats.bestWinStreak,
      currentWinStreak: playerStats.currentWinStreak,
      averageGameDuration: playerStats.averageGameDuration,
      lastActiveAt: new Date(),
      updatedAt: new Date(),
    };
    
    await storage.upsertLeaderboardEntry(playerStats.gamerName, leaderboardData);
  }

  /**
   * Award XP for winning a round
   */
  async awardRoundXP(playerId: string): Promise<{
    xpAwarded: number;
    newXP: number;
    newLevel: number;
    levelChanged: boolean;
    wasPromotion: boolean;
  }> {
    const currentStats = await storage.getPlayerStats(playerId);
    const currentXP = currentStats?.currentXP || 0;
    const previousLevel = currentStats?.currentLevel || 1;
    
    // Base round win XP
    let baseXP = XP_CONFIG.ROUND_WIN;
    
    // Apply active XP multiplier power-ups
    let xpMultiplier = 1.0;
    try {
      const { gamificationService } = await import("./gamificationService");
      const activePowerUps = await gamificationService.getUserActivePowerUps(playerId);
      
      for (const powerUp of activePowerUps) {
        const effect = powerUp.effect as any;
        if (effect?.type === 'xp_multiplier' && effect?.value) {
          xpMultiplier = Math.max(xpMultiplier, effect.value);
        }
      }
    } catch (error) {
      console.error("Error fetching active power-ups for round XP:", error);
    }
    
    // Apply multiplier
    const xpAwarded = Math.floor(baseXP * xpMultiplier);
    const newXP = Math.max(0, currentXP + xpAwarded);
    
    // Determine new level
    const newLevel = this.getLevelFromXP(newXP);
    const levelChanged = newLevel !== previousLevel;
    const wasPromotion = levelChanged && newLevel > previousLevel;
    
    // Update player stats with new XP and level
    const updates: Partial<InsertPlayerStats> = {
      currentXP: newXP,
      currentLevel: newLevel,
      totalXPEarned: (currentStats?.totalXPEarned || 0) + xpAwarded,
      lastLevelChangeAt: levelChanged ? new Date() : currentStats?.lastLevelChangeAt,
    };
    
    const updatedStats = await storage.upsertPlayerStats(playerId, updates);
    
    // Update leaderboard to keep it in sync
    await this.updateLeaderboardEntry(playerId, updatedStats);
    
    return {
      xpAwarded,
      newXP,
      newLevel,
      levelChanged,
      wasPromotion,
    };
  }

  /**
   * Get all level thresholds for UI display
   */
  getAllLevels() {
    return LEVEL_THRESHOLDS;
  }

  /**
   * Update season pass XP for a user based on their organization or global config.
   * This works for ALL users, not just those who purchased a premium pass.
   * The season pass tracks XP progress regardless of purchase status.
   */
  private async updateSeasonPassXPForUser(playerId: string, xpToAdd: number): Promise<void> {
    try {
      const { gamificationService } = await import("./gamificationService");
      
      // Get the user's organization to find their season pass config
      const playerRoles = await storage.getUserRoles(playerId);
      const organizationId = playerRoles && playerRoles.length > 0 ? playerRoles[0].organizationId : undefined;
      
      // Try to get org-specific season pass config, fallback to global
      let seasonPassConfig = organizationId ? await storage.getSeasonPassConfig(organizationId) : null;
      
      if (!seasonPassConfig) {
        seasonPassConfig = await storage.getSeasonPassConfig('global');
      }
      
      // If no season pass config exists at all, nothing to update
      if (!seasonPassConfig) {
        console.log(`ℹ️ No season pass config found for player ${playerId}, skipping XP update`);
        return;
      }
      
      // Update season pass progress for this config (works for all users, purchased or not)
      console.log(`🎖️ Updating season pass XP: +${xpToAdd} XP for config ${seasonPassConfig.id}`);
      await gamificationService.updateSeasonPassXP(
        playerId,
        seasonPassConfig.id,
        xpToAdd
      );
    } catch (error) {
      console.error("Error updating season pass XP:", error);
    }
  }
}

export const xpService = new XPService();
