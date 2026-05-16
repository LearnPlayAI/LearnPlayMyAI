import { storage } from "./storage";
import type { Card, CardStat, CollectionStatType, GameRoom, PlayerSession } from "@shared/schema";

export interface GameState {
  gameRoomId: string;
  players: PlayerSession[];
  currentPlayerPosition: number;
  roundNumber: number;
  gameTimer: number; // seconds remaining (2 minutes = 120)
  playerTimer: number; // seconds remaining for current player (3 seconds)
  playerTimerRemaining?: number; // countdown timer for current player's turn
  middlePile: string[]; // card IDs in middle pile for tie-breakers
  cards: Map<string, any>; // Cache of all cards with stats for this game
  selectedStat?: {
    statTypeId: string;
    statName: string;
  };
  roundCards: Array<{
    playerId: string;
    cardId: string;
    statValue?: number;
  }>;
  gamePhase: "waiting" | "dealing" | "playing" | "reveal" | "collecting" | "finished";
  lastWinner?: string;
  cardsWonThisRound?: number; // Track cards won in current round for animation display
  tiedStats?: string[]; // Stats that tied in special tie mode (when someone has 1 card)
  isSpecialTieMode?: boolean; // Flag for special tie handling
  specialTieStatName?: string; // Name of the stat that tied for display
}

export interface NPCPlayer {
  id: string;
  name: string;
  difficulty: "easy" | "medium" | "hard";
  cardStack: string[];
  cardCount: number;
}

export class GameEngine {
  private gameStates: Map<string, GameState> = new Map();
  private gameTimers: Map<string, NodeJS.Timeout> = new Map();
  private playerTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor() {}

  // Initialize a new game
  async initializeGame(gameRoomId: string, options?: any): Promise<GameState> {
    const gameRoom = await storage.getGameRoom(gameRoomId);
    if (!gameRoom) {
      throw new Error("Game room not found");
    }

    const players = await storage.getPlayerSessions(gameRoomId);
    const cards = await storage.getCardsWithStats(gameRoom.collectionId);
    
    // Shuffle and deal cards
    const shuffledCards = this.shuffleArray([...cards]);
    const dealedPlayers = this.dealCards(players, shuffledCards);
    
    // Create cards cache for fast lookup
    const cardsMap = new Map();
    cards.forEach(card => cardsMap.set(card.id, card));

    // Update player sessions in database
    for (const player of dealedPlayers) {
      await storage.updatePlayerSession(player.id!, {
        cardStack: player.cardStack,
        cardCount: player.cardCount,
        isActive: player.playerPosition === 0, // First player starts
      });
    }

    const gameState: GameState = {
      gameRoomId,
      players: dealedPlayers,
      currentPlayerPosition: 0,
      roundNumber: 1,
      gameTimer: gameRoom.gameTimeSeconds || 120, // Use configured game time
      playerTimer: gameRoom.roundTimeSeconds || 3, // Use configured round time
      middlePile: [],
      cards: cardsMap,
      roundCards: [],
      gamePhase: "playing",
    };

    this.gameStates.set(gameRoomId, gameState);
    this.startGameTimer(gameRoomId);
    // Don't start player timer immediately - wait for first turn event
    console.log(`⏰ Game timers initialized for room ${gameRoomId}, waiting for first turn`);
    gameState.gamePhase = "dealing";

    return gameState;
  }

  // Deal cards equally to players
  private dealCards(players: PlayerSession[], cards: any[]): PlayerSession[] {
    const playerCount = players.length;
    const cardsPerPlayer = Math.floor(cards.length / playerCount);
    
    // Validate we have enough cards for fair distribution
    if (cards.length < playerCount) {
      throw new Error(`Not enough cards for fair distribution: ${cards.length} cards for ${playerCount} players`);
    }
    
    const dealedPlayers = players.map((player, index) => {
      const playerCards = cards.slice(
        index * cardsPerPlayer, 
        (index + 1) * cardsPerPlayer
      );
      
      return {
        ...player,
        cardStack: playerCards.map(c => c.id),
        cardCount: playerCards.length,
      };
    });

    // Validate no duplicate cards between players
    this.validateNoDuplicateCards(dealedPlayers);
    
    return dealedPlayers;
  }

  // Utility function to ensure card count consistency
  private syncCardCount(player: PlayerSession): void {
    player.cardCount = player.cardStack.length;
  }

