import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { 
  ArrowLeft, 
  User, 
  Trophy, 
  Settings, 
  Calendar, 
  GamepadIcon,
  Target,
  Zap,
  Crown,
  BarChart3,
  Clock,
  Flame,
  Star,
  Award,
  Shield,
  Globe,
  DollarSign,
  Bell,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Mail,
  Languages
} from 'lucide-react';
import { getLevelFromXP, getLevelProgress, getLevelColor } from '@shared/levelUtils';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { apiRequest, invalidateCurrencyPreferenceCaches } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { AvatarUpload } from '@/components/ui/AvatarUpload';
import { CountrySelector } from '@/components/ui/CountrySelector';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import GameHistoryCard from '@/components/GameHistoryCard';
import { TIMEZONES } from '@/utils/timezones';

// Currency options for preferences
const CURRENCIES = [
  { value: 'USD', label: 'US Dollar (USD)', symbol: '$' },
  { value: 'EUR', label: 'Euro (EUR)', symbol: '€' },
  { value: 'ZAR', label: 'South African Rand (ZAR)', symbol: 'R' },
];

// Profile update schema
const profileSchema = z.object({
  gamerName: z.string().min(3, 'Gamer name must be at least 3 characters').max(20, 'Gamer name must be less than 20 characters').optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  bio: z.string().max(200, 'Bio must be less than 200 characters').optional(),
  country: z.string().optional(),
  playerTitle: z.string().optional(),
  preferredGameModes: z.array(z.string()).optional(),
  isStatsPublic: z.boolean().optional(),
});

