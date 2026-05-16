import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Clock, Users, Target, Calendar, Award, Zap, Layers } from "lucide-react";
import { tzFormatDistanceToNow } from "@/utils/timezoneRuntime";
import { useQuery } from "@tanstack/react-query";

const GameHistoryCard = ({ game }) => {
  // Get current user to identify which player is the current user
  const { data: user } = useQuery({
    queryKey: ['/api/auth/user'],
  });
  const formatDuration = (seconds) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const getResultIcon = (result) => {
    switch (result) {
      case 'win':
        return <Trophy className="w-4 h-4 text-success" />;
      case 'loss':
        return <Target className="w-4 h-4 text-destructive" />;
      case 'tie':
        return <Award className="w-4 h-4 text-glow-gold" />;
      default:
        return <Target className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getResultColor = (result) => {
    switch (result) {
      case 'win':
        return 'from-[var(--success)]/20 border-[var(--success)]/30 text-success';
      case 'loss':
        return 'from-[var(--destructive)]/20 border-[var(--destructive)]/30 text-destructive';
      case 'tie':
        return 'from-[var(--game-gold)]/20 border-[var(--game-gold)]/30 text-glow-gold';
      default:
        return 'from-muted/20 border-border text-muted-foreground';
    }
  };

  const getOpponentText = () => {
    if (game.gameMode === 'single') {
      return 'vs Bot';
    }
    if (game.opponents && game.opponents.length > 0) {
      return `vs ${game.opponents.map(opp => opp.name).join(', ')}`;
    }
    return `${game.gameMode} mode`;
  };

  return (
    <Card 
      className={`border-2 shadow-elevated transition-all duration-200 hover:shadow-elevated  ${getResultColor(game.result)} backdrop-blur-sm hover:scale-[1.02]`}
      data-testid={`card-game-history-${game.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10  ${
              game.result === 'win' 
                ? 'from-[var(--success)]' 
                : game.result === 'loss' 
                ? 'from-[var(--destructive)]' 
                : 'from-[var(--game-gold)]'
            } rounded-full flex items-center justify-center shadow-md`}>
              {getResultIcon(game.result)}
            </div>
            <div>
              <h4 className="font-bold text-sm capitalize" data-testid={`text-game-result-${game.id}`}>
                {game.result === 'win' ? 'Victory' : game.result === 'loss' ? 'Defeat' : 'Draw'}
              </h4>
              <p className="text-xs text-muted-foreground" data-testid={`text-opponent-${game.id}`}>
                {getOpponentText()}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground flex items-center gap-1" data-testid={`text-game-time-${game.id}`}>
              <Calendar className="w-3 h-3" />
              {tzFormatDistanceToNow(game.gameEndedAt, { addSuffix: true })}
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-accent rounded flex items-center justify-center">
                <img 
                  src={`/api/collections/${game.collectionId}/cover-image`} 
                  alt={game.collectionName}
                  className="w-4 h-4 object-cover rounded"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
                <div className="w-4 h-4 bg-accent/20 rounded flex items-center justify-center hidden">
                  <Target className="w-2 h-2" />
                </div>
              </div>
              <span className="font-medium" data-testid={`text-collection-${game.id}`}>
                {game.collectionName}
              </span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Clock className="w-3 h-3" />
              <span className="text-xs" data-testid={`text-duration-${game.id}`}>
                {formatDuration(game.gameDuration)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                <span data-testid={`text-game-mode-${game.id}`}>
                  {game.gameMode === 'single' ? 'Single Player' : 
                   game.gameMode === '1v1' ? '1v1 Multiplayer' : 
                   `${game.gameMode} Multiplayer`}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Target className="w-3 h-3" />
                <span data-testid={`text-rounds-${game.id}`}>
                  {game.totalRounds} rounds
                </span>
              </div>
            </div>
            {game.xpChange !== undefined && (
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                game.xpChange > 0 
                  ? 'bg-success/15 text-success' 
                  : game.xpChange < 0
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-muted text-muted-foreground'
              }`}>
                <Zap className="w-3 h-3" />
                <span data-testid={`text-xp-change-${game.id}`}>
                  {game.xpChange > 0 ? '+' : ''}{game.xpChange} XP
                </span>
              </div>
            )}
          </div>

          {/* Final Card Counts */}
          {game.finalCardCounts && Object.keys(game.finalCardCounts).length > 0 && (
            <div className="pt-2 mt-2 border-t border-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <Layers className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">Final Cards won in the Game</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                {Object.entries(game.finalCardCounts).map(([playerId, cardCount]) => {
                  const isCurrentUser = user?.id === playerId;
                  const playerName = playerId === user?.id 
                    ? 'You' 
                    : playerId === 'npc_opponent'
                    ? 'Bot'
                    : game.opponents?.find(opp => opp.id === playerId)?.name || 'Player';
                  
                  return (
                    <div 
                      key={playerId} 
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/20 font-medium text-foreground"
                      data-testid={`text-final-cards-${playerId}`}
                    >
                      <span className="truncate max-w-16">{playerName}:</span>
                      <span className="font-mono">{cardCount}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default GameHistoryCard;
