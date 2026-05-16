import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Flame, Target } from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Badge } from '@/components/ui/badge';

/**
 * BackgroundLeaderboard - Ghost leaderboard overlay for homepage
 * 
 * Features:
 * - Semi-transparent overlay with blur effects
 * - Auto-scrolling animation of top players
 * - Player avatars with country flags
 * - Win rates and statistics
 * - Premium visual effects without disrupting main content
 * - Responsive design: full on desktop, mini on mobile
 * 
 * @param {Object} props
 * @param {number} props.limit - Number of players to show (default: 10)
 * @param {boolean} props.autoScroll - Enable auto-scrolling (default: true)
 * @param {string} props.className - Additional CSS classes
 */
export function BackgroundLeaderboard({ 
  limit = 10, 
  autoScroll = true, 
  className = "" 
}) {
  const [scrollPosition, setScrollPosition] = useState(0);

  // Fetch leaderboard data with real-time updates
  const { data: leaderboard, isLoading, isFetching } = useQuery({
    queryKey: ['/api/leaderboard', limit],
    refetchInterval: 5000, // Refresh every 5 seconds for premium real-time experience
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    staleTime: 0, // Always fetch fresh data
    retry: false,
  });

  // Auto-scroll effect
  useEffect(() => {
    if (!autoScroll || !leaderboard?.length) return;

    const interval = setInterval(() => {
      setScrollPosition(prev => {
        // Calculate item height (approximately 80px per item)
        const itemHeight = 80;
        const maxScroll = (leaderboard.length - 1) * itemHeight;
        return prev >= maxScroll ? 0 : prev + itemHeight;
      });
    }, 3000); // Change every 3 seconds

    return () => clearInterval(interval);
  }, [autoScroll, leaderboard?.length]);

  if (isLoading || !leaderboard?.length) {
    return null;
  }

  return (
    <>
      {/* Desktop/Tablet Background Leaderboard */}
      <div className={`fixed inset-0 pointer-events-none z-0 hidden md:block ${className}`}>
        {/* Background gradient overlay */}
        <div className="absolute inset-0 bg-primary/5" />
        
        {/* Leaderboard container */}
        <div className="absolute right-8 top-1/2 -translate-y-1/2 w-80">
          <motion.div
            className="bg-background/20 backdrop-blur-sm border border-border/30 rounded-2xl p-6 shadow-dialog"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 0.6, x: 0 }}
            transition={{ duration: 1, delay: 0.5 }}
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                <Trophy className="w-4 h-4 text-primary-foreground" />
              </div>
              <h3 className="font-bold text-foreground/80">Top Players</h3>
            </div>

            {/* Scrolling leaderboard */}
            <div className="h-96 overflow-hidden relative">
              <motion.div
                className="space-y-3"
                animate={{ y: -scrollPosition }}
                transition={{ 
                  duration: 0.8,
                  ease: "easeInOut"
                }}
              >
                {/* Render leaderboard items multiple times for seamless scrolling */}
                {[...Array(3)].map((_, setIndex) => (
                  <div key={setIndex}>
                    {leaderboard.map((player, index) => (
                      <motion.div
                        key={`${setIndex}-${player.id}`}
                        className="flex items-center gap-3 p-3 rounded-xl bg-background/30 backdrop-blur-sm border border-border/20 hover:bg-background/40 transition-colors"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                      >
                        {/* Rank */}
                        <div className="w-8 h-8 flex items-center justify-center">
                          {index === 0 && setIndex === 0 ? (
                            <Crown className="w-5 h-5 text-warning" />
                          ) : (
                            <span className="text-sm font-bold text-muted-foreground/60">
                              #{index + 1}
                            </span>
                          )}
                        </div>

                        {/* Player Avatar */}
                        <PlayerAvatar
                          user={player}
                          size="sm"
                          showCountry={true}
                          className="ring-2 ring-accent/20"
                        />

                        {/* Player Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-foreground/70 truncate">
                              {player.gamerName}
                            </p>
                            {/* Show military rank badge */}
                            <Badge 
                              variant="outline" 
                              className="text-xs px-1.5 py-0.5 bg-accent/20 text-accent border-accent/30"
                              data-testid={`rank-${player.gamerName}`}
                            >
                              {player.playerTitle || 'Recruit'}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-3 text-xs">
                            <div className="flex items-center gap-1">
                              <Trophy className="w-3 h-3 text-primary" />
                              <span className="text-primary font-medium">
                                {player.totalWins}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-1">
                              <Target className="w-3 h-3 text-secondary" />
                              <span className="text-secondary font-medium">
                                {parseFloat(player.winPercentage || '0').toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Win streak indicator */}
                        {player.currentWinStreak > 0 && (
                          <div className="text-xs bg-accent/20 text-accent px-2 py-1 rounded-full">
                            🔥{player.currentWinStreak}
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                ))}
              </motion.div>
            </div>

            {/* Footer info */}
            <div className="mt-4 pt-4 border-t border-border/20 text-center">
              <p className="text-xs text-muted-foreground/50">
                Live rankings • Updates every 30s
              </p>
            </div>
          </motion.div>

          {/* Floating particles effect */}
          <div className="absolute inset-0 pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 bg-accent/20 rounded-full"
                animate={{
                  x: [0, 50, 0],
                  y: [0, -30, 0],
                  opacity: [0, 0.5, 0],
                }}
                transition={{
                  duration: 4 + i,
                  repeat: Infinity,
                  delay: i * 0.8,
                }}
                style={{
                  left: `${10 + i * 15}%`,
                  top: `${20 + (i % 3) * 30}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Mobile Mini Leaderboard */}
      <div className="fixed bottom-4 right-4 z-10 pointer-events-auto md:hidden">
        <motion.div
          className="bg-background/95 backdrop-blur-sm border border-border/30 rounded-2xl p-3 shadow-dialog max-w-[280px]"
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 0.9, y: 0, scale: 1 }}
          transition={{ duration: 0.5, delay: 1 }}
        >
          {/* Mobile Header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 bg-accent rounded-full flex items-center justify-center">
              <Trophy className="w-3 h-3 text-primary-foreground" />
            </div>
            <h3 className="text-sm font-bold text-foreground/80">Top 3</h3>
          </div>

          {/* Top 3 Players Only */}
          <div className="space-y-2">
            {leaderboard.slice(0, 3).map((player, index) => (
              <motion.div
                key={player.id}
                className="flex items-center gap-2 p-2 rounded-lg bg-background/30 backdrop-blur-sm border border-border/10"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
              >
                {/* Rank */}
                <div className="w-5 h-5 flex items-center justify-center text-xs">
                  {index === 0 ? (
                    <Crown className="w-3 h-3 text-warning" />
                  ) : (
                    <span className="font-bold text-muted-foreground/60">#{index + 1}</span>
                  )}
                </div>

                {/* Mini Avatar */}
                <PlayerAvatar
                  user={player}
                  size="xs"
                  showCountry={true}
                  className="ring-1 ring-accent/20"
                />

                {/* Compact Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground/70 truncate">
                    {player.gamerName}
                  </p>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-primary font-medium">
                      {player.totalWins}W
                    </span>
                    <span className="text-secondary font-medium">
                      {parseFloat(player.winPercentage || '0').toFixed(0)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </>
  );
}

export default BackgroundLeaderboard;