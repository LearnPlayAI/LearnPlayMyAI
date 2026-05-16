import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Flame, Target, Users, TrendingUp, ChevronDown, Award, Shield, Star } from 'lucide-react';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getLevelFromXP, getLevelIconType } from '@shared/levelUtils';
import 'flag-icons/css/flag-icons.min.css';

// Country code mapping for flag-icons CSS classes
const COUNTRY_CODE_MAP = {
  'USA': 'us', 'GBR': 'gb', 'CAN': 'ca', 'DEU': 'de', 'FRA': 'fr',
  'JPN': 'jp', 'AUS': 'au', 'ITA': 'it', 'ESP': 'es', 'BRA': 'br',
  'MEX': 'mx', 'KOR': 'kr', 'NLD': 'nl', 'RUS': 'ru', 'SWE': 'se',
  'NOR': 'no', 'DNK': 'dk', 'FIN': 'fi', 'CHE': 'ch', 'AUT': 'at',
  'BEL': 'be', 'PRT': 'pt', 'POL': 'pl', 'CZE': 'cz', 'HUN': 'hu',
  'GRC': 'gr', 'TUR': 'tr', 'ISR': 'il', 'EGY': 'eg', 'ZAF': 'za',
  'IRL': 'ie', 'NZL': 'nz', 'SGP': 'sg', 'HKG': 'hk', 'TWN': 'tw',
  'IND': 'in', 'CHN': 'cn', 'ARG': 'ar', 'CHL': 'cl', 'COL': 'co', 
  'PER': 'pe', 'URY': 'uy', 'ECU': 'ec', 'BOL': 'bo', 'PRY': 'py', 
  'VEN': 've', 'GUY': 'gy', 'SUR': 'sr', 'THA': 'th', 'VNM': 'vn', 
  'PHL': 'ph', 'MYS': 'my', 'IDN': 'id',
};

// Helper function to get country flag component
const getCountryFlag = (countryCode) => {
  const flagCode = COUNTRY_CODE_MAP[countryCode];
  if (!flagCode) return null;
  
  return (
    <span 
      className={`fi fi-${flagCode} w-5 h-5 rounded-sm shadow-sm flex-shrink-0`}
      title={countryCode}
      style={{ fontSize: '20px' }}
    />
  );
};

// Helper function to get level icon component
const getLevelIcon = (level) => {
  const iconType = getLevelIconType(level);
  switch (iconType) {
    case 'crown': return Crown;
    case 'trophy': return Trophy;
    case 'award': return Award;
    case 'shield': return Shield;
    default: return Star;
  }
};

/**
 * InlineLeaderboard - Main content leaderboard for homepage
 * 
 * Features:
 * - Shows selectable number of top players (10-1000)
 * - Integrates naturally into page content flow
 * - Responsive design that scales to all screen sizes
 * - Player avatars with country flags and stats
 * - Premium styling with gradients and animations
 * - Dropdown selector for different player counts
 * 
 * @param {Object} props
 * @param {string} props.className - Additional CSS classes
 */
export function InlineLeaderboard({ 
  className = "" 
}) {
  // State for selected player limit
  const [selectedLimit, setSelectedLimit] = useState(10);
  
  // Available limit options
  const limitOptions = [
    { value: 10, label: 'Top 10' },
    { value: 25, label: 'Top 25' },
    { value: 50, label: 'Top 50' },
    { value: 100, label: 'Top 100' },
    { value: 500, label: 'Top 500' },
    { value: 1000, label: 'Top 1000' },
  ];
  // Fetch leaderboard data with real-time updates
  const { data: leaderboard, isLoading, isFetching } = useQuery({
    queryKey: ['/api/leaderboard', selectedLimit],
    refetchInterval: 5000, // Refresh every 5 seconds for premium real-time experience
    refetchOnWindowFocus: true, // Refresh when user returns to tab
    staleTime: 0, // Always fetch fresh data
    retry: false,
  });

  if (isLoading) {
    return (
      <div className={`w-full ${className}`}>
        <div className="bg-card/50 backdrop-blur-sm rounded-3xl border border-border p-8">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
            <p className="mt-4 text-muted-foreground">Loading leaderboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!leaderboard?.length) {
    return null;
  }

  return (
    <div className={`w-full ${className}`}>
      <motion.div
        className="bg-card/50 backdrop-blur-sm rounded-3xl border border-border p-6 md:p-8 shadow-dialog"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center">
              <Trophy className="w-6 h-6 text-primary-foreground" />
            </div>
            <h2 className="text-3xl md:text-4xl font-bold gradient-text">
              Top Players
            </h2>
          </div>
          
          <div className="flex items-center justify-center gap-2">
            <p className="text-muted-foreground text-lg">
              Compete with the best • Live rankings
            </p>
            {isFetching && (
              <div className="flex items-center gap-1 text-accent text-sm">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
                <span>Updating...</span>
              </div>
            )}
          </div>
          
          {/* Player Count Selector */}
          <div className="flex items-center justify-center gap-4 mt-6 mb-4">
            <span className="text-sm font-medium text-muted-foreground">Show:</span>
            <Select value={selectedLimit.toString()} onValueChange={(value) => setSelectedLimit(parseInt(value))}>
              <SelectTrigger className="w-32 bg-background/50 border-accent/20 focus:border-accent">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {limitOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value.toString()}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          {/* Stats summary */}
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-muted-foreground">{leaderboard?.length || 0} Players</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-accent" />
              <span className="text-muted-foreground">Live Updates</span>
            </div>
          </div>
        </div>

        {/* Leaderboard Grid - Responsive */}
        <div className="w-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {leaderboard.map((player, index) => (
              <motion.div
                key={player.id}
                className={`flex items-center gap-3 p-3 md:p-4 rounded-xl transition-all duration-200 hover:scale-[1.02] ${
                  index === 0 
                    ? 'bg-[var(--leaderboard-gold)]/20 border border-[var(--leaderboard-gold)]/30 shadow-elevated' 
                    : index === 1
                    ? 'bg-[var(--leaderboard-silver)]/20 border border-[var(--leaderboard-silver)]/30'
                    : index === 2
                    ? 'bg-[var(--leaderboard-bronze)]/20 border border-[var(--leaderboard-bronze)]/30'
                    : 'bg-[var(--leaderboard-row-bg)] backdrop-blur-sm border border-border/20 hover:bg-[var(--leaderboard-row-highlight-bg)]'
                }`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: Math.min(index * 0.05, 1) }}
              >
                {/* Rank */}
                <div className="w-8 h-8 md:w-10 md:h-10 flex items-center justify-center">
                  {index === 0 ? (
                    <Crown className="w-5 h-5 md:w-6 md:h-6 text-glow-gold" />
                  ) : index === 1 ? (
                    <div className="w-5 h-5 md:w-6 md:h-6 bg-[var(--leaderboard-silver)] rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground">2</div>
                  ) : index === 2 ? (
                    <div className="w-5 h-5 md:w-6 md:h-6 bg-[var(--leaderboard-bronze)] rounded-full flex items-center justify-center text-xs font-bold text-primary-foreground">3</div>
                  ) : (
                    <span className="text-sm md:text-base font-bold text-muted-foreground">
                      #{index + 1}
                    </span>
                  )}
                </div>

                {/* Player Avatar */}
                <PlayerAvatar
                  user={player}
                  size="md"
                  showCountry={false}
                  className={`${
                    index < 3 
                      ? 'ring-2 ring-accent/40 shadow-elevated' 
                      : 'ring-1 ring-accent/20'
                  }`}
                />

                {/* Player Info */}
                <div className="flex-1 min-w-0">
                  {/* Player Name Row - with country flag */}
                  <div className="flex items-center gap-2 mb-1">
                    {/* Country Flag */}
                    {player.country && getCountryFlag(player.country)}
                    <p className="text-sm md:text-base font-semibold text-foreground truncate">
                      {player.gamerName}
                    </p>
                  </div>
                  
                  {/* Level Badge Row - Below name */}
                  <div className="flex items-center gap-2 mb-1">
                    <Badge 
                      variant="outline" 
                      className="text-xs px-1.5 py-0.5 bg-accent/20 text-accent border-accent/30 flex items-center gap-1"
                      data-testid={`rank-${player.gamerName}`}
                    >
                      {(() => {
                        const level = getLevelFromXP(player.currentXP || 0);
                        const LevelIcon = getLevelIcon(level);
                        return (
                          <>
                            <LevelIcon className="w-3 h-3" />
                            <span>Level {level}</span>
                          </>
                        );
                      })()}
                    </Badge>
                    {player.currentWinStreak > 5 && (
                      <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded-full">
                        🔥{player.currentWinStreak}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-xs md:text-sm">
                    <div className="flex items-center gap-1">
                      <Trophy className="w-3 h-3 text-primary" />
                      <span className="text-primary font-medium">
                        {player.totalWins} wins
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      <Target className="w-3 h-3 text-secondary" />
                      <span className="text-secondary font-medium">
                        {parseFloat(player.winPercentage || '0').toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  
                  {/* Additional stats for top players */}
                  {index < 10 && (
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      <span>Games: {player.totalGames || 0}</span>
                      {player.currentWinStreak > 0 && (
                        <span className="text-glow-gold">Streak: {player.currentWinStreak}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Rank change indicator (placeholder for future feature) */}
                {index < 5 && (
                  <div className="text-xs text-success hidden md:block">
                    ↗ +{Math.floor(Math.random() * 3) + 1}
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-border/20 text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Think you can make it to the top? Start your winning streak today! 🏆
          </p>
          
          {/* View Full Leaderboard Button */}
          <div>
            <a
              href="/leaderboard"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-primary-foreground font-semibold rounded-full transition-all duration-300 hover:scale-105 hover:shadow-elevated"
              data-testid="view-full-leaderboard-button"
            >
              <Trophy className="w-4 h-4" />
              View Full Leaderboard
            </a>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default InlineLeaderboard;