  // Validate total card conservation (for debugging)
  private validateCardConservation(gameState: GameState, totalCards: number): void {
    const currentTotal = gameState.players.reduce((sum, player) => sum + player.cardStack.length, 0) + gameState.middlePile.length;
    if (currentTotal !== totalCards) {
      console.error(`CARD CONSERVATION ERROR: Expected ${totalCards} cards, found ${currentTotal} cards`);
      console.error('Player cards:', gameState.players.map(p => ({ id: p.playerId, cards: p.cardStack.length })));
      console.error('Middle pile:', gameState.middlePile.length);
    }
  }

  // Validate no duplicate cards between players
  private validateNoDuplicateCards(players: PlayerSession[]): void {
    const allCards = new Set<string>();
    const duplicates = new Set<string>();
    
    for (const player of players) {
      for (const cardId of player.cardStack) {
        if (allCards.has(cardId)) {
          duplicates.add(cardId);
        }
        allCards.add(cardId);
      }
    }
    
    if (duplicates.size > 0) {
      console.error(`DUPLICATE CARDS DETECTED: ${Array.from(duplicates).join(', ')}`);
      console.error('Player card distributions:', players.map(p => ({ 
        id: p.playerId, 
        cards: p.cardStack 
      })));
      throw new Error(`Game integrity violation: Duplicate cards detected between players`);
    }
    
    console.log(`✅ Card uniqueness validated: ${allCards.size} unique cards distributed to ${players.length} players`);
  }

  // Player selects a stat
  async selectStat(gameRoomId: string, playerId: string, statTypeId: string): Promise<GameState> {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) {
      throw new Error("Game not found");
    }

    const currentPlayer = gameState.players[gameState.currentPlayerPosition];
    if (currentPlayer.playerId !== playerId && !currentPlayer.isNPC) {
      throw new Error("Not your turn");
    }

    // Check if this stat was already tied in special tie mode
    if (gameState.isSpecialTieMode && gameState.tiedStats?.includes(statTypeId)) {
      throw new Error("Stat already tied - select a different stat");
    }

    const statType = await storage.getCollectionStatType(statTypeId);
    if (!statType) {
      throw new Error("Stat type not found");
    }

    gameState.selectedStat = {
      statTypeId,
      statName: statType.statName,
    };

    // Stop player timer and collect all player cards for comparison
    this.clearPlayerTimer(gameRoomId);
    gameState.gamePhase = "reveal";

    // Get top cards from each player and their stat values
    gameState.roundCards = [];
    for (const player of gameState.players) {
      if (player.cardStack.length > 0) {
        const topCardId = player.cardStack[0];
        const card = gameState.cards.get(topCardId);
        
        // Find the stat value for the selected stat type
        let statValue = 0;
        if (card && card.stats) {
          const statData = card.stats.find((stat: any) => stat.statTypeId === statTypeId);
          statValue = statData ? parseFloat(statData.value.toString()) : 0;
        }
        
        gameState.roundCards.push({
          playerId: player.playerId!,
          cardId: topCardId,
          statValue,
        });
      }
    }

