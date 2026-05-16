import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { optionalAuth } from './shared';
import { storage } from '../storage';
import { GameEngine } from '../gameEngine';

const router = Router();

export function createGameRouter(io: SocketIOServer, gameEngine: GameEngine): Router {
  
  // Create a game lobby
  router.post("/create-lobby", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { collectionId, gameMode, roundTimeSeconds = 5, gameTimeSeconds = 120 } = req.body;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;
      
      if (!["single", "1v1", "4player"].includes(gameMode)) {
        return res.status(400).json({ error: "Invalid game mode" });
      }

      // Validate collection exists
      const collection = await storage.getCardCollection(collectionId);
      if (!collection) {
        return res.status(404).json({ error: "Collection not found" });
      }

      // Check if user already has an active lobby (prevent duplicates)
      const existingRooms = await storage.getActiveGameRooms();
      const userExistingRoom = existingRooms.find(room => room.hostPlayerId === userId);
      if (userExistingRoom) {
        console.log(`User ${userId} already has active lobby ${userExistingRoom.id}, returning existing room`);
        return res.json({ gameRoom: userExistingRoom, joinCode: userExistingRoom.joinCode });
      }

      const maxPlayers = gameMode === "single" ? 1 : gameMode === "1v1" ? 2 : 4;
      const joinCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      const gameRoom = await storage.createGameRoom({
        hostPlayerId: userId,
        collectionId,
        gameMode,
        maxPlayers,
        joinCode,
        gameState: "waiting",
        currentPlayers: 1,
        gameData: { roundTimeSeconds, gameTimeSeconds },
      });

      // Create player session for host
      await storage.createPlayerSession({
        gameRoomId: gameRoom.id,
        playerId: userId,
        playerName: "Host", // TODO: get actual player name
        playerPosition: 0,
        cardStack: [],
        cardCount: 0,
        isActive: true,
        isNPC: false,
      });

      res.json({ gameRoom, joinCode: gameRoom.joinCode });
    } catch (error) {
      console.error("Create lobby error:", error);
      console.error("Create lobby details:", {
        collectionId: req.body.collectionId,
        gameMode: req.body.gameMode,
        userId: req.session.userId,
        error: (error as Error).message
      });
      res.status(500).json({ error: "Failed to create lobby" });
    }
  });

  // Join a game lobby
  router.post("/join-lobby", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { joinCode } = req.body;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      // Find game room with matching join code
      const allGameRooms = await storage.getActiveGameRooms();
      const gameRoom = allGameRooms.find(room => room.joinCode === joinCode);
      if (!gameRoom) {
        return res.status(404).json({ error: "Game lobby not found" });
      }

      // Get player name for session
      let playerName = 'Player';
      if (req.session.userId) {
        const user = await storage.getUser(userId);
        playerName = user?.gamerName || 'Player';
      } else if (req.session.anonymousUserId) {
        const guestSession = await storage.getOrCreateGuestSession(userId);
        playerName = guestSession.guestName;
      }

      // Use atomic join operation to prevent race conditions
      const joinResult = await storage.atomicJoinGameRoom(gameRoom.id, userId, playerName);
      
      if (!joinResult.success) {
        return res.status(400).json({ error: joinResult.error });
      }

      const { playerSession, newPlayerCount, gameRoom: updatedRoom } = joinResult;

      // Auto-start game if lobby is now full (only if not already started)
      if (newPlayerCount === gameRoom.maxPlayers && gameRoom.gameState !== 'playing') {
        console.log(`🚀 Lobby full, auto-starting game ${gameRoom.id} with ${newPlayerCount} players`);
        
        try {
          // Double-check game hasn't been started by another request
          const currentGameRoom = await storage.getGameRoom(gameRoom.id);
          if (currentGameRoom?.gameState === 'playing') {
            console.log(`⚠️ Game ${gameRoom.id} already started by another request, skipping auto-start`);
            return res.json({ gameRoom: updatedRoom, playerSession });
          }
          
          // Update game state to playing
          await storage.updateGameRoom(gameRoom.id, { 
            gameState: "playing",
            gameStartedAt: new Date()
          });
          
          // Initialize the game with cards
          console.log(`🎮 Initializing game engine for room ${gameRoom.id}`);
          const gameState = await gameEngine.initializeGame(gameRoom.id);
          console.log(`✅ Game initialized with ${gameState.players.length} players, current player: ${gameState.currentPlayerPosition}`);
          
          // Emit game-started event only to the specific room (not globally)
          console.log(`📡 Emitting game-started event to room ${gameRoom.id}`);
          io.to(gameRoom.id).emit('game-started', { 
            gameRoomId: gameRoom.id,
            currentPlayerPosition: gameState.currentPlayerPosition,
            roundNumber: gameState.roundNumber,
            gameTimeSeconds: gameState.gameTimer,
            roundTimeSeconds: gameState.playerTimer,
            serverTime: Date.now(), // Add server timestamp for sync
            gameStartTimestamp: Date.now() // When game actually started
          });
          
          console.log(`🎯 Emitting player-turn event to room ${gameRoom.id}`);
          io.to(gameRoom.id).emit('player-turn', {
            gameRoomId: gameRoom.id,
            currentPlayerPosition: gameState.currentPlayerPosition,
            roundNumber: gameState.roundNumber
          });
          
        } catch (autoStartError) {
          console.error(`❌ Auto-start failed for game ${gameRoom.id}:`, autoStartError);
        }
      }

      res.json({ gameRoom: updatedRoom, playerSession });
    } catch (error) {
      console.error("Join lobby error:", error);
      console.error("Join lobby details:", {
        joinCode: req.body.joinCode,
        userId: req.session.userId || `anonymous_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        error: (error as Error).message,
        stack: (error as Error).stack
      });
      res.status(500).json({ error: "Failed to join lobby" });
    }
  });

  // Get active game lobbies
  router.get("/lobbies", optionalAuth, async (req: Request, res: Response) => {
    try {
      const lobbies = await storage.getActiveGameRooms();
      res.json({ lobbies });
    } catch (error) {
      console.error("Get lobbies error:", error);
      res.status(500).json({ error: "Failed to get lobbies" });
    }
  });

  // Forfeit game
  router.post("/:gameRoomId/forfeit", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { gameRoomId } = req.params;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: "Authentication required" });
      }

      // Verify player is in this game
      const playerSessions = await storage.getPlayerSessions(gameRoomId);
      const playerSession = playerSessions.find(session => session.playerId === userId);
      if (!playerSession) {
        return res.status(403).json({ error: "Not authorized - not in this game" });
      }

      // Process forfeit
      const forfeitResult = await gameEngine.forfeitGame(gameRoomId, userId);
      
      // Notify other players via socket
      io.to(gameRoomId).emit('player-forfeited', {
        forfeitedPlayer: forfeitResult.forfeitedPlayer,
        remainingPlayers: forfeitResult.remainingPlayers,
        gameEnded: forfeitResult.gameEnded,
        winner: forfeitResult.winner
      });

      res.json({
        message: "Game forfeited successfully",
        gameEnded: forfeitResult.gameEnded,
        winner: forfeitResult.winner
      });
    } catch (error) {
      console.error("Forfeit game error:", error);
      console.error("Forfeit details:", {
        gameRoomId: req.params.gameRoomId,
        userId: req.session.userId || req.user?.id,
        error: (error as Error).message
      });
      res.status(500).json({ error: "Failed to forfeit game" });
    }
  });

  // Get game state
  router.get("/:gameRoomId", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { gameRoomId } = req.params;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      const gameRoom = await storage.getGameRoom(gameRoomId);
      if (!gameRoom) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Verify player is in this game
      const playerSessions = await storage.getPlayerSessions(gameRoomId);
      const playerSession = playerSessions.find(session => session.playerId === userId);
      if (!playerSession) {
        return res.status(403).json({ error: "Not authorized to view this game" });
      }

      res.json({ 
        gameRoom,
        playerSessions,
        isHost: gameRoom.hostPlayerId === userId,
        playerPosition: playerSession.playerPosition
      });
    } catch (error) {
      console.error("Get game state error:", error);
      res.status(500).json({ error: "Failed to get game state" });
    }
  });

  // Get current player cards for a game
  router.get("/:gameRoomId/current-cards", optionalAuth, async (req: Request, res: Response) => {
    try {
      const { gameRoomId } = req.params;
      const userId = req.session.userId || req.session.anonymousUserId || req.user?.id;

      const gameRoom = await storage.getGameRoom(gameRoomId);
      if (!gameRoom) {
        return res.status(404).json({ error: "Game not found" });
      }

      // Verify player is in this game
      const playerSessions = await storage.getPlayerSessions(gameRoomId);
      const playerSession = playerSessions.find(session => session.playerId === userId);
      if (!playerSession) {
        return res.status(403).json({ error: "Not authorized to view this game" });
      }

      // Get current top card for each player
      const currentCards = await Promise.all(
        playerSessions.map(async (session) => {
          if (!session.cardStack || session.cardStack.length === 0) {
            return { playerPosition: session.playerPosition, card: null, stats: [] };
          }
          
          // Get the top card (first in the stack)
          const topCardId = session.cardStack[0];
          const card = await storage.getCard(topCardId);
          const stats = card ? await storage.getCardStats(topCardId) : [];
          
          return {
            playerPosition: session.playerPosition,
            card,
            stats
          };
        })
      );

      res.json({ currentCards });
    } catch (error) {
      console.error("Get current cards error:", error);
      res.status(500).json({ error: "Failed to get current cards" });
    }
  });

  return router;
}