function LanguagePreferenceSection({ user }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: languages, isLoading: languagesLoading } = useQuery({
    queryKey: ['/api/languages'],
    enabled: !!user,
  });

  const updateLanguageMutation = useMutation({
    mutationFn: async (languageCode) => {
      return await apiRequest('/api/users/language', {
        method: 'PATCH',
        body: JSON.stringify({ languageCode }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      toast({
        title: 'Language updated',
        description: 'Your preferred language has been updated',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update language',
        variant: 'destructive',
      });
    },
  });

  return (
    <Card className="bg-card border-border" data-testid="card-language-settings">
      <CardHeader className="p-[var(--card-padding)]">
        <CardTitle className="text-card-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-lg)]">
          <Languages className="h-5 w-5 text-primary" />
          Language Settings
        </CardTitle>
        <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
          Set your preferred language for content and interface
        </CardDescription>
      </CardHeader>
      <CardContent className="p-[var(--card-padding)] space-y-[var(--space-lg)]">
        <div className="space-y-[var(--space-sm)]">
          <Label htmlFor="preferred-language" className="text-foreground text-[length:var(--text-sm)]">Preferred Language</Label>
          <Select
            value={user?.preferredLanguage || 'en'}
            onValueChange={(value) => updateLanguageMutation.mutate(value)}
            disabled={languagesLoading || updateLanguageMutation.isPending}
          >
            <SelectTrigger id="preferred-language" className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-preferred-language">
              <SelectValue placeholder="Select your preferred language" />
            </SelectTrigger>
            <SelectContent>
              {languages && languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name} ({lang.nativeName})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[length:var(--text-xs)] text-muted-foreground">
            Content and interface will be displayed in your preferred language when available
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

const ProfilePage = () => {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('profile');
  const [gameHistoryTimeframe, setGameHistoryTimeframe] = useState('week');
  const queryClient = useQueryClient();

  // Force refresh user data on profile page load to ensure latest auth status
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
  }, []);

  // Get current user
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['/api/auth/user'],
    retry: false,
  });

  // Get user's leaderboard stats for accurate game statistics
  const { data: leaderboardStats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['/api/user/leaderboard-stats'],
    enabled: !!user, // Only fetch if user exists (all returned users are authenticated)
    retry: false,
  });

  // Get user's game history
  const { data: gameHistory, isLoading: gameHistoryLoading, error: gameHistoryError } = useQuery({
    queryKey: ['/api/user/game-history', gameHistoryTimeframe],
    queryFn: () => fetch(`/api/user/game-history?timeframe=${gameHistoryTimeframe}`).then(res => res.json()),
    enabled: !!user && activeTab === 'stats', // Only fetch if user exists and stats tab is active
    retry: false,
  });

  // User preferences for settings tab
  const { toast } = useToast();
  const [hasPreferencesChanges, setHasPreferencesChanges] = useState(false);
  const [isResendingVerification, setIsResendingVerification] = useState(false);
  const [localPreferences, setLocalPreferences] = useState({
    timezone: null,
    preferredCurrency: null,
    emailNotifications: true,
    pushNotifications: true,
  });

  // Calculate action required count for settings tab
  const actionRequiredCount = useMemo(() => {
    if (!user) return 0;
    let count = 0;
    if (!user.emailVerified) count++;
    if (!user.country) count++;
    if (user.needsCurrencyOnboarding) count++;
    return count;
  }, [user]);

  // Get user preferences
  const { data: preferences, isLoading: preferencesLoading } = useQuery({
    queryKey: ['/api/user/preferences'],
    enabled: !!user,
  });

  // Sync local preferences with fetched data
  useEffect(() => {
    if (preferences) {
      setLocalPreferences(preferences);
    }
  }, [preferences]);

  // Update preferences mutation
  const updatePreferencesMutation = useMutation({
    mutationFn: async (updates) => {
      return await apiRequest('/api/user/preferences', {
        method: 'PUT',
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      // Invalidate all price-displaying caches to reflect currency preference changes
      invalidateCurrencyPreferenceCaches();
      setHasPreferencesChanges(false);
      toast({
        title: 'Success',
        description: 'Your preferences have been updated',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handlePreferenceChange = (key, value) => {
    setLocalPreferences((prev) => ({ ...prev, [key]: value }));
    setHasPreferencesChanges(true);
  };

  const handleSavePreferences = () => {
    updatePreferencesMutation.mutate(localPreferences);
  };

  const handleResendVerification = async () => {
    setIsResendingVerification(true);
    try {
      await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
      });
      toast({
        title: 'Success',
        description: 'Verification email sent! Please check your inbox.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to send verification email',
        variant: 'destructive',
      });
    } finally {
      setIsResendingVerification(false);
    }
  };
  

  // Profile form
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      gamerName: user?.gamerName || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      bio: user?.bio || '',
      country: user?.country || '',
      playerTitle: user?.playerTitle || 'Rookie',
      preferredGameModes: user?.preferredGameModes || [],
      isStatsPublic: user?.isStatsPublic !== false,
    },
    values: {
      gamerName: user?.gamerName || '',
      firstName: user?.firstName || '',
      lastName: user?.lastName || '',
      bio: user?.bio || '',
      country: user?.country || '',
      playerTitle: user?.playerTitle || 'Rookie',
      preferredGameModes: user?.preferredGameModes || [],
      isStatsPublic: user?.isStatsPublic !== false,
    }
  });

  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data) => apiRequest('/api/profile', {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/leaderboard-stats'] });
    },
    onError: (error) => {
      console.error('Profile update error:', error);
    }
  });

  const onSubmit = (data) => {
    updateProfileMutation.mutate(data);
  };

  if (userLoading || statsLoading) {
    return (
      <QuizAdminLayout
        title="My Profile"
        description="Manage your profile and game statistics"
        activeSection="profile"
      >
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-lg text-foreground">Loading profile...</span>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (!user) {
    return (
      <QuizAdminLayout
        title="My Profile"
        description="Manage your profile and game statistics"
        activeSection="profile"
      >
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-destructive mb-2">Access Denied</h1>
            <p className="text-muted-foreground mb-4">You need to be logged in to view this page.</p>
            <Button onClick={() => setLocation('/')}
              variant="gradient"
            >
              Go Home
            </Button>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  const getLevelIcon = (level) => {
    if (level >= 90) return Crown;
    if (level >= 70) return Trophy;
    if (level >= 50) return Award;
    if (level >= 30) return Shield;
    return Star;
  };

  const getLevelBadgeColor = (level) => {
    if (level >= 90) return 'bg-accent';
    if (level >= 70) return 'bg-primary';
    if (level >= 50) return 'bg-secondary';
    if (level >= 30) return 'bg-primary';
    return 'bg-muted';
  };

  const formatDuration = (seconds) => {
    if (!seconds) return '0m';
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    }
    return `${minutes}m`;
  };

  return (
    <QuizAdminLayout
      title="My Profile"
      description="Manage your profile and game statistics"
      activeSection="profile"
    >
      <div className="w-full max-w-7xl mx-auto p-[var(--container-padding)]">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-full sm:max-w-md mx-auto mb-[var(--space-xl)] min-h-[44px]">
            <TabsTrigger value="profile" data-testid="tab-profile" className="min-h-[44px] touch-manipulation text-[length:var(--text-sm)]">
              <User className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Profile</span>
              <span className="xs:hidden">Me</span>
            </TabsTrigger>
            <TabsTrigger value="stats" data-testid="tab-stats" className="min-h-[44px] touch-manipulation text-[length:var(--text-sm)]">
              <Trophy className="w-4 h-4 mr-1 sm:mr-2" />
              Stats
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="tab-settings" className="min-h-[44px] touch-manipulation text-[length:var(--text-sm)] relative">
              <Settings className="w-4 h-4 mr-1 sm:mr-2" />
              <span className="hidden xs:inline">Settings</span>
              <span className="xs:hidden">⚙️</span>
              {actionRequiredCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center font-semibold">
                  {actionRequiredCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="space-y-[var(--space-xl)]">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-[var(--space-lg)]">
              {/* Avatar Section */}
              <Card className="bg-card border-border" data-testid="card-avatar-section">
                <CardHeader className="text-center p-[var(--card-padding)]">
                  <CardTitle className="flex items-center justify-center gap-[var(--space-sm)] text-card-foreground text-[length:var(--text-lg)]">
                    <User className="w-5 h-5 text-primary" />
                    Avatar
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    Upload and manage your profile picture
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-[var(--card-padding)]">
                  <AvatarUpload 
                    user={user} 
                    size="xl"
                    onUploadSuccess={() => {
                      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
                    }}
                  />
                </CardContent>
              </Card>

              {/* Profile Information */}
              <div className="lg:col-span-2 space-y-[var(--space-lg)]">
                <Card className="bg-card border-border" data-testid="card-player-info">
                  <CardHeader className="p-[var(--card-padding)]">
                    <CardTitle className="flex items-center gap-[var(--space-sm)] text-card-foreground text-[length:var(--text-lg)]">
                      <GamepadIcon className="w-5 h-5 text-primary" />
                      Player Information
                    </CardTitle>
                    <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                      Update your basic profile information
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-[var(--card-padding)]">
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-[var(--space-lg)]">
                        {/* Gamer Name */}
                        <FormField
                          control={form.control}
                          name="gamerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Player Name</FormLabel>
                              <FormControl>
                                <Input 
                                  placeholder="Enter your player name" 
                                  {...field} 
                                  data-testid="input-gamer-name"
                                />
                              </FormControl>
                              <FormMessage />
                              <p className="text-xs text-muted-foreground">
                                This is your unique player name shown to other players
                              </p>
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                          <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Enter first name" 
                                    {...field} 
                                    data-testid="input-first-name"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="Enter last name" 
                                    {...field}
                                    data-testid="input-last-name"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="country"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Country</FormLabel>
                              <FormControl>
                                <CountrySelector
                                  value={field.value}
                                  onValueChange={field.onChange}
                                  placeholder="Select your country"
                                  data-testid="country-selector"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="bio"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Bio</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Tell other players about yourself..."
                                  {...field}
                                  rows={3}
                                  maxLength={200}
                                  data-testid="textarea-bio"
                                />
                              </FormControl>
                              <FormMessage />
                              <p className="text-xs text-muted-foreground">
                                {field.value?.length || 0}/200 characters
                              </p>
                            </FormItem>
                          )}
                        />

                        <Button type="submit" disabled={updateProfileMutation.isPending} variant="gradient" className="w-full min-h-[44px] touch-manipulation text-[length:var(--text-base)]" data-testid="button-save-profile" >
                          {updateProfileMutation.isPending ? 'Saving...' : 'Save Profile'}
                        </Button>
                      </form>
                    </Form>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Stats Tab */}
          <TabsContent value="stats" className="space-y-[var(--space-xl)]">
            {/* XP and Level Progression */}
            <Card className="bg-card border-border" data-testid="card-xp-progression">
              <CardContent className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] mb-[var(--space-md)]">
                  <div className="flex items-center gap-[var(--space-sm)]">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-surface-raised rounded-full flex items-center justify-center flex-shrink-0">
                      {(() => {
                        const currentLevel = leaderboardStats?.currentLevel || getLevelFromXP(leaderboardStats?.currentXP || 0);
                        const LevelIcon = getLevelIcon(currentLevel);
                        return <LevelIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />;
                      })()}
                    </div>
                    <div>
                      <h3 className="text-[length:var(--text-lg)] font-bold text-card-foreground" data-testid="text-level">Level {leaderboardStats?.currentLevel || getLevelFromXP(leaderboardStats?.currentXP || 0)}</h3>
                      <p className="text-[length:var(--text-sm)] text-muted-foreground">Current Level</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-[length:var(--text-2xl)] font-bold text-primary" data-testid="text-xp">{leaderboardStats?.currentXP?.toLocaleString() || '0'}</p>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">XP</p>
                  </div>
                </div>
                
                <div className="space-y-[var(--space-sm)]">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      Progress to {(() => {
                        const currentXP = leaderboardStats?.currentXP || 0;
                        const currentLevel = leaderboardStats?.currentLevel || getLevelFromXP(currentXP);
                        const levelData = getLevelProgress(currentXP, currentLevel);
                        return levelData.progress < 100 ? `Level ${levelData.nextLevel}` : "Max Level";
                      })()}
                    </span>
                    <span className="text-muted-foreground">
                      {(() => {
                        const currentXP = leaderboardStats?.currentXP || 0;
                        const currentLevel = leaderboardStats?.currentLevel || getLevelFromXP(currentXP);
                        const levelData = getLevelProgress(currentXP, currentLevel);
                        return levelData.progress < 100 ? `${Math.round(levelData.progress)}%` : "Max Level";
                      })()}
                    </span>
                  </div>
                  <Progress 
                    className="h-3 bg-muted [&>div]: [&>div]:from-warning [&>div]:to-warning/80"
                    value={(() => {
                      const currentXP = leaderboardStats?.currentXP || 0;
                      const currentLevel = leaderboardStats?.currentLevel || getLevelFromXP(currentXP);
                      const levelData = getLevelProgress(currentXP, currentLevel);
                      return levelData.progress;
                    })()}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Leaderboard Position */}
            {leaderboardStats?.leaderboardPosition && (
              <Card className="bg-card border-border" data-testid="card-leaderboard-position">
                <CardContent className="p-[var(--card-padding)]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)]">
                    <div className="flex items-center gap-[var(--space-sm)]">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-warning rounded-full flex items-center justify-center flex-shrink-0">
                        <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-warning-foreground" />
                      </div>
                      <div>
                        <h3 className="text-[length:var(--text-lg)] font-bold text-accent" data-testid="text-position">#{leaderboardStats.leaderboardPosition}</h3>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">Leaderboard Position</p>
                      </div>
                    </div>
                    <Crown className="w-6 h-6 sm:w-8 sm:h-8 text-accent hidden sm:block" />
                  </div>
                  <p className="text-[length:var(--text-sm)] text-muted-foreground mt-[var(--space-sm)]">
                    {leaderboardStats.leaderboardPosition <= 10 ? "🔥 Top 10 Player!" : 
                     leaderboardStats.leaderboardPosition <= 50 ? "⭐ Top 50 Player!" :
                     leaderboardStats.leaderboardPosition <= 100 ? "💪 Top 100 Player!" :
                     "Keep climbing the ranks!"}
                  </p>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-[var(--space-md)]" data-testid="stats-grid">
              {/* Games Played */}
              <Card className="bg-card border-border">
                <CardContent className="p-[var(--card-padding)]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-xs)]">
                    <div className="order-2 sm:order-1">
                      <p className="text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] text-muted-foreground">Games Played</p>
                      <p className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-card-foreground" data-testid="stat-games-played">
                        {leaderboardStats?.totalGames || 0}
                      </p>
                    </div>
                    <GamepadIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary order-1 sm:order-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Wins */}
              <Card className="bg-card border-border">
                <CardContent className="p-[var(--card-padding)]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-xs)]">
                    <div className="order-2 sm:order-1">
                      <p className="text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] text-muted-foreground">Total Wins</p>
                      <p className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-primary" data-testid="stat-total-wins">
                        {leaderboardStats?.totalWins || 0}
                      </p>
                    </div>
                    <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-primary order-1 sm:order-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Win Rate */}
              <Card className="bg-card border-border">
                <CardContent className="p-[var(--card-padding)]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-xs)]">
                    <div className="order-2 sm:order-1">
                      <p className="text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] text-muted-foreground">Win Rate</p>
                      <p className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-secondary" data-testid="stat-win-percentage">
                        {leaderboardStats?.winPercentage || '0.00'}%
                      </p>
                    </div>
                    <Target className="w-6 h-6 sm:w-8 sm:h-8 text-secondary order-1 sm:order-2" />
                  </div>
                </CardContent>
              </Card>

              {/* Best Streak */}
              <Card className="bg-card border-border">
                <CardContent className="p-[var(--card-padding)]">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-xs)]">
                    <div className="order-2 sm:order-1">
                      <p className="text-[length:var(--text-xs)] sm:text-[length:var(--text-sm)] text-muted-foreground">Best Streak</p>
                      <p className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)] font-bold text-warning" data-testid="stat-best-streak">
                        {leaderboardStats?.bestWinStreak || 0}
                      </p>
                    </div>
                    <Flame className="w-6 h-6 sm:w-8 sm:h-8 text-warning order-1 sm:order-2" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Player Title Card */}
            <Card className="bg-card border-border" data-testid="card-player-status">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="flex items-center gap-[var(--space-sm)] text-card-foreground text-[length:var(--text-lg)]">
                  <Crown className="w-5 h-5 text-primary" />
                  Player Status
                </CardTitle>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)]">
                  <div className="space-y-[var(--space-sm)]">
                    <div className="flex flex-wrap items-center gap-[var(--space-sm)]">
                      <Badge className={`${getLevelBadgeColor(leaderboardStats?.currentLevel || 1)} text-primary-foreground font-bold`} data-testid="player-level-badge" >
                        Level {leaderboardStats?.currentLevel || 1}
                      </Badge>
                      {leaderboardStats?.currentXP && (
                        <span className="text-[length:var(--text-sm)] text-muted-foreground">
                          {leaderboardStats.currentXP.toLocaleString()} XP
                        </span>
                      )}
                    </div>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      Member since {new Date(user.createdAt).toLocaleDateString()}
                    </p>
                    {user.lastActiveAt && (
                      <p className="text-[length:var(--text-sm)] text-muted-foreground">
                        Last active {new Date(user.lastActiveAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  
                  <div className="text-left sm:text-right space-y-1">
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">Current Streak</p>
                    <p className="text-[length:var(--text-xl)] font-bold text-primary" data-testid="current-streak">
                      {leaderboardStats?.currentWinStreak || 0}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Game History */}
            <Card className="bg-card border-border" data-testid="card-game-history">
              <CardHeader className="p-[var(--card-padding)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] mb-[var(--space-sm)]">
                  <CardTitle className="flex items-center gap-[var(--space-sm)] text-card-foreground text-[length:var(--text-lg)]">
                    <Clock className="w-5 h-5 text-primary" />
                    Game History
                  </CardTitle>
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
                <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                  Review your recent game results and performance
                </CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)]">
                {gameHistoryLoading ? (
                  <div className="space-y-4" data-testid="loading-game-history">
                    {/* Loading skeleton */}
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Card key={i} className="border-2 shadow-elevated animate-pulse">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-muted rounded-full" />
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
                  <div className="text-center py-[var(--space-xl)]" data-testid="error-game-history">
                    <p className="text-muted-foreground mb-[var(--space-sm)] text-[length:var(--text-base)]">Failed to load game history</p>
                    <Button variant="outline" onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/user/game-history'] })}
                      data-testid="button-retry-game-history"
                      className="border-border hover:bg-muted min-h-[44px] touch-manipulation"
                    >
                      Try Again
                    </Button>
                  </div>
                ) : gameHistory && gameHistory.length > 0 ? (
                  <div className="space-y-4" data-testid="game-history-list">
                    {gameHistory.map((game) => (
                      <GameHistoryCard key={game.id} game={game} />
                    ))}
                    {gameHistory.length >= 20 && (
                      <div className="text-center pt-4">
                        <p className="text-sm text-muted-foreground">
                          Showing your 20 most recent games
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-[var(--space-xl)]" data-testid="no-game-history">
                    <Target className="w-10 h-10 sm:w-12 sm:h-12 text-muted-foreground mx-auto mb-[var(--space-md)]" />
                    <h3 className="text-[length:var(--text-lg)] font-medium text-card-foreground mb-[var(--space-sm)]">No games yet</h3>
                    <p className="text-muted-foreground mb-[var(--space-md)] text-[length:var(--text-sm)]">
                      Start playing to see your game history here
                    </p>
                    <Button onClick={() => setLocation('/lobby')}
                      className="bg-primary hover:bg-primary/90 min-h-[44px] touch-manipulation"
                      data-testid="button-play-game"
                    >
                      Play Your First Game
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings" className="space-y-[var(--space-lg)]">
            {/* Action Required Alerts */}
            {actionRequiredCount > 0 && (
              <Card className="bg-card border-border border-l-4 border-l-warning" data-testid="card-action-required">
                <CardHeader className="p-[var(--card-padding)]">
                  <CardTitle className="text-card-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-lg)]">
                    <AlertTriangle className="h-5 w-5 text-warning" />
                    Action Required
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    Please complete the following to ensure full platform access
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-[var(--card-padding)] space-y-[var(--space-md)]">
                  {!user?.emailVerified && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] p-[var(--card-padding)] border border-warning/30 rounded-lg bg-warning/5">
                      <div className="flex items-start gap-[var(--space-sm)]">
                        <Mail className="w-5 h-5 text-warning mt-0.5" />
                        <div>
                          <p className="font-medium text-foreground text-[length:var(--text-sm)]">Email Verification Required</p>
                          <p className="text-[length:var(--text-xs)] text-muted-foreground">
                            Verify your email ({user?.email}) to receive important notifications
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" >
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Not Verified
                        </Badge>
                        <Button variant="outline" size="sm" onClick={handleResendVerification} disabled={isResendingVerification} className="min-h-[36px]" >
                          {isResendingVerification ? 'Sending...' : 'Send Verification'}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                  {!user?.country && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] p-[var(--card-padding)] border border-warning/30 rounded-lg bg-warning/5">
                      <div className="flex items-start gap-[var(--space-sm)]">
                        <Globe className="w-5 h-5 text-warning mt-0.5" />
                        <div>
                          <p className="font-medium text-foreground text-[length:var(--text-sm)]">Country Selection Required</p>
                          <p className="text-[length:var(--text-xs)] text-muted-foreground">
                            Set your country in Regional Settings below for accurate pricing
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" >
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Not Set
                      </Badge>
                    </div>
                  )}
                  
                  {user?.needsCurrencyOnboarding && (
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] p-[var(--card-padding)] border border-warning/30 rounded-lg bg-warning/5">
                      <div className="flex items-start gap-[var(--space-sm)]">
                        <DollarSign className="w-5 h-5 text-warning mt-0.5" />
                        <div>
                          <p className="font-medium text-foreground text-[length:var(--text-sm)]">Currency Preference Required</p>
                          <p className="text-[length:var(--text-xs)] text-muted-foreground">
                            Choose your preferred currency in Regional Settings for course pricing
                          </p>
                        </div>
                      </div>
                      <Badge variant="outline" >
                        <AlertCircle className="w-3 h-3 mr-1" />
                        Not Set
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Regional Settings */}
            <Card className="bg-card border-border" data-testid="card-regional-settings">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-card-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-lg)]">
                  <Globe className="h-5 w-5 text-primary" />
                  Regional Settings
                </CardTitle>
                <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                  Set your timezone and preferred currency for display
                </CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] space-y-[var(--space-lg)]">
                <div className="space-y-[var(--space-sm)]">
                  <Label htmlFor="timezone" className="text-foreground text-[length:var(--text-sm)]">Timezone</Label>
                  <Select
                    value={localPreferences.timezone || ''}
                    onValueChange={(value) => handlePreferenceChange('timezone', value)}
                  >
                    <SelectTrigger id="timezone" className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-timezone">
                      <SelectValue placeholder="Select your timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">
                    Used to display purchase history and course schedules in your local time
                  </p>
                </div>

                <Separator className="bg-border" />

                <div className="space-y-[var(--space-sm)]">
                  <Label htmlFor="currency" className="text-foreground text-[length:var(--text-sm)]">Preferred Currency</Label>
                  <Select
                    value={localPreferences.preferredCurrency || ''}
                    onValueChange={(value) => handlePreferenceChange('preferredCurrency', value)}
                  >
                    <SelectTrigger id="currency" className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-currency">
                      <SelectValue placeholder="Select your preferred currency" />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((curr) => (
                        <SelectItem key={curr.value} value={curr.value}>
                          <span className="flex items-center gap-[var(--space-sm)]">
                            <span className="font-mono">{curr.symbol}</span>
                            {curr.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[length:var(--text-xs)] text-muted-foreground">
                    Course prices will be displayed in this currency (converted at current exchange rates)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Language Settings */}
            <LanguagePreferenceSection user={user} />

            {/* Notification Settings */}
            <Card className="bg-card border-border" data-testid="card-notification-settings">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="text-card-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-lg)]">
                  <Bell className="h-5 w-5 text-primary" />
                  Notification Preferences
                </CardTitle>
                <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                  Choose how you want to receive notifications
                </CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] space-y-[var(--space-md)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] p-[var(--card-padding)] border border-border rounded-lg">
                  <div className="space-y-[var(--space-xs)]">
                    <Label htmlFor="email-notifications" className="text-foreground text-[length:var(--text-sm)]">Email Notifications</Label>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      Receive updates about course purchases, new versions, and announcements via email
                    </p>
                  </div>
                  <Switch
                    id="email-notifications"
                    checked={localPreferences.emailNotifications}
                    onCheckedChange={(checked) => handlePreferenceChange('emailNotifications', checked)}
                    data-testid="switch-email-notifications"
                    className="touch-manipulation"
                  />
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] p-[var(--card-padding)] border border-border rounded-lg">
                  <div className="space-y-[var(--space-xs)]">
                    <Label htmlFor="push-notifications" className="text-foreground text-[length:var(--text-sm)]">Push Notifications</Label>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      Get real-time notifications about course activity and updates
                    </p>
                  </div>
                  <Switch
                    id="push-notifications"
                    checked={localPreferences.pushNotifications}
                    onCheckedChange={(checked) => handlePreferenceChange('pushNotifications', checked)}
                    data-testid="switch-push-notifications"
                    className="touch-manipulation"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Privacy Settings */}
            <Card className="bg-card border-border" data-testid="card-privacy-settings">
              <CardHeader className="p-[var(--card-padding)]">
                <CardTitle className="flex items-center gap-[var(--space-sm)] text-card-foreground text-[length:var(--text-lg)]">
                  <Shield className="w-5 h-5 text-primary" />
                  Privacy Settings
                </CardTitle>
                <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                  Control how your profile and statistics are displayed to other players
                </CardDescription>
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] space-y-[var(--space-lg)]">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] p-[var(--card-padding)] border border-border rounded-lg">
                  <div className="space-y-[var(--space-xs)]">
                    <Label htmlFor="stats-public" className="font-medium text-foreground text-[length:var(--text-sm)]">
                      Public Statistics
                    </Label>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      Allow other players to see your game statistics and win rate
                    </p>
                  </div>
                  <Switch
                    id="stats-public"
                    checked={form.watch('isStatsPublic')}
                    onCheckedChange={(checked) => {
                      form.setValue('isStatsPublic', checked);
                      form.handleSubmit(onSubmit)();
                    }}
                    data-testid="switch-stats-public"
                    className="touch-manipulation"
                  />
                </div>

                <div className="p-[var(--card-padding)] border border-border rounded-lg bg-muted/30">
                  <h4 className="font-medium mb-[var(--space-sm)] flex items-center gap-[var(--space-sm)] text-card-foreground text-[length:var(--text-base)]">
                    <GamepadIcon className="w-4 h-4" />
                    Account Information
                  </h4>
                  <div className="space-y-[var(--space-sm)] text-[length:var(--text-sm)] text-muted-foreground">
                    <p><strong className="text-foreground">Gamer Name:</strong> {user.gamerName}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p><strong className="text-foreground">Email:</strong> {user.email}</p>
                      {user.emailVerified ? (
                        <Badge variant="outline" >
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Verified
                        </Badge>
                      ) : (
                        <>
                          <Badge variant="outline" >
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Not Verified
                          </Badge>
                          <Button variant="outline" size="sm" onClick={handleResendVerification} disabled={isResendingVerification} className="h-7 text-xs" >
                            {isResendingVerification ? 'Sending...' : 'Verify'}
                          </Button>
                        </>
                      )}
                    </div>
                    <p><strong className="text-foreground">Account Type:</strong> {user.isAdmin ? 'Administrator' : 'Player'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Save Preferences Button */}
            {hasPreferencesChanges && (
              <div className="flex flex-col sm:flex-row justify-end gap-[var(--space-sm)]">
                <Button variant="outline" onClick={() => {
                    setLocalPreferences(preferences || {
                      timezone: null,
                      preferredCurrency: null,
                      emailNotifications: true,
                      pushNotifications: true,
                    });
                    setHasPreferencesChanges(false);
                  }}
                  className="bg-muted border-border text-foreground hover:bg-muted/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
                  data-testid="button-cancel-preferences"
                >
                  Cancel
                </Button>
                <Button onClick={handleSavePreferences} disabled={updatePreferencesMutation.isPending} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-save-preferences" >
                  {updatePreferencesMutation.isPending ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Preferences
                    </>
                  )}
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </QuizAdminLayout>
  );
};

export default ProfilePage;