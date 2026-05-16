import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Trophy, TrendingUp, Target, Award, Crown, Shield, Star, Flame, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface ProgressStats {
  currentLevel: number;
  currentXP: number;
  xpInCurrentLevel: number;
  xpNeededForNextLevel: number;
  levelProgress: number;
  nextLevel: number;
  gradeRank: number | null;
  gradeRankTotal: number | null;
  gradeName: string | null;
  xpToNextRank: number | null;
  currentWinStreak: number;
  quizPassRate: number;
  totalQuizzes: number;
}

function getLevelIcon(level: number) {
  if (level >= 90) return Crown;
  if (level >= 70) return Trophy;
  if (level >= 50) return Award;
  if (level >= 30) return Shield;
  return Star;
}

function getLevelColor(level: number): string {
  if (level >= 90) return "text-warning";
  if (level >= 70) return "text-primary";
  if (level >= 50) return "text-secondary";
  if (level >= 30) return "text-success";
  return "text-muted-foreground";
}

function getLevelTitle(level: number): string {
  if (level >= 90) return "Legendary";
  if (level >= 70) return "Master";
  if (level >= 50) return "Expert";
  if (level >= 30) return "Apprentice";
  return "Novice";
}

function getRankMedal(rank: number): string {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
}

export function StudentProgressWidget() {
  const { data: stats, isLoading } = useQuery<ProgressStats>({
    queryKey: ["/api/student/progress-stats"],
  });

  if (isLoading || !stats) {
    return null; // Don't show anything while loading or if no data
  }

  const LevelIcon = getLevelIcon(stats.currentLevel);
  const levelColor = getLevelColor(stats.currentLevel);
  const levelTitle = getLevelTitle(stats.currentLevel);

  // Only show the widget if there's meaningful grade ranking or quiz stats to display
  const hasGradeRank = stats.gradeRank && stats.gradeName;
  const hasQuizStats = stats.currentWinStreak > 0 || stats.totalQuizzes > 0;
  
  if (!hasGradeRank && !hasQuizStats) {
    return null; // Don't show empty widget
  }

  return (
    <Card className="bg-card/90 border-border shadow-elevated mb-6" data-testid="card-progress-widget">
      <CardContent className="p-6">
        <h3 className="text-lg font-bold text-foreground mb-4">Quiz Performance</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {/* Grade Ranking */}
          {hasGradeRank && (
            <div className="bg-[var(--surface-muted)]/50 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground" data-testid="text-grade-label">
                    Rank in {stats.gradeName}
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-bold text-foreground" data-testid="text-grade-rank">
                      {getRankMedal(stats.gradeRank!)}#{stats.gradeRank}
                    </span>
                    <span className="text-sm text-muted-foreground" data-testid="text-grade-rank-total">
                      of {stats.gradeRankTotal}
                    </span>
                  </div>
                  {stats.xpToNextRank !== null && stats.xpToNextRank > 0 && stats.gradeRank! > 1 && (
                    <p className="text-xs !text-primary mt-1" data-testid="text-xp-to-next-rank">
                      {stats.xpToNextRank.toLocaleString()} XP to #{stats.gradeRank! - 1}
                    </p>
                  )}
                </div>
                <Trophy className="w-10 h-10 text-[var(--warning)]/40" data-testid="icon-trophy" />
              </div>
              {stats.gradeRank && stats.gradeRank <= 3 && (
                <p className="text-center text-xs !text-primary/80 font-medium mt-3 pt-3 border-t border-border" data-testid="text-motivation">
                  🎯 Amazing! You're top 3!
                </p>
              )}
            </div>
          )}

          {/* Quiz Stats */}
          {hasQuizStats && (
            <TooltipProvider>
              <div className="grid grid-cols-2 gap-3">
                {/* Quizzes Played */}
                {stats.totalQuizzes > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="bg-[var(--surface-muted)]/50 border border-border rounded-lg p-3 cursor-help" data-testid="card-quizzes-played">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-5 h-5 text-secondary" data-testid="icon-quizzes" />
                          <div className="flex items-center gap-1 flex-1">
                            <p className="text-xs text-muted-foreground font-semibold">Quizzes Played</p>
                            <HelpCircle className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-foreground" data-testid="text-quizzes-played">
                            {stats.totalQuizzes}
                          </p>
                          <span className="text-xs text-muted-foreground">total</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover border-secondary/50">
                      <p className="text-sm">Total quizzes completed.</p>
                      <p className="text-xs text-muted-foreground mt-1">Keep playing to improve your skills!</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              
                {/* Win Streak */}
                {stats.currentWinStreak > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="bg-[var(--surface-muted)]/50 border border-border rounded-lg p-3 cursor-help" data-testid="card-win-streak">
                        <div className="flex items-center gap-2 mb-1">
                          <Flame className="w-5 h-5 text-warning" data-testid="icon-streak" />
                          <div className="flex items-center gap-1 flex-1">
                            <p className="text-xs text-muted-foreground font-semibold">Win Streak</p>
                            <HelpCircle className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-foreground" data-testid="text-win-streak">
                            {stats.currentWinStreak}
                          </p>
                          <span className="text-xs text-muted-foreground">wins</span>
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover border-[var(--warning)]/50">
                      <p className="text-sm">Quizzes passed in a row.</p>
                      <p className="text-xs text-muted-foreground mt-1">Keep winning to maintain your streak!</p>
                    </TooltipContent>
                  </Tooltip>
                )}

                {/* Quiz Pass Rate */}
                {stats.totalQuizzes > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="bg-[var(--surface-muted)]/50 border border-border rounded-lg p-3 cursor-help" data-testid="card-pass-rate">
                        <div className="flex items-center gap-2 mb-1">
                          <Target className="w-5 h-5 text-success" data-testid="icon-pass-rate" />
                          <div className="flex items-center gap-1 flex-1">
                            <p className="text-xs text-muted-foreground font-semibold">Pass Rate</p>
                            <HelpCircle className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <p className="text-2xl font-bold text-foreground" data-testid="text-pass-rate">
                            {stats.quizPassRate}%
                          </p>
                          {stats.quizPassRate >= 80 && (
                            <Badge variant="outline" className="px-1 py-0 h-4 !text-success" data-testid="badge-excellent">
                            Excellent!
                          </Badge>
                        )}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="bg-popover border-[var(--success)]/50">
                      <p className="text-sm">Percentage of quizzes passed.</p>
                      <p className="text-xs text-muted-foreground mt-1">Based on {stats.totalQuizzes} quiz{stats.totalQuizzes > 1 ? 'zes' : ''}.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            </TooltipProvider>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
