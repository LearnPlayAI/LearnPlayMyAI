import { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Timer, Crown, Zap, Trophy, ArrowLeft, Users, Bot, User, Wifi } from 'lucide-react';
import '../winner-card-animations.css';
import '../premium-game-effects.css';
import PremiumGameResultModal from '@/components/PremiumGameResultModal';
import GuestRegistrationPrompt from '@/components/GuestRegistrationPrompt';
import { preloadCardImagesWithProgress } from '@/utils/imagePreloader';
import io from 'socket.io-client';
import GameAbandonmentConfirmDialog from '@/components/GameAbandancmentConfirmDialog';
import { PremiumGameHeader } from '@/components/PremiumGameHeader';
import { FloatingLeaveButton } from '@/components/FloatingLeaveButton';
import { useAutoFitText } from '@/hooks/useAutoFitText';
import { RoundResultOverlay } from '@/components/RoundResultOverlay';

import { formatStatValue } from '@shared/gameUtils';

// StatBox component with dynamic text sizing and premium effects
const StatBox = ({ stat, isSelected, isClickable, onClick, isTied }) => {
  const nameRef = useRef(null);
  const valueRef = useRef(null);
  
  useAutoFitText(nameRef, { min: 6, max: 11, lines: 2 });
  useAutoFitText(valueRef, { min: 10, max: 16, lines: 1 });
  
  return (
    <div
      className={`
        stat-box flex flex-col items-center justify-center py-0.5 px-0.5 rounded transition-all duration-200 text-center min-h-0 overflow-hidden haptic-button
        ${isTied 
          ? 'cursor-not-allowed bg-muted/60 text-muted-foreground border border-border' 
          : isClickable 
            ? 'cursor-pointer hover:ring-1 hover:ring-[var(--game-gold)]/50 ring-inset glass-button' 
            : 'cursor-default'
        }
        ${isSelected 
          ? 'bg-accent text-accent-foreground ring-2 ring-accent ring-inset card-glow-active' 
          : isTied
            ? 'bg-muted text-muted-foreground border border-border'
            : isClickable 
              ? 'bg-card/95 text-card-foreground hover:bg-card border border-[var(--game-gold)]/40'
              : 'bg-card/95 text-card-foreground border border-border/20'
        }
      `}
      onClick={onClick}
      data-testid={`stat-${stat.statTypeId}`}
      title={isTied ? 'This stat already tied - choose a different one' : ''}
    >
      <span ref={nameRef} className="stat-name font-medium w-full px-0.5 leading-tight">
        {stat.statName}
      </span>
      <span ref={valueRef} className="stat-value mt-0.5 font-bold">
        {formatStatValue(stat.value)}
      </span>
    </div>
  );
};

// Game Timer Component
const GameTimer = ({ timeRemaining, totalTime = 120, isPaused }) => {
  const percentage = (timeRemaining / totalTime) * 100;
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  
  const getTimerColor = () => {
    if (percentage > 50) return 'text-success';
    if (percentage > 20) return 'text-glow-gold';
    return 'text-destructive';
  };

  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${getTimerColor()}`}>
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
      <Progress 
        value={percentage} 
        className={`h-1 w-16 ${percentage < 20 && !isPaused ? 'animate-pulse' : ''}`}
      />
      <div className="text-xs text-muted-foreground">
        {isPaused ? 'Paused' : 'Game Time'}
      </div>
    </div>
  );
};

// Player Decision Timer
const PlayerTimer = ({ timeRemaining, totalTime = 5, isActive, isPaused }) => {
  if (!isActive || isPaused) return null;
  
  const percentage = (timeRemaining / totalTime) * 100;
  
  return (
    <div className="text-center">
      <div className="text-sm font-bold text-destructive animate-pulse">
        {timeRemaining}s
      </div>
      <Progress 
        value={percentage} 
        className="h-1 w-20 mx-auto animate-pulse" 
      />
      <div className="text-xs text-muted-foreground">Your Turn</div>
    </div>
  );
};

// Game Card Component (enhanced with realistic 3D flip animation)
const GameCard = ({ card, isOwn, isRevealed, opponentCardRevealed, onStatSelect, selectedStat, isWinner, isFlipping, isActivePlayer, tiedStats = [] }) => {
  if (!card) {
    return (
      <Card className="w-full max-w-[260px] mx-auto bg-muted/50 border-dashed" style={{ minHeight: '250px' }}>
        <CardContent className="flex items-center justify-center h-full">
          <div className="text-muted-foreground text-xs text-center">No Card</div>
        </CardContent>
      </Card>
    );
  }

  const cardClassName = `
    w-full max-w-[260px] mx-auto aspect-[5/7] transition-all duration-500 relative overflow-hidden card-container
    ${isOwn ? 'border-accent border-2 cursor-pointer' : ''}
    ${isRevealed ? 'transform scale-102' : ''}
    ${isOwn && onStatSelect ? 'ring-4 ring-[var(--game-gold)]/60 shadow-dialog shadow-[var(--game-gold)]/30 border-[var(--game-gold)] card-shake animated-border' : ''}
    ${isActivePlayer ? 'active-player-glow card-glow-active' : ''}
  `;

  // Player's own card: always show front face, no flip
  if (isOwn) {
    return (
      <Card className={cardClassName}>
        {/* Ambient Glow Effect */}
        {isActivePlayer && <div className="card-ambient-glow" />}
        
        <div className="w-full h-full relative">
          {/* Fire particles for active player */}
          {isActivePlayer && (
            <>
              <div className="fire-particle"></div>
              <div className="fire-particle"></div>
              <div className="fire-particle"></div>
              <div className="fire-particle"></div>
            </>
          )}
          
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
            {/* Overlay for bottom 50% only */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--surface-overlay)]/95"></div>
          </div>
          
          {/* Content overlay */}
          <div className="relative z-10 h-full flex flex-col">
            {/* Card name at top with minimal overlay */}
            <div className="absolute top-2 left-2 right-2 z-20">
              <div className="backdrop-blur-sm rounded-lg px-3 py-1.5 text-center shadow-elevated bg-[var(--surface-overlay)]/80 text-foreground">
                <div className="font-bold text-sm">{card.name}</div>
              </div>
            </div>
            
            {/* Image viewing area - top 50% */}
            <div className="h-1/2"></div>
            
            {/* Stats area - constrained to bottom 50% */}
            <div className="h-1/2 p-2 sm:p-3 relative z-20 flex items-center">
              <div className="grid grid-cols-2 gap-1 sm:gap-1.5 w-full">
                {card.stats?.map((stat) => {
                  const isSelected = selectedStat === stat.statTypeId;
                  const isTied = tiedStats.includes(stat.statTypeId);
                  const isClickable = isOwn && onStatSelect && !isTied;
                  
                  return (
                    <StatBox
                      key={stat.statTypeId}
                      stat={stat}
                      isSelected={isSelected}
                      isClickable={isClickable}
                      isTied={isTied}
                      onClick={() => isClickable && !isTied && onStatSelect(stat.statTypeId)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  // Opponent card: use 3D flip animation
  const flipContainerClassName = `
    card-flip-container w-full h-full relative
    ${isFlipping ? 'flipping' : ''}
    ${opponentCardRevealed ? 'flipped' : ''}
  `;

  return (
    <Card className={cardClassName}>
      <div className={flipContainerClassName}>
        {/* Card Back Face */}
        <div className="card-face card-back">
          <img 
            src="/learnplay-card-back.png"
            alt="Card back"
            className="w-full h-full object-fill rounded-lg"
            onError={(e) => {
              console.error('❌ Failed to load card back image:', e.target.src);
              // Fallback to gradient
              e.target.style.display = 'none';
              e.target.nextSibling.style.display = 'flex';
            }}
          />
          {/* Fallback gradient background (hidden by default) */}
          <div className="absolute inset-0 bg-secondary items-center justify-center rounded-lg" style={{ display: 'none' }}>
            <div className="text-secondary-foreground font-bold text-xl">LEARNPLAY</div>
          </div>
        </div>

        {/* Card Front Face */}
        <div className="card-face card-front">
          {/* Fire particles for active player */}
          {isActivePlayer && (
            <>
              <div className="fire-particle"></div>
              <div className="fire-particle"></div>
              <div className="fire-particle"></div>
              <div className="fire-particle"></div>
            </>
          )}
          
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
            {/* Overlay for bottom 50% only */}
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[var(--surface-overlay)]/95"></div>
          </div>
          
          {/* Content overlay */}
          <div className="relative z-10 h-full flex flex-col">
            {/* Card name at top with minimal overlay */}
            <div className="absolute top-2 left-2 right-2 z-20">
              <div className="backdrop-blur-sm rounded-lg px-3 py-1.5 text-center shadow-elevated bg-[var(--surface-overlay)]/80 text-foreground">
                <div className="font-bold text-sm">{card.name}</div>
              </div>
            </div>
            
            {/* Image viewing area - top 50% */}
            <div className="h-1/2"></div>
            
            {/* Stats area - constrained to bottom 50% */}
            <div className="h-1/2 p-2 sm:p-3 relative z-20 flex items-center">
              <div className="grid grid-cols-2 gap-1 sm:gap-1.5 w-full">
                {card.stats?.map((stat) => {
                  const isSelected = selectedStat === stat.statTypeId;
                  const isTied = tiedStats.includes(stat.statTypeId);
                  const isClickable = isOwn && onStatSelect && !isTied;
                  
                  return (
                    <StatBox
                      key={stat.statTypeId}
                      stat={stat}
                      isSelected={isSelected}
                      isClickable={isClickable}
                      isTied={isTied}
                      onClick={() => isClickable && !isTied && onStatSelect(stat.statTypeId)}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </Card>
  );
};

export default function SinglePlayer() {
  const [, params] = useRoute('/single-player/:collectionId');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const collectionId = params?.collectionId;

  // Socket connection state
  const [socket, setSocket] = useState(null);
  const [gameState, setGameState] = useState('loading'); // loading, finding-opponent, playing, finished
  const [gameData, setGameData] = useState({
    gameId: null,
    opponentName: null,
    currentTurn: null,
    isPlayer1: false,
    playerCard: null,
    opponentCard: null,
    playerDeckSize: 0,
    opponentDeckSize: 0,
    roundNumber: 1,
    isMyTurn: false
  });

  // Ref to track if we've already joined to prevent duplicate joins on reconnects
  const hasJoinedRef = useRef(false);

  // Game UI state (matching 1v1 multiplayer exactly)
  const [selectedStats, setSelectedStats] = useState([]);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [xpData, setXPData] = useState(null);
  const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);
  const [gameTimeRemaining, setGameTimeRemaining] = useState(120);
  const [roundTimeRemaining, setRoundTimeRemaining] = useState(5);
  const [gameStartTime, setGameStartTime] = useState(null);
  const [gameTimeSettings, setGameTimeSettings] = useState({ roundTime: 5, gameTime: 120 });
  const [timersArePaused, setTimersArePaused] = useState(false);
  const [gameResult, setGameResult] = useState(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealData, setRevealData] = useState(null);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  
  // Round result overlay state (exactly like 1v1)
  const [showOverlay, setShowOverlay] = useState(null);
  const [overlayCardInfo, setOverlayCardInfo] = useState({ cardsWon: 1, cardsFromTie: 0 });
  const [gameCompletionData, setGameCompletionData] = useState(null);
  const [selectedStat, setSelectedStat] = useState(null);
  const [opponentCardRevealed, setOpponentCardRevealed] = useState(false);
  const [winnerCard, setWinnerCard] = useState(null);
  const [cardFlipping, setCardFlipping] = useState(false);
  const [animationTimeouts, setAnimationTimeouts] = useState([]); // Track active timeouts
  const [isAnimating, setIsAnimating] = useState(false); // Prevent overlapping animations

  // Special tie mode state (when someone has 1 card left)
  const [tiedStats, setTiedStats] = useState([]);
  const [isSpecialTieMode, setIsSpecialTieMode] = useState(false);

  // Preloader state
  const [isPreloading, setIsPreloading] = useState(false);
  const [preloadProgress, setPreloadProgress] = useState(0);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });

  // Get user authentication data
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  // Get user's leaderboard stats for level display
  const { data: leaderboardStats } = useQuery({
    queryKey: ['/api/user/leaderboard-stats'],
    enabled: !!user,
    retry: false,
  });

  // Get collection data (matches multiplayer 1v1)
  const { data: collection, isLoading: isLoadingCollection } = useQuery({
    queryKey: [`/api/collections`],
    select: (data) => data?.find(c => c.id === collectionId),
    enabled: !!collectionId,
  });

  // Get stat types for the collection (matches multiplayer 1v1)
  const { data: statTypes, isLoading: isLoadingStatTypes } = useQuery({
    queryKey: ["/api/collections", collectionId, "stat-types"],
    enabled: !!collectionId,
  });

  // Get real cards with actual stat values for the collection (matches multiplayer 1v1)
  const { data: realCards, isLoading: isLoadingCards } = useQuery({
    queryKey: ["/api/collections", collectionId, "cards"],
    enabled: !!collectionId,
  });

  // Parse URL parameters for custom timer settings (matches multiplayer 1v1)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const roundTime = parseInt(urlParams.get('roundTime')) || 5;
    const gameTime = parseInt(urlParams.get('gameTime')) || 120;
    
    console.log('🕒 Parsed URL timer settings:', { roundTime, gameTime });
    setGameTimeSettings({ roundTime, gameTime });
    setGameTimeRemaining(gameTime);
    setRoundTimeRemaining(roundTime);
  }, []);

  // Preload card images when cards are available
  useEffect(() => {
    if (!realCards || realCards.length === 0) {
      setImagesLoaded(false);
      return;
    }

    const preloadImages = async () => {
      console.log('🖼️ Starting card image preload...');
      try {
        await preloadCardImagesWithProgress(
          realCards,
          (progress) => {
            setLoadingProgress(prev => ({
              ...prev,
              loaded: Math.floor((progress / 100) * realCards.length),
              total: realCards.length
            }));
          }
        );
        console.log('✅ All card images preloaded for single player');
        setImagesLoaded(true);
      } catch (error) {
        console.error('❌ Failed to preload images:', error);
        // Continue anyway
        setImagesLoaded(true);
      }
    };

    preloadImages();
  }, [realCards]);

  // Initialize socket connection
  useEffect(() => {
    if (!collectionId || !realCards || !imagesLoaded) return;

    console.log('🔌 Connecting to server for single player...');
    const newSocket = io();
    setSocket(newSocket);

    // Socket event listeners
    newSocket.on('connect', () => {
      console.log('✅ Connected to server for single player');
      console.log('🔍 Socket ID:', newSocket.id);
      
      // CRITICAL FIX: Only join if we haven't already joined and no game is in progress
      // This prevents duplicate games on reconnects
      if (!hasJoinedRef.current && !gameData.gameId && gameState === 'loading') {
        console.log('🤖 Auto-starting single player game...');
        console.log('🔍 Debug - gameTimeSettings:', gameTimeSettings);
        
        setGameState('finding-opponent');
        hasJoinedRef.current = true; // Mark as joined to prevent duplicates
        
        console.log('📡 Auto-emitting join-single-player with:', {
          collectionId,
          roundTime: gameTimeSettings.roundTime,
          gameTime: gameTimeSettings.gameTime
        });
        
        // Join single player queue (creates immediate game with NPC)
        newSocket.emit('join-single-player', {
          collectionId,
          roundTime: gameTimeSettings.roundTime,
          gameTime: gameTimeSettings.gameTime
        });
      } else {
        console.log('🚫 Skipping join-single-player on reconnect:', {
          hasJoined: hasJoinedRef.current,
          gameId: gameData.gameId,
          gameState: gameState
        });
      }
    });

    newSocket.on('opponent-found', (data) => {
      console.log('🤖 NPC opponent found:', data);
      console.log('🎯 Auto-handling ready state (skip in-lobby screen)');
      setGameData(prev => ({
        ...prev,
        gameId: data.gameId,
        opponentName: data.opponentName,
        isPlayer1: data.isPlayer1
      }));
      setGameTimeSettings({ 
        roundTime: data.roundTime, 
        gameTime: data.gameTime 
      });
      setGameTimeRemaining(data.gameTime);
      
      // Automatically signal ready to server (skip in-lobby screen)
      setIsPlayerReady(true);
      console.log('📡 Auto-emitting player-ready-1v1 for gameId:', data.gameId);
      newSocket.emit('player-ready-1v1', { gameId: data.gameId });
      // Game will transition to 'playing' when 'start-game' event is received
    });

    newSocket.on('start-game', (data) => {
      console.log('🎮 Game started');
      setGameData(prev => ({
        ...prev,
        ...data,
        playerCard: data.playerCard,
        opponentCard: data.opponentCard,
        playerDeckSize: data.playerDeckSize,
        opponentDeckSize: data.opponentDeckSize,
        isMyTurn: data.isMyTurn,
        currentTurn: data.currentTurn,
        roundNumber: data.roundNumber
      }));
      setGameState('playing');
      setRoundTimeRemaining(data.roundTimeSeconds);
      setGameTimeRemaining(data.gameTimeSeconds);
      
      // Reset special tie state for fresh game start
      setIsSpecialTieMode(false);
      setTiedStats([]);
    });

    newSocket.on('stat-reveal-1v1', (data) => {
      console.log('🎯 Stat reveal received from server:', data);
      
      // Prevent overlapping animations
      if (isAnimating) {
        console.log('🚫 Animation already in progress, clearing old timeouts');
        clearAllAnimationTimeouts();
      }
      setIsAnimating(true);
      
      // Capture socket and gameId immediately when reveal is received
      const capturedSocket = newSocket;
      const capturedGameId = data.gameId;
      console.log('🎮 Starting animation for gameId:', capturedGameId, 'round:', data.roundNumber);
      
      // Start card flip animation immediately
      setCardFlipping(true);
      
      // Reveal cards and show winner immediately (minimal delay for smooth transition)
      const flipTimeout = setTimeout(() => {
        setCardFlipping(false);
        setSelectedStat(data.statTypeId);
        setIsRevealing(true);
        setOpponentCardRevealed(true);
        setRevealData(data);
        
        // Show winning card highlight - use server's authoritative data
        if (data.roundWinner === 'player1') {
          setWinnerCard(data.isPlayer1 ? 'player' : 'opponent');
        } else if (data.roundWinner === 'player2') {
          setWinnerCard(data.isPlayer1 ? 'opponent' : 'player');
        } else {
          setWinnerCard(null); // tie
        }
        
        // Show win/loss overlay immediately
        const overlayTimeout = setTimeout(() => {
          let overlayType = null;
          if (data.roundWinner === 'player1') {
            overlayType = data.isPlayer1 ? 'win' : 'lose';
          } else if (data.roundWinner === 'player2') {
            overlayType = data.isPlayer1 ? 'lose' : 'win';
          } else {
            overlayType = 'tie';
          }
          
          // Store card count info for overlay
          setOverlayCardInfo({
            cardsWon: data.cardsWonThisRound || 1,
            cardsFromTie: data.cardsFromTie || 0
          });
          setShowOverlay(overlayType);
          
          // After win/loss animation (3s), complete animations and signal server
          const winnerTimeout = setTimeout(() => {
            setShowOverlay(null);
            setIsAnimating(false);
            
            // Signal server that animation is complete - server will handle timer resume
            if (capturedSocket && capturedGameId) {
              console.log('🎬 Animation complete - signaling server with gameId:', capturedGameId);
              capturedSocket.emit('animation-complete', { gameId: capturedGameId });
            } else {
              console.error('❌ Cannot signal animation-complete: socket or gameId missing');
            }
          }, 3000);
          
          addAnimationTimeout(winnerTimeout);
        }, 0);
        
        addAnimationTimeout(overlayTimeout);
      }, 50);
      
      addAnimationTimeout(flipTimeout);
    });

    newSocket.on('round-start-1v1', (data) => {
      console.log('🔄 Next round started:', data);
      
      // Clear any pending animations when new round starts
      clearAllAnimationTimeouts();
      setIsAnimating(false);
      
      const { roundNumber: newRoundNumber, currentTurn, isMyTurn } = data;
      
      // Reset round state for new round (exactly like 1v1)
      setGameData(prev => ({
        ...prev,
        playerCard: data.playerCard,
        opponentCard: data.opponentCard,
        playerDeckSize: data.playerDeckSize,
        opponentDeckSize: data.opponentDeckSize,
        isMyTurn: data.isMyTurn,
        currentTurn: data.currentTurn,
        roundNumber: data.roundNumber
      }));
      setSelectedStats([]);
      setIsRevealing(false);
      setOpponentCardRevealed(false); // Reset opponent card reveal timing
      setSelectedStat(null);
      setWinnerCard(null);
      setCardFlipping(false);
      setRoundTimeRemaining(data.roundTimeSeconds);
      
      // Reset special tie state for new round
      setIsSpecialTieMode(false);
      setTiedStats([]);
      
      console.log(`🎯 Round ${newRoundNumber} started - My turn: ${isMyTurn}`);
    });

    newSocket.on('game-ended-1v1', async (data) => {
      console.log('🏁 Single player game ended via socket:', data);
      const { gameResult, reason } = data;
      
      // Set final game result and show proper overlay
      setGameResult(gameResult);
      
      // Prepare unified completion modal data
      setGameCompletionData({
        gameResult: gameResult === 'win' ? 'victory' : gameResult === 'lose' ? 'game-over' : 'tie'
      });
      
      // For authenticated users, use XP data from server (no additional API call needed)
      if (user?.isAuthenticated) {
        if (data.xpData) {
          console.log('🌟 Using XP data from server:', data.xpData);
          setXPData(data.xpData);
        } else {
          console.log('⚠️ No XP data received from server for authenticated user');
          setXPData(null);
        }
        
        // Invalidate player stats and game history cache after game
        console.log('💫 Invalidating player stats and game history cache after single player game');
        queryClient.invalidateQueries({ queryKey: ['/api/user/leaderboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user/game-history'] });
      }
      
      // Show the unified completion modal after XP data is fetched (or immediately for guests)
      setShowCompletionModal(true);
      
      // For guests, show registration prompt after they close the completion modal
      if (!user || !user.isAuthenticated) {
        // No timeout needed - will handle via modal close
      } else {
        // Fallback timeout for authenticated users - if they don't click continue after 30 seconds, auto-navigate
        setTimeout(() => {
          console.log('🕐 Single player fallback timeout: Auto-navigating authenticated user after 30 seconds');
          if (showCompletionModal) {
            console.log('🏠 Auto-navigating to game lobby due to timeout');
            setShowCompletionModal(false);
            setXPData(null);
            setLocation('/game-lobby');
          }
        }, 30000);
      }
    });
    
    newSocket.on('clear-reveal', () => {
      console.log('🧹 Clearing reveal data from server signal');
      setIsRevealing(false);
      setRevealData(null);
      setWinnerCard(null);
      setSelectedStat(null);
      setCardFlipping(false);
    });

    // Removed timer pausing during animations to match multiplayer behavior
    // Timers now keep running during animations like in multiplayer mode

    newSocket.on('special-tie-retry', (data) => {
      console.log('🔄 Special tie retry received from server:', data);
      console.log('🎯 Tied stats:', data.tiedStats);
      console.log('🎮 Active player in tie:', data.activePlayerInTie);
      console.log('📊 Tied stat name:', data.tiedStatName);
      
      // Set special tie mode and update tied stats
      setIsSpecialTieMode(true);
      setTiedStats(data.tiedStats || []);
      
      // Reset states to allow new stat selection
      setIsRevealing(false);
      setSelectedStat(null);
      setOpponentCardRevealed(false);
      setWinnerCard(null);
      setCardFlipping(false);
      
      // Determine if it's this player's turn in the special tie
      // activePlayerInTie will be "player1" or "player2"
      // We need to check if we are the active player
      const isMyTurnInTie = (data.activePlayerInTie === 'player1' && gameData.isPlayer1) || 
                           (data.activePlayerInTie === 'player2' && !gameData.isPlayer1);
      
      console.log('🔍 Special tie turn calculation:', {
        activePlayerInTie: data.activePlayerInTie,
        isPlayer1: gameData.isPlayer1,
        isMyTurnInTie: isMyTurnInTie
      });
      
      // Update game state with special tie turn info
      setGameData(prev => ({
        ...prev,
        isMyTurn: isMyTurnInTie
      }));
      
      console.log(`🔄 Special tie mode activated - ${isMyTurnInTie ? 'YOUR' : 'OPPONENT\'S'} turn to select new stat`);
    });

    newSocket.on('error', (error) => {
      console.error('❌ Socket error:', error);
    });

    return () => {
      console.log('🔌 Disconnecting socket');
      clearAllAnimationTimeouts();
      newSocket.disconnect();
    };
  }, [collectionId, realCards, imagesLoaded]);

  // startSinglePlayerGame and handleReady functions removed - now handled automatically in socket events

  // Handle stat selection (client-driven timer control)
  const handleStatSelect = (statTypeId) => {
    if (!gameData.isMyTurn || selectedStats.includes(statTypeId) || !socket) return;
    
    if (!imagesLoaded) {
      return;
    }
    
    console.log('📊 Selecting stat:', statTypeId);
    setSelectedStats([statTypeId]);
    setSelectedStat(statTypeId);
    setIsRevealing(true);
    
    // Disable further selections immediately
    setGameData(prev => ({ ...prev, isMyTurn: false }));
    
    // Timers now continue running during animations (like multiplayer mode)
    
    // Send stat selection to server
    socket.emit('select-stat', {
      statTypeId,
      gameId: gameData.gameId,
      roundNumber: gameData.roundNumber
    });
  };

  // Animation cleanup utilities
  const clearAllAnimationTimeouts = () => {
    animationTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    setAnimationTimeouts([]);
  };

  const addAnimationTimeout = (timeoutId) => {
    setAnimationTimeouts(prev => [...prev, timeoutId]);
  };

  // Round result handlers with socket closure (client controls timer flow)
  const handlePlayerWinWithSocket = (socketRef, gameIdRef, roundKey) => {
    console.log('🏆 handlePlayerWinWithSocket called with refs - Socket:', !!socketRef, 'GameId:', gameIdRef, 'Round:', roundKey);
    setShowOverlay('win');
    setTimeout(() => {
      setShowOverlay(null);
      
      // Animation complete - signal server (timers continue running)
      
      if (socketRef && gameIdRef) {
        console.log('🎬 Win animation complete - signaling server with gameId:', gameIdRef);
        socketRef.emit('animation-complete', { gameId: gameIdRef });
      } else {
        console.error('❌ Cannot signal animation-complete: socket, gameId missing, or round changed', { 
          hasSocket: !!socketRef, 
          gameId: gameIdRef,
          roundKey,
          expectedRoundKey: `${gameIdRef}_${roundNumber}`
        });
      }
    }, 3000);
  };

  // Legacy handler for backward compatibility
  const handlePlayerWin = () => handlePlayerWinWithSocket(socket, gameData.gameId);

  const handleOpponentWinWithSocket = (socketRef, gameIdRef, roundKey) => {
    console.log('😢 handleOpponentWinWithSocket called with refs - Socket:', !!socketRef, 'GameId:', gameIdRef, 'Round:', roundKey);
    setShowOverlay('lose');
    setTimeout(() => {
      setShowOverlay(null);
      
      // Animation complete - signal server (timers continue running)
      
      if (socketRef && gameIdRef) {
        console.log('🎬 Loss animation complete - signaling server with gameId:', gameIdRef);
        socketRef.emit('animation-complete', { gameId: gameIdRef });
      } else {
        console.error('❌ Cannot signal animation-complete: socket, gameId missing, or round changed', { 
          hasSocket: !!socketRef, 
          gameId: gameIdRef,
          roundKey,
          expectedRoundKey: `${gameIdRef}_${roundNumber}`
        });
      }
    }, 3000);
  };

  // Legacy handler for backward compatibility  
  const handleOpponentWin = () => handleOpponentWinWithSocket(socket, gameData.gameId);

  const handleTieWithSocket = (socketRef, gameIdRef, roundKey) => {
    console.log('🤝 handleTieWithSocket called with refs - Socket:', !!socketRef, 'GameId:', gameIdRef, 'Round:', roundKey);
    setShowOverlay('tie');
    setTimeout(() => {
      setShowOverlay(null);
      
      // Animation complete - signal server (timers continue running)
      
      if (socketRef && gameIdRef) {
        console.log('🎬 Tie animation complete - signaling server with gameId:', gameIdRef);
        socketRef.emit('animation-complete', { gameId: gameIdRef });
      } else {
        console.error('❌ Cannot signal animation-complete: socket, gameId missing, or round changed', { 
          hasSocket: !!socketRef, 
          gameId: gameIdRef,
          roundKey,
          expectedRoundKey: `${gameIdRef}_${roundNumber}`
        });
      }
    }, 3000);
  };

  // Legacy handler for backward compatibility
  const handleTie = () => handleTieWithSocket(socket, gameData.gameId);

  // Timer effects (exactly like 1v1 - pure client-side timers, server-driven logic)
  useEffect(() => {
    if (timersArePaused || gameState !== 'playing') return;

    const timer = setInterval(() => {
      setGameTimeRemaining(prev => {
        if (prev <= 1) {
          // Signal game timeout to server exactly like 1v1
          if (socket && gameData.gameId) {
            console.log('⏰ Game timeout - signaling server');
            socket.emit('game-timeout', { gameId: gameData.gameId });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, timersArePaused, socket, gameData.gameId]);

  // Round timer effect (exactly like 1v1 - only for current player)
  useEffect(() => {
    if (!gameData.isMyTurn || gameState !== 'playing' || timersArePaused || isRevealing) return;
    
    const roundTimer = setInterval(() => {
      setRoundTimeRemaining(prev => {
        if (prev <= 1) {
          // Signal turn timeout to server exactly like 1v1
          if (socket && gameData.gameId) {
            console.log('⏰ Player turn timeout - signaling server');
            socket.emit('turn-timeout', { gameId: gameData.gameId });
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(roundTimer);
  }, [gameData.isMyTurn, gameState, timersArePaused, isRevealing, socket, gameData.gameId]);

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
      queryClient.invalidateQueries({ queryKey: ['/api/user/leaderboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/game-history'] });
      if (socket) {
        socket.disconnect();
      }
      setLocation('/');
    },
    onError: (error) => {
      console.error('Failed to apply abandonment penalty:', error);
      // Still allow leaving even if penalty fails
      if (socket) {
        socket.disconnect();
      }
      setLocation('/');
    }
  });

  // Back to home with abandonment check
  const handleBackToHome = () => {
    // Check if game is actively in progress
    const isActiveGame = gameState === 'playing' && user?.isAuthenticated;
    
    if (isActiveGame) {
      setShowAbandonConfirm(true);
    } else {
      // Safe to leave without penalty
      if (socket) {
        socket.disconnect();
      }
      setLocation('/');
    }
  };

  // Confirm abandonment with penalty
  const handleConfirmAbandon = () => {
    setShowAbandonConfirm(false);
    if (user?.isAuthenticated) {
      abandonGame({ gameMode: 'single', gameId: gameData?.gameId || 'single-player' });
    } else {
      // Guests don't get penalties, just leave
      if (socket) {
        socket.disconnect();
      }
      setLocation('/');
    }
  };

  // Handle unified completion modal close
  const handleCloseCompletionModal = () => {
    setShowCompletionModal(false);
    setXPData(null);
    
    if (!user || !user.isAuthenticated) {
      // For guests, show registration prompt
      setShowRegistrationPrompt(true);
    } else {
      // For authenticated users, go to game lobby
      setLocation('/game-lobby');
    }
  };

  // Loading screen with proper steps (exactly like multiplayer 1v1)
  if (!collection || !statTypes || !realCards || !imagesLoaded) {
    const loadingSteps = [
      { label: "Finding collection", completed: !!collection, loading: isLoadingCollection },
      { label: "Loading game rules", completed: !!statTypes, loading: isLoadingStatTypes },
      { label: "Preparing cards", completed: !!realCards, loading: isLoadingCards },
      { label: "Preparing NPC opponent", completed: !!imagesLoaded, loading: !imagesLoaded && !!realCards }
    ];
    
    const completedSteps = loadingSteps.filter(step => step.completed).length;
    const totalSteps = loadingSteps.length;
    const progressPercent = (completedSteps / totalSteps) * 100;
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto mb-4 bg-primary rounded-full flex items-center justify-center">
              <Bot className="w-12 h-12 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Loading Single Player</h2>
            <p className="text-muted-foreground">Preparing your NPC battle experience...</p>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Progress value={progressPercent} className="h-3" />
              <p className="text-sm text-muted-foreground">
                {completedSteps} of {totalSteps} steps completed ({Math.round(progressPercent)}%)
              </p>
            </div>
            
            <div className="space-y-2 text-left">
              {loadingSteps.map((step, index) => (
                <div key={index} className="flex items-center gap-3 text-sm">
                  {step.completed ? (
                    <div className="w-5 h-5 rounded-full bg-success flex items-center justify-center">
                      <svg className="w-3 h-3 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  ) : step.loading ? (
                    <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-muted"></div>
                  )}
                  <span className={step.completed ? 'text-success' : step.loading ? 'text-accent' : 'text-muted-foreground'}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>

            {/* Image loading progress */}
            {loadingProgress.total > 0 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">
                  Preloading {loadingProgress.total} card images...
                </div>
                <Progress 
                  value={(loadingProgress.loaded / loadingProgress.total) * 100} 
                  className="h-2" 
                />
                <div className="text-xs text-muted-foreground">
                  {loadingProgress.loaded}/{loadingProgress.total} images
                </div>
              </div>
            )}
          </div>
          
          <Button variant="outline" onClick={() => setLocation('/')}
            className="mt-6"
            data-testid="button-cancel-loading"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // 'waiting' state screen removed - game now starts automatically

  if (gameState === 'finding-opponent') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary mx-auto"></div>
          <h2 className="text-xl font-semibold text-foreground">Preparing NPC Opponent</h2>
          <p className="text-muted-foreground">Setting up your single player game...</p>
        </div>
      </div>
    );
  }

  // 'in-lobby' state screen removed - ready state now handled automatically

  if (gameState === 'playing') {
    return (
      <div className="min-h-screen relative overflow-hidden">
        {/* Premium Dynamic Background */}
        <div className="premium-game-background" />
        
        {/* Floating Particles */}
        <div className="game-particle" style={{ bottom: '20%' }} />
        <div className="game-particle" style={{ bottom: '30%' }} />
        <div className="game-particle" style={{ bottom: '10%' }} />
        <div className="game-particle" style={{ bottom: '40%' }} />
        <div className="game-particle" style={{ bottom: '15%' }} />
        <div className="game-particle" style={{ bottom: '50%' }} />
        <div className="game-particle" style={{ bottom: '25%' }} />
        <div className="game-particle" style={{ bottom: '35%' }} />
        
        {/* Main Content */}
        <div className="relative z-10">
        {/* Premium Game Header */}
        <PremiumGameHeader
          gameTimeRemaining={gameTimeRemaining}
          gameTimeTotal={gameTimeSettings.gameTime}
          roundTimeRemaining={roundTimeRemaining}
          roundTimeTotal={gameTimeSettings.roundTime}
          showRoundTimer={gameData.isMyTurn && !isRevealing && !timersArePaused}
          players={[
            {
              name: gameData.opponentName,
              cardCount: gameData.opponentDeckSize,
              isCurrentPlayer: !gameData.isMyTurn,
              isYou: false,
              gamerName: gameData.opponentName,
              currentLevel: 1
            },
            {
              name: user?.gamerName || "You",
              cardCount: gameData.playerDeckSize,
              isCurrentPlayer: gameData.isMyTurn,
              isYou: true,
              userId: user?.id,
              gamerName: user?.gamerName,
              currentXP: leaderboardStats?.currentXP,
              currentLevel: leaderboardStats?.currentLevel,
              country: user?.country,
              avatarImageUrl: user?.avatarImageUrl
            }
          ]}
          currentPlayerName={gameData.isMyTurn ? "You" : gameData.opponentName}
          isMyTurn={gameData.isMyTurn}
          roundNumber={gameData.roundNumber}
          gameMode="single"
          collectionName={collection.name}
        />
        
        {/* Floating Leave Button */}
        <FloatingLeaveButton
          onLeave={handleBackToHome}
          isGameActive={gameState === 'playing' && user?.isAuthenticated}
          gameMode="single"
        />

        <div className="container mx-auto px-2 py-1">


          {/* Game Area - Compact Layout (cloned from 1v1) */}
          <div className="max-w-4xl mx-auto px-1">
            {/* Cards Display - Vertical Layout (Player on Top, Opponent Below) */}
            <div className="flex flex-col gap-1 mb-1 w-full max-w-sm px-1 mx-auto">
              {/* Player Card */}
              <div className="text-center">
                <div className="mb-1 flex items-center gap-1 justify-center">
                  <Crown className="w-3 h-3 text-accent" />
                  <span className="font-bold text-sm">You</span>
                </div>
                <GameCard
                  card={gameData.playerCard}
                  isOwn={true}
                  isRevealed={isRevealing}
                  onStatSelect={gameData.isMyTurn && !isRevealing && !isAnimating && !timersArePaused ? handleStatSelect : null}
                  selectedStat={selectedStat}
                  isWinner={winnerCard === 'player'}
                  isFlipping={false}
                  isActivePlayer={gameData.isMyTurn && !isRevealing}
                  tiedStats={tiedStats}
                />
              </div>

              {/* NPC Card - Hidden during gameplay, shown only in overlay */}
            </div>
          </div>
        </div>

        {/* Round Result Overlay - Stacked Cards Reveal */}
        <RoundResultOverlay
          show={showOverlay !== null}
          winnerCard={
            winnerCard === 'player' ? gameData.playerCard :
            winnerCard === 'opponent' ? gameData.opponentCard :
            gameData.playerCard // For tie, show player card as "winner"
          }
          loserCard={
            winnerCard === 'player' ? gameData.opponentCard :
            winnerCard === 'opponent' ? gameData.playerCard :
            gameData.opponentCard // For tie, show opponent card as "loser"
          }
          selectedStatId={revealData?.statTypeId || null}
          selectedStatName={
            revealData?.statTypeId
              ? gameData.playerCard?.stats?.find(s => s.statTypeId === revealData.statTypeId)?.statName || null
              : null
          }
          winnerValue={
            winnerCard === 'player' ? revealData?.player1Value :
            winnerCard === 'opponent' ? revealData?.player2Value :
            revealData?.player1Value // For tie
          }
          loserValue={
            winnerCard === 'player' ? revealData?.player2Value :
            winnerCard === 'opponent' ? revealData?.player1Value :
            revealData?.player2Value // For tie
          }
          isPlayerWinner={winnerCard === 'player'}
          isTie={winnerCard === null}
          onComplete={() => setShowOverlay(null)}
        />

        {/* Unified Game Completion Modal */}
        {showCompletionModal && gameCompletionData && (
          <PremiumGameResultModal
            isOpen={showCompletionModal}
            gameResult={gameCompletionData.gameResult}
            xpData={xpData}
            onBackToLobby={handleCloseCompletionModal}
            userIsAuthenticated={user?.isAuthenticated || false}
          />
        )}


        {/* Post-game Registration Prompt for Guests */}
        {showRegistrationPrompt && (
          <GuestRegistrationPrompt
            gameResult={gameResult}
            onSkip={() => {
              setShowRegistrationPrompt(false);
              setLocation('/');
            }}
            onClose={() => {
              setShowRegistrationPrompt(false);
              setLocation('/');
            }}
          />
        )}

        {/* Game Abandonment Confirmation Dialog */}
        <GameAbandonmentConfirmDialog
          isOpen={showAbandonConfirm}
          onOpenChange={setShowAbandonConfirm}
          onConfirm={handleConfirmAbandon}
          gameMode="single"
        />
        </div>
      </div>
    );
  }

  // No longer need the basic 'finished' screen - using GameOverlay system like 1v1

  return null;
}
