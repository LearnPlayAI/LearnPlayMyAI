import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PlayerAvatar from "@/components/ui/PlayerAvatar";
import { Trophy, Medal, Award, Brain, Target, TrendingUp, Clock, Home } from "lucide-react";
import { Link } from "wouter";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";

const QuizLeaderboardEntry = ({ player, rank }) => {
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
      case 1: return "bg-[var(--game-gold)]/20 border-[var(--game-gold)]/50";
      case 2: return "bg-muted border-border";
      case 3: return "bg-[var(--game-gold)]/20 border-[var(--game-gold)]/50";
      default: return "";
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
              <h3 className="font-bold text-[length:var(--text-base)] sm:text-[length:var(--text-lg)] truncate" data-testid={`text-player-name-${rank}`}>
                {player.gamerName}
              </h3>
              {player.currentLevel && (
                <Badge variant="outline" className="text-[length:var(--text-xs)] w-fit">
                  Lvl {player.currentLevel}
                </Badge>
              )}
            </div>
            
            {player.unitName && (
              <p className="text-[length:var(--text-sm)] text-muted-foreground mb-2 truncate">{player.unitName}</p>
            )}
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-[var(--space-sm)] text-[length:var(--text-sm)]">
              <div className="flex flex-col">
                <span className="text-muted-foreground text-[length:var(--text-xs)]">Correct</span>
                <span className="font-semibold text-success">{player.totalCorrectAnswers || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-[length:var(--text-xs)]">Accuracy</span>
                <span className="font-semibold text-secondary">{player.averageAccuracy || 0}%</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-[length:var(--text-xs)]">Games</span>
                <span className="font-semibold">{player.totalGamesPlayed || 0}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-muted-foreground text-[length:var(--text-xs)]">Wins</span>
                <span className="font-semibold text-primary">{player.totalGamesWon || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const StatCard = ({ icon: Icon, title, value, subtitle }) => (
  <Card>
    <CardContent className="p-[var(--card-padding)]">
      <div className="flex items-center gap-[var(--space-sm)] sm:gap-[var(--space-md)]">
        <div className="p-2 bg-accent/20 rounded-lg flex-shrink-0">
          <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
        </div>
        <div className="min-w-0">
          <p className="text-[length:var(--text-sm)] text-muted-foreground truncate">{title}</p>
          <p className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold">{value}</p>
          {subtitle && <p className="text-[length:var(--text-xs)] text-muted-foreground mt-1 truncate">{subtitle}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

export default function QuizLeaderboard() {
  const { terminology, isResolved } = useOrganizationTerminology();
  
  const [daysFilter, setDaysFilter] = useState("all");
  const [unitFilter, setUnitFilter] = useState("all");

  const queryParams = new URLSearchParams();
  if (daysFilter !== "all") {
    queryParams.append("days", daysFilter);
  }
  if (unitFilter !== "all") {
    queryParams.append("unitId", unitFilter);
  }
  const queryString = queryParams.toString();

  const { data: leaderboardData, isLoading, error } = useQuery({
    queryKey: ["/api/quiz-leaderboard", queryString],
    queryFn: async () => {
      const response = await fetch(`/api/quiz-leaderboard?${queryString}`);
      if (!response.ok) throw new Error("Failed to fetch quiz leaderboard");
      return response.json();
    },
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });

  const { data: unitsData } = useQuery({
    queryKey: ["/api/admin/org-structure/units"],
    retry: false,
  });

  if (!isResolved || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-[var(--container-padding)]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-24 w-24 sm:h-32 sm:w-32 border-b-2 border-accent mx-auto"></div>
          <p className="mt-[var(--space-md)] text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">Loading quiz leaderboard...</p>
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
            <p className="text-[length:var(--text-lg)] font-semibold">Failed to load quiz leaderboard</p>
            <p className="text-[length:var(--text-sm)] text-muted-foreground mt-2">Please try again later</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const leaderboard = leaderboardData || [];
  const totalPlayers = leaderboard.length;
  const totalCorrectAnswers = leaderboard.reduce((sum, p) => sum + (p.totalCorrectAnswers || 0), 0);
  const averageAccuracy = leaderboard.length > 0 
    ? (leaderboard.reduce((sum, p) => sum + (parseFloat(p.averageAccuracy) || 0), 0) / leaderboard.length).toFixed(1)
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-primary hover:bg-primary/90 border-b border-primary/20">
        <div className="container mx-auto p-[var(--container-padding)]">
          <div className="flex items-center justify-between mb-[var(--space-md)]">
            <Link href="/" data-testid="link-home">
              <Button variant="ghost" className="flex items-center gap-2 min-h-[44px] touch-manipulation px-2">
                <Home className="w-5 h-5" />
                <span className="text-[length:var(--text-sm)] sm:text-[length:var(--text-base)]">Home</span>
              </Button>
            </Link>
          </div>
          
          <div className="text-center">
            <h1 className="text-[length:var(--text-3xl)] sm:text-[length:var(--text-4xl)] md:text-[length:var(--text-5xl)] font-bold gradient-text mb-2">
              Quiz Champions
            </h1>
            <p className="text-muted-foreground text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">
              Top performers in quiz battles
            </p>
            <Badge variant="outline" className="mt-2">
              <Brain className="w-3 h-3 mr-1" />
              Knowledge Leaderboard
            </Badge>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-[var(--container-padding)]">
        <Card className="mb-[var(--space-xl)]">
          <CardContent className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row gap-[var(--space-md)]">
              <div className="flex-1">
                <label className="text-[length:var(--text-sm)] font-medium mb-2 block">Time Period</label>
                <Select value={daysFilter} onValueChange={setDaysFilter}>
                  <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-days-filter">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="1">Today</SelectItem>
                    <SelectItem value="7">Last 7 Days</SelectItem>
                    <SelectItem value="14">Last 14 Days</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {unitsData && unitsData.length > 0 && (
                <div className="flex-1">
                  <label className="text-[length:var(--text-sm)] font-medium mb-2 block">{terminology?.unit}</label>
                  <Select value={unitFilter} onValueChange={setUnitFilter}>
                    <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-unit-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All {terminology?.unitPlural}</SelectItem>
                      {unitsData.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--space-md)] mb-[var(--space-xl)]">
          <StatCard
            icon={Brain}
            title="Total Players"
            value={totalPlayers}
          />
          <StatCard
            icon={Target}
            title="Total Correct Answers"
            value={totalCorrectAnswers}
          />
          <StatCard
            icon={TrendingUp}
            title="Average Accuracy"
            value={`${averageAccuracy}%`}
          />
        </div>

        {leaderboard.length > 0 && (
          <div className="mb-[var(--space-xl)]">
            <h2 className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold mb-[var(--space-md)] flex items-center gap-2">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-glow-gold flex-shrink-0" />
              Top Quiz Masters
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-md)]">
              {leaderboard.slice(0, 3).map((player, index) => (
                <QuizLeaderboardEntry
                  key={player.userId}
                  player={player}
                  rank={index + 1}
                />
              ))}
            </div>
          </div>
        )}

        <div>
          <h2 className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold mb-[var(--space-md)] flex items-center gap-2">
            <Medal className="w-5 h-5 sm:w-6 sm:h-6 text-accent flex-shrink-0" />
            Complete Rankings
          </h2>
          
          <div className="space-y-[var(--space-sm)] sm:space-y-[var(--space-md)]">
            {leaderboard.length > 0 ? (
              leaderboard.map((player, index) => (
                <QuizLeaderboardEntry
                  key={player.userId}
                  player={player}
                  rank={index + 1}
                />
              ))
            ) : (
              <Card>
                <CardContent className="p-[var(--space-xl)] sm:p-[var(--space-2xl)] text-center">
                  <Brain className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-muted-foreground mb-[var(--space-md)]" />
                  <p className="text-[length:var(--text-lg)] font-semibold">No quiz results yet</p>
                  <p className="text-muted-foreground text-[length:var(--text-sm)]">
                    Play quiz games to appear on the leaderboard!
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
