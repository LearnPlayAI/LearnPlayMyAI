import { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import io from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  Timer, 
  Crown, 
  Zap, 
  Trophy, 
  ArrowLeft, 
  Users, 
  X,
  AlertTriangle 
} from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { EnhancedPlayerTimer } from '@/components/EnhancedPlayerTimer';
import { useScreenWakeLock } from '@/hooks/useScreenWakeLock';
import { PremiumGameHeader } from '@/components/PremiumGameHeader';
import { FloatingLeaveButton } from '@/components/FloatingLeaveButton';
import { useAutoFitText } from '@/hooks/useAutoFitText';

// Helper function to format stat values - remove decimal when it's .00
// Import the shared formatting function
import { formatStatValue } from '@shared/gameUtils';

// StatBox component with dynamic text sizing
const StatBox = ({ stat, isSelected, isClickable, onClick }) => {
  const nameRef = useRef(null);
  const valueRef = useRef(null);
  
  useAutoFitText(nameRef, { min: 9, max: 14, lines: 2 });
  useAutoFitText(valueRef, { min: 12, max: 22, lines: 1 });
  
  return (
    <div
      className={`
        stat-box flex flex-col items-center justify-center py-1 px-1 sm:py-1.5 sm:px-1.5 md:py-2 md:px-2 rounded transition-all duration-200 text-center min-h-0 overflow-hidden
        ${isClickable ? 'cursor-pointer hover:ring-1 hover:ring-accent/50 ring-inset' : 'cursor-default'}
        ${isSelected 
          ? 'bg-accent text-accent-foreground ring-2 ring-accent ring-inset' 
          : isClickable 
            ? 'bg-card/95 text-card-foreground hover:bg-card border border-[var(--game-gold)]/40'
            : 'bg-card/95 text-card-foreground border border-border/20'
        }
      `}
      onClick={onClick}
      data-testid={`stat-${stat.statTypeId}`}
    >
      <span ref={nameRef} className="stat-name font-medium w-full px-0.5">
        {stat.statName}
      </span>
      <span ref={valueRef} className="stat-value mt-0.5">
        {formatStatValue(stat.value)}
      </span>
    </div>
  );
};

