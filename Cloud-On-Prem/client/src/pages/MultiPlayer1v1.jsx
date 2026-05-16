import { useState, useEffect, useRef } from 'react';
import { useRoute, useLocation } from 'wouter';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Timer, Crown, Zap, Trophy, ArrowLeft, Users, Wifi, WifiOff, User, Shield } from 'lucide-react';
import '../winner-card-animations.css';
import '../premium-game-effects.css';
import PremiumGameResultModal from '@/components/PremiumGameResultModal';
import { preloadCardImagesWithProgress } from '@/utils/imagePreloader';
import { io } from 'socket.io-client';
import GuestRegistrationPrompt from '@/components/GuestRegistrationPrompt';
import GameAbandonmentConfirmDialog from '@/components/GameAbandancmentConfirmDialog';
import { PremiumGameHeader } from '@/components/PremiumGameHeader';
import { FloatingLeaveButton } from '@/components/FloatingLeaveButton';
import { RoundResultOverlay } from '@/components/RoundResultOverlay';
import { useAutoFitText } from '@/hooks/useAutoFitText';

import { formatStatValue } from '@shared/gameUtils';


// Proper deck dealing - ensures unique cards per player
const dealCards = (realCards) => {
  if (!realCards || realCards.length < 2) {
    return { playerDeck: [], opponentDeck: [] };
  }
  
  // Validate minimum cards for fair distribution
  if (realCards.length < 2) {
    console.error(`Not enough cards for fair distribution: ${realCards.length} cards for 2 players`);
    return { playerDeck: [], opponentDeck: [] };
  }
  
  // Shuffle the deck to ensure randomness
  const shuffledCards = [...realCards].sort(() => Math.random() - 0.5);
  
  // Deal cards alternately to ensure equal distribution
  const playerDeck = [];
  const opponentDeck = [];
  const usedCardIds = new Set();
  
  shuffledCards.forEach((card, index) => {
    // Validate no duplicate cards
    if (usedCardIds.has(card.id)) {
      console.error(`DUPLICATE CARD DETECTED: ${card.id} already used`);
      return;
    }
    usedCardIds.add(card.id);
    
    const formattedCard = {
      id: card.id,
      name: card.name,
      imageKey: card.imageKey,
      stats: card.stats?.map(stat => ({
        statTypeId: stat.statTypeId,
        statName: stat.statName,
        value: stat.value
      })) || []
    };
    
    if (index % 2 === 0) {
      playerDeck.push(formattedCard);
    } else {
      opponentDeck.push(formattedCard);
    }
  });
  
  // Final validation - ensure no overlapping cards between decks
  const playerCardIds = new Set(playerDeck.map(c => c.id));
  const opponentCardIds = new Set(opponentDeck.map(c => c.id));
  const overlapping = [...playerCardIds].filter(id => opponentCardIds.has(id));
  
  if (overlapping.length > 0) {
    console.error(`CARD OVERLAP DETECTED: ${overlapping.join(', ')}`);
    throw new Error(`Game integrity violation: Overlapping cards between players`);
  }
  
  console.log(`✅ Multiplayer 1v1 - Card uniqueness validated: ${playerDeck.length} player cards, ${opponentDeck.length} opponent cards, ${usedCardIds.size} total unique cards`);
  
  return { playerDeck, opponentDeck };
};

// Get the next card from a player's deck (original deck first, then won cards)
const getNextCard = (originalDeck, wonCards) => {
  if (originalDeck.length > 0) {
    return originalDeck[0]; // Top card from original deck
  } else if (wonCards.length > 0) {
    return wonCards[0]; // Top card from won cards pile
  }
  return null;
};

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
          ? 'cursor-not-allowed bg-muted text-muted-foreground border border-border/80' 
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

// Card Display Component - Enhanced with realistic 3D flip animation
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
      <Card className={cardClassName} style={{ aspectRatio: '5 / 7' }}>
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
              <div className="w-full h-full bg-surface-base flex items-center justify-center text-primary-foreground/45 text-6xl font-bold">
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
    <Card className={cardClassName} style={{ aspectRatio: '5 / 7' }}>
      <div className={flipContainerClassName}>
        {/* Card Back Face */}
        <div className="card-face card-back">
          <img 
            src="/learnplay-card-back.png"
            alt="Card back"
            className="w-full h-full object-cover rounded-lg"
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
              <div className="w-full h-full bg-surface-base flex items-center justify-center text-primary-foreground/45 text-6xl font-bold">
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

export default function MultiPlayer1v1() {
  // Add global error handler to catch crashes
  useEffect(() => {
    const handleError = (error) => {
      console.error('🚨 Global error caught:', error);
    };
    const handleUnhandledRejection = (event) => {
      console.error('🚨 Unhandled promise rejection:', event.reason);
    };
    
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);
  const [match, params] = useRoute('/multiplayer-1v1/:collectionId');
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  
  // Parse URL parameters for timer settings and matchmaking mode
  const urlParams = new URLSearchParams(window.location.search);
  const userSelectedRoundTime = parseInt(urlParams.get('roundTime')) || 5;
  const userSelectedGameTime = parseInt(urlParams.get('gameTime')) || 120;
  const isHostMode = urlParams.get('host') === 'true';
  const isQuickJoinMode = urlParams.get('quickJoin') === 'true';
  const isCollectionOnlyMode = urlParams.get('collectionOnly') === 'true';
  const [gameId, setGameId] = useState(urlParams.get('gameId')); // Matchmaking game ID
  const [autoMatchmaking, setAutoMatchmaking] = useState(urlParams.get('autoMatchmaking') === 'true'); // Auto-matchmaking toggle
  
  // Game state - timers initialized with user's selected values
  const [gameTimer, setGameTimer] = useState(userSelectedGameTime);
  const [playerTimer, setPlayerTimer] = useState(userSelectedRoundTime);
  const [roundTime, setRoundTime] = useState(userSelectedRoundTime); // Track server's round setting
  const [gameTimeLimit, setGameTimeLimit] = useState(userSelectedGameTime); // Track server's game setting
  const [gameStartAt, setGameStartAt] = useState(null); // Server-provided countdown start time
  const [timersPaused, setTimersPaused] = useState(false); // Pause during animations
  const [isPlayerTurn, setIsPlayerTurn] = useState(false); // Start as false until turn is assigned
  const [selectedStat, setSelectedStat] = useState(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [isPlayer1, setIsPlayer1] = useState(false); // Track player role
  
  // Deck management
  const [playerDeck, setPlayerDeck] = useState([]);
  const [playerWonCards, setPlayerWonCards] = useState([]);
  const [opponentDeck, setOpponentDeck] = useState([]);
  const [opponentWonCards, setOpponentWonCards] = useState([]);
  const [tiedCards, setTiedCards] = useState([]);
  
  // Server-authoritative deck sizes (override local calculations)
  const [playerDeckSize, setPlayerDeckSize] = useState(undefined);
  const [opponentDeckSize, setOpponentDeckSize] = useState(undefined);
  
  // Special tie mode state (when someone has 1 card left)
  const [tiedStats, setTiedStats] = useState([]);
  const [isSpecialTieMode, setIsSpecialTieMode] = useState(false);
  const [isActivePlayerInSpecialTie, setIsActivePlayerInSpecialTie] = useState(false);
  
  // Current round state
  const [roundNumber, setRoundNumber] = useState(1);
  const [gameStarted, setGameStarted] = useState(false);
  const [playerCard, setPlayerCard] = useState(null);
  const [opponentCard, setOpponentCard] = useState(null);
  
  // Use refs to ensure event handlers have access to latest card values
  const playerCardRef = useRef(null);
  const opponentCardRef = useRef(null);
  
  // Update refs when cards change
  useEffect(() => {
    playerCardRef.current = playerCard;
    opponentCardRef.current = opponentCard;
  }, [playerCard, opponentCard]);
  const [winnerCard, setWinnerCard] = useState(null);
  const [cardFlipping, setCardFlipping] = useState(false); // Track card flip animation
  const [animationTimeouts, setAnimationTimeouts] = useState([]); // Track active timeouts
  const [isAnimating, setIsAnimating] = useState(false); // Prevent overlapping animations
  const [revealData, setRevealData] = useState(null); // Store stat reveal data for overlay
  const [opponentCardRevealed, setOpponentCardRevealed] = useState(false); // Track opponent card face reveal timing
  const [showOverlay, setShowOverlay] = useState(null);
  const [overlayCardInfo, setOverlayCardInfo] = useState({ cardsWon: 1, cardsFromTie: 0 });
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });
  
  // Multiplayer state
  const [socket, setSocket] = useState(null);
  const [opponentName, setOpponentName] = useState('Searching...');
  const [isConnected, setIsConnected] = useState(false);
  const [waitingForOpponent, setWaitingForOpponent] = useState(true);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState(null); // 'manual' or 'connection-lost'
  const [opponentDisconnected, setOpponentDisconnected] = useState(false); // Track if opponent is currently disconnected
  const [showDisconnectAlert, setShowDisconnectAlert] = useState(false); // Show real-time disconnect notification
  const [gamePhase, setGamePhase] = useState('matchmaking'); // 'matchmaking', 'waiting', 'playing'
  const [bothPlayersReady, setBothPlayersReady] = useState(false);
  const [waitingPlayers, setWaitingPlayers] = useState([]);
  const [lastQueueUpdate, setLastQueueUpdate] = useState(0);
  
  // Registration prompt for guests
  const [showRegistrationPrompt, setShowRegistrationPrompt] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [xpData, setXPData] = useState(null);
  const [gameResult, setGameResult] = useState(null); // 'win', 'lose', or 'tie'
  const [gameCompletionData, setGameCompletionData] = useState(null);
  
  // Game collection data (received from server, takes precedence over URL params)
  const [gameCollection, setGameCollection] = useState(null);
  
  // Check user authentication status (works for both authenticated and anonymous users)
  const { data: user } = useQuery({
    queryKey: ['/api/user-status'],
    retry: false,
    staleTime: 60000,
  });

  // Get user's leaderboard stats for level display
  const { data: leaderboardStats } = useQuery({
    queryKey: ['/api/user/leaderboard-stats'],
    enabled: !!user && user.isAuthenticated,
    retry: false,
  });

  // Query for waiting players (updated when queue changes)
  const { data: fetchedWaitingPlayers, refetch: refetchWaitingPlayers } = useQuery({
    queryKey: ['waiting-players', lastQueueUpdate],
    queryFn: () => fetch('/api/matchmaking/waiting-players').then(res => res.json()),
    enabled: waitingForOpponent,
    refetchInterval: waitingForOpponent ? 3000 : false, // Refetch every 3 seconds while waiting
    staleTime: 1000, // Consider data stale after 1 second
  });

  // Function to join a specific waiting player
  const joinSpecificPlayer = (targetPlayer) => {
    if (!socket) {
      console.error('No socket connection available');
      return;
    }
    
    console.log('🎯 Joining specific player:', targetPlayer.playerName, 'in collection:', targetPlayer.collectionId);
    socket.emit('join-specific-player', {
      targetPlayerId: targetPlayer.playerId,
      targetCollectionId: targetPlayer.collectionId
    });
  };
  
  // Calculate total card counts for display
  // Use server-provided deck sizes when available, otherwise fall back to local calculation
  const playerCards = playerDeckSize !== undefined ? playerDeckSize : (playerDeck.length + playerWonCards.length);
  const opponentCards = opponentDeckSize !== undefined ? opponentDeckSize : (opponentDeck.length + opponentWonCards.length);
  
  const collectionId = params?.collectionId;

  // Get collection data
  const { data: collection, isLoading: isLoadingCollection } = useQuery({
    queryKey: [`/api/collections`],
    select: (data) => data?.find(c => c.id === collectionId),
    enabled: !!collectionId,
  });

  // Get stat types for the collection
  const { data: statTypes, isLoading: isLoadingStatTypes } = useQuery({
    queryKey: ["/api/collections", collectionId, "stat-types"],
    enabled: !!collectionId,
  });

  // Get real cards with actual stat values for the collection
  const { data: realCards, isLoading: isLoadingCards } = useQuery({
    queryKey: ["/api/collections", collectionId, "cards"],
    enabled: !!collectionId,
  });

  // Initialize socket connection and matchmaking
  useEffect(() => {
    if (!collectionId || !realCards) return;
    
    const newSocket = io();
    setSocket(newSocket);
    
    // Join matchmaking for 1v1 with host/quickJoin/collection-only preferences
    newSocket.emit('join-1v1-queue', { 
      collectionId,
      gameId,
      roundTime: userSelectedRoundTime,
      gameTime: userSelectedGameTime,
      preferredMatchingMode: isCollectionOnlyMode ? 'collection-only' : isHostMode ? 'host' : isQuickJoinMode ? 'quickJoin' : 'flexible'
    });
    
    // Socket event handlers
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setIsConnected(true);
    });
    
    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setIsConnected(false);
    });
    
    // Handle new matchmaking events
    newSocket.on('matchmaking-queued', (data) => {
      console.log('🎯 Added to matchmaking queue:', data);
      // Update UI to show queue position and estimated wait
    });
    
    newSocket.on('matchmaking-update', (data) => {
      console.log('🔄 Matchmaking update:', data);
      // Update UI with extended wait message
    });

    // Handle queue updates to refresh waiting players list
    newSocket.on('queue-updated', () => {
      console.log('🔄 Queue updated, refreshing waiting players...');
      setLastQueueUpdate(Date.now());
      refetchWaitingPlayers();
    });

    // Handle server timer synchronization (after rounds to prevent drift)
    newSocket.on('timer-sync', (data) => {
      console.log('⏰ Timer sync received after round:', data);
      // Update local timer states with server-authoritative values to prevent drift
      setGameTimer(data.gameTimer);
      if (data.playerTimerRemaining !== undefined) {
        setPlayerTimer(data.playerTimerRemaining);
      }
      
      // Sync round number if provided
      if (data.roundNumber !== undefined) {
        setRoundNumber(data.roundNumber);
      }
    });
    
    // Enhanced matchmaking: Handle match found (before game starts)
    newSocket.on('match-found', (data) => {
      try {
        console.log('🎯 Match found:', data);
        console.log('🎯 Player role assignment:', { isPlayer1: data.isPlayer1 });
        console.log('⏱️ Timer settings from match-found:', { 
          roundTimeSeconds: data.roundTimeSeconds, 
          gameTimeSeconds: data.gameTimeSeconds 
        });
        
        // Validate required data
        if (!data.gameId || !data.seed) {
          console.error('❌ Invalid match-found data:', data);
          return;
        }
        
        setGameId(data.gameId);
        setOpponentName(data.opponentName);
        setWaitingForOpponent(false);
        setGamePhase('loading'); // Set to loading phase
        setIsPlayer1(data.isPlayer1);
        
        console.log('🎲 Pre-initializing game with seed:', data.seed, 'isPlayer1:', data.isPlayer1);
        // Initialize decks with shared seed for synchronization
        initializeGame(data.seed, data.isPlayer1);
        console.log('✅ Game pre-initialized, entering loading phase');
        
        // Emit join-match to signal we've entered the game
        console.log('🎮 Emitting join-match for game:', data.gameId);
        newSocket.emit('join-match', { gameId: data.gameId });
        
        // Note: player-ready-1v1 will be emitted after card images are preloaded
        // See the useEffect that watches imagesLoaded state
      } catch (error) {
        console.error('❌ Error in match-found handler:', error);
      }
    });
    
    // Handle match lobby updates (shows readiness status)
    newSocket.on('match-lobby-update', (data) => {
      console.log('🏛️ Match lobby update:', data);
      // Update UI to show which players have joined and are ready
      // This will be used to show "Waiting for opponent to load..." messages
    });
    
    // Handle synchronized game start
    newSocket.on('start-game', (data) => {
      try {
        console.log('🚀 Game starting:', data);
        console.log('⏱️ Timer settings from start-game:', { 
          roundTimeSeconds: data.roundTimeSeconds, 
          gameTimeSeconds: data.gameTimeSeconds 
        });
        
        // Transition from loading to active game phase
        setGamePhase('playing');
        setBothPlayersReady(true);
        
        // Set collection data from server (overrides URL params for cross-collection games)
        if (data.collection) {
          setGameCollection(data.collection);
          console.log('🎮 Game collection set from server:', data.collection.name);
        }
        
        // Set up game state from server data
        setPlayerCard(data.playerCard);
        setOpponentCard(data.opponentCard);
        setPlayerDeckSize(data.playerDeckSize);
        setOpponentDeckSize(data.opponentDeckSize);
        setRoundNumber(data.roundNumber);
        setIsPlayerTurn(data.isMyTurn);
        
        // Set timer durations immediately so components mount with correct values
        setGameTimer(data.gameTimeSeconds);
        setPlayerTimer(data.roundTimeSeconds);
        setGameTimeLimit(data.gameTimeSeconds); // Track server's game time setting
        setRoundTime(data.roundTimeSeconds); // Track server's round time setting
        setGameStartAt(data.startAt); // Store server's countdown start time
        
        const now = Date.now();
        const delay = Math.max(0, data.startAt - now);
        
        console.log('⏱️ Timer settings from server:', {
          gameTimer: data.gameTimeSeconds,
          roundTimer: data.roundTimeSeconds,
          startAt: data.startAt,
          currentTime: now,
          countdownStartsIn: delay + 'ms'
        });
        
      } catch (error) {
        console.error('❌ Error in start-game handler:', error);
      }
    });
    
    newSocket.on('opponent-stat-selected', (data) => {
      console.log('🎯 Opponent selected stat:', data);
      console.log('🎯 Current cards state - playerCard:', playerCard, 'opponentCard:', opponentCard);
      console.log('🎯 Current player state - isPlayer1:', isPlayer1);
      
      // Update turn state based on server response
      const isMyTurn = (isPlayer1 && data.nextTurn === 'player1') || 
                      (!isPlayer1 && data.nextTurn === 'player2');
      setIsPlayerTurn(isMyTurn);
      
      // Use refs to get current card values (fixes React closure issue)
      console.log('🎯 Using refs - playerCard:', playerCardRef.current, 'opponentCard:', opponentCardRef.current);
      // Server will handle all stat processing - client just waits
    });

    // Handle stat reveal from server (critical for card flip synchronization)
    newSocket.on('stat-reveal-1v1', (data) => {
      console.log('🎯 Stat reveal received from server:', data);
      
      // Store reveal data for overlay
      setRevealData(data);
      
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
        setIsRevealed(true);
        setOpponentCardRevealed(true);
        setIsPlayerTurn(false);
        
        // Show winning card highlight - use server's authoritative data
        if (data.roundWinner === 'player1') {
          setWinnerCard(data.isPlayer1 ? 'player' : 'opponent');
        } else if (data.roundWinner === 'player2') {
          setWinnerCard(data.isPlayer1 ? 'opponent' : 'player');
        } else {
          setWinnerCard(null); // tie
        }
        
        // Show win/loss overlay immediately after card reveal
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
    
    // Handle special tie scenario (when someone has 1 card left)
    newSocket.on('special-tie-retry', (data) => {
      console.log('🎯 Special tie retry received from server:', data);
      
      // Clear any animations
      clearAllAnimationTimeouts();
      setIsAnimating(false);
      setCardFlipping(false);
      
      // Reset reveal states
      setIsRevealed(false);
      setOpponentCardRevealed(false);
      setSelectedStat(null);
      setWinnerCard(null);
      setShowOverlay(null);
      
      // Enter special tie mode
      setIsSpecialTieMode(true);
      setTiedStats(data.tiedStats || []);
      
      // Determine if this player is the active player (can select stats)
      // Server tells us exactly who can select based on who has multiple cards
      setIsActivePlayerInSpecialTie(data.canSelectInTie);
      
      // Show message about tied stat
      const message = data.message || `${data.tiedStatName} tied! Choose a different stat.`;
      console.log('🎯 Special tie message:', message);
      console.log('🎯 Special tie mode activated - tied stats:', data.tiedStats);
      console.log('🎯 Active player in special tie:', data.canSelectInTie ? 'You' : 'Opponent');
      console.log('🎯 Active player ID from server:', data.activePlayerInTie);
    });
    
    newSocket.on('game-sync', (data) => {
      console.log('Game sync received:', data);
      // Sync game state if needed
      syncGameState(data);
    });
    
    newSocket.on('opponent-disconnected', () => {
      console.log('Opponent disconnected');
      setOpponentLeft(true);
      setOpponentDisconnected(true);
      setDisconnectReason('manual');
      setShowDisconnectAlert(true);
      // Remove auto-redirect, let user choose when to leave
    });
    
    newSocket.on('opponent-connection-lost', (data) => {
      console.log('🔌 Opponent connection lost:', data);
      setOpponentLeft(true);
      setOpponentDisconnected(true);
      setDisconnectReason('connection-lost');
      setShowDisconnectAlert(true);
      
      // Show message that no penalties were applied due to connection loss
      console.log('ℹ️ Game ended due to connection loss - no penalties applied');
      // Remove auto-redirect, let user choose when to leave
    });
    
    newSocket.on('game-start-1v1', (data) => {
      console.log('🎮 Game starting with server-authoritative data:', data);
      setGamePhase('playing');
      setBothPlayersReady(true);
      setGameStarted(true);
      
      // Use server's direct turn assignment to avoid stale state issues
      setIsPlayerTurn(data.isMyTurn);
      setIsPlayer1(data.isPlayer1);
      
      // Verify server timer settings match user's selection (game start)
      if (data.gameTimeSeconds !== undefined) {
        console.log(`🎯 Server game time: ${data.gameTimeSeconds}s, User selected: ${userSelectedGameTime}s`);
        if (data.gameTimeSeconds !== userSelectedGameTime) {
          console.warn('⚠️ Server game time differs from user selection at game start');
        }
        setGameTimeLimit(data.gameTimeSeconds);
        setGameTimer(data.gameTimeSeconds);
      }
      if (data.roundTimeSeconds !== undefined) {
        console.log(`🎯 Server round time: ${data.roundTimeSeconds}s, User selected: ${userSelectedRoundTime}s`);
        if (data.roundTimeSeconds !== userSelectedRoundTime) {
          console.warn('⚠️ Server round time differs from user selection at game start');
        }
        setRoundTime(data.roundTimeSeconds);
        setPlayerTimer(data.roundTimeSeconds);
      }
      
      // Initialize server deck sizes and current cards
      if (data.playerDeckSize !== undefined) {
        setPlayerDeckSize(data.playerDeckSize);
      }
      if (data.opponentDeckSize !== undefined) {
        setOpponentDeckSize(data.opponentDeckSize);
      }
      if (data.playerCard) {
        setPlayerCard(data.playerCard);
        playerCardRef.current = data.playerCard;
      }
      if (data.opponentCard) {
        setOpponentCard(data.opponentCard);
        opponentCardRef.current = data.opponentCard;
      }
      
      console.log(`🎯 Game started - My turn: ${data.isMyTurn}, Round time: ${data.roundTimeSeconds}s, Game time: ${data.gameTimeSeconds}s`);
      console.log('📊 Initial deck sizes - player:', data.playerDeckSize, 'opponent:', data.opponentDeckSize);
    });
    
    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      if (error.message !== 'Not your turn') {
        setTimeout(() => setLocation('/'), 3000);
      }
    });
    
    // Handle server-driven round progression
    newSocket.on('round-start-1v1', (data) => {
      console.log('🔄 Server starting new round:', data);
      
      // Clear any pending animations when new round starts
      clearAllAnimationTimeouts();
      setIsAnimating(false);
      
      const { roundNumber: newRoundNumber, currentTurn, isMyTurn, isPlayer1: serverIsPlayer1 } = data;
      
      // Reset round state for new round
      setRoundNumber(newRoundNumber);
      setIsRevealed(false);
      setOpponentCardRevealed(false); // Reset opponent card reveal timing
      setSelectedStat(null);
      setPlayerTimer(data.roundTimeSeconds || userSelectedRoundTime); // Reset to full round time
      setWinnerCard(null);
      setIsPlayerTurn(isMyTurn);
      
      // Clear special tie state when starting a new round (normal flow resumed)
      setIsSpecialTieMode(false);
      setTiedStats([]);
      setIsActivePlayerInSpecialTie(false);
      
      // Update player role from server (authoritative)
      if (serverIsPlayer1 !== undefined) {
        setIsPlayer1(serverIsPlayer1);
      }
      
      // Don't reset game timer on round start - it should continue counting down
      if (data.roundTimeSeconds !== undefined) {
        console.log(`🎯 Server round time: ${data.roundTimeSeconds}s, User selected: ${userSelectedRoundTime}s`);
        if (data.roundTimeSeconds !== userSelectedRoundTime) {
          console.warn('⚠️ Server round time differs from user selection at round start');
        }
        setRoundTime(data.roundTimeSeconds);
        setPlayerTimer(data.roundTimeSeconds);
      }
      
      // Use server-provided cards and deck sizes (100% authoritative)
      if (data.playerCard) {
        setPlayerCard(data.playerCard);
        playerCardRef.current = data.playerCard;
      }
      if (data.opponentCard) {
        setOpponentCard(data.opponentCard);
        opponentCardRef.current = data.opponentCard;
      }
      if (data.playerDeckSize !== undefined) {
        setPlayerDeckSize(data.playerDeckSize);
      }
      if (data.opponentDeckSize !== undefined) {
        setOpponentDeckSize(data.opponentDeckSize);
      }
      
      console.log(`🎯 Round ${newRoundNumber} started - My turn: ${isMyTurn}`);
    });
    
    // Handle game end
    newSocket.on('game-ended-1v1', (data) => {
      console.log('🏁 Game ended received from server:', data);
      const { gameResult, isPlayer1: serverIsPlayer1, reason } = data;
      
      // Clear special tie state when game ends
      setIsSpecialTieMode(false);
      setTiedStats([]);
      setIsActivePlayerInSpecialTie(false);
      
      // Show timeout message if game ended due to time expiration
      if (reason === 'timeout') {
      }
      
      // Set final game result and prepare unified completion modal data
      if (gameResult === 'win') {
        setGameResult('win');
        setGameCompletionData({
          gameResult: 'victory',
          message: data.message || null, // Server now sends proper message for all cases
          reason: data.reason || null
        });
      } else if (gameResult === 'lose') {
        setGameResult('lose');
        setGameCompletionData({
          gameResult: 'game-over',
          message: data.message || null,
          reason: data.reason || null
        });
      } else if (gameResult === 'tie') {
        setGameResult('tie');
        setGameCompletionData({
          gameResult: 'tie',
          message: data.message || null,
          reason: data.reason || null
        });
      }
      
      // Store XP data for authenticated users (don't show animation yet)
      if (user?.isAuthenticated && data.xpData) {
        console.log('🌟 Storing XP data for multiplayer game');
        console.log('🔍 XP data structure check:', {
          hasXpResult: !!data.xpData?.xpResult,
          hasPlayerStats: !!data.xpData?.playerStats,
          hasGameWon: data.xpData?.gameWon !== undefined,
          xpResult: data.xpData?.xpResult,
          playerStats: data.xpData?.playerStats
        });
        setXPData(data.xpData);
      } else if (user?.isAuthenticated && !data.xpData) {
        console.log('🔎 Authenticated user but no XP data received from server:', {
          gameResult,
          userId: user.id,
          hasDataObject: !!data
        });
        setXPData(null);
      } else {
        console.log('👤 Guest player - no XP data stored');
        setXPData(null);
      }
      
      // Invalidate player stats and game history cache to update profile after game ends
      if (user?.isAuthenticated) {
        console.log('💫 Invalidating player stats and game history cache after multiplayer game');
        queryClient.invalidateQueries({ queryKey: ['/api/user/leaderboard-stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user/game-history'] });
      }
      
      // Show the unified completion modal immediately
      setShowCompletionModal(true);
      
      // User must manually click "Back to Lobby" - no auto-navigation
    });
    
    // Handle timer pause/resume from server
    newSocket.on('pause-timers', () => {
      console.log('⏸️ Timers paused for animations');
      setTimersPaused(true);
    });
    
    newSocket.on('resume-timers', () => {
      console.log('▶️ Timers resumed after animations');
      setTimersPaused(false);
    });
    
    return () => {
      clearAllAnimationTimeouts();
      newSocket.disconnect();
    };
  }, [collectionId, realCards, userSelectedRoundTime, userSelectedGameTime]); // Removed gameId to prevent socket recreation

  // Initialize game with synchronized card dealing
  const initializeGame = (seed, playerRole) => {
    console.log('🎲 initializeGame called with seed:', seed, 'playerRole:', playerRole);
    console.log('🎲 realCards available:', !!realCards, 'length:', realCards?.length);
    
    if (!realCards) {
      console.error('❌ realCards is null/undefined in initializeGame');
      return;
    }
    
    if (realCards.length === 0) {
      console.error('❌ realCards is empty in initializeGame');
      return;
    }
    
    // Use seed for synchronized random card dealing - simple seeded random implementation
    let seedValue = seed || Date.now();
    const seededRandom = () => {
      seedValue = (seedValue * 9301 + 49297) % 233280;
      return seedValue / 233280;
    };
    
    console.log('🎲 Creating shuffled deck from', realCards.length, 'cards');
    // Create deterministic shuffle using seed
    const shuffledCards = [...realCards].sort(() => seededRandom() - 0.5);
    
    const playerDeck = [];
    const opponentDeck = [];
    
    shuffledCards.forEach((card, index) => {
      const formattedCard = {
        id: card.id,
        name: card.name,
        imageKey: card.imageKey,
        stats: card.stats?.map(stat => ({
          statTypeId: stat.statTypeId,
          statName: stat.statName,
          value: stat.value
        })) || []
      };
      
      if (index % 2 === 0) {
        playerDeck.push(formattedCard);
      } else {
        opponentDeck.push(formattedCard);
      }
    });
    
    console.log('🎲 Card allocation for playerRole:', playerRole);
    console.log('🎲 Player1 deck size:', playerDeck.length, 'Player2 deck size:', opponentDeck.length);
    
    // Assign cards based on player role: Player 1 gets even-indexed, Player 2 gets odd-indexed
    if (playerRole) {
      // Player 1: gets even-indexed cards (playerDeck)
      setPlayerDeck(playerDeck);
      setOpponentDeck(opponentDeck);
      setPlayerCard(playerDeck[0] || null);
      setOpponentCard(opponentDeck[0] || null);
      console.log('🎯 Player 1 assigned:', playerDeck.length, 'cards, opponent has:', opponentDeck.length);
      console.log('🎯 Player 1 first card:', playerDeck[0]?.name);
      console.log('🎯 Player 1 setting playerCard:', playerDeck[0], 'opponentCard:', opponentDeck[0]);
    } else {
      // Player 2: gets odd-indexed cards (opponentDeck from perspective of player1)
      setPlayerDeck(opponentDeck);
      setOpponentDeck(playerDeck);
      setPlayerCard(opponentDeck[0] || null);
      setOpponentCard(playerDeck[0] || null);
      console.log('🎯 Player 2 assigned:', opponentDeck.length, 'cards, opponent has:', playerDeck.length);
      console.log('🎯 Player 2 first card:', opponentDeck[0]?.name);
      console.log('🎯 Player 2 setting playerCard:', opponentDeck[0], 'opponentCard:', playerDeck[0]);
    }
    // Don't start the game or set turns here - wait for server signal
    // setGameStarted will be called when both players are ready
  };

  // Preload card images when real cards are loaded
  useEffect(() => {
    if (realCards && realCards.length > 0 && !imagesLoaded) {
      const preloadImages = async () => {
        try {
          console.log('🖼️ Starting card image preloading...');
          await preloadCardImagesWithProgress(realCards, (loaded, total) => {
            setLoadingProgress({ loaded, total });
          });
          setImagesLoaded(true);
          console.log('✅ Card images preloaded successfully');
        } catch (error) {
          console.warn('⚠️ Image preloading failed, proceeding anyway:', error);
          setImagesLoaded(true);
        }
      };
      
      preloadImages();
    }
  }, [realCards, imagesLoaded]);

  // Signal readiness to server only after assets are loaded
  useEffect(() => {
    if (imagesLoaded && gameId && socket && gamePhase === 'loading') {
      console.log('🎯 All assets loaded, sending player-ready-1v1 for game:', gameId);
      socket.emit('player-ready-1v1', { gameId });
    }
  }, [imagesLoaded, gameId, socket, gamePhase]);

  // Hybrid: Client countdown + Server sync after rounds
  useEffect(() => {
    // Don't start game timer until both players are loaded and first round actually starts
    if (!bothPlayersReady || gamePhase !== 'playing' || roundNumber === 0 || !imagesLoaded) return;
    
    // Don't start countdown until server's startAt time is reached
    if (!gameStartAt) {
      console.log('⏳ Waiting for server startAt time...');
      return;
    }
    
    let intervalId = null;
    let timeoutId = null;
    
    const startCountdown = () => {
      console.log('🎮 Starting game timer countdown from:', gameTimer);
      intervalId = setInterval(() => {
        setGameTimer(prev => {
          if (timersPaused || showOverlay || winnerCard) {
            return prev; // Don't count down when paused or showing overlays
          }
          
          if (prev <= 1) {
            // Signal server that game time expired
            if (socket) {
              console.log('⏰ Game time expired - signaling server');
              socket.emit('game-timeout', { gameId });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };
    
    const now = Date.now();
    if (now < gameStartAt) {
      const delay = gameStartAt - now;
      console.log(`⏳ Waiting ${delay}ms until countdown starts (startAt: ${gameStartAt})`);
      timeoutId = setTimeout(startCountdown, delay);
    } else {
      // Start immediately if startAt has already passed
      startCountdown();
    }
    
    // Cleanup function clears both timeout and interval
    return () => {
      if (timeoutId) {
        console.log('🧹 Clearing game timer delay timeout');
        clearTimeout(timeoutId);
      }
      if (intervalId) {
        console.log('🧹 Clearing game timer interval');
        clearInterval(intervalId);
      }
    };
  }, [bothPlayersReady, gamePhase, showOverlay, winnerCard, timersPaused, socket, gameId, roundNumber, imagesLoaded, gameTimeLimit, gameStartAt]);

  // Hybrid: Client countdown + Server sync after rounds
  useEffect(() => {
    if (!isPlayerTurn || !bothPlayersReady || gamePhase !== 'playing' || !imagesLoaded || roundNumber === 0) return;
    
    // Don't start countdown until server's startAt time is reached
    if (!gameStartAt) {
      console.log('⏳ Player timer waiting for server startAt time...');
      return;
    }
    
    let intervalId = null;
    let timeoutId = null;
    
    const startCountdown = () => {
      console.log('⏱️ Starting player turn timer countdown from:', playerTimer);
      intervalId = setInterval(() => {
        setPlayerTimer(prev => {
          if (timersPaused || showOverlay || winnerCard || isRevealed) {
            return prev; // Don't count down when paused or showing overlays
          }
          
          if (prev <= 1) {
            // Signal server that player turn expired
            if (socket) {
              console.log('⏰ Player turn expired - signaling server');
              socket.emit('turn-timeout', { gameId });
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    };
    
    const now = Date.now();
    if (now < gameStartAt) {
      const delay = gameStartAt - now;
      console.log(`⏳ Player timer waiting ${delay}ms until countdown starts`);
      timeoutId = setTimeout(startCountdown, delay);
    } else {
      // Start immediately if startAt has already passed
      startCountdown();
    }
    
    // Cleanup function clears both timeout and interval
    return () => {
      if (timeoutId) {
        console.log('🧹 Clearing player timer delay timeout');
        clearTimeout(timeoutId);
      }
      if (intervalId) {
        console.log('🧹 Clearing player turn timer interval');
        clearInterval(intervalId);
      }
    };
  }, [isPlayerTurn, bothPlayersReady, gamePhase, showOverlay, winnerCard, isRevealed, timersPaused, socket, gameId, imagesLoaded, roundNumber, roundTime, gameStartAt]);

  const handleStatSelection = (statTypeId) => {
    // In special tie mode, only the active player can select stats
    if (isSpecialTieMode && !isActivePlayerInSpecialTie) {
      console.log('🚫 Only the active player can select stats in special tie mode');
      return;
    }
    
    // Allow stat selection in special tie mode regardless of normal game state
    if (!isSpecialTieMode && (isRevealed || !isPlayerTurn || !bothPlayersReady)) return;
    
    if (!imagesLoaded) {
      return;
    }
    
    setSelectedStat(statTypeId);
    setIsRevealed(true);
    setPlayerTimer(userSelectedRoundTime); // Reset for next round
    setIsPlayerTurn(false); // Disable further selections

    // Client pauses timers immediately upon stat selection
    console.log('⏸️ Client pausing timers for animation');
    setTimersPaused(true);

    // Send stat selection to server
    if (socket) {
      socket.emit('select-stat', { 
        statTypeId,
        gameId,
        roundNumber 
      });
    }
  };

  // Removed: Client no longer does stat comparisons - server handles everything
  
  // Removed: Client no longer calculates stat comparisons - server does everything

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
      
      // Client resumes timers and signals server that animation is complete
      console.log('▶️ Client resuming timers after animation');
      setTimersPaused(false);
      
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
  const handlePlayerWin = () => handlePlayerWinWithSocket(socket, gameId);

  const handleOpponentWinWithSocket = (socketRef, gameIdRef, roundKey) => {
    console.log('😢 handleOpponentWinWithSocket called with refs - Socket:', !!socketRef, 'GameId:', gameIdRef, 'Round:', roundKey);
    setShowOverlay('lose');
    setTimeout(() => {
      setShowOverlay(null);
      
      // Client resumes timers and signals server that animation is complete
      console.log('▶️ Client resuming timers after animation');
      setTimersPaused(false);
      
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
  const handleOpponentWin = () => handleOpponentWinWithSocket(socket, gameId);

  const handleTieWithSocket = (socketRef, gameIdRef, roundKey) => {
    console.log('🤝 handleTieWithSocket called with refs - Socket:', !!socketRef, 'GameId:', gameIdRef, 'Round:', roundKey);
    setShowOverlay('tie');
    setTimeout(() => {
      setShowOverlay(null);
      
      // Client resumes timers and signals server that animation is complete
      console.log('▶️ Client resuming timers after animation');
      setTimersPaused(false);
      
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
  const handleTie = () => handleTieWithSocket(socket, gameId);

  // Removed: nextRound function - server handles ALL round progression

  const syncGameState = (data) => {
    // Sync critical game state if out of sync
    if (data.roundNumber !== roundNumber) {
      setRoundNumber(data.roundNumber);
    }
    if (data.gameTimer !== gameTimer) {
      setGameTimer(data.gameTimer);
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
      queryClient.invalidateQueries({ queryKey: ['/api/user/leaderboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/game-history'] });
      
      // Show penalty modal instead of immediately redirecting
      setGameCompletionData({
        gameResult: 'penalty',
        xpData: data.playerStats,
        message: `Game abandoned. -${Math.abs(data.playerStats?.xpChange || 30)} XP penalty applied.`
      });
      setShowCompletionModal(true);
      
      // Clean up socket connection
      if (socket) {
        socket.emit('leave-game', { gameId });
        socket.disconnect();
      }
    },
    onError: (error) => {
      console.error('Failed to apply abandonment penalty:', error);
      // Still allow leaving even if penalty fails
      if (socket) {
        socket.emit('leave-game', { gameId });
        socket.disconnect();
      }
      setLocation('/');
    }
  });

  const handleLeaveGame = () => {
    // Check if game is actively in progress
    const isActiveGame = gamePhase === 'playing' && user?.isAuthenticated;
    
    // Allow penalty-free leaving if opponent is disconnected or has left
    const opponentUnavailable = opponentDisconnected || opponentLeft;
    
    if (isActiveGame && !opponentUnavailable) {
      setShowAbandonConfirm(true);
    } else {
      // Safe to leave without penalty (inactive game or opponent unavailable)
      if (socket) {
        socket.emit('leave-game', { gameId });
        socket.disconnect();
      }
      setLocation('/');
    }
  };

  // Confirm abandonment with penalty
  const handleConfirmAbandon = () => {
    setShowAbandonConfirm(false);
    if (user?.isAuthenticated) {
      abandonGame({ gameMode: '1v1', gameId });
    } else {
      // Guests don't get penalties, just leave
      if (socket) {
        socket.emit('leave-game', { gameId });
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

  // Loading screen - show when loading data or waiting for opponent
  if (!match || !collection || !statTypes || !realCards || !imagesLoaded || waitingForOpponent) {
    const loadingSteps = [
      { label: "Finding collection", completed: !!collection, loading: isLoadingCollection },
      { label: "Loading game rules", completed: !!statTypes, loading: isLoadingStatTypes },
      { label: "Preparing cards", completed: !!realCards, loading: isLoadingCards },
      { label: "Finding opponent", completed: !waitingForOpponent, loading: waitingForOpponent }
    ];
    
    const completedSteps = loadingSteps.filter(step => step.completed).length;
    const totalSteps = loadingSteps.length;
    const progressPercent = (completedSteps / totalSteps) * 100;
    
    // If waiting for opponent and everything else is loaded, show enhanced waiting screen
    if (waitingForOpponent && collection && statTypes && realCards && imagesLoaded) {
      const availablePlayers = fetchedWaitingPlayers || [];
      
      return (
        <div className="min-h-screen bg-background p-4">
          <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-24 h-24 mx-auto mb-4 bg-primary rounded-full flex items-center justify-center">
                <Users className="w-12 h-12 text-foreground" />
              </div>
              <h2 className="text-3xl font-bold mb-2">
                Finding Players
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Choose a player to join or wait for automatic matching in <strong>{collection?.name}</strong> collection
              </p>
            </div>

            {/* Current Game Settings */}
            <div className="bg-card border rounded-lg p-4 mb-6 max-w-md mx-auto">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <Crown className="w-4 h-4" />
                Your Game Settings
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Collection:</span>
                  <span className="font-medium">{collection?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Round Time:</span>
                  <span className="font-medium">{userSelectedRoundTime}s</span>
                </div>
                <div className="flex justify-between">
                  <span>Game Time:</span>
                  <span className="font-medium">{Math.floor(userSelectedGameTime / 60)}:{String(userSelectedGameTime % 60).padStart(2, '0')}</span>
                </div>
              </div>
            </div>

            {/* Waiting Players List */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-4 text-center">
                Available Players ({availablePlayers.length})
              </h3>
              
              {availablePlayers.length === 0 ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
                    <Timer className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <p className="text-muted-foreground mb-2">No players currently waiting</p>
                  <p className="text-sm text-muted-foreground">You'll be automatically matched when another player joins</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {availablePlayers.map((player) => (
                    <Card key={player.playerId} className="hover:shadow-elevated transition-shadow">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* Collection Image Header */}
                          <div className="relative">
                            <div className="w-full h-20 rounded-lg overflow-hidden bg-muted">
                              <img
                                src={`/api/collections/${player.collectionId}/cover-image`}
                                alt={`${player.collectionName} collection`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                                data-testid={`img-collection-${player.collectionId}`}
                              />
                              <div className="w-full h-full bg-muted flex items-center justify-center" style={{display: 'none'}}>
                                <span className="text-muted-foreground text-xs font-medium">{player.collectionName}</span>
                              </div>
                            </div>
                            <Badge variant={player.collectionId === collectionId ? 'default' : 'secondary'} className="absolute top-2 right-2 text-xs shadow-sm" >
                              {player.collectionId === collectionId ? 'Same' : 'Different'}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                                <User className="w-4 h-4 text-foreground" />
                              </div>
                              <div>
                                <div className="font-semibold text-sm">{player.playerName}</div>
                                <div className="text-xs text-muted-foreground">
                                  Waiting {Math.floor(player.waitTimeSeconds / 60)}:{String(player.waitTimeSeconds % 60).padStart(2, '0')}
                                </div>
                              </div>
                            </div>
                          </div>
                          
                          <div className="text-xs space-y-1">
                            <div className="flex justify-between">
                              <span>Collection:</span>
                              <span className="font-medium">{player.collectionName}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Round Time:</span>
                              <span className="font-medium">{player.roundTimeSeconds}s</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Game Time:</span>
                              <span className="font-medium">{Math.floor(player.gameTimeSeconds / 60)}:{String(player.gameTimeSeconds % 60).padStart(2, '0')}</span>
                            </div>
                          </div>
                          
                          <Button onClick={() => joinSpecificPlayer(player)}
                            size="sm"
                            className="w-full"
                            data-testid={`button-join-player-${player.playerId}`}
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            Join Game
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Auto-matchmaking toggle */}
            <div className="text-center">
              <div className="inline-flex items-center gap-3 bg-card border rounded-full px-4 py-2">
                <div className={`w-2 h-2 rounded-full ${autoMatchmaking ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`}></div>
                <span className="text-sm font-medium text-foreground">Auto-matching</span>
                <Switch 
                  checked={autoMatchmaking}
                  onCheckedChange={setAutoMatchmaking}
                  data-testid="switch-auto-matchmaking-finding"
                />
                <span className="text-xs text-muted-foreground">
                  {autoMatchmaking ? 'On' : 'Off'}
                </span>
              </div>
            </div>

            {/* Cancel button */}
            <div className="text-center mt-8">
              <Button variant="outline" onClick={() => setLocation('/')}
                data-testid="button-cancel-matchmaking"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Cancel
              </Button>
            </div>
          </div>
        </div>
      );
    }
    
    // Standard loading screen for initial loading
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md">
          <div className="mb-6">
            <div className="w-24 h-24 mx-auto mb-4 bg-primary rounded-full flex items-center justify-center">
              <Users className="w-12 h-12 text-foreground" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Loading Game</h2>
            <p className="text-muted-foreground">
              Preparing your multiplayer experience...
            </p>
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
            data-testid="button-cancel-matchmaking"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  // Opponent left screen
  if (opponentLeft) {
    const isConnectionLost = disconnectReason === 'connection-lost';
    const isManualLeave = disconnectReason === 'manual';
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-lg px-4">
          <div className="mb-8">
            <div className={`w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center ${
              isConnectionLost 
                ? 'bg-[var(--timer-warning)]' 
                : 'bg-success'
            }`}>
              {isConnectionLost ? (
                <WifiOff className="w-12 h-12 text-foreground" />
              ) : (
                <Trophy className="w-12 h-12 text-foreground" />
              )}
            </div>
            
            {isConnectionLost ? (
              <>
                <h2 className="text-2xl font-bold mb-3 text-[var(--timer-warning)]">Connection Lost</h2>
                <p className="text-muted-foreground mb-4">
                  Your opponent lost their internet connection. The game has ended automatically.
                </p>
                <div className="bg-card border border-[var(--timer-warning)]/30 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 text-success mb-2">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-medium">No Penalties Applied</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Since this was a connection issue, neither player receives any penalties. You can leave safely.
                  </p>
                </div>
              </>
            ) : isManualLeave ? (
              <>
                <h2 className="text-2xl font-bold mb-3 text-success">You Win!</h2>
                <p className="text-muted-foreground mb-4">
                  Your opponent left the game. You win by default!
                </p>
                <div className="bg-card border border-[var(--success)]/30 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 text-success mb-2">
                    <Trophy className="w-4 h-4" />
                    <span className="text-sm font-medium">Victory Earned</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This counts as a legitimate win. XP and ranking points have been awarded.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold mb-3 text-[var(--timer-warning)]">Game Interrupted</h2>
                <p className="text-muted-foreground mb-4">
                  The multiplayer session was interrupted.
                </p>
                <div className="bg-card border border-[var(--timer-warning)]/30 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 text-success mb-2">
                    <Shield className="w-4 h-4" />
                    <span className="text-sm font-medium">No Penalties Applied</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    You can leave safely without any penalties to your ranking or XP.
                  </p>
                </div>
              </>
            )}
          </div>
          
          <div className="space-y-3">
            <Button onClick={() => setLocation('/game-lobby')}
              className="w-full"
              data-testid="button-return-lobby"
            >
              Return to Game Lobby
            </Button>
            
            <Button variant="outline" onClick={() => setLocation('/')}
              className="w-full"
              data-testid="button-return-home"
            >
              Go to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Show loading screen when match is found and players are joining
  if (gamePhase === 'loading') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md mx-auto">
          <div className="relative">
            <div className="w-24 h-24 mx-auto rounded-full bg-primary hover:bg-primary/90 flex items-center justify-center animate-pulse">
              <Users className="w-12 h-12 text-foreground" />
            </div>
          </div>
          
          <h1 className="text-2xl font-bold text-foreground">
            Loading Game
          </h1>
          
          <div className="space-y-3 text-muted-foreground">
            <p className="text-lg">
              Matched with <span className="font-semibold text-primary">{opponentName}</span>
            </p>
            <p className="text-sm">
              Waiting for both players to load...
            </p>
          </div>
          
          <div className="flex justify-center">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
              <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show waiting room when players are matched but game hasn't started  
  if (gamePhase === 'waiting' && !bothPlayersReady) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center space-y-6 max-w-md mx-auto">
          <div className="relative">
            <div className="w-24 h-24 mx-auto rounded-full bg-accent flex items-center justify-center animate-pulse">
              <Users className="w-12 h-12 text-foreground" />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-success rounded-full flex items-center justify-center animate-bounce">
              <Wifi className="w-4 h-4 text-foreground" />
            </div>
          </div>
          
          <div>
            <h2 className="text-3xl font-bold text-foreground mb-2">
              Preparing Battle
            </h2>
            <p className="text-muted-foreground">
              Matched with {opponentName}! Game starting soon...
            </p>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-center justify-center space-x-4 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-success rounded-full"></div>
                <span>You</span>
              </div>
              <div className="text-muted-foreground">vs</div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-success rounded-full"></div>
                <span>{opponentName}</span>
              </div>
            </div>
            
            <div className="text-xs text-muted-foreground">
              Game Time: {Math.floor(userSelectedGameTime / 60)}:{String(userSelectedGameTime % 60).padStart(2, '0')} | 
              Round Time: {roundTime}s
            </div>
          </div>
          
          <Button variant="outline" size="lg" onClick={() => setLocation('/')}
            className="mt-6 p-4 sm:p-3 min-h-[56px] sm:min-h-[48px] min-w-[180px] sm:min-w-[160px] hover:bg-accent/10 touch-manipulation active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-5 h-5 sm:w-4 sm:h-4 mr-2 pointer-events-none" />
            Back to Lobby
          </Button>
        </div>
      </div>
    );
  }

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
        gameTimeRemaining={gameTimer}
        gameTimeTotal={gameTimeLimit}
        roundTimeRemaining={playerTimer}
        roundTimeTotal={roundTime}
        showRoundTimer={isPlayerTurn && !isRevealed}
        players={[
          {
            name: opponentName || "Opponent",
            cardCount: opponentCards,
            isCurrentPlayer: !isPlayerTurn,
            isYou: false,
            gamerName: opponentName
          },
          {
            name: user?.gamerName || "You",
            cardCount: playerCards,
            isCurrentPlayer: isPlayerTurn,
            isYou: true,
            userId: user?.id,
            gamerName: user?.gamerName,
            currentXP: leaderboardStats?.currentXP,
            currentLevel: leaderboardStats?.currentLevel,
            country: user?.country,
            avatarImageUrl: user?.avatarImageUrl
          }
        ]}
        currentPlayerName={isPlayerTurn ? "You" : (opponentName || "Opponent")}
        isMyTurn={isPlayerTurn}
        roundNumber={roundNumber}
        isConnected={isConnected}
        opponentDisconnected={opponentDisconnected}
        gameMode="1v1"
        collectionName={gameCollection?.name || collection?.name || "1v1 Battle"}
      />
      
      {/* Floating Leave Button */}
      <FloatingLeaveButton
        onLeave={handleLeaveGame}
        onForfeit={handleLeaveGame}
        isGameActive={gamePhase === 'playing'}
        gameMode="1v1"
      />

      <div className="container mx-auto px-2 py-3">

        {/* Opponent Disconnect Alert - Show during gameplay */}
        {showDisconnectAlert && gamePhase === 'playing' && !opponentLeft && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-sm mx-auto">
            <Card className="border-[var(--timer-warning)]/30 bg-card shadow-elevated">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <WifiOff className="w-5 h-5 text-[var(--timer-warning)] flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[var(--timer-warning)]">
                      {disconnectReason === 'connection-lost' ? 'Connection Lost' : 'Opponent Left'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      You can leave without penalty
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setShowDisconnectAlert(false)}
                    className="w-6 h-6 p-0"
                  >
                    ×
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}


        {/* Opponent Thinking Indicator */}
        {bothPlayersReady && !isPlayerTurn && !isRevealed && (
          <div className="text-center mb-2">
            <Card className="max-w-sm mx-auto border-secondary/50">
              <CardContent className="p-2 text-center">
                <div className="flex items-center justify-center gap-2 text-secondary">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-secondary"></div>
                  <span className="font-medium text-sm">{opponentName} is choosing...</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* First Round Instructions */}
        {bothPlayersReady && isPlayerTurn && !isRevealed && (
          <div className="text-center mb-3">
            <Card className="max-w-sm mx-auto border-accent/50">
              <CardContent className="p-2 text-center">
                <div className="flex items-center justify-center gap-2 text-accent">
                  <Zap className="w-3 h-3" />
                  <span className="font-medium text-sm">Select a stat to begin the battle!</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Game Area - Compact Layout matching SinglePlayer */}
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
                card={playerCard}
                isOwn={true}
                isRevealed={isRevealed}
                onStatSelect={(isSpecialTieMode && isActivePlayerInSpecialTie) || (!isSpecialTieMode && isPlayerTurn && !isRevealed && !isAnimating) ? handleStatSelection : null}
                selectedStat={selectedStat}
                isWinner={winnerCard === 'player'}
                isFlipping={false}
                isActivePlayer={isPlayerTurn && bothPlayersReady && !isRevealed}
                tiedStats={tiedStats}
              />
            </div>

            {/* Opponent Card - Hidden during gameplay, shown only in overlay */}
          </div>
        </div>

        {/* Tied Cards Pool */}
        {tiedCards.length > 0 && (
          <div className="text-center mb-3">
            <Badge variant="outline" className="text-xs">
              🎯 {tiedCards.length} cards in prize pool
            </Badge>
          </div>
        )}

        {/* Connection Status */}
        {!isConnected && (
          <div className="text-center mb-3">
            <Card className="max-w-sm mx-auto border-destructive/50">
              <CardContent className="p-2 text-center">
                <div className="flex items-center justify-center gap-2 text-destructive">
                  <Wifi className="w-3 h-3" />
                  <span className="font-medium text-sm">Connection lost. Reconnecting...</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Round Result Overlay - Stacked Cards Reveal */}
      <RoundResultOverlay
        show={showOverlay !== null}
        winnerCard={
          winnerCard === 'player' ? playerCard :
          winnerCard === 'opponent' ? opponentCard :
          playerCard // For tie, show player card as "winner"
        }
        loserCard={
          winnerCard === 'player' ? opponentCard :
          winnerCard === 'opponent' ? playerCard :
          opponentCard // For tie, show opponent card as "loser"
        }
        selectedStatId={revealData?.statTypeId || null}
        selectedStatName={
          revealData?.statTypeId
            ? playerCard?.stats?.find(s => s.statTypeId === revealData.statTypeId)?.statName || null
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
        onComplete={() => {
          setShowOverlay(null);
          setRevealData(null);
        }}
      />

      {/* Unified Game Completion Modal */}
      {showCompletionModal && gameCompletionData && (() => {
        console.log('🧪 Modal gating checks:', {
          showCompletionModal,
          gameResult: gameCompletionData?.gameResult,
          userIsAuthenticated: !!user?.isAuthenticated,
          hasXpData: !!xpData,
          hasXpResult: !!xpData?.xpResult,
          hasPlayerStats: !!xpData?.playerStats
        });
        return (
          <PremiumGameResultModal
            isOpen={showCompletionModal}
            gameResult={gameCompletionData.gameResult}
            xpData={xpData}
            onBackToLobby={handleCloseCompletionModal}
            userIsAuthenticated={user?.isAuthenticated || false}
            customMessage={gameCompletionData.message}
            reason={gameCompletionData.reason}
          />
        );
      })()}


      {/* Post-game Registration Prompt for Guests */}
      {showRegistrationPrompt && (
        <GuestRegistrationPrompt
          gameResult={gameResult}
          onSkip={() => {
            setShowRegistrationPrompt(false);
            setTimeout(() => setLocation('/'), 500);
          }}
          onClose={() => {
            setShowRegistrationPrompt(false);
            setTimeout(() => setLocation('/profile'), 500);
          }}
        />
      )}

      {/* Game Abandonment Confirmation Dialog */}
      <GameAbandonmentConfirmDialog
        isOpen={showAbandonConfirm}
        onOpenChange={setShowAbandonConfirm}
        onConfirm={handleConfirmAbandon}
        gameMode="1v1"
      />
      </div>
    </div>
  );
}