    return gameState;
  }

  // Determine round winner and collect cards
  async processRoundResult(gameRoomId: string): Promise<GameState> {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) {
      throw new Error("Game not found");
    }

    // Get the comparison type for the selected stat
    const statType = await storage.getCollectionStatType(gameState.selectedStat?.statTypeId!);
    const comparisonType = statType?.comparisonType || "highest";

    // Use enhanced comparison logic
    const { determineWinners } = await import("@shared/gameUtils");
    const playerValues = gameState.roundCards.map(rc => ({
      playerId: rc.playerId,
      value: rc.statValue || 0
    }));
    
    const winnerIds = determineWinners(playerValues, comparisonType as any);
    const winners = gameState.roundCards.filter(rc => winnerIds.includes(rc.playerId));

    if (winners.length === 1) {
      // Single winner - clear special tie mode if it was active
      gameState.isSpecialTieMode = false;
      gameState.tiedStats = undefined;
      gameState.specialTieStatName = undefined;
      
      const winner = winners[0];
      await this.collectCards(gameState, winner.playerId);
      gameState.lastWinner = winner.playerId;
      
      // Award round XP for authenticated real players (not NPCs or guests)
      const winnerPlayer = gameState.players.find(p => p.playerId === winner.playerId);
      
      if (winnerPlayer && !winnerPlayer.isNPC && winner.playerId) {
        try {
          // Verify this is an authenticated user by checking if they exist in the database
          const user = await storage.getUser(winner.playerId);
          
          if (user) {
            const { xpService } = await import("./xpService");
            const roundXPResult = await xpService.awardRoundXP(winner.playerId);
            console.log(`🌟 Round XP awarded to ${winner.playerId}: +${roundXPResult.xpAwarded} XP (Total: ${roundXPResult.newXP} XP)`);
            
            if (roundXPResult.wasPromotion) {
              console.log(`🎖️ ${winner.playerId} promoted to level ${roundXPResult.newLevel}!`);
            }
          }
        } catch (error) {
          console.error(`❌ Failed to award round XP to ${winner.playerId}:`, error);
          // Don't stop the game if XP fails
        }
      }
      
      // Set winner as next active player
      const winnerIndex = gameState.players.findIndex(p => p.playerId === winner.playerId);
      gameState.currentPlayerPosition = winnerIndex;
    } else {
      // TIE DETECTED - Check if this is a special tie scenario
      const hasPlayerWithOneCard = gameState.players.some(p => p.cardStack.length === 1);
      
      if (hasPlayerWithOneCard && !gameState.isSpecialTieMode) {
        // SPECIAL TIE MODE: Someone has 1 card left, don't remove cards yet
        console.log(`🎯 Special tie detected - player(s) with 1 card, stat: ${gameState.selectedStat?.statName}`);
        return this.handleSpecialTieRetry(gameState);
      } else if (gameState.isSpecialTieMode) {
        // Already in special tie mode, add this stat to tied list and retry
        gameState.tiedStats = gameState.tiedStats || [];
        gameState.tiedStats.push(gameState.selectedStat!.statTypeId);
        console.log(`🎯 Another tie in special mode - stat: ${gameState.selectedStat?.statName}`);
        return this.handleSpecialTieRetry(gameState);
      } else {
        // NORMAL TIE: No one has 1 card, regular tie handling
        gameState.middlePile.push(...gameState.roundCards.map(rc => rc.cardId));
        return this.handleTieBreaker(gameState);
      }
    }

    // Check if game is finished
    if (this.checkGameEnd(gameState)) {
      gameState.gamePhase = "finished";
      await this.finishGame(gameRoomId);
    } else {
      // Continue to next round
      const gameRoom = await storage.getGameRoom(gameRoomId);
      gameState.roundNumber++;
      gameState.gamePhase = "playing";
      gameState.playerTimer = gameRoom?.roundTimeSeconds || 3; // Use configured round time
      gameState.selectedStat = undefined;
      gameState.roundCards = [];
      
      this.startPlayerTimer(gameRoomId);
    }

    return gameState;
  }

  // Handle tie-breaker scenario
  private async handleTieBreaker(gameState: GameState): Promise<GameState> {
    // Remove top cards from all players (they're now in middle pile)
    for (const player of gameState.players) {
      if (player.cardStack.length > 0) {
        player.cardStack = player.cardStack.slice(1);
        this.syncCardCount(player);
      }
    }

    // Continue with same player and stat for tie-breaker
    const gameRoom = await storage.getGameRoom(gameState.gameRoomId);
    gameState.roundCards = [];
    gameState.gamePhase = "playing";
    gameState.playerTimer = gameRoom?.roundTimeSeconds || 3; // Use configured round time
    
    this.startPlayerTimer(gameState.gameRoomId);
    return gameState;
  }

  // Handle special tie scenario when someone has 1 card left
  private async handleSpecialTieRetry(gameState: GameState): Promise<GameState> {
    // Initialize or update special tie mode
    if (!gameState.isSpecialTieMode) {
      gameState.isSpecialTieMode = true;
      gameState.tiedStats = [gameState.selectedStat!.statTypeId];
      gameState.specialTieStatName = gameState.selectedStat!.statName;
    }
    
    // Get the total number of available stats for this collection
    const gameRoom = await storage.getGameRoom(gameState.gameRoomId);
    const allStatTypes = await storage.getCollectionStatTypes(gameRoom!.collectionId!);
    const totalAvailableStats = allStatTypes.length;
    
    // Check if all stats have been tried/tied - if so, end the game
    if (gameState.tiedStats && gameState.tiedStats.length >= totalAvailableStats) {
      console.log(`🏁 All ${totalAvailableStats} stats exhausted in special tie mode - ending game`);
      console.log(`🎯 Tied stats: [${gameState.tiedStats.join(', ')}]`);
      
      // Determine winner based on current card count (player with more cards wins)
      const winner = gameState.players.reduce((prev, current) => 
        prev.cardStack.length > current.cardStack.length ? prev : current
      );
      
      console.log(`🏆 Special tie game winner determined by card count: ${winner.playerId} (${winner.cardStack.length} cards)`);
      
      // Set winner as last winner and finish the game
      gameState.lastWinner = winner.playerId || undefined;
      gameState.gamePhase = "finished";
      await this.finishGame(gameState.gameRoomId);
      
      return gameState;
    }
    
    // DON'T remove cards - keep them in play for final showdown
    // Reset round state but maintain cards and tied stats
    gameState.roundCards = [];
    gameState.gamePhase = "playing";
    gameState.selectedStat = undefined;
    
    // Reset player timer for next stat selection
    gameState.playerTimer = gameRoom?.roundTimeSeconds || 3;
    
    console.log(`🎯 Special tie retry - tied stats: [${gameState.tiedStats?.join(', ') || ''}] (${gameState.tiedStats?.length}/${totalAvailableStats})`);
    this.startPlayerTimer(gameState.gameRoomId);
    return gameState;
  }

  // Collect cards for winner
  private async collectCards(gameState: GameState, winnerId: string): Promise<void> {
    const winner = gameState.players.find(p => p.playerId === winnerId);
    if (!winner) return;

    // Collect all round cards + middle pile (tied cards from previous rounds)
    const collectedCards = [
      ...gameState.roundCards.map(rc => rc.cardId),
      ...gameState.middlePile,
    ];

    console.log(`🃏 Card collection - Round cards: ${gameState.roundCards.length}, Middle pile (tied cards): ${gameState.middlePile.length}, Total collected: ${collectedCards.length}`);

    // Remove top cards from all players (they are now won by the winner)
    for (const player of gameState.players) {
      if (player.cardStack.length > 0) {
        const removedCard = player.cardStack[0];
        player.cardStack = player.cardStack.slice(1);
        this.syncCardCount(player);
        console.log(`🗂️ Removed top card ${removedCard} from player ${player.playerId}, remaining: ${player.cardStack.length}`);
      }
    }

    // Add collected cards to the BACK of winner's deck (proper deck simulation)
    winner.cardStack.push(...collectedCards);
    this.syncCardCount(winner);

    console.log(`🏆 Winner ${winnerId} collected ${collectedCards.length} cards, total deck: ${winner.cardStack.length}`);
    console.log(`🃏 Winner's deck order: [${winner.cardStack.slice(0, 5).join(', ')}${winner.cardStack.length > 5 ? ', ...' : ''}]`);

    // Clear middle pile (tied cards have been distributed)
    gameState.middlePile = [];

    // Store cards won in this round for animation display
    gameState.cardsWonThisRound = collectedCards.length;

    // Validate no duplicates after card collection
    this.validateNoDuplicateCards(gameState.players);

    // Update database
    await storage.updatePlayerSession(winner.id!, {
      cardStack: winner.cardStack,
      cardCount: winner.cardCount,
    });
  }

  // Check if game should end
  private checkGameEnd(gameState: GameState): boolean {
    // Game ends if one player has all cards (use cardStack.length as source of truth)
    const playersWithCards = gameState.players.filter(p => p.cardStack.length > 0);
    if (playersWithCards.length <= 1) {
      return true;
    }

    // Game ends if time is up
    if (gameState.gameTimer <= 0) {
      return true;
    }

    return false;
  }

  // Timer management
  private startGameTimer(gameRoomId: string): void {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) return;

    const timer = setInterval(() => {
      gameState.gameTimer--;
      
      // Broadcast timer sync to all clients every second for perfect synchronization
      this.broadcastTimerSync(gameRoomId);
      
      if (gameState.gameTimer <= 0) {
        this.finishGame(gameRoomId);
      }
    }, 1000);

    this.gameTimers.set(gameRoomId, timer);
  }

  // Public method to start player timer from external calls
  async startPlayerTimerForRoom(gameRoomId: string): Promise<void> {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) return;
    
    console.log(`🎯 Starting player timer for room ${gameRoomId}, current player position: ${gameState.currentPlayerPosition}`);
    this.startPlayerTimer(gameRoomId);
  }

  private startPlayerTimer(gameRoomId: string): void {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) return;

    this.clearPlayerTimer(gameRoomId);

    // Use actual configured player timer value, not hardcoded 3 seconds
    const timeoutMs = gameState.playerTimer * 1000;
    console.log(`⏱️ Starting player timer for ${gameState.playerTimer} seconds (${timeoutMs}ms) - Room: ${gameRoomId}`);
    
    // Set initial player timer countdown value
    gameState.playerTimerRemaining = gameState.playerTimer;
    
    // Start player countdown that decrements every second
    const countdownTimer = setInterval(() => {
      if (gameState.playerTimerRemaining && gameState.playerTimerRemaining > 0) {
        gameState.playerTimerRemaining--;
        // Broadcast updated timer every second
        this.broadcastTimerSync(gameRoomId);
      }
    }, 1000);
    
    // Main timeout for when player time is up
    const timeoutTimer = setTimeout(() => {
      // Clear the countdown timer first
      clearInterval(countdownTimer);
      // Player time is up, move to next player
      console.log(`⏰ Player timeout reached for room ${gameRoomId}`);
      this.handlePlayerTimeout(gameRoomId);
    }, timeoutMs);

    // Store both timers for cleanup  
    this.playerTimers.set(gameRoomId, { countdownTimer, timeoutTimer } as any);
  }

  private clearPlayerTimer(gameRoomId: string): void {
    const timers = this.playerTimers.get(gameRoomId);
    if (timers) {
      if (typeof timers === 'object' && 'countdownTimer' in timers && 'timeoutTimer' in timers) {
        // New timer structure with both countdown and timeout
        clearInterval((timers as any).countdownTimer);
        clearTimeout((timers as any).timeoutTimer);
      } else {
        // Legacy timer structure
        clearTimeout(timers as NodeJS.Timeout);
      }
      this.playerTimers.delete(gameRoomId);
    }
  }

  // Broadcast current timer values to all clients for synchronization
  private broadcastTimerSync(gameRoomId: string): void {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) return;

    const { io } = require('./index');
    const timerData = {
      gameTimer: gameState.gameTimer,
      playerTimerRemaining: gameState.playerTimerRemaining || 0,
      roundNumber: gameState.roundNumber,
      gameRoomId: gameRoomId
    };

    console.log(`⏰ Broadcasting timer sync: game=${timerData.gameTimer}s, player=${timerData.playerTimerRemaining}s, room=${gameRoomId}`);
    io.to(gameRoomId).emit('timer-sync', timerData);
  }

  private async handlePlayerTimeout(gameRoomId: string): Promise<void> {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) return;

    // Move to next player
    gameState.currentPlayerPosition = (gameState.currentPlayerPosition + 1) % gameState.players.length;
    const gameRoom = await storage.getGameRoom(gameRoomId);
    gameState.playerTimer = gameRoom?.roundTimeSeconds || 3; // Use configured round time
    
    this.startPlayerTimer(gameRoomId);
  }

  // Finish game and save results
  private async finishGame(gameRoomId: string): Promise<void> {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) return;

    // Clear timers
    const gameTimer = this.gameTimers.get(gameRoomId);
    const playerTimer = this.playerTimers.get(gameRoomId);
    
    if (gameTimer) clearInterval(gameTimer);
    if (playerTimer) clearTimeout(playerTimer);
    
    this.gameTimers.delete(gameRoomId);
    this.playerTimers.delete(gameRoomId);

    // Determine winner (player with most cards)
    const winner = gameState.players.reduce((prev, current) => 
      prev.cardStack.length > current.cardStack.length ? prev : current
    );

    // Save game result to database (only if multiplayer and has registered users)
    const gameRoom = await storage.getGameRoom(gameRoomId);
    if (gameRoom && gameRoom.gameMode !== "single") {
      // Check if winner and all players are registered users (not guests)
      const hasRegisteredWinner = winner.playerId && !winner.playerId.startsWith('guest_');
      const registeredPlayerIds = gameState.players
        .filter(p => p.playerId && !p.playerId.startsWith('guest_'))
        .map(p => p.playerId!);
      
      // Only save results if winner is registered (to maintain leaderboard integrity)
      if (hasRegisteredWinner && registeredPlayerIds.length > 0) {
        console.log(`💾 Saving game result for registered users: winner=${winner.playerId}`);
        try {
          // Calculate XP for all registered players FIRST
          const { xpService } = await import("./xpService");
          const playerXPChanges: any = {};
          
          for (const playerId of registeredPlayerIds) {
            const won = playerId === winner.playerId;
            const player = gameState.players.find(p => p.playerId === playerId);
            const finalCardCount = player ? player.cardStack.length : 0;
            
            const gameOutcome = {
              playerId,
              won,
              gameMode: gameRoom.gameMode as "1v1" | "4player",
              gameDuration: 120 - gameState.gameTimer,
              totalRounds: gameState.roundNumber,
            };
            
            try {
              const { updatedStats, xpResult } = await xpService.updatePlayerStatsAfterGame(gameOutcome);
              playerXPChanges[playerId] = {
                xpChange: xpResult.totalXPChange,
                newXP: xpResult.newXP,
                newLevel: xpResult.newLevel,
                wasPromotion: xpResult.wasPromotion,
                finalCardCount: finalCardCount
              };
              console.log(`✨ Updated XP for player ${playerId}: ${won ? 'WIN' : 'LOSS'}, XP Change: ${xpResult.totalXPChange}, Final Cards: ${finalCardCount}`);
              
              // Update challenge progress for battle_wins (only for winners)
              if (won) {
                try {
                  const { gamificationService } = await import("./gamificationService");
                  const { CHALLENGE_GOAL_TYPES } = await import("@shared/challengeConstants");
                  
                  // Ensure challenge progress exists before querying
                  await gamificationService.ensureChallengeProgress(playerId);
                  const userChallenges = await gamificationService.getUserChallengeProgress(playerId);
                  for (const challenge of userChallenges) {
                    if ((challenge as any).goalType === CHALLENGE_GOAL_TYPES.BATTLE_WINS && !challenge.isCompleted && !challenge.isClaimed) {
                      await gamificationService.updateChallengeProgress(playerId, challenge.challengeId, 1);
                      console.log(`🎯 Updated challenge progress: ${(challenge as any).title} (battle_wins)`);
                    }
                  }
                } catch (challengeError) {
                  console.error(`Failed to update battle_wins challenge for player ${playerId}:`, challengeError);
                }
              }
              
              // Award coins based on scoped gamification rules
              try {
                const { gamificationService } = await import("./gamificationService");
                
                // Get user's organization from their roles
                const userRoles = await storage.getUserRoles(playerId);
                const orgId = userRoles[0]?.organizationId;
                
                if (orgId) {
                  const rules = await storage.getGamificationEconomyRules(orgId);
                  
                  if (rules && rules.length > 0) {
                    // Find the appropriate rule for win/loss coin rewards
                    const winRule = rules.find(r => r.actionType === 'game_win');
                    const lossRule = rules.find(r => r.actionType === 'game_loss' || r.actionType === 'game_participation');
                    const baseCoins = won ? (winRule?.coinReward || 0) : (lossRule?.coinReward || 0);
                    let totalCoins = baseCoins;
                    let coinMultiplier = 1.0;
                    
                    // Check for active coin multiplier power-ups
                    const activePowerUps = await gamificationService.getUserActivePowerUps(playerId);
                    for (const powerUp of activePowerUps) {
                      const effect = powerUp.effect as any;
                      if (effect?.type === 'coin_multiplier' && effect?.value) {
                        coinMultiplier = Math.max(coinMultiplier, effect.value);
                        console.log(`⚡ Power-up coin multiplier: ${effect.value}x`);
                      }
                    }
                    
                    // Apply final multiplier
                    if (coinMultiplier > 1.0) {
                      totalCoins = Math.floor(baseCoins * coinMultiplier);
                      console.log(`💎 Total coin multiplier: ${baseCoins} × ${coinMultiplier} = ${totalCoins} coins`);
                    }
                    
                    if (totalCoins > 0) {
                      await gamificationService.awardCoins(
                        playerId,
                        totalCoins,
                        won ? "game_win" : "game_participation",
                        `${won ? 'Won' : 'Participated in'} ${gameRoom.gameMode} game`,
                        { gameRoomId, won, gameMode: gameRoom.gameMode }
                      );
                      console.log(`💰 Awarded ${totalCoins} coins to ${playerId} (${won ? 'win' : 'loss'})`);
                    }
                  }
                }
              } catch (coinError) {
                console.error(`Failed to award coins to player ${playerId}:`, coinError);
                // Don't stop the game if coin reward fails
              }
            } catch (xpError) {
              console.error(`Failed to update XP for player ${playerId}:`, xpError);
            }
          }

          // Now save game result with XP changes
          await storage.createGameResult({
            gameRoomId,
            collectionId: gameRoom.collectionId,
            winnerId: winner.playerId!,
            gameMode: gameRoom.gameMode,
            playerIds: registeredPlayerIds, // Only registered player IDs
            playerXPChanges: Object.keys(playerXPChanges).length > 0 ? playerXPChanges : null,
            totalRounds: gameState.roundNumber,
            gameDuration: 120 - gameState.gameTimer,
            isMultiplayer: true,
            gameStartedAt: gameRoom.gameStartedAt!,
            gameEndedAt: new Date(),
          });
        } catch (error) {
          console.error('Failed to save game result:', error);
          // Continue game cleanup even if result saving fails
        }
      } else {
        console.log(`🎭 Skipping game result save - guest game (winner: ${winner.playerId})`);
      }
    }

    // Update game room status
    await storage.updateGameRoom(gameRoomId, {
      gameState: "finished",
      gameEndedAt: new Date(),
    });

    // Clean up game state
    this.gameStates.delete(gameRoomId);
  }

  // NPC AI for single player
  async makeNPCMove(gameRoomId: string, npcPlayerId: string): Promise<string> {
    const gameState = this.gameStates.get(gameRoomId);
    if (!gameState) {
      throw new Error("Game not found");
    }

    const npcPlayer = gameState.players.find(p => p.playerId === npcPlayerId);
    if (!npcPlayer || npcPlayer.cardStack.length === 0) {
      throw new Error("NPC player not found or no cards");
    }

    // Get NPC's top card from cache
    const topCardId = npcPlayer.cardStack[0];
    const card = gameState.cards.get(topCardId);
    
    if (!card || !card.stats || card.stats.length === 0) {
      // Fallback to first available stat
      const gameRoom = await storage.getGameRoom(gameRoomId);
      const statTypes = await storage.getCollectionStatTypes(gameRoom!.collectionId);
      return statTypes[0].id;
    }

    // Filter out tied stats in special tie mode
    let availableStats = card.stats;
    if (gameState.isSpecialTieMode && gameState.tiedStats && gameState.tiedStats.length > 0) {
      availableStats = card.stats.filter((stat: any) => !gameState.tiedStats!.includes(stat.statTypeId));
      console.log(`🤖 NPC filtering out tied stats: [${gameState.tiedStats.join(', ')}], available: ${availableStats.length} stats`);
      
      // If all stats are tied, something went wrong - fallback to first stat
      if (availableStats.length === 0) {
        console.error('🚨 NPC has no available stats - all are tied!');
        availableStats = card.stats;
      }
    }

    // Enhanced NPC AI: Choose best stat based on comparison type
    const gameRoom = await storage.getGameRoom(gameRoomId);
    const statTypes = await storage.getCollectionStatTypes(gameRoom!.collectionId);
    const { compareStatValues } = await import("@shared/gameUtils");
    
    let bestStat = availableStats[0];
    let bestValue = parseFloat(bestStat.value.toString());
    
    for (const stat of availableStats) {
      const statType = statTypes.find(st => st.id === stat.statTypeId);
      const comparisonType = statType?.comparisonType || "highest";
      const currentValue = parseFloat(stat.value.toString());
      
      // Compare using the appropriate comparison type
      if (compareStatValues(currentValue, bestValue, comparisonType as any) > 0) {
        bestStat = stat;
        bestValue = currentValue;
      }
    }

    console.log(`🤖 NPC selected stat: ${bestStat.statTypeId} (value: ${bestValue}) ${gameState.isSpecialTieMode ? 'in special tie mode' : ''}`);
    return bestStat.statTypeId;
  }

  // Utility functions
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  private generateJoinCode(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  // Get current game state
  getGameState(gameRoomId: string): GameState | undefined {
    return this.gameStates.get(gameRoomId);
  }

  // Clean up finished games
  cleanupGame(gameRoomId: string): void {
    this.gameStates.delete(gameRoomId);
    
    const gameTimer = this.gameTimers.get(gameRoomId);
    const playerTimer = this.playerTimers.get(gameRoomId);
    
    if (gameTimer) clearInterval(gameTimer);
    if (playerTimer) clearTimeout(playerTimer);
    
    this.gameTimers.delete(gameRoomId);
    this.playerTimers.delete(gameRoomId);
  }

  // Handle player forfeit
  async forfeitGame(gameRoomId: string, forfeitingPlayerId: string): Promise<{
    gameEnded: boolean;
    winner?: string;
    remainingPlayers: PlayerSession[];
    forfeitedPlayer: PlayerSession;
  }> {
    const gameState = this.gameStates.get(gameRoomId);
    const gameRoom = await storage.getGameRoom(gameRoomId);
    
    if (!gameState || !gameRoom) {
      throw new Error("Game not found");
    }

    const forfeitingPlayerIndex = gameState.players.findIndex(p => p.playerId === forfeitingPlayerId);
    if (forfeitingPlayerIndex === -1) {
      throw new Error("Player not found in game");
    }

    const forfeitingPlayer = gameState.players[forfeitingPlayerIndex];
    const remainingPlayers = gameState.players.filter(p => p.playerId !== forfeitingPlayerId);

    if (gameRoom.gameMode === "1v1") {
      // 1v1: Check who has more cards to determine the actual winner
      const remainingPlayer = remainingPlayers[0];
      let actualWinner: PlayerSession;
      let actualLoser: PlayerSession;
      
      if (remainingPlayer.cardStack.length > forfeitingPlayer.cardStack.length) {
        actualWinner = remainingPlayer;
        actualLoser = forfeitingPlayer;
      } else if (forfeitingPlayer.cardStack.length > remainingPlayer.cardStack.length) {
        actualWinner = forfeitingPlayer;
        actualLoser = remainingPlayer;
      } else {
        // Tie - remaining player wins by default for connection stability
        actualWinner = remainingPlayer;
        actualLoser = forfeitingPlayer;
      }
      
      console.log(`🎯 1v1 forfeit: ${forfeitingPlayer.playerId} (${forfeitingPlayer.cardStack.length} cards) vs ${remainingPlayer.playerId} (${remainingPlayer.cardStack.length} cards) - Winner: ${actualWinner.playerId}`);
      
      // Record results based on actual card counts, not just who remained
      await this.recordGameResult(gameRoomId, actualLoser.playerId!, false, "forfeit");
      await this.recordGameResult(gameRoomId, actualWinner.playerId!, true, "opponent_forfeit");
      
      // End the game
      await this.finishGame(gameRoomId);

      return {
        gameEnded: true,
        winner: actualWinner.playerId!,
        remainingPlayers,
        forfeitedPlayer: forfeitingPlayer
      };
    } else {
      // 4-player: Redistribute cards and continue game
      await this.redistributeCards(gameState, forfeitingPlayer, remainingPlayers);
      
      // Remove forfeiting player from game state
      gameState.players = remainingPlayers;
      
      // Update current player position if needed
      if (gameState.currentPlayerPosition === forfeitingPlayerIndex) {
        gameState.currentPlayerPosition = 0; // Reset to first remaining player
      } else if (gameState.currentPlayerPosition > forfeitingPlayerIndex) {
        gameState.currentPlayerPosition--; // Shift position due to removed player
      }

      // Update player sessions in database
      for (const player of remainingPlayers) {
        await storage.updatePlayerSession(player.id!, {
          cardStack: player.cardStack,
          cardCount: player.cardCount,
        });
      }

      // Update game room player count
      await storage.updateGameRoom(gameRoomId, {
        currentPlayers: remainingPlayers.length
      });

      return {
        gameEnded: false,
        remainingPlayers,
        forfeitedPlayer: forfeitingPlayer
      };
    }
  }

  // Redistribute forfeiting player's cards
  private async redistributeCards(
    gameState: GameState, 
    forfeitingPlayer: PlayerSession, 
    remainingPlayers: PlayerSession[]
  ): Promise<void> {
    const forfeitedCards = [...forfeitingPlayer.cardStack];
    
    if (forfeitedCards.length === 0) {
      return; // No cards to redistribute
    }

    // Determine game leader (player with most cards, or first player if tie)
    const gameLeader = remainingPlayers.reduce((leader, player) => 
      player.cardStack.length > leader.cardStack.length ? player : leader
    );

    // Calculate equal distribution
    const cardsPerPlayer = Math.floor(forfeitedCards.length / remainingPlayers.length);
    const remainderCards = forfeitedCards.length % remainingPlayers.length;

    let cardIndex = 0;

    // Distribute cards equally
    for (const player of remainingPlayers) {
      const cardsToAdd = cardIndex < forfeitedCards.length ? 
        forfeitedCards.slice(cardIndex, cardIndex + cardsPerPlayer) : [];
      
      player.cardStack = [...player.cardStack, ...cardsToAdd];
      this.syncCardCount(player);
      cardIndex += cardsPerPlayer;
    }

    // Give remainder cards to game leader
    if (remainderCards > 0) {
      const remainingCards = forfeitedCards.slice(cardIndex);
      gameLeader.cardStack = [...gameLeader.cardStack, ...remainingCards];
      this.syncCardCount(gameLeader);
    }

    // Validate no duplicates after redistribution
    this.validateNoDuplicateCards(remainingPlayers);
    
    console.log(`Redistributed ${forfeitedCards.length} cards from forfeiting player to ${remainingPlayers.length} remaining players`);
  }

  // Record game result for forfeit scenarios
  private async recordGameResult(
    gameRoomId: string, 
    playerId: string, 
    isWinner: boolean, 
    resultType: "forfeit" | "opponent_forfeit" | "normal"
  ): Promise<void> {
    const gameRoom = await storage.getGameRoom(gameRoomId);
    if (!gameRoom || !playerId) return;

    // Record in game results table
    if (isWinner && resultType === "opponent_forfeit") {
      await storage.createGameResult({
        gameRoomId,
        collectionId: gameRoom.collectionId,
        winnerId: playerId,
        gameMode: gameRoom.gameMode,
        playerIds: [playerId], // Only winner recorded for forfeit wins
        totalRounds: 1,
        gameDuration: 0,
        isMultiplayer: true,
        gameStartedAt: gameRoom.gameStartedAt || new Date(),
        gameEndedAt: new Date(),
      });
    }

    console.log(`Recorded ${resultType} result for player ${playerId}: ${isWinner ? 'WIN' : 'LOSS'}`);
  }
}