// GameCard component from SinglePlayer - extracted for reuse
const GameCard = ({ card, isOwn, isRevealed, onStatSelect, selectedStat, isWinner, stats }) => {
  if (!card) {
    return (
      <Card className="w-full max-w-[90vw] sm:max-w-80 md:max-w-96 lg:max-w-[28rem] mx-auto bg-muted/50 border-dashed" style={{ minHeight: '250px' }}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-xs text-center">No Card</div>
        </CardContent>
      </Card>
    );
  }

  // Use stats prop if provided, otherwise use card.stats
  const cardStats = stats || card.stats;

  const cardClassName = `
    w-full max-w-[85vw] sm:max-w-96 md:max-w-[26rem] lg:max-w-[28rem] aspect-[5/7] mx-auto transition-all duration-500 relative overflow-hidden
    ${isOwn ? 'border-accent border-2 cursor-pointer' : ''}
    ${isRevealed ? 'transform scale-102' : ''}
    ${isWinner ? 'winner-card' : ''}
    ${!isRevealed && !isOwn ? 'bg-secondary' : ''}
    ${isOwn && onStatSelect ? 'ring-4 ring-[var(--game-gold)]/60 shadow-dialog shadow-[var(--game-gold)]/30 border-[var(--game-gold)]' : ''}
  `;

  if (!isRevealed && !isOwn) {
    // Card back using custom LEARNPLAY image
    return (
      <Card className={cardClassName} style={{ aspectRatio: '5 / 7' }}>
        <CardContent className="p-0 h-full relative">
          <img 
            src="/learnplay-card-back.png"
            alt="Card back"
            className="w-full h-full object-cover"
            onError={(e) => {
              console.error('❌ Failed to load card back image:', e.target.src);
              // Fallback to gradient
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Fallback gradient background (hidden by default) */}
          <div className="absolute inset-0 bg-secondary items-center justify-center" style={{ display: 'none' }}>
            <div className="text-secondary-foreground font-bold text-xl">LEARNPLAY</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClassName} style={{ aspectRatio: '5 / 7' }}>
      {/* Full card background image */}
      <div className="absolute inset-0">
        {card.imageKey ? (
          <img 
            src={`/api/cards/${card.id}/image`}
            alt={card.name}
            className="w-full h-full object-cover"
            onError={(e) => console.error(`❌ Failed to load image for ${card.name}:`, e.target.src)}
          />
        ) : (
          <div className="w-full h-full bg-surface-base flex items-center justify-center text-primary-foreground/20 text-6xl font-bold">
            {card.name[0]}
          </div>
        )}
      </div>
      
      {/* Gradient overlay - bottom 50% for stats readability */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--surface-overlay)]/95"></div>
      
      {/* Content overlay */}
      <div className="absolute inset-0 z-10">
        {/* Sparkle effects for winner */}
        {isWinner && (
          <>
            <div className="sparkle"></div>
            <div className="sparkle"></div>
            <div className="sparkle"></div>
            <div className="sparkle"></div>
          </>
        )}
        
        {/* Card name at top with minimal overlay */}
        <div className="absolute top-2 left-2 right-2 z-20">
          <div className={`backdrop-blur-sm rounded-lg px-3 py-1.5 text-center shadow-elevated ${
            isWinner ? 'bg-[var(--game-gold)]/95 text-foreground' : 'bg-[var(--surface-overlay)]/80 text-foreground'
          }`}>
            <div className="font-bold text-sm">{card.name}</div>
          </div>
        </div>
        
        {/* Stats constrained to bottom - more space on mobile */}
        <div className="absolute inset-x-0 bottom-0 top-[35%] sm:top-1/2 z-20 overflow-hidden">
          <div className="h-full overflow-y-auto px-1 sm:px-1.5">
            <div className="grid grid-cols-2 grid-rows-3 gap-1 sm:gap-0.5 w-full h-full py-1">
              {cardStats?.map((stat) => {
                const isSelected = selectedStat === stat.statTypeId;
                const isClickable = isOwn && onStatSelect;
                
                return (
                  <StatBox
                    key={stat.statTypeId}
                    stat={stat}
                    isSelected={isSelected}
                    isClickable={isClickable}
                    onClick={() => isClickable && onStatSelect(stat.statTypeId)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

// Game Timer Component
const GameTimer = ({ timeRemaining, totalTime = 120 }) => {
  const percentage = (timeRemaining / totalTime) * 100;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  
  const getTimerColor = () => {
    if (percentage > 50) return 'text-success';
    if (percentage > 20) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${getTimerColor()}`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
      <Progress 
        value={percentage} 
        className={`h-2 w-24 ${percentage < 20 ? 'animate-pulse' : ''}`}
      />
      <div className="text-xs text-muted-foreground">Game Time</div>
    </div>
  );
};

// Player Decision Timer
const PlayerTimer = ({ timeRemaining, totalTime = 5, isActive }) => {
  if (!isActive) return null;
  
  const percentage = (timeRemaining / totalTime) * 100;
  
  return (
    <div className="text-center">
      <div className="text-lg font-bold text-destructive animate-pulse">
        {timeRemaining}s
      </div>
      <Progress 
        value={percentage} 
        className="h-2 w-24 mx-auto animate-pulse" 
      />
      <div className="text-xs text-muted-foreground">Your Turn</div>
    </div>
  );
};

// Card Display Component - Single Player Style for 1v1
const SinglePlayerCard = ({ card, isOwn, isRevealed, stats, onStatSelect, selectedStat, isWinner }) => {
  if (!card) {
    return (
      <Card className="w-full max-w-[90vw] sm:max-w-80 md:max-w-96 lg:max-w-[28rem] mx-auto bg-muted/50 border-dashed" style={{ minHeight: '250px' }}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-xs text-center">No Card</div>
        </CardContent>
      </Card>
    );
  }

  const cardClassName = `
    w-full max-w-[85vw] sm:max-w-96 md:max-w-[26rem] lg:max-w-[28rem] aspect-[5/7] mx-auto transition-all duration-500 relative overflow-hidden
    ${isOwn ? 'border-accent border-2 cursor-pointer' : ''}
    ${isRevealed ? 'transform scale-102' : ''}
    ${isWinner ? 'winner-card' : ''}
    ${!isRevealed && !isOwn ? 'bg-secondary' : ''}
    ${isOwn && onStatSelect ? 'ring-4 ring-[var(--game-gold)]/60 shadow-dialog shadow-[var(--game-gold)]/30 border-[var(--game-gold)]' : ''}
  `;

  if (!isRevealed && !isOwn) {
    // Card back (same as single player)
    return (
      <Card className={cardClassName}>
        <CardContent className="p-0 h-full flex items-center justify-center relative">
          <div className="absolute inset-0 bg-secondary"></div>
          <div className="relative text-secondary-foreground font-bold text-xl z-10">LEARNPLAY</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cardClassName} style={{ aspectRatio: '5 / 7' }}>
      {/* Full card background image */}
      <div className="absolute inset-0">
        {card.imageKey ? (
          <img 
            src={`/api/cards/${card.id}/image`}
            alt={card.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-surface-base flex items-center justify-center text-primary-foreground/20 text-6xl font-bold">
            {card.name[0]}
          </div>
        )}
      </div>
      
      {/* Gradient overlay - bottom 50% for stats readability */}
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--surface-overlay)]/95"></div>
      
      {/* Content overlay */}
      <div className="absolute inset-0 z-10">
        {/* Card name at top */}
        <div className="absolute top-2 left-2 right-2 z-20">
          <div className="backdrop-blur-sm rounded-lg px-3 py-1.5 text-center shadow-elevated bg-[var(--surface-overlay)]/80 text-foreground">
            <div className="font-bold text-sm">{card.name}</div>
          </div>
        </div>

        {/* Stats constrained to bottom - more space on mobile */}
        <div className="absolute inset-x-0 bottom-0 top-[35%] sm:top-1/2 z-20 overflow-hidden">
          <div className="h-full overflow-y-auto px-1 sm:px-1.5">
            <div className="grid grid-cols-2 grid-rows-3 gap-1 sm:gap-0.5 w-full h-full py-1">
              {stats?.map((stat) => {
                const isSelected = selectedStat === stat.statTypeId;
                const isClickable = isOwn && onStatSelect;
                
                return (
                  <StatBox
                    key={stat.statTypeId}
                    stat={stat}
                    isSelected={isSelected}
                    isClickable={isClickable}
                    onClick={() => isClickable && onStatSelect(stat.statTypeId)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default function GamePlay() {
  const [match, params] = useRoute('/play/:gameRoomId');
  const [, setLocation] = useLocation();
  const [socket, setSocket] = useState(null);
  const [gameTimer, setGameTimer] = useState(120); // Default values
  const [playerTimer, setPlayerTimer] = useState(5);
  const [currentPlayerPosition, setCurrentPlayerPosition] = useState(0);
  const [selectedStat, setSelectedStat] = useState(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [winnerPosition, setWinnerPosition] = useState(null);
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  
  // Screen wake lock hook
  const { isSupported: wakeLockSupported, isActive: wakeLockActive, requestWakeLock, releaseWakeLock } = useScreenWakeLock();
  
  const gameRoomId = params?.gameRoomId;

  // Get current user
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Get game data
  const { data: gameData } = useQuery({
    queryKey: [`/api/game/${gameRoomId}`],
    enabled: !!gameRoomId,
  });

  // Get timer settings from game data, fallback to defaults
  const roundTimeSeconds = gameData?.roundTimeSeconds || 5;
  const gameTimeSeconds = gameData?.gameTimeSeconds || 120;

  // Update timers when game data loads
  useEffect(() => {
    if (gameData?.gameTimeSeconds && gameData?.roundTimeSeconds) {
      setGameTimer(gameData.gameTimeSeconds);
      setPlayerTimer(gameData.roundTimeSeconds);
    }
  }, [gameData?.gameTimeSeconds, gameData?.roundTimeSeconds]);

  // Get current cards for all players with real database card data
  const { data: currentCardsData, refetch } = useQuery({
    queryKey: [`/api/game/${gameRoomId}/current-cards`],
    enabled: !!gameRoomId,
    refetchInterval: 1000, // Faster refresh every 1 second for better sync
  });

  // Initialize socket and game timers - support anonymous users
  useEffect(() => {
    if (!gameRoomId) return;

    const newSocket = io();
    setSocket(newSocket);

    // Use existing user ID or wait for user data to be loaded
    if (!user?.id) {
      console.log('Waiting for user authentication...');
      return; // Wait for user to be loaded before joining socket
    }
    
    const userId = user.id;
    newSocket.emit('join-game', { gameRoomId, userId });
    console.log('Socket joining game with userId:', userId);

    // Socket event handlers
    newSocket.on('joined-game', (data) => {
      console.log('Joined game:', data);
      // Set the global current player position (who's turn it is)
      setCurrentPlayerPosition(data.currentPlayerPosition || 0);
      
      // Use timer settings from server
      if (data.gameTimeSeconds) setGameTimer(data.gameTimeSeconds);
      if (data.roundTimeSeconds) setPlayerTimer(data.roundTimeSeconds);
    });

    newSocket.on('game-started', (data) => {
      console.log('🎮 Game started with server sync');
      setCurrentPlayerPosition(data.currentPlayerPosition || 0);
      
      // Use server-authoritative timer settings for consistency
      const serverGameTime = data.gameTimeSeconds || 120;
      const serverRoundTime = data.roundTimeSeconds || 5;
      
      console.log(`⏰ Setting timers from server: Game=${serverGameTime}s, Round=${serverRoundTime}s`);
      setGameTimer(serverGameTime);
      setPlayerTimer(serverRoundTime);
      
      // Log timezone info for debugging
      const clientTime = Date.now();
      const serverTime = data.serverTime || clientTime;
      const timeDiff = Math.abs(clientTime - serverTime);
      console.log(`🌍 Time sync: Client=${new Date(clientTime).toISOString()}, Server=${new Date(serverTime).toISOString()}, Diff=${timeDiff}ms`);
      
    });

    newSocket.on('player-turn', (data) => {
      console.log('🎯 Player turn event received:', data);
      
      // Verify this event is for our game room to prevent cross-room conflicts
      if (data.gameRoomId && data.gameRoomId !== gameRoomId) {
        console.log('⚠️ Player turn event for different room, ignoring');
        return;
      }
      
      setCurrentPlayerPosition(data.currentPlayerPosition);
      setPlayerTimer(roundTimeSeconds); // Reset timer for new turn
      setIsRevealed(false);
      setSelectedStat(null);
      setWinnerPosition(null);
      
      console.log(`✅ Turn updated: Player ${data.currentPlayerPosition}, Round ${data.roundNumber || 'N/A'}`);
      
      // Force refresh game data to sync with server
      refetch();
    });

    newSocket.on('stat-selected', (data) => {
      console.log('Stat selected:', data);
      setSelectedStat(data.statTypeId);
      setIsRevealed(true);
    });

    newSocket.on('round-result', (data) => {
      console.log('Round result:', data);
      if (data.winner) {
        const winnerPlayer = playerSessions?.find(p => p.playerId === data.winner);
        const winnerPosition = winnerPlayer?.playerPosition;
        setWinnerPosition(winnerPosition);
      }
      
      // Force refresh game data to sync card counts and player states
      refetch();
    });

    newSocket.on('round-winner', (data) => {
      setWinnerPosition(data.winnerPosition);
    });

    newSocket.on('game-finished', (data) => {
      setTimeout(() => {
        setLocation('/game-lobby');
      }, 5000);
    });

    // Handle player forfeit updates
    newSocket.on('player-forfeited', (data) => {
      console.log('Player forfeited:', data);
      
      // Force refresh to sync updated player list and card counts
      refetch();
      
      if (data.gameEnded) {
        setTimeout(() => setLocation('/game-lobby'), 3000);
      }
    });

    // Handle connection errors with auto-retry
    newSocket.on('connect_error', (error) => {
      console.error('Socket connection error:', error);
    });

    // Handle reconnection success
    newSocket.on('reconnect', () => {
      console.log('Socket reconnected');
      // Force refresh to sync with current server state
      refetch();
    });


    return () => {
      newSocket.disconnect();
    };
  }, [gameRoomId, user, setLocation, toast]);

  // Game timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setGameTimer(prev => {
        if (prev <= 0) {
          setTimeout(() => setLocation('/game-lobby'), 3000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [toast, setLocation]);

  // Player timer countdown
  useEffect(() => {
    if (!currentPlayerPosition || isRevealed) return;
    
    const timer = setInterval(() => {
      setPlayerTimer(prev => {
        if (prev <= 0) {
          // Auto-select first stat if time runs out
          // handleStatSelection(currentCards[currentPlayerPosition]?.stats?.[0]?.statTypeId);
          return roundTimeSeconds; // Reset for next turn
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentPlayerPosition, isRevealed, roundTimeSeconds]);

  // Handle stat selection
  const handleStatSelection = (statTypeId) => {
    if (!socket || isRevealed) return;
    
    console.log('Selecting stat:', { statTypeId, currentUserPosition, currentPlayerPosition });
    setSelectedStat(statTypeId);
    socket.emit('select-stat', {
      gameRoomId,
      statTypeId,
      playerPosition: currentUserPosition  // Use currentUserPosition instead of currentPlayerPosition
    });
  };

  // Leave game handlers - should only be used for non-active games
  const handleLeaveGame = () => {
    // For active multiplayer games, this should trigger forfeit instead
    if (gameData?.gameRoom?.gameState === 'active' && gameData?.gameRoom?.gameMode !== 'single') {
      handleForfeitGame();
    } else {
      setLocation('/game-lobby');
    }
  };

  const handleForfeitGame = () => {
    setShowForfeitDialog(true);
  };

  const forfeitMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/game/${gameRoomId}/forfeit`, {
        method: 'POST',
      });
    },
    onSuccess: (data) => {
      setLocation('/game-lobby');
    },
    onError: (error) => {
    },
  });

  const confirmForfeit = () => {
    setShowForfeitDialog(false);
    forfeitMutation.mutate();
  };

  // Simplified loading check - only require gameRoomId to be valid
  if (!match || !gameRoomId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-accent mx-auto"></div>
          <p className="mt-4 text-lg">Loading game...</p>
        </div>
      </div>
    );
  }

  const { playerSessions } = gameData || {};
  
  // Handle both authenticated and anonymous users safely
  const currentUser = playerSessions?.find(p => p.playerId === user?.id);
  const currentUserPosition = currentUser?.playerPosition ?? 0; // Default to position 0 if not found
  const isMyTurn = currentUserPosition === currentPlayerPosition;
  
  console.log('Authenticated User Debug:', {
    userId: user?.id,
    playerSessions,
    currentUser,
    currentUserPosition,
    currentPlayerPosition,
    isMyTurn
  });
  
  // Check if this is a 1v1 game to use single player interface
  // 1v1 matchmaking games use gameRoomIds that start with "match_"
  const isMatchmaking1v1 = gameRoomId?.startsWith('match_');
  const is1v1Game = isMatchmaking1v1;
  

  // Helper function to get card data for a player position
  const getPlayerCardData = (position) => {
    if (!currentCardsData?.currentCards) {
      return null;
    }
    return currentCardsData.currentCards.find(cardData => cardData.playerPosition === position) || null;
  };

  // Single Player Style Interface for 1v1 Games ONLY - Simplified condition
  if (is1v1Game) {
    // For authenticated users, show player's card vs opponent's card
    const cards = currentCardsData?.currentCards || [];
    const playerCard = cards.find(card => card.playerPosition === currentUserPosition) || null;
    const opponentCard = cards.find(card => card.playerPosition !== currentUserPosition) || null;
    
    console.log('1v1 Authenticated Card Debug:', {
      currentUserPosition,
      cards,
      playerCard,
      opponentCard
    });
    
    
    return (
      <div className="min-h-screen bg-background">
        {/* Premium Game Header */}
        <PremiumGameHeader
          gameTimeRemaining={gameTimer}
          gameTimeTotal={gameTimeSeconds}
          roundTimeRemaining={playerTimer}
          roundTimeTotal={roundTimeSeconds}
          showRoundTimer={isMyTurn && !isRevealed}
          players={[
            {
              name: opponentPlayer?.playerName || "Opponent",
              cardCount: opponentPlayer?.cardCount || 0,
              isCurrentPlayer: !isMyTurn,
              isYou: false
            },
            {
              name: "You",
              cardCount: currentUser?.cardCount || 0,
              isCurrentPlayer: isMyTurn,
              isYou: true
            }
          ]}
          currentPlayerName={isMyTurn ? "You" : (opponentPlayer?.playerName || "Opponent")}
          isMyTurn={isMyTurn}
          roundNumber={1}
          isConnected={connectionStatus?.connected}
          opponentDisconnected={connectionStatus?.opponentDisconnected}
          gameMode="1v1"
          collectionName={gameData?.gameRoom?.collection?.name || "1v1 Battle"}
        />
        
        {/* Floating Leave Button */}
        <FloatingLeaveButton
          onLeave={handleLeaveGame}
          onForfeit={handleForfeitGame}
          isGameActive={gameData?.gameRoom?.gameState === 'active'}
          gameMode="1v1"
        />

        <div className="container mx-auto px-2 py-3">

          {/* Single Player Style Card Layout */}
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8 justify-center">
              {/* Player Card */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <PlayerAvatar
                    user={user}
                    size="sm"
                    showCountry={true}
                    showGlow={true}
                    className="ring-2 ring-accent"
                  />
                </div>
                <div className="text-sm font-medium">
                  You
                </div>
                <Badge variant="default" className="text-xs">
                  {currentUser?.cardCount || 0} cards
                </Badge>
                
                <GameCard
                  card={playerCard?.card}
                  isOwn={true}
                  isRevealed={isRevealed || !isMyTurn}
                  stats={playerCard?.stats}
                  onStatSelect={isMyTurn && !isRevealed ? handleStatSelection : null}
                  selectedStat={selectedStat}
                  isWinner={winnerPosition === currentUserPosition}
                />
              </div>

              {/* Opponent Card */}
              <div className="text-center space-y-2">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <PlayerAvatar
                    user={{ gamerName: "Opponent", id: "opponent" }}
                    size="sm"
                    showCountry={false}
                    showGlow={false}
                  />
                </div>
                <div className="text-sm font-medium">
                  Opponent
                </div>
                <Badge variant="secondary" className="text-xs">
                  {playerSessions?.find(p => p.playerId !== user?.id)?.cardCount || 0} cards
                </Badge>
                
                <GameCard
                  card={opponentCard?.card}
                  isOwn={false}
                  isRevealed={isRevealed}
                  stats={opponentCard?.stats}
                  onStatSelect={null}
                  selectedStat={selectedStat}
                  isWinner={winnerPosition !== currentUserPosition && winnerPosition !== null}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Forfeit Dialog */}
        <AlertDialog open={showForfeitDialog} onOpenChange={setShowForfeitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Forfeit Game?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Leaving this 1v1 game will result in an automatic forfeit. This will count as a loss on your record and your opponent will receive an automatic win.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continue Playing</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmForfeit}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, Forfeit Game
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  // 4-Player Interface with Single Player Style
  
  return (
    <div className="min-h-screen bg-background">
      {/* Single Player Style Header - Compact */}
      <div className="bg-primary/20 border-b border-accent/20 p-2">
        <div className="container mx-auto flex justify-between items-center">
          
          <div className="flex items-center gap-4">
            {/* Single Player Style Timer */}
            <div className="text-center">
              <div className={`text-lg font-bold ${gameTimer > 60 ? 'text-success' : gameTimer > 20 ? 'text-warning' : 'text-destructive'}`}>
                {String(Math.floor(gameTimer / 60)).padStart(2, '0')}:{String(gameTimer % 60).padStart(2, '0')}
              </div>
              <Progress 
                value={(gameTimer / gameTimeSeconds) * 100} 
                className={`h-1 w-16 ${gameTimer < 20 ? 'animate-pulse' : ''}`}
              />
              <div className="text-xs text-muted-foreground">Game Time</div>
            </div>
            
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Round 1</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="w-2 h-2" />
                4 Players
              </div>
            </div>
          </div>
          
          <Button variant="destructive" size="sm" onClick={handleForfeitGame} className="text-xs px-2 py-1" >
            Forfeit
          </Button>
        </div>
      </div>

      <div className="container mx-auto px-2 py-3">
        {/* Collection Info - Compact */}
        <div className="text-center mb-3">
          <h2 className="text-lg font-bold gradient-text mb-1">4-Player Battle</h2>
          <p className="text-xs text-muted-foreground">Choose your best stat to win!</p>
        </div>

        {/* Player Decision Timer (when active) */}
        {isMyTurn && !isRevealed && (
          <div className="text-center mb-2">
            <div className="text-center">
              <div className="text-sm font-bold text-destructive animate-pulse">
                {playerTimer}s
              </div>
              <Progress 
                value={(playerTimer / roundTimeSeconds) * 100} 
                className="h-1 w-20 mx-auto animate-pulse" 
              />
              <div className="text-xs text-muted-foreground">Your Turn</div>
            </div>
          </div>
        )}

        {/* Active Player Thinking Indicator */}
        {!isMyTurn && !isRevealed && (
          <div className="text-center mb-2">
            <Card className="max-w-sm mx-auto border-secondary/50">
              <CardContent className="p-2 text-center">
                <div className="flex items-center justify-center gap-2 text-secondary">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-secondary"></div>
                  <span className="font-medium text-sm">
                    {playerSessions?.find(p => p.playerPosition === currentPlayerPosition)?.playerName || 'Player'} is choosing...
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 4-Player Card Layout - 2x2 Grid */}
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 gap-4 md:gap-6">
            {playerSessions?.slice(0, 4).map((player, index) => {
              const playerCardData = getPlayerCardData(player.playerPosition) || { card: null, stats: [] };
              const isCurrentPlayer = player.playerId === user?.id;
              const isActivePlayer = player.playerPosition === currentPlayerPosition;
              const isHost = gameData?.gameRoom?.hostPlayerId === player.playerId;
              
              
              return (
                <div key={player.playerId} className="text-center space-y-2">
                  {/* Player Info */}
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <PlayerAvatar
                      user={{ 
                        gamerName: player.playerName, 
                        id: player.playerId,
                        country: player.country 
                      }}
                      size="sm"
                      showCountry={true}
                      showGlow={isCurrentPlayer}
                      className={isCurrentPlayer ? 'ring-2 ring-accent' : ''}
                    />
                    {isHost && <Crown className="w-3 h-3 text-glow-gold" />}
                  </div>
                  
                  <div className="text-sm font-medium">
                    {isCurrentPlayer ? 'You' : player.playerName}
                    {isActivePlayer && (
                      <div className="text-xs text-accent font-bold animate-pulse mt-1">
                        ⚡ Active Player
                      </div>
                    )}
                  </div>
                  
                  <Badge variant={isCurrentPlayer ? "default" : "secondary"} className="text-xs">
                    {player.cardCount || 0} cards
                  </Badge>
                  
                  {/* Single Player Style Card */}
                  <div className="w-full max-w-[280px] mx-auto">
                    <GameCard
                      card={playerCardData?.card}
                      isOwn={isCurrentPlayer}
                      isRevealed={isRevealed || isCurrentPlayer}
                      stats={playerCardData?.stats}
                      onStatSelect={isCurrentPlayer && (currentUserPosition === currentPlayerPosition) && !isRevealed ? handleStatSelection : null}
                      selectedStat={selectedStat}
                      isWinner={winnerPosition === player.playerPosition}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Forfeit Dialog */}
        <AlertDialog open={showForfeitDialog} onOpenChange={setShowForfeitDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="w-5 h-5 text-destructive" />
                Forfeit Game?
              </AlertDialogTitle>
              <AlertDialogDescription>
                Leaving this 4-player game will result in forfeit. This will count as a loss on your record and your cards will be redistributed equally among the remaining players. Any remainder cards will go to the current game leader.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continue Playing</AlertDialogCancel>
              <AlertDialogAction 
                onClick={confirmForfeit}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Yes, Forfeit Game
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
