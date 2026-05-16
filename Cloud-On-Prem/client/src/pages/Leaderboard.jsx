import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, Medal, Award, Users, Target, TrendingUp, Star, Home } from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Progress } from '@/components/ui/progress';

const LeaderboardEntry = ({ player, rank }) => {
  const getRankIcon = (rank) => {
    switch(rank) {
      case 1: return <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-glow-gold" />;
      case 2: return <Medal className="w-5 h-5 sm:w-6 sm:h-6 text-muted-foreground" />;
      case 3: return <Award className="w-5 h-5 sm:w-6 sm:h-6 text-glow-gold" />;
      default: return <div className="w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center text-muted-foreground font-bold text-[length:var(--text-sm)]">#{rank}</div>;
    }
  };

  const getRankColor = (rank) => {
    switch(rank) {
      case 1: return 'border-[var(--game-gold)] bg-[var(--game-gold)]/10';
      case 2: return 'border-muted-foreground bg-muted';
      case 3: return 'border-[var(--game-gold)] bg-[var(--game-gold)]/10';
      default: return 'border-border';
    }
  };

  return (
    <Card className={`${getRankColor(rank)} transition-all duration-300 hover:shadow-elevated hover:scale-[1.02] sm:hover:scale-105`}>
      <CardContent className="p-[var(--card-padding)]">
        <div className="flex items-start gap-[var(--space-sm)] sm:gap-[var(--space-md)]">
          <div className="flex-shrink-0 mt-1">
            {getRankIcon(rank)}
          </div>
          
          <div className="flex-shrink-0">
            <PlayerAvatar
              user={player}
              size="md"
              showCountry={true}
              showGlow={rank <= 3}
              className={rank === 1 ? 'ring-2 ring-[var(--game-gold)]' : rank === 2 ? 'ring-2 ring-muted-foreground' : rank === 3 ? 'ring-2 ring-[var(--game-gold)]' : ''}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[length:var(--text-base)] sm:text-[length:var(--text-lg)] truncate">{player.gamerName}</div>
            
            <div className="mt-1">
              <Badge variant="outline" className="text-[length:var(--text-xs)]" data-testid={`player-level-${player.gamerName}`} >
                Level {player.currentLevel || 1}
              </Badge>
            </div>
            
            <div className="mt-1">
              <span className="text-[length:var(--text-xs)] text-muted-foreground">
                {player.totalGames} game{player.totalGames !== 1 ? 's' : ''} played
              </span>
            </div>
            
            <div className="mt-2">
              <Badge variant={ (player.winRate || player.winPercentage || 0) >= 70 ? "default" : 
                (player.winRate || player.winPercentage || 0) >= 50 ? "secondary" : 
                "outline"
              } className="text-[length:var(--text-xs)]">
                {Math.round(player.winRate || player.winPercentage || 0)}% WR
              </Badge>
            </div>
          </div>
          
          <div className="flex-shrink-0 text-right space-y-1 min-w-[60px] sm:min-w-[80px]">
            <div className="flex items-center justify-end gap-1">
              <Star className="w-3 h-3 text-accent flex-shrink-0" />
              <span className="text-[length:var(--text-sm)] font-bold text-accent">{player.currentXP?.toLocaleString() || '0'}</span>
            </div>
            <div className="text-[length:var(--text-xs)] text-muted-foreground">XP</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StatCard = ({ icon: Icon, title, value, subtitle, color = "text-foreground" }) => (
  <Card className="hover:shadow-elevated transition-all duration-300">
    <CardContent className="p-[var(--card-padding)]">
      <div className="flex items-center gap-[var(--space-sm)] sm:gap-[var(--space-md)]">
        <div className={`p-2 sm:p-3 rounded-full bg-accent/20 ${color} flex-shrink-0`}>
          <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
        </div>
        <div className="min-w-0">
          <div className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold">{value}</div>
          <div className="text-[length:var(--text-sm)] font-medium truncate">{title}</div>
          {subtitle && <div className="text-[length:var(--text-xs)] text-muted-foreground truncate">{subtitle}</div>}
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function Leaderboard() {
  const { data: leaderboardData, isLoading, error } = useQuery({
    queryKey: ["/api/leaderboard", 100],
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  const { data: statsData, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/leaderboard/stats"],
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-[var(--container-padding)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-24 w-24 sm:h-32 sm:w-32 border-b-2 border-accent mx-auto"></div>
          <p className="mt-[var(--space-md)] text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-[var(--container-padding)]">
        <Card className="w-full max-w-md">
          <CardContent className="p-[var(--card-padding)] text-center">
            <div className="text-destructive mb-2 text-[length:var(--text-2xl)]">⚠️</div>
            <p className="text-[length:var(--text-lg)] font-semibold">Failed to load leaderboard</p>
            <p className="text-[length:var(--text-sm)] text-muted-foreground mt-2">Please try again later</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const leaderboard = leaderboardData || [];

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary/20 border-b border-accent/20">
        <div className="container mx-auto p-[var(--container-padding)]">
          <div className="text-center">
            <h1 className="text-[length:var(--text-3xl)] sm:text-[length:var(--text-4xl)] md:text-[length:var(--text-5xl)] font-bold gradient-text mb-2">
              Hall of Fame
            </h1>
            <p className="text-muted-foreground text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">
              Top players from multiplayer battles
            </p>
            <Badge variant="outline" className="mt-2">
              Multiplayer Only
            </Badge>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-[var(--container-padding)]">
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-[var(--space-sm)] sm:gap-[var(--space-md)] mb-[var(--space-xl)]">
          <StatCard
            icon={Users}
            title="Active Players"
            value={statsLoading ? "..." : statsData?.activePlayersThisMonth?.toLocaleString() || "0"}
            subtitle="This month"
            color="text-secondary"
          />
          <StatCard
            icon={Target}
            title="Games Played"
            value={statsLoading ? "..." : statsData?.totalGamesPlayed?.toLocaleString() || "0"}
            subtitle="Total multiplayer"
            color="text-primary"
          />
          <StatCard
            icon={Trophy}
            title="Active Collections"
            value={statsLoading ? "..." : statsData?.activeCollections?.toString() || "0"}
            subtitle="Card collections"
            color="text-glow-gold"
          />
          <StatCard
            icon={TrendingUp}
            title="Win Rate"
            value={statsLoading ? "..." : `${statsData?.averageWinRate || 0}%`}
            subtitle="Average"
            color="text-primary"
          />
        </div>

        <div className="mb-[var(--space-xl)]">
          <h2 className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold mb-[var(--space-md)] flex items-center gap-2">
            <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-glow-gold flex-shrink-0" />
            Top Champions
          </h2>
          
          {leaderboard.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-md)]">
              {leaderboard.slice(0, 3).map((player, index) => (
                <LeaderboardEntry
                  key={player.gamerName}
                  player={player}
                  rank={index + 1}
                />
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold mb-[var(--space-md)] flex items-center gap-2">
            <Medal className="w-5 h-5 sm:w-6 sm:h-6 text-accent flex-shrink-0" />
            Complete Rankings
          </h2>
          
          <div className="space-y-[var(--space-sm)] sm:space-y-[var(--space-md)]">
            {leaderboard.length > 0 ? (
              leaderboard.map((player, index) => (
                <LeaderboardEntry
                  key={player.gamerName}
                  player={player}
                  rank={index + 1}
                />
              ))
            ) : (
              <Card>
                <CardContent className="p-[var(--space-xl)] sm:p-[var(--space-2xl)] text-center">
                  <Trophy className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground mb-[var(--space-md)]" />
                  <p className="text-[length:var(--text-lg)] font-semibold">No rankings yet</p>
                  <p className="text-muted-foreground text-[length:var(--text-sm)]">
                    Play multiplayer games to appear on the leaderboard!
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        <Card className="mt-[var(--space-xl)] border-accent/20">
          <CardContent className="p-[var(--card-padding)]">
            <div className="text-center space-y-2">
              <h3 className="font-semibold text-[length:var(--text-lg)]">How Rankings Work</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-md)] text-[length:var(--text-sm)] text-muted-foreground">
                <div>
                  <strong className="text-accent">🏆 Wins:</strong> Total multiplayer victories
                </div>
                <div>
                  <strong className="text-accent">📊 Win Rate:</strong> Wins / Total games played
                </div>
                <div>
                  <strong className="text-accent">🎯 Ranked Games:</strong> 1v1 and 4-player modes only
                </div>
              </div>
              <p className="text-[length:var(--text-xs)] mt-[var(--space-md)] text-muted-foreground">
                Note: Single-player games against NPCs do not count toward rankings.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <a
        href="/"
        className="fixed bottom-[var(--space-lg)] right-[var(--space-lg)] w-12 h-12 sm:w-14 sm:h-14 min-h-[44px] min-w-[44px] bg-[var(--game-gold)] text-foreground rounded-full flex items-center justify-center shadow-elevated hover:shadow-elevated transition-all duration-300 hover:scale-110 z-50 touch-manipulation"
        data-testid="back-to-home-button"
        title="Back to Home"
      >
        <Home className="w-5 h-5 sm:w-6 sm:h-6" />
      </a>
    </div>
  );
}
