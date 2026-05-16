import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Database, ImageIcon, Users, TrendingUp, Activity, Calendar, Clock, Trophy, Target, Gamepad2, BarChart3, Trash2, AlertTriangle, Eye, Mail, CalendarDays, UserCheck } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

export default function AdminDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isClearing, setIsClearing] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const { branding } = useBranding();
  const orgName = branding?.orgName || 'LearnPlay';
  
  // Fetch users data when modal is opened
  const { data: usersData, isLoading: usersLoading } = useQuery({
    queryKey: ["/api/admin/users"],
    enabled: showUsersModal,
    retry: false,
  });

  const { data: collections, isLoading: collectionsLoading } = useQuery({
    queryKey: ["/api/admin/collections"],
    retry: false,
  });

  const { data: dashboardStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/admin/dashboard/stats"],
    retry: false,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

  // Clear all data mutation
  const clearAllDataMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/clear-all-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to clear data');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "All Data Cleared Successfully",
        description: `${data.message} - The system has been reset to a fresh state.`,
        duration: 5000,
      });
      // Refresh all dashboard data
      queryClient.invalidateQueries();
      setIsClearing(false);
    },
    onError: (error) => {
      toast({
        title: "Error Clearing Data",
        description: error.message,
        variant: "destructive",
        duration: 5000,
      });
      setIsClearing(false);
    }
  });

  const handleClearAllData = () => {
    setIsClearing(true);
    clearAllDataMutation.mutate();
  };

  const mainStats = [
    {
      title: "Total Collections",
      value: dashboardStats?.totalCollections || 0,
      icon: Database,
      description: "All card collections",
      color: "from-[var(--action-primary)]",
      clickable: false
    },
    {
      title: "Active Collections",
      value: dashboardStats?.activeCollections || 0,
      icon: TrendingUp,
      description: "Currently available to players",
      color: "from-[var(--action-primary)]",
      clickable: false
    },
    {
      title: "Total Cards",
      value: dashboardStats?.totalCards || 0,
      icon: ImageIcon,
      description: "Across all collections",
      color: "from-[var(--action-secondary)]",
      clickable: false
    },
    {
      title: "Registered Users",
      value: dashboardStats?.totalUsers || 0,
      icon: Users,
      description: "Total player accounts",
      color: "from-[var(--game-gold)]",
      clickable: true,
      onClick: () => setShowUsersModal(true)
    }
  ];

  const activityStats = [
    {
      title: "Active Now",
      value: dashboardStats?.activePlayersNow || 0,
      icon: Activity,
      description: "All players currently in games",
      color: "from-[var(--action-primary)]"
    },
    {
      title: "Active (7d)",
      value: dashboardStats?.activePlayers7Days || 0,
      icon: Calendar,
      description: "Players active in last 7 days",
      color: "from-[var(--action-secondary)]"
    },
    {
      title: "New This Month",
      value: dashboardStats?.newUsersThisMonth || 0,
      icon: Users,
      description: "New user registrations",
      color: "from-[var(--action-secondary)]"
    },
    {
      title: "Engagement Rate",
      value: `${dashboardStats?.playerEngagementRate || 0}%`,
      icon: Target,
      description: "% of users active in 30 days",
      color: "from-[var(--destructive)]"
    }
  ];

  const gameStats = [
    {
      title: "Games Today",
      value: dashboardStats?.totalGamesToday || 0,
      icon: Gamepad2,
      description: "Games played today",
      color: "from-[var(--game-gold)]"
    },
    {
      title: "Games This Week",
      value: dashboardStats?.totalGamesThisWeek || 0,
      icon: BarChart3,
      description: "Games played this week",
      color: "from-[var(--action-secondary)]"
    },
    {
      title: "Avg Game Duration",
      value: `${Math.floor((dashboardStats?.averageGameDuration || 0) / 60)}m`,
      icon: Clock,
      description: "Average time per game",
      color: "from-[var(--action-accent)]"
    },
    {
      title: "Avg Rounds",
      value: dashboardStats?.averageRoundsPerGame || 0,
      icon: Trophy,
      description: "Average rounds per game",
      color: "from-[var(--game-gold)]"
    }
  ];

  const recentCollections = collections?.slice(0, 5) || [];

  return (
    <QuizAdminLayout title="Quiz Admin" description="Manage quiz collections and cards" activeSection="dashboard">
      <div className="space-y-8">
        {/* Header */}
        <div className="border-b border-border pb-6">
          <h1 className="text-3xl font-bold bg-primary hover:bg-primary/90 bg-clip-text text-transparent">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            {`Manage your ${orgName} card game collections and monitor system performance`}
          </p>
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {mainStats.map((stat, index) => {
            const Icon = stat.icon;
            const CardComponent = stat.clickable ? 'div' : Card;
            const cardProps = stat.clickable 
              ? {
                  className: "rounded-lg border text-card-foreground bg-surface-raised shadow-card hover:shadow-card-hover border-border hover:border-primary/50 cursor-pointer transition-all duration-300 hover:scale-[1.02]",
                  onClick: stat.onClick,
                  'data-testid': `stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`
                }
              : {
                  className: "bg-surface-raised shadow-card hover:shadow-card-hover border-border hover:border-primary/30 transition-shadow duration-300",
                  'data-testid': `stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`
                };
            
            return (
              <CardComponent key={index} {...cardProps}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-muted-foreground text-sm font-medium mb-1">
                        {stat.title}
                        {stat.clickable && <Eye className="inline h-3 w-3 ml-2 text-muted-foreground" />}
                      </p>
                      <p className="text-3xl font-bold text-stats-number">
                        {statsLoading ? "..." : stat.value}
                      </p>
                      <p className="text-stats-label text-xs mt-1">
                        {stat.description}
                        {stat.clickable && <span className="text-primary block mt-1">Click to view details</span>}
                      </p>
                    </div>
                    <div className={`p-3 rounded-xl  ${stat.color} shadow-elevated`}>
                      <Icon className="h-6 w-6 text-primary-foreground" />
                    </div>
                  </div>
                </CardContent>
              </CardComponent>
            );
          })}
        </div>

        {/* Player Activity Stats */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center">
            <Activity className="h-5 w-5 mr-2 text-primary" />
            Player Activity
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {activityStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Card key={index} className="bg-surface-raised shadow-card hover:shadow-card-hover border-border hover:border-primary/30 transition-shadow duration-300" data-testid={`activity-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-muted-foreground text-sm font-medium mb-1">
                          {stat.title}
                        </p>
                        <p className="text-3xl font-bold text-stats-number">
                          {statsLoading ? "..." : stat.value}
                        </p>
                        <p className="text-stats-label text-xs mt-1">
                          {stat.description}
                        </p>
                      </div>
                      <div className={`p-3 rounded-xl  ${stat.color} shadow-elevated`}>
                        <Icon className="h-6 w-6 text-primary-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Game Activity Stats */}
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-4 flex items-center">
            <Gamepad2 className="h-5 w-5 mr-2 text-primary" />
            Game Activity
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {gameStats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <Card key={index} className="bg-surface-raised shadow-card hover:shadow-card-hover border-border hover:border-secondary/30 transition-shadow duration-300" data-testid={`game-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-muted-foreground text-sm font-medium mb-1">
                          {stat.title}
                        </p>
                        <p className="text-3xl font-bold text-stats-number">
                          {statsLoading ? "..." : stat.value}
                        </p>
                        <p className="text-stats-label text-xs mt-1">
                          {stat.description}
                        </p>
                      </div>
                      <div className={`p-3 rounded-xl  ${stat.color} shadow-elevated`}>
                        <Icon className="h-6 w-6 text-primary-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Top Players and Collections */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Top Players */}
          <Card className="bg-surface-raised shadow-card hover:shadow-card-hover transition-shadow border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center">
                <Trophy className="h-5 w-5 mr-2 text-glow-gold" />
                Top Players
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Leaderboard by wins and win percentage
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse"></div>
                  ))}
                </div>
              ) : dashboardStats?.topPlayers?.length > 0 ? (
                <div className="space-y-3">
                  {dashboardStats.topPlayers.map((player, index) => (
                    <div
                      key={player.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors duration-200"
                      data-testid={`top-player-${player.gamerName.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                          index === 0 ? 'bg-[var(--game-gold)]/20 text-glow-gold' :
                          index === 1 ? 'bg-muted text-muted-foreground' :
                          'bg-[var(--game-gold)]/20 text-glow-gold'
                        }`}>
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-foreground font-semibold">{player.gamerName}</p>
                          <p className="text-muted-foreground text-sm">{player.totalWins} wins • {player.winPercentage}% win rate</p>
                        </div>
                      </div>
                      <Badge variant="outline" >
                        {player.totalGames} games
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Trophy className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No players with games yet</p>
                  <p className="text-sm">Play some games to see the leaderboard</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Top Collections */}
          <Card className="bg-surface-raised shadow-card hover:shadow-card-hover transition-shadow border-l-4 border-l-primary">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-primary" />
                Popular Collections
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Most played collections in last 30 days
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse"></div>
                  ))}
                </div>
              ) : dashboardStats?.topCollections?.length > 0 ? (
                <div className="space-y-3">
                  {dashboardStats.topCollections.map((collection) => (
                    <div
                      key={collection.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors duration-200"
                      data-testid={`top-collection-${collection.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div>
                        <p className="text-foreground font-semibold">{collection.name}</p>
                        <p className="text-muted-foreground text-sm">{collection.gamesPlayed} games played</p>
                      </div>
                      <Badge variant="outline" >
                        {collection.popularity}%
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No games played yet</p>
                  <p className="text-sm">Start playing to see popular collections</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Collections */}
          <Card className="bg-surface-raised shadow-card hover:shadow-card-hover transition-shadow border-l-4 border-l-secondary">
            <CardHeader>
              <CardTitle className="text-foreground flex items-center">
                <Database className="h-5 w-5 mr-2 text-secondary" />
                Recent Collections
              </CardTitle>
              <CardDescription className="text-muted-foreground">
                Latest card collections in the system
              </CardDescription>
            </CardHeader>
            <CardContent>
              {collectionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse"></div>
                  ))}
                </div>
              ) : recentCollections.length > 0 ? (
                <div className="space-y-3">
                  {recentCollections.map((collection) => (
                    <div
                      key={collection.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors duration-200"
                      data-testid={`collection-${collection.name.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      <div>
                        <p className="text-foreground font-semibold">{collection.name}</p>
                        <p className="text-muted-foreground text-sm">{collection.totalCards} cards</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                        collection.isActive 
                          ? 'bg-primary/20 text-primary border border-primary/30' 
                          : 'bg-destructive/20 text-destructive border border-destructive/30'
                      }`}>
                        {collection.isActive ? 'Active' : 'Inactive'}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No collections found</p>
                  <p className="text-sm">Create your first collection to get started</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Games Trend */}
        <Card className="bg-surface-raised shadow-card hover:shadow-card-hover transition-shadow border-l-4 border-l-secondary">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-secondary" />
              Games Per Day (Last 7 Days)
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Daily game activity trend
            </CardDescription>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <div className="h-32 bg-muted/50 rounded-lg animate-pulse"></div>
            ) : dashboardStats?.gamesPerDayTrend?.length > 0 ? (
              <div className="space-y-3">
                {dashboardStats.gamesPerDayTrend.map((day) => (
                  <div key={day.date} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                    <div className="text-foreground font-medium">
                      {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-32 bg-muted rounded-full h-2">
                        <div 
                          className="bg-primary hover:bg-primary/90 h-2 rounded-full transition-all duration-300"
                          style={{ 
                            width: `${Math.min(100, (day.games / Math.max(...dashboardStats.gamesPerDayTrend.map(d => d.games), 1)) * 100)}%` 
                          }}
                        ></div>
                      </div>
                      <Badge variant="outline" className="min-w-[3rem] text-center">
                        {day.games}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No game activity data</p>
                <p className="text-sm">Play some games to see activity trends</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card className="bg-surface-raised shadow-card hover:shadow-card-hover transition-shadow border-l-4 border-l-primary">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-primary" />
              Quick Actions
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Common admin tasks and shortcuts
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link
              href="/admin/collections"
              className="block p-4 bg-primary hover:bg-primary/90 border border-primary/20 rounded-lg hover:border-primary/40 transition-all duration-300 group"
              data-testid="link-create-collection"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-primary font-semibold group-hover:text-primary/80">
                    Manage Collections
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Create and edit card collections
                  </p>
                </div>
                <Database className="h-5 w-5 text-primary/70" />
              </div>
            </Link>

            <Link
              href="/admin/cards"
              className="block p-4 bg-primary hover:bg-primary/90 border border-primary/20 rounded-lg hover:border-primary/40 transition-all duration-300 group"
              data-testid="link-manage-cards"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-primary font-semibold group-hover:text-primary/80">
                    Manage Cards
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Edit cards and upload images
                  </p>
                </div>
                <ImageIcon className="h-5 w-5 text-primary/70" />
              </div>
            </Link>

            {/* Clear All Data Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg hover:border-destructive/40 transition-all duration-300 group cursor-pointer"
                     data-testid="button-clear-all-data">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-destructive font-semibold group-hover:text-destructive/80">
                        Clear Game Progress
                      </p>
                      <p className="text-muted-foreground text-sm">
                        Reset stats (keeps accounts & cards)
                      </p>
                    </div>
                    <Trash2 className="h-5 w-5 text-destructive/70" />
                  </div>
                </div>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-card border-destructive/30 max-w-md">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-destructive flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Clear All Data
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-muted-foreground">
                    This action will permanently delete game progress including:
                    <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                      <li>All player stats and XP</li>
                      <li>All game results and leaderboards</li>
                      <li>All active games and sessions</li>
                    </ul>
                    <br />
                    <strong className="text-success">User accounts, collections and cards will be preserved.</strong>
                    <br />
                    <strong className="text-destructive">This cannot be undone.</strong>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-muted border-border hover:bg-muted/80">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearAllData}
                    disabled={isClearing}
                    className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                  >
                    {isClearing ? "Clearing..." : "Clear All Data"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
      
      {/* Users Modal */}
      <Dialog open={showUsersModal} onOpenChange={setShowUsersModal}>
        <DialogContent className="bg-card border-border max-w-4xl h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0 pb-4">
            <DialogTitle className="text-foreground flex items-center gap-2">
              <Users className="h-5 w-5 text-glow-gold" />
              Registered Users ({dashboardStats?.totalUsers || 0})
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Complete list of all registered player accounts
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto overflow-x-hidden pr-2" style={{ scrollbarWidth: 'thin' }}>
            {usersLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse"></div>
                ))}
              </div>
            ) : usersData?.length > 0 ? (
              <div className="space-y-2">
                {/* Header Row */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg font-semibold text-muted-foreground text-sm">
                  <div className="flex items-center gap-2">
                    <UserCheck className="h-4 w-4" />
                    Player Name
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Address
                  </div>
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4" />
                    Registered
                  </div>
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Last Active
                  </div>
                </div>
                
                {/* User Rows */}
                {usersData.map((user) => (
                  <div
                    key={user.id}
                    className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors duration-200"
                    data-testid={`user-row-${user.gamerName.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="space-y-1">
                      <p className="text-foreground font-semibold">{user.gamerName}</p>
                      <p className="text-muted-foreground text-sm">
                        {user.playerTitle || 'Rookie'} {user.country && `• ${user.country}`}
                      </p>
                      <p className="text-muted-foreground text-xs md:hidden">
                        {user.totalGamesPlayed || 0} games played
                      </p>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-foreground break-all">{user.email}</p>
                      <p className="text-muted-foreground text-sm md:hidden">
                        Email: {user.email}
                      </p>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-foreground">
                        {new Date(user.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {new Date(user.createdAt).toLocaleDateString('en-US', {
                          weekday: 'short'
                        })}
                      </p>
                    </div>
                    
                    <div className="space-y-1">
                      <p className="text-foreground">
                        {new Date(user.lastActiveAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </p>
                      <p className="text-muted-foreground text-sm">
                        {Math.floor((Date.now() - new Date(user.lastActiveAt).getTime()) / (1000 * 60 * 60 * 24))} days ago
                      </p>
                    </div>
                  </div>
                ))}
                
                <div className="text-center py-4 text-muted-foreground text-sm border-t border-border mt-4">
                  Total: {usersData.length} registered users
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No registered users found</p>
                <p className="text-sm">Users will appear here once they register</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </QuizAdminLayout>
  );
}