import { useState, useEffect } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import GameAbandonmentConfirmDialog from '@/components/GameAbandancmentConfirmDialog';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Users, Crown, Play, Copy, ArrowLeft, Timer, Zap, Trophy } from 'lucide-react';
import { io } from 'socket.io-client';
import { preloadCardImagesWithProgress } from '@/utils/imagePreloader';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { usePlatformMode } from '@/hooks/usePlatformMode';

const PlayerCard = ({ player, isHost, isYou, user }) => (
  <Card className={`relative ${isYou ? 'border-accent border-2' : ''}`}>
    <CardContent className="p-4 text-center">
      <div className="relative">
        <div className="w-16 h-16 mx-auto mb-2 flex items-center justify-center">
          <PlayerAvatar
            user={isYou ? user : { gamerName: player.playerName, id: player.playerId }}
            size="lg"
            showCountry={true}
            showGlow={isYou}
            className={isYou ? 'ring-2 ring-accent' : ''}
          />
        </div>
        {isHost && (
          <Crown className="absolute -top-2 -right-2 w-6 h-6 text-glow-gold" />
        )}
      </div>
      <div className="text-sm font-medium">
        {player.playerName} {isYou && '(You)'}
      </div>
      <div className="text-xs text-muted-foreground">
        Position {player.playerPosition + 1}
      </div>
    </CardContent>
  </Card>
);

export default function GameRoom() {
  const [match, params] = useRoute('/game/:gameRoomId');
  const [, setLocation] = useLocation();
  const [socket, setSocket] = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [gameStarting, setGameStarting] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });
  
  const gameRoomId = params?.gameRoomId;
  const { baseUrl } = usePlatformMode();

  // Get current user
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
  });

  // Get game room data
  const { data: gameData, refetch: refetchGameData } = useQuery({
    queryKey: [`/api/game/${gameRoomId}`],
    enabled: !!gameRoomId,
    refetchInterval: 500, // Faster refresh every 500ms for real-time lobby sync
  });

  // Get collection cards for image preloading
  const { data: collectionCards } = useQuery({
    queryKey: [`/api/collections/${gameData?.gameRoom?.collectionId}/cards`],
    enabled: !!gameData?.gameRoom?.collectionId,
  });

  // Initialize socket connection
  useEffect(() => {
    if (!gameRoomId || !user?.id) return;

    const newSocket = io();
    setSocket(newSocket);

    // Join the game room
    newSocket.emit('join-game', { gameRoomId, userId: user.id });

    // Socket event handlers
    newSocket.on('joined-game', (data) => {
      console.log('Joined game:', data);
      refetchGameData();
    });

    newSocket.on('player-joined', (data) => {
      refetchGameData();
    });

    newSocket.on('game-started', (data) => {
      console.log('🎮 Game started event received:', data);
      // Check if this event is for our game room
      if (data.gameRoomId === gameRoomId) {
        console.log('✅ Game started for our room, preparing for navigation');
        setGameStarting(true);
        
        // Add small delay to ensure all socket events are processed
        setTimeout(() => {
          console.log('🚀 Navigating to gameplay...');
          setLocation(`/play/${gameRoomId}`);
        }, 200);
      } else {
        console.log('⚠️ Game started event for different room, ignoring');
      }
    });

    newSocket.on('error', (data) => {
    });

    return () => {
      newSocket.disconnect();
    };
  }, [gameRoomId, user, refetchGameData, setLocation, toast]);

  // Preload card images when collection cards are loaded
  useEffect(() => {
    if (collectionCards && collectionCards.length > 0 && !imagesLoaded) {
      const preloadImages = async () => {
        try {
          console.log('Starting multiplayer card image preloading...');
          await preloadCardImagesWithProgress(collectionCards, (loaded, total) => {
            setLoadingProgress({ loaded, total });
          });
          setImagesLoaded(true);
          console.log('Multiplayer card images preloaded successfully');
        } catch (error) {
          console.warn('Multiplayer image preloading failed, proceeding anyway:', error);
          setImagesLoaded(true); // Allow game to start even if some images failed
        }
      };
      
      preloadImages();
    }
  }, [collectionCards, imagesLoaded]);

  const handleReady = () => {
    // Don't allow ready state until images are loaded
    if (socket && imagesLoaded) {
      setIsReady(true);
      socket.emit('player-ready', { gameRoomId });
    }
  };

  const copyJoinCode = async () => {
    if (gameData?.gameRoom?.joinCode) {
      const shareUrl = `${baseUrl}/join/${gameData.gameRoom.joinCode}`;
      await navigator.clipboard.writeText(shareUrl);
    }
  };

  // Game abandonment state
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const { mutate: abandonGame } = useMutation({
    mutationFn: async ({ gameMode, gameId }) => {
      const response = await fetch('/api/game/abandon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameMode, gameId })
      });
      if (!response.ok) throw new Error('Failed to apply abandonment penalty');
      return response.json();
    },
    onSuccess: (data) => {
      console.log('🚨 Abandonment penalty applied:', data);
      // Note: queryClient not available in this scope, so we skip cache invalidation
      setLocation('/game-lobby');
    },
    onError: (error) => {
      console.error('Failed to apply abandonment penalty:', error);
      // Still allow leaving even if penalty fails
      setLocation('/game-lobby');
    }
  });

  const handleLeaveGame = () => {
    // Check if game is actively started
    const isActiveGame = gameData?.gameRoom?.gameState === 'active' && user?.isAuthenticated;
    
    if (isActiveGame) {
      setShowAbandonConfirm(true);
    } else {
      // Safe to leave without penalty
      setLocation('/game-lobby');
    }
  };

  // Confirm abandonment with penalty
  const handleConfirmAbandon = () => {
    setShowAbandonConfirm(false);
    if (user?.isAuthenticated) {
      const gameMode = gameData?.gameRoom?.gameMode === '1v1' ? '1v1' : '4player';
      abandonGame({ gameMode, gameId: gameRoomId });
    } else {
      // Guests don't get penalties, just leave
      setLocation('/game-lobby');
    }
  };

  if (!match) return null;

  if (!gameData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-accent mx-auto"></div>
          <p className="mt-4 text-lg">Loading game room...</p>
        </div>
      </div>
    );
  }

  const { gameRoom, playerSessions, isHost } = gameData;
  const playersNeeded = gameRoom.maxPlayers - (gameRoom.currentPlayers || 0);
  const canStart = gameRoom.currentPlayers === gameRoom.maxPlayers;

  // Show image preloading screen while images are being cached
  if (collectionCards && !imagesLoaded) {
    const { loaded, total } = loadingProgress;
    const percentage = total > 0 ? (loaded / total) * 100 : 0;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto mb-4 bg-primary rounded-full flex items-center justify-center">
              <Trophy className="w-12 h-12 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Preparing Multiplayer Game</h2>
            <p className="text-muted-foreground">Loading card images for optimal gameplay...</p>
          </div>
          
          <div className="space-y-3">
            <Progress value={percentage} className="h-3" />
            <p className="text-sm text-muted-foreground">
              {loaded} of {total} images loaded ({Math.round(percentage)}%)
            </p>
          </div>
          
          {total > 0 && (
            <div className="mt-6 text-xs text-muted-foreground">
              <p>🖼️ All players will have instant card loading during gameplay</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (gameStarting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full text-center">
          <CardHeader>
            <CardTitle className="text-2xl gradient-text">Game Starting!</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="w-24 h-24 mx-auto relative">
              <div className="absolute inset-0 border-4 border-accent border-t-transparent rounded-full animate-spin"></div>
              <div className="absolute inset-2 border-4 border-secondary border-b-transparent rounded-full animate-spin animate-reverse"></div>
              <Play className="absolute inset-6 w-12 h-12 text-accent" />
            </div>
            <p className="text-lg">Preparing your cards...</p>
            <Progress value={100} className="w-full animate-pulse" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary/20 border-b border-accent/20">
        <div className="container mx-auto px-4 py-6">
          <div className="flex justify-between items-center">
            <Button variant="ghost" size="lg" onClick={handleLeaveGame} className="flex items-center gap-2 p-4 sm:p-3 min-h-[56px] sm:min-h-[48px] min-w-[180px] sm:min-w-[160px] touch-manipulation active:scale-95 transition-transform" data-testid="button-leave-game" >
              <ArrowLeft className="w-5 h-5 sm:w-4 sm:h-4 pointer-events-none" />
              Leave Game
            </Button>
            <div className="text-center">
              <h1 className="text-3xl font-bold gradient-text">Game Lobby</h1>
              <p className="text-sm text-muted-foreground">{gameRoom.gameMode.toUpperCase()} Mode</p>
            </div>
            <div></div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Game Info Card */}
          <Card className="border-2 border-accent/20">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-2">
                    <Users className="w-6 h-6 text-accent" />
                    Waiting for Players
                  </CardTitle>
                  <p className="text-muted-foreground mt-1">
                    {playersNeeded > 0 
                      ? `${playersNeeded} more player${playersNeeded > 1 ? 's' : ''} needed`
                      : 'All players joined! Ready to start?'
                    }
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm text-muted-foreground">Game Code:</span>
                    <Badge variant="outline" className="text-lg font-mono cursor-pointer" onClick={copyJoinCode} data-testid="badge-join-code" >
                      {gameRoom.joinCode}
                      <Copy className="w-4 h-4 ml-2" />
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">Click to copy share link</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4">
                <div className="flex-1">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-medium">Players</span>
                    <span className="text-sm text-muted-foreground">
                      {gameRoom.currentPlayers}/{gameRoom.maxPlayers}
                    </span>
                  </div>
                  <Progress 
                    value={(gameRoom.currentPlayers / gameRoom.maxPlayers) * 100} 
                    className="h-2"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Players Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: gameRoom.maxPlayers }, (_, index) => {
              const player = playerSessions?.find(p => p.playerPosition === index);
              if (player) {
                return (
                  <PlayerCard
                    key={player.id}
                    player={player}
                    isHost={gameRoom.hostPlayerId === player.playerId}
                    isYou={player.playerId === user?.id}
                    user={user}
                  />
                );
              } else {
                return (
                  <Card key={index} className="opacity-50">
                    <CardContent className="p-4 text-center">
                      <div className="w-16 h-16 rounded-full mx-auto mb-2 bg-muted/50 flex items-center justify-center">
                        <Users className="w-8 h-8 text-muted-foreground/50" />
                      </div>
                      <div className="text-sm text-muted-foreground">Waiting...</div>
                      <div className="text-xs text-muted-foreground">Position {index + 1}</div>
                    </CardContent>
                  </Card>
                );
              }
            })}
          </div>

          {/* Game Controls */}
          <Card>
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                {canStart ? (
                  <div>
                    <p className="text-lg font-medium mb-4">All players have joined!</p>
                    {!isReady ? (
                      <Button onClick={handleReady} disabled={!imagesLoaded} className="from-primary hover:scale-105 transition-all duration-300 text-lg px-8 py-3 disabled:opacity-50" data-testid="button-ready" >
                        <Zap className="w-5 h-5 mr-2" />
                        {!imagesLoaded ? 'Loading Images...' : 'Ready to Play!'}
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-accent font-medium">✓ You're ready!</div>
                        <p className="text-sm text-muted-foreground">Waiting for other players to ready up...</p>
                        <div className="flex justify-center">
                          <Timer className="w-6 h-6 animate-pulse text-accent" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <p className="text-lg font-medium mb-4">Share the game code with friends!</p>
                    <div className="flex justify-center gap-4">
                      <Button variant="outline" onClick={copyJoinCode} className="flex items-center gap-2" data-testid="button-copy-share-link" >
                        <Copy className="w-4 h-4" />
                        Copy Share Link
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Game Rules Preview */}
          <Card className="border border-accent/20">
            <CardHeader>
              <CardTitle className="text-lg">Game Rules</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h4 className="font-semibold mb-2">⏱️ Timing</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• 2 minute game limit</li>
                    <li>• 3 seconds to select stats</li>
                    <li>• Player with most cards wins</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">🎯 Gameplay</h4>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Compare card statistics</li>
                    <li>• Highest value wins round</li>
                    <li>• Collect opponent's cards</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Game Abandonment Confirmation Dialog */}
        <GameAbandonmentConfirmDialog
          isOpen={showAbandonConfirm}
          onOpenChange={setShowAbandonConfirm}
          onConfirm={handleConfirmAbandon}
          gameMode={gameData?.gameRoom?.gameMode === '1v1' ? '1v1' : '4player'}
        />
      </div>
    </div>
  );
}