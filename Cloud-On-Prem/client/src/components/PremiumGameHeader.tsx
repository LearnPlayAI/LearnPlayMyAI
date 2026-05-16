import { motion } from 'framer-motion';
import { PremiumCircularTimer } from './PremiumCircularTimer';
import { Badge } from '@/components/ui/badge';
import { Users, User, Bot, Crown, Wifi, WifiOff, Star, Zap, Shield, Award } from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { getLevelFromXP } from '@shared/levelUtils';

interface Player {
  name: string;
  cardCount: number;
  isCurrentPlayer?: boolean;
  isYou?: boolean;
  isHost?: boolean;
  country?: string;
  userId?: string;
  currentXP?: number;
  currentLevel?: number;
  gamerName?: string;
  avatarImageUrl?: string;
}

interface PremiumGameHeaderProps {
  // Timer props
  gameTimeRemaining: number;
  gameTimeTotal: number;
  roundTimeRemaining?: number;
  roundTimeTotal?: number;
  showRoundTimer?: boolean;
  
  // Player props
  players: Player[];
  currentPlayerName?: string;
  isMyTurn?: boolean;
  roundNumber?: number;
  
  // Connection props
  isConnected?: boolean;
  opponentDisconnected?: boolean;
  
  // Game props
  gameMode?: 'single' | '1v1' | '4player';
  collectionName?: string;
  
  className?: string;
}

// Helper function to get level icon component
const getLevelIcon = (level: number) => {
  if (level >= 75) return Star;
  if (level >= 50) return Award;
  if (level >= 25) return Shield;
  if (level >= 10) return Zap;
  return Star;
};

// Helper function to get level color - uses CSS variables for theming
const getLevelColor = (level: number) => {
  if (level >= 75) return 'text-primary';
  if (level >= 50) return 'text-accent';
  if (level >= 25) return 'text-primary/80';
  if (level >= 10) return 'text-accent/80';
  return 'text-primary/60';
};

export const PremiumGameHeader: React.FC<PremiumGameHeaderProps> = ({
  gameTimeRemaining,
  gameTimeTotal,
  roundTimeRemaining = 0,
  roundTimeTotal = 30,
  showRoundTimer = false,
  players = [],
  currentPlayerName,
  isMyTurn = false,
  roundNumber = 1,
  isConnected = true,
  opponentDisconnected = false,
  gameMode = 'single',
  collectionName = '',
  className = ''
}) => {
  const isMultiplayer = gameMode !== 'single';
  
  return (
    <motion.div 
      className={`
        bg-background/95 
        backdrop-blur-md border-b border-accent/20 
        ${className}
      `}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          
          {/* Left Section: Timers */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Game Timer */}
            <div className="flex flex-col items-center">
              <PremiumCircularTimer
                timeRemaining={gameTimeRemaining}
                totalTime={gameTimeTotal}
                size="md"
                label="GAME"
                className="mb-1"
              />
            </div>
            
            {/* Round Timer (if active) */}
            {showRoundTimer && roundTimeRemaining > 0 && (
              <motion.div 
                className="flex flex-col items-center hidden sm:flex"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                <PremiumCircularTimer
                  timeRemaining={roundTimeRemaining}
                  totalTime={roundTimeTotal}
                  size="sm"
                  label="TURN"
                  isActive={isMyTurn}
                  className="mb-1"
                />
              </motion.div>
            )}
            
            {/* Mobile Round Timer - Smaller for space efficiency */}
            {showRoundTimer && roundTimeRemaining > 0 && (
              <motion.div 
                className="flex flex-col items-center sm:hidden"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
              >
                <PremiumCircularTimer
                  timeRemaining={roundTimeRemaining}
                  totalTime={roundTimeTotal}
                  size="sm"
                  label="TURN"
                  isActive={isMyTurn}
                  className="mb-1"
                />
              </motion.div>
            )}
          </div>

          {/* Center Section: Game Info */}
          <div className="flex-1 text-center space-y-1 min-w-0">
            {/* Collection Name */}
            {collectionName && (
              <div className="text-xs sm:text-sm font-bold text-primary truncate">
                {collectionName}
              </div>
            )}
            
            {/* Turn Indicator */}
            <motion.div 
              className="flex items-center justify-center gap-1 sm:gap-2"
              animate={isMyTurn ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 2, repeat: Infinity }}
            >
              {isMyTurn ? (
                <Badge variant="default" className="animate-pulse text-xs">
                  <Users className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                  <span className="hidden sm:inline">Your Turn</span>
                  <span className="sm:hidden">You</span>
                </Badge>
              ) : currentPlayerName ? (
                <Badge variant="secondary" className="text-xs">
                  <User className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                  <span className="hidden sm:inline">{currentPlayerName}'s Turn</span>
                  <span className="sm:hidden truncate max-w-[60px]">{currentPlayerName}</span>
                </Badge>
              ) : gameMode === 'single' ? (
                <Badge variant="outline" className="text-xs">
                  <Bot className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                  Round {roundNumber}
                </Badge>
              ) : null}
            </motion.div>
            
            {/* Connection Status - Hidden on very small screens */}
            {isMultiplayer && (
              <div className="hidden sm:flex items-center justify-center gap-2">
                {!isConnected ? (
                  <Badge variant="destructive" className="text-xs">
                    <WifiOff className="w-3 h-3 mr-1" />
                    Disconnected
                  </Badge>
                ) : opponentDisconnected ? (
                  <Badge variant="outline" className="text-xs">
                    <WifiOff className="w-3 h-3 mr-1" />
                    Opponent Offline
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <Wifi className="w-3 h-3 mr-1" />
                    Connected
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Right Section: Player Info */}
          <div className="flex items-center gap-1 sm:gap-2">
            {players.map((player, index) => {
              const playerLevel = player.currentLevel || (player.currentXP ? getLevelFromXP(player.currentXP) : 1);
              const LevelIcon = getLevelIcon(playerLevel);
              const levelColor = getLevelColor(playerLevel);
              
              return (
                <motion.div
                  key={index}
                  className={`
                    flex items-center gap-1 sm:gap-2 px-1.5 sm:px-2 py-1 rounded-lg
                    transition-all duration-200
                    ${player.isCurrentPlayer 
                      ? 'bg-accent/20 border border-accent/50 shadow-md' 
                      : 'bg-muted/30'
                    }
                    ${player.isYou ? 'ring-1 ring-primary/30' : ''}
                  `}
                  animate={player.isCurrentPlayer ? { 
                    boxShadow: [
                      '0 0 0 0 rgba(var(--action-accent), 0.3)',
                      '0 0 0 4px rgba(var(--action-accent), 0.1)',
                      '0 0 0 0 rgba(var(--action-accent), 0.3)'
                    ]
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  {/* Player Avatar */}
                  {player.userId && !player.isYou && gameMode !== 'single' ? (
                    <PlayerAvatar
                      user={{
                        id: player.userId,
                        gamerName: player.gamerName || player.name,
                        country: player.country,
                        avatarImageUrl: player.avatarImageUrl
                      }}
                      size="sm"
                      showCountry={false}
                      showGlow={!!player.isCurrentPlayer}
                      showCosmetics={false}
                      className="w-6 h-6 sm:w-8 sm:h-8"
                    />
                  ) : player.isYou && player.userId ? (
                    <PlayerAvatar
                      user={{
                        id: player.userId,
                        gamerName: player.gamerName || player.name,
                        country: player.country,
                        avatarImageUrl: player.avatarImageUrl
                      }}
                      size="sm"
                      showCountry={false}
                      showGlow={!!player.isCurrentPlayer}
                      showCosmetics={false}
                      className="w-6 h-6 sm:w-8 sm:h-8"
                    />
                  ) : gameMode === 'single' && !player.isYou ? (
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-surface-raised flex items-center justify-center">
                      <Bot className="w-3 h-3 sm:w-4 sm:h-4 text-primary-foreground" />
                    </div>
                  ) : null}
                  
                  {/* Player Info */}
                  <div className="flex flex-col items-start min-w-0">
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      <span className="text-[10px] sm:text-xs font-semibold truncate max-w-[50px] sm:max-w-[70px]">
                        {player.isYou ? 'You' : player.gamerName || player.name}
                      </span>
                      {player.isHost && <Crown className="w-2 h-2 sm:w-3 sm:h-3 text-glow-gold flex-shrink-0" />}
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {/* Level Badge */}
                      <Badge variant="outline" className={`text-[8px] sm:text-[10px] px-1 py-0 h-auto ${levelColor} border-current`} >
                        <LevelIcon className="w-2 h-2 mr-0.5" />
                        {playerLevel}
                      </Badge>
                      
                      {/* Card Count */}
                      <Badge variant={player.isYou ? "default" : "secondary"} className="sm:text-xs px-1 sm:px-1.5 py-0 h-auto font-bold" >
                        {player.cardCount}
                      </Badge>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
