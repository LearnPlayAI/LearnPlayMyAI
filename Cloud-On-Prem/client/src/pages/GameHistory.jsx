import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Clock, 
  Target,
  Trophy,
  Filter
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FloatingCloseButton } from '@/components/FloatingCloseButton';
import GameHistoryCard from '@/components/GameHistoryCard';

const GameHistory = () => {
  const [, setLocation] = useLocation();
  const [gameHistoryTimeframe, setGameHistoryTimeframe] = useState('week');
  const queryClient = useQueryClient();

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['/api/auth/user'],
    retry: false,
  });

  const { data: gameHistory, isLoading: gameHistoryLoading, error: gameHistoryError } = useQuery({
    queryKey: ['/api/user/game-history', gameHistoryTimeframe],
    queryFn: () => fetch(`/api/user/game-history?timeframe=${gameHistoryTimeframe}`).then(res => res.json()),
    enabled: !!user,
    retry: false,
  });

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin"></div>
          <div className="text-muted-foreground text-[length:var(--text-lg)]">Loading...</div>
        </div>
      </div>
    );
  }

  if (!user) {
    setLocation('/login');
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <FloatingCloseButton onClose={() => setLocation('/')} />

      <div className="container max-w-6xl mx-auto p-[var(--container-padding)]">
        <div className="mb-[var(--space-xl)]">
          <Button variant="ghost" onClick={() => setLocation('/')}
            className="mb-[var(--space-md)] hover:bg-accent/10 min-h-[44px] touch-manipulation"
            data-testid="button-back"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
            <div>
              <h1 className="text-[length:var(--text-4xl)] sm:text-[length:var(--text-5xl)] font-bold gradient-text mb-2">
                Game History
              </h1>
              <p className="text-muted-foreground text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]">
                Review your game results and performance
              </p>
            </div>
          </div>
        </div>

        <Card className="border-2 border-accent/30 shadow-elevated bg-card backdrop-blur-sm">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)] mb-2">
              <CardTitle className="flex items-center gap-2 text-[length:var(--text-lg)] sm:text-[length:var(--text-xl)]">
                <Clock className="w-5 h-5 text-accent flex-shrink-0" />
                Your Games
              </CardTitle>
              <div className="flex items-center gap-[var(--space-sm)]">
                <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <Select value={gameHistoryTimeframe} onValueChange={setGameHistoryTimeframe}>
                  <SelectTrigger className="w-full sm:w-40 min-h-[44px] touch-manipulation" data-testid="select-game-history-timeframe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <CardDescription className="text-[length:var(--text-sm)]">
              Track your wins, losses, and performance statistics
            </CardDescription>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)]">
            {gameHistoryLoading ? (
              <div className="space-y-[var(--space-md)]" data-testid="loading-game-history">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} className="border-2 shadow-elevated animate-pulse">
                    <CardContent className="p-[var(--card-padding)]">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-[var(--space-sm)] mb-3">
                        <div className="flex items-center gap-[var(--space-sm)]">
                          <div className="w-10 h-10 bg-muted rounded-full flex-shrink-0" />
                          <div className="space-y-2">
                            <div className="h-4 w-20 bg-muted rounded" />
                            <div className="h-3 w-16 bg-muted rounded" />
                          </div>
                        </div>
                        <div className="h-3 w-24 bg-muted rounded" />
                      </div>
                      <div className="space-y-2">
                        <div className="h-3 w-full bg-muted rounded" />
                        <div className="h-3 w-3/4 bg-muted rounded" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : gameHistoryError ? (
              <div className="text-center py-[var(--space-2xl)]" data-testid="error-game-history">
                <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-[var(--space-md)]">
                  <Trophy className="w-8 h-8 text-destructive" />
                </div>
                <h3 className="text-[length:var(--text-lg)] font-medium mb-2">Failed to load game history</h3>
                <p className="text-muted-foreground mb-[var(--space-md)] text-[length:var(--text-sm)]">
                  There was an error loading your games
                </p>
                <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/user/game-history'] })}
                  className="min-h-[44px] touch-manipulation"
                  data-testid="button-retry-game-history"
                >
                  Try Again
                </Button>
              </div>
            ) : gameHistory && gameHistory.length > 0 ? (
              <div className="space-y-[var(--space-md)]" data-testid="game-history-list">
                {gameHistory.map((game) => (
                  <GameHistoryCard key={game.id} game={game} />
                ))}
                {gameHistory.length >= 20 && (
                  <div className="text-center pt-[var(--space-md)]">
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      Showing your 20 most recent games
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-[var(--space-2xl)]" data-testid="no-game-history">
                <div className="w-16 h-16 rounded-full bg-accent/10 flex items-center justify-center mx-auto mb-[var(--space-md)]">
                  <Target className="w-8 h-8 text-accent" />
                </div>
                <h3 className="text-[length:var(--text-lg)] font-medium mb-2">No games yet</h3>
                <p className="text-muted-foreground mb-[var(--space-lg)] text-[length:var(--text-sm)]">
                  Start playing to see your game history here
                </p>
                <Button onClick={() => setLocation('/')}
                  className="bg-accent min-h-[44px] touch-manipulation"
                  data-testid="button-play-game"
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Play Your First Game
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GameHistory;
