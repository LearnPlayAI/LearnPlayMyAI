import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { tzFormat } from '@/utils/timezoneRuntime';
import { 
  Coins, 
  ShoppingCart, 
  Trophy, 
  Award, 
  Users, 
  Plus, 
  Trash2, 
  Save,
  Settings,
  DollarSign,
  History,
  Star,
  RefreshCw,
  Database,
  Zap,
  Edit,
  Pencil,
  Calendar as CalendarIcon,
  Check,
  X,
  Filter,
  Search,
  Sparkles,
  PlayCircle,
  StopCircle
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function GamificationSettings() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [organizationId, setOrganizationId] = useState<string>('');
  const [selectedTab, setSelectedTab] = useState('economy');
  const { terminology, isResolved } = useOrganizationTerminology();

  // Fetch user admin status
  const { data: adminStatus } = useQuery<any>({
    queryKey: ['/api/admin/check'],
  });
  const hasGamificationAccess = !!(adminStatus?.isSuperAdmin || adminStatus?.isCustSuper);

  // Fetch user roles only for scoped non-privileged admin contexts.
  const { data: userRoles } = useQuery<any[]>({
    queryKey: ['/api/user-roles'],
    enabled: !!adminStatus?.isAdmin && !hasGamificationAccess,
  });

  useEffect(() => {
    // Keep page guard aligned with route/nav access rules.
    if (adminStatus && !hasGamificationAccess) {
      navigate('/');
    }
  }, [adminStatus, hasGamificationAccess, navigate]);

  useEffect(() => {
    // SuperAdmin and CustSuper can manage global gamification settings.
    if (hasGamificationAccess) {
      setOrganizationId('global');
    } else if (userRoles && userRoles.length > 0) {
      // For org admins/teachers, get their organization
      const orgRole = userRoles.find(r => ['org_admin', 'teacher', 'team_lead'].includes(r.role));
      if (orgRole) {
        setOrganizationId(orgRole.organizationId);
      }
    }
  }, [hasGamificationAccess, userRoles]);

  if (!adminStatus || !isResolved) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!hasGamificationAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">Only superadmin or customer superadmin users can access gamification settings.</p>
        </div>
      </div>
    );
  }

  if (!organizationId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">Loading organization data...</div>
      </div>
    );
  }

  return (
    <QuizAdminLayout title="Gamification Settings" description="Manage economy, shop pricing, and rewards" activeSection="gamification-settings">
      <div className="max-w-7xl mx-auto p-[var(--container-padding)]">
        {/* Initialize Catalog Button - Privileged Admins (SuperAdmin/CustSuper) */}
        {hasGamificationAccess && (
          <div className="mb-[var(--space-lg)]">
            <InitializeCatalogButton />
          </div>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <div className="grid grid-cols-1 md:grid-cols-[240px_1fr] gap-[var(--space-lg)]">
            <TabsList className="flex flex-col h-auto space-y-2 bg-card/50 border border-border p-[var(--card-padding)] rounded-lg">
              <TabsTrigger 
                value="catalog"
                className="w-full justify-start min-h-[44px] touch-manipulation"
                data-testid="tab-catalog"
              >
                <Star className="w-4 h-4 mr-2" />
                Catalog
              </TabsTrigger>
              <TabsTrigger 
                value="economy"
                className="w-full justify-start min-h-[44px] touch-manipulation"
                data-testid="tab-economy"
              >
                <Coins className="w-4 h-4 mr-2" />
                Economy
              </TabsTrigger>
              <TabsTrigger 
                value="shop"
                className="w-full justify-start min-h-[44px] touch-manipulation"
                data-testid="tab-shop"
              >
                <ShoppingCart className="w-4 h-4 mr-2" />
                Shop Pricing
              </TabsTrigger>
              <TabsTrigger 
                value="challenges"
                className="w-full justify-start min-h-[44px] touch-manipulation"
                data-testid="tab-challenges"
              >
                <Trophy className="w-4 h-4 mr-2" />
                Challenges
              </TabsTrigger>
              <TabsTrigger 
                value="seasonpass"
                className="w-full justify-start min-h-[44px] touch-manipulation"
                data-testid="tab-seasonpass"
              >
                <Award className="w-4 h-4 mr-2" />
                Season Pass
              </TabsTrigger>
              <TabsTrigger 
                value="students"
                className="w-full justify-start min-h-[44px] touch-manipulation"
                data-testid="tab-students"
              >
                <Users className="w-4 h-4 mr-2" />
                {terminology?.learner} Balances
              </TabsTrigger>
            </TabsList>

            <div className="pr-0 sm:pr-4">
              <TabsContent value="catalog" className="mt-0">
                <CatalogTab />
              </TabsContent>

              <TabsContent value="economy" className="mt-0">
                <EconomyTab organizationId={organizationId} />
              </TabsContent>

              <TabsContent value="shop" className="mt-0">
                <ShopPricingTab organizationId={organizationId} />
              </TabsContent>

              <TabsContent value="challenges" className="mt-0">
                <ChallengesTab organizationId={organizationId} />
              </TabsContent>

              <TabsContent value="seasonpass" className="mt-0">
                <SeasonPassTab organizationId={organizationId} />
              </TabsContent>

              <TabsContent value="students" className="mt-0">
                <StudentBalancesTab organizationId={organizationId} />
              </TabsContent>
            </div>
          </div>
        </Tabs>
      </div>
    </QuizAdminLayout>
  );
}

// Economy Tab Component
function EconomyTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const { terminology } = useOrganizationTerminology();
  const [rules, setRules] = useState<Record<string, number>>({});
  const [dirtyRules, setDirtyRules] = useState<Record<string, boolean>>({});

  const isGlobal = organizationId === 'global';
  const scope = isGlobal ? 'global' : 'organization';
  const normalizedOrgId = isGlobal ? null : organizationId;

  const { data: economyRules, isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/gamification/economy', organizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('scope', scope);
      if (normalizedOrgId) params.append('organizationId', normalizedOrgId);
      const response = await fetch(`/api/admin/gamification/economy?${params}`);
      if (!response.ok) throw new Error('Failed to fetch economy rules');
      return response.json();
    },
    enabled: !!organizationId,
  });

  const saveMutation = useMutation({
    mutationFn: async (ruleData: any) => {
      return apiRequest('/api/admin/gamification/economy', {
        method: 'POST',
        body: JSON.stringify({
          ...ruleData,
          scope,
          organizationId: normalizedOrgId,
        }),
      });
    },
    onSuccess: (_savedRule: any, variables: any) => {
      // Mark only the saved rule as clean. Keep unsaved edits on other rows intact.
      if (variables?.actionType) {
        setDirtyRules((prev) => ({ ...prev, [variables.actionType]: false }));
      }
      // Keep cache fresh without clobbering local unsaved edits via full refetch.
      queryClient.setQueryData(['/api/admin/gamification/economy', organizationId], (prev: any[] | undefined) => {
        if (!Array.isArray(prev)) return prev;
        return prev.map((row) =>
          row.actionType === variables?.actionType ? { ...row, coinReward: variables?.coinReward ?? row.coinReward } : row
        );
      });
      toast({ title: 'Saved!', description: 'Economy rules updated successfully.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to save economy rules.', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (economyRules) {
      const incomingMap: Record<string, number> = {};
      economyRules.forEach((rule: any) => {
        incomingMap[rule.actionType] = rule.coinReward;
      });

      // Preserve local edits for dirty rows while updating non-dirty rows from server.
      setRules((prev) => {
        const next = { ...prev };
        Object.entries(incomingMap).forEach(([actionType, coinReward]) => {
          if (!dirtyRules[actionType]) {
            next[actionType] = coinReward;
          }
        });
        return next;
      });
    }
  }, [economyRules, dirtyRules]);

  const actionTypes = [
    { key: 'quiz_win', label: 'Quiz Win', description: 'Coins awarded for winning a quiz match' },
    { key: 'quiz_participation', label: 'Quiz Participation', description: 'Coins for completing a quiz' },
    { key: 'daily_login', label: 'Daily Login', description: 'Coins for logging in each day' },
    { key: 'perfect_score', label: 'Perfect Score', description: 'Bonus for 100% quiz score' },
    { key: 'streak_bonus', label: 'Streak Bonus', description: 'Bonus for consecutive wins' },
  ];

  const handleSave = (actionType: string) => {
    saveMutation.mutate({
      actionType,
      coinReward: rules[actionType] || 0,
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading economy rules...</div>;
  }

  return (
    <div className="space-y-[var(--space-md)]">
      <Card className="bg-card/50 border-border">
        <CardHeader className="p-[var(--card-padding)]">
          <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
            <Coins className="w-5 h-5 text-glow-gold" />
            Coin Reward Rules
          </CardTitle>
          <CardDescription>Configure how many coins {terminology?.learnerPlural?.toLowerCase()} earn for different actions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
          {actionTypes.map(action => (
            <div key={action.key} className="flex flex-col sm:flex-row sm:items-center gap-[var(--space-md)] p-[var(--card-padding)] bg-muted/30 rounded-lg">
              <div className="flex-1">
                <Label className="text-foreground font-semibold">{action.label}</Label>
                <p className="text-sm text-muted-foreground">{action.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  value={rules[action.key] || 0}
                  onChange={(e) => {
                    const value = parseInt(e.target.value) || 0;
                    setRules((prev) => ({ ...prev, [action.key]: value }));
                    setDirtyRules((prev) => ({ ...prev, [action.key]: true }));
                  }}
                  className="w-20 sm:w-24 min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                  data-testid={`input-${action.key}`}
                />
                <Coins className="w-4 h-4 text-glow-gold" />
                <Button onClick={() => handleSave(action.key)}
                  disabled={saveMutation.isPending}
                  className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/80 text-primary-foreground"
                  data-testid={`button-save-${action.key}`}
                >
                  <Save className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// Shop Pricing Tab Component - Now uses dynamic catalog data
function ShopPricingTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const [catalogView, setCatalogView] = useState<'powerups' | 'cosmetics'>('powerups');
  const [editingPrices, setEditingPrices] = useState<Record<string, number>>({});

  // Check if user has privileged admin access for gamification pricing management
  const { data: adminStatus } = useQuery<any>({
    queryKey: ['/api/admin/check'],
  });

  const isPrivilegedAdmin = adminStatus?.isSuperAdmin === true || adminStatus?.isCustSuper === true;

  // Fetch powerup catalog (only if privileged admin)
  const { data: powerups = [], isLoading: loadingPowerups, refetch: refetchPowerups } = useQuery<any[]>({
    queryKey: ['/api/gamification/powerups/catalog'],
    enabled: isPrivilegedAdmin,
  });

  // Fetch cosmetic catalog (only if privileged admin)
  const { data: cosmetics = [], isLoading: loadingCosmetics, refetch: refetchCosmetics } = useQuery<any[]>({
    queryKey: ['/api/gamification/cosmetics/catalog'],
    enabled: isPrivilegedAdmin,
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ id, coinCost, type }: { id: string; coinCost: number; type: 'powerup' | 'cosmetic' }) => {
      const endpoint = type === 'powerup' 
        ? `/api/gamification/powerups/catalog/${id}`
        : `/api/gamification/cosmetics/catalog/${id}`;
      return apiRequest(endpoint, {
        method: 'PATCH',
        body: JSON.stringify({ coinCost }),
      });
    },
    onSuccess: (_data, variables) => {
      if (variables.type === 'powerup') {
        queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/catalog'] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/gamification/cosmetics/catalog'] });
      }
      // Clear editing state for this item
      setEditingPrices(prev => {
        const next = { ...prev };
        delete next[variables.id];
        return next;
      });
      toast({ title: 'Saved!', description: `Price updated to ${variables.coinCost} coins` });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update price', variant: 'destructive' });
    },
  });

  const handlePriceChange = (id: string, value: string) => {
    if (value === '') {
      // Clear editing state if empty
      setEditingPrices(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } else {
      const numValue = parseInt(value) || 0;
      setEditingPrices(prev => ({ ...prev, [id]: numValue }));
    }
  };

  const handlePriceUpdate = (id: string, originalPrice: number, type: 'powerup' | 'cosmetic') => {
    const newPrice = editingPrices[id];
    if (newPrice !== undefined && newPrice !== originalPrice) {
      updatePriceMutation.mutate({ id, coinCost: newPrice, type });
    } else {
      // Revert to original if unchanged
      setEditingPrices(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const getDisplayPrice = (id: string, originalPrice: number) => {
    return editingPrices[id] !== undefined ? editingPrices[id] : originalPrice;
  };

  // Privileged admin-only guard (SuperAdmin/CustSuper)
  if (!isPrivilegedAdmin) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">SuperAdmin or CustSuper access required to manage shop pricing.</p>
      </div>
    );
  }

  const isLoading = loadingPowerups || loadingCosmetics;

  if (isLoading) {
    return <div className="text-muted-foreground">Loading shop pricing...</div>;
  }

  return (
    <div className="space-y-[var(--space-lg)]">
      {/* View Toggle */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button onClick={() => setCatalogView('powerups')}
          variant={catalogView === 'powerups' ? 'default' : 'outline'}
          className={`min-h-[44px] touch-manipulation ${catalogView === 'powerups' ? 'bg-secondary hover:bg-secondary/90 text-secondary-foreground' : 'border-border text-foreground'}`}
          data-testid="button-price-powerups"
        >
          <Zap className="w-4 h-4 mr-2" />
          Powerup Pricing ({powerups.length})
        </Button>
        <Button onClick={() => setCatalogView('cosmetics')}
          variant={catalogView === 'cosmetics' ? 'default' : 'outline'}
          className={`min-h-[44px] touch-manipulation ${catalogView === 'cosmetics' ? 'bg-secondary hover:bg-secondary/90 text-secondary-foreground' : 'border-border text-foreground'}`}
          data-testid="button-price-cosmetics"
        >
          <Star className="w-4 h-4 mr-2" />
          Cosmetic Pricing ({cosmetics.length})
        </Button>
      </div>

      {/* Powerups Pricing */}
      {catalogView === 'powerups' && (
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
              <ShoppingCart className="w-5 h-5 text-secondary" />
              Power-Up Pricing
            </CardTitle>
            <CardDescription>
              Set coin prices for power-ups in the shop. These are the actual catalog prices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {powerups.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No powerups found. Initialize the catalog first.</p>
            ) : (
              powerups.map(item => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-[var(--space-md)] p-[var(--card-padding)] bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Label className="text-foreground font-semibold">{item.name}</Label>
                      <Badge variant="outline" className={` ${item.tier === 'common' ? 'border-muted-foreground text-muted-foreground' : ''} ${item.tier === 'rare' ? 'border-secondary text-secondary' : ''} ${item.tier === 'epic' ? 'border-primary text-primary' : ''} ${item.tier === 'legendary' ? 'border-[var(--game-gold)] text-glow-gold' : ''} `}>
                        {item.tier}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={getDisplayPrice(item.id, item.coinCost)}
                      onChange={(e) => handlePriceChange(item.id, e.target.value)}
                      onBlur={() => handlePriceUpdate(item.id, item.coinCost, 'powerup')}
                      className="w-20 sm:w-24 min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                      data-testid={`input-price-${item.id}`}
                    />
                    <Coins className="w-4 h-4 text-glow-gold" />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Cosmetics Pricing */}
      {catalogView === 'cosmetics' && (
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
              <ShoppingCart className="w-5 h-5 text-secondary" />
              Cosmetic Pricing
            </CardTitle>
            <CardDescription>
              Set coin prices for cosmetics in the shop. These are the actual catalog prices.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {cosmetics.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No cosmetics found. Initialize the catalog first.</p>
            ) : (
              cosmetics.map(item => (
                <div key={item.id} className="flex flex-col sm:flex-row sm:items-center gap-[var(--space-md)] p-[var(--card-padding)] bg-muted/30 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Label className="text-foreground font-semibold">{item.name}</Label>
                      <Badge variant="outline" className={` ${item.tier === 'common' ? 'border-muted-foreground text-muted-foreground' : ''} ${item.tier === 'rare' ? 'border-secondary text-secondary' : ''} ${item.tier === 'epic' ? 'border-primary text-primary' : ''} ${item.tier === 'legendary' ? 'border-[var(--game-gold)] text-glow-gold' : ''} `}>
                        {item.tier}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={getDisplayPrice(item.id, item.coinCost)}
                      onChange={(e) => handlePriceChange(item.id, e.target.value)}
                      onBlur={() => handlePriceUpdate(item.id, item.coinCost, 'cosmetic')}
                      className="w-20 sm:w-24 min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                      data-testid={`input-price-${item.id}`}
                    />
                    <Coins className="w-4 h-4 text-glow-gold" />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Challenges Tab Component
function ChallengesTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const { terminology } = useOrganizationTerminology();
  const [newChallenge, setNewChallenge] = useState({
    title: '',
    description: '',
    challengeType: 'daily',
    goalType: 'quiz_wins',
    goalTarget: 1,
    coinReward: 100,
    xpReward: 0,
  });

  const isGlobal = organizationId === 'global';
  const scope = isGlobal ? 'global' : 'organization';
  const normalizedOrgId = isGlobal ? null : organizationId;

  const { data: challenges, isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/gamification/challenges', organizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('scope', scope);
      if (normalizedOrgId) params.append('organizationId', normalizedOrgId);
      const response = await fetch(`/api/admin/gamification/challenges?${params}`);
      if (!response.ok) throw new Error('Failed to fetch challenges');
      return response.json();
    },
    enabled: !!organizationId,
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/admin/gamification/challenges', {
        method: 'POST',
        body: JSON.stringify({
          ...data,
          scope,
          organizationId: normalizedOrgId,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gamification/challenges', organizationId] });
      toast({ title: 'Created!', description: 'Challenge created successfully.' });
      setNewChallenge({
        title: '',
        description: '',
        challengeType: 'daily',
        goalType: 'quiz_wins',
        goalTarget: 1,
        coinReward: 100,
        xpReward: 0,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/gamification/challenges/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/gamification/challenges', organizationId] });
      toast({ title: 'Deleted!', description: 'Challenge deleted successfully.' });
    },
  });

  const handleCreate = () => {
    if (!newChallenge.title || !newChallenge.description) {
      toast({ title: 'Error', description: 'Please fill in all fields.', variant: 'destructive' });
      return;
    }
    if ((newChallenge.coinReward || 0) <= 0 && (newChallenge.xpReward || 0) <= 0) {
      toast({
        title: 'Error',
        description: 'Set a coin reward, XP reward, or both.',
        variant: 'destructive',
      });
      return;
    }
    createMutation.mutate({
      ...newChallenge,
      isActive: true,
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading challenges...</div>;
  }

  return (
    <div className="space-y-[var(--space-lg)]">
      <Card className="bg-card/50 border-border">
        <CardHeader className="p-[var(--card-padding)]">
          <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
            <Plus className="w-5 h-5 text-primary" />
            Create New Challenge
          </CardTitle>
          <CardDescription>Add daily or weekly challenges for {terminology?.learnerPlural?.toLowerCase()}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)]">
            <div>
              <Label className="text-foreground">Challenge Title</Label>
              <Input
                value={newChallenge.title}
                onChange={(e) => setNewChallenge({ ...newChallenge, title: e.target.value })}
                className="min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                placeholder="Win 3 quizzes"
                data-testid="input-challenge-name"
              />
            </div>
            <div>
              <Label className="text-foreground">Challenge Type</Label>
              <Select value={newChallenge.challengeType} onValueChange={(value) => setNewChallenge({ ...newChallenge, challengeType: value })}>
                <SelectTrigger className="min-h-[44px] touch-manipulation bg-card border-border text-foreground" data-testid="select-challenge-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-foreground">Description</Label>
            <Textarea
              value={newChallenge.description}
              onChange={(e) => setNewChallenge({ ...newChallenge, description: e.target.value })}
              className="min-h-[44px] touch-manipulation bg-card border-border text-foreground"
              placeholder="Complete 3 quiz matches to earn bonus coins"
              data-testid="input-challenge-description"
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)]">
            <div>
              <Label className="text-foreground">Goal Type</Label>
              <Select value={newChallenge.goalType} onValueChange={(value) => setNewChallenge({ ...newChallenge, goalType: value })}>
                <SelectTrigger className="min-h-[44px] touch-manipulation bg-card border-border text-foreground" data-testid="select-goal-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quiz_wins">Quiz Wins</SelectItem>
                  <SelectItem value="quiz_completions">Quiz Completions</SelectItem>
                  <SelectItem value="perfect_scores">Perfect Scores</SelectItem>
                  <SelectItem value="daily_logins">Daily Logins</SelectItem>
                  <SelectItem value="xp_earned">XP Earned</SelectItem>
                  <SelectItem value="lesson_completions">Lesson Completions</SelectItem>
                  <SelectItem value="battle_wins">Battle Wins</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-foreground">Target Value</Label>
              <Input
                type="number"
                min="1"
                value={newChallenge.goalTarget}
                onChange={(e) => setNewChallenge({ ...newChallenge, goalTarget: parseInt(e.target.value) || 1 })}
                className="min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                data-testid="input-challenge-target"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)]">
            <div>
              <Label className="text-foreground">Coin Reward</Label>
              <Input
                type="number"
                min="0"
                value={newChallenge.coinReward}
                onChange={(e) => setNewChallenge({ ...newChallenge, coinReward: parseInt(e.target.value) || 0 })}
                className="min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                data-testid="input-challenge-reward"
              />
            </div>
            <div>
              <Label className="text-foreground">XP Reward</Label>
              <Input
                type="number"
                min="0"
                value={newChallenge.xpReward}
                onChange={(e) => setNewChallenge({ ...newChallenge, xpReward: parseInt(e.target.value) || 0 })}
                className="min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                data-testid="input-challenge-xp-reward"
              />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={createMutation.isPending} className="w-full min-h-[44px] touch-manipulation" data-testid="button-create-challenge" >
            <Plus className="w-4 h-4 mr-2" />
            Create Challenge
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-card/50 border-border">
        <CardHeader className="p-[var(--card-padding)]">
          <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
            <Trophy className="w-5 h-5 text-glow-gold" />
            Active Challenges
          </CardTitle>
        </CardHeader>
        <CardContent className="p-[var(--card-padding)] pt-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">Name</TableHead>
                <TableHead className="text-muted-foreground">Type</TableHead>
                <TableHead className="text-muted-foreground">Target</TableHead>
                <TableHead className="text-muted-foreground">Reward</TableHead>
                <TableHead className="text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {challenges && challenges.length > 0 ? (
                challenges.map((challenge: any) => (
                  <TableRow key={challenge.id} className="border-border">
                    <TableCell className="text-foreground font-semibold">{challenge.title}</TableCell>
                    <TableCell className="text-muted-foreground capitalize">{challenge.challengeType}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {challenge.goalType.replace(/_/g, ' ')} - {challenge.goalTarget}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <div className="flex items-center gap-2 flex-wrap">
                        {(challenge.coinReward || 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-glow-gold">
                            <Coins className="w-4 h-4" />
                            {challenge.coinReward}
                          </span>
                        )}
                        {(challenge.xpReward || 0) > 0 && (
                          <span className="inline-flex items-center gap-1 text-secondary">
                            <Star className="w-4 h-4" />
                            {challenge.xpReward} XP
                          </span>
                        )}
                        {(challenge.coinReward || 0) <= 0 && (challenge.xpReward || 0) <= 0 && (
                          <span className="text-muted-foreground">No reward</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => deleteMutation.mutate(challenge.id)}
                        disabled={deleteMutation.isPending}
                        variant="destructive"
                        size="sm"
                        data-testid={`button-delete-${challenge.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-border">
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    No challenges yet. Create one to get started!
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

// Season Pass Schema for validation
const seasonPassFormSchema = z.object({
  seasonNumber: z.number().min(1, 'Season number must be at least 1'),
  seasonName: z.string().min(1, 'Season name is required'),
  description: z.string().optional(),
  startDate: z.date({ required_error: 'Start date is required' }),
  endDate: z.date({ required_error: 'End date is required' }),
  scope: z.enum(['global', 'organization']),
  organizationId: z.string().optional(),
  coinCost: z.number().min(0, 'Coin cost cannot be negative'),
  coinMultiplier: z.number().min(1, 'Multiplier must be at least 1'),
  xpMultiplier: z.number().min(1, 'Multiplier must be at least 1'),
  advantages: z.array(z.string()).optional(),
}).refine((data) => data.endDate > data.startDate, {
  message: 'End date must be after start date',
  path: ['endDate'],
});

type SeasonPassFormData = z.infer<typeof seasonPassFormSchema>;

// Tier Reward type
interface TierReward {
  tier: number;
  xpRequired: number;
  freeReward: {
    rewardType: 'coins' | 'power_up' | 'cosmetic' | null;
    rewardId: string | null;
    rewardAmount: number | null;
  };
  premiumReward: {
    rewardType: 'coins' | 'power_up' | 'cosmetic' | null;
    rewardId: string | null;
    rewardAmount: number | null;
  };
}

// Catalog Item Picker Modal Component
function CatalogItemPicker({
  open,
  onOpenChange,
  onSelect,
  tier,
  isPremium,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (reward: { rewardType: string; rewardId: string | null; rewardAmount: number | null }) => void;
  tier: number;
  isPremium: boolean;
}) {
  const [rewardType, setRewardType] = useState<'coins' | 'power_up' | 'cosmetic'>('coins');
  const [coinAmount, setCoinAmount] = useState(100);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: powerups = [], isLoading: loadingPowerups } = useQuery<any[]>({
    queryKey: ['/api/gamification/powerups/catalog'],
    enabled: open && rewardType === 'power_up',
  });

  const { data: cosmetics = [], isLoading: loadingCosmetics } = useQuery<any[]>({
    queryKey: ['/api/gamification/cosmetics/catalog'],
    enabled: open && rewardType === 'cosmetic',
  });

  const filteredPowerups = powerups.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredCosmetics = cosmetics.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.cosmeticType.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = () => {
    if (rewardType === 'coins') {
      onSelect({ rewardType: 'coins', rewardId: null, rewardAmount: coinAmount });
    } else {
      if (selectedId) {
        onSelect({ rewardType, rewardId: selectedId, rewardAmount: null });
      }
    }
    onOpenChange(false);
    setSelectedId(null);
    setSearchTerm('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Select Reward for Tier {tier} ({isPremium ? 'Premium' : 'Free'})
          </DialogTitle>
          <DialogDescription>
            Choose the type of reward and configure it
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-foreground mb-2 block">Reward Type</Label>
            <RadioGroup
              value={rewardType}
              onValueChange={(value: any) => {
                setRewardType(value);
                setSelectedId(null);
              }}
              className="flex gap-4"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="coins" id="coins" data-testid="radio-coins" />
                <Label htmlFor="coins" className="text-foreground cursor-pointer flex items-center gap-2">
                  <Coins className="w-4 h-4 text-glow-gold" />
                  Coins
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="power_up" id="power_up" data-testid="radio-powerup" />
                <Label htmlFor="power_up" className="text-foreground cursor-pointer flex items-center gap-2">
                  <Zap className="w-4 h-4 text-primary" />
                  Power-up
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="cosmetic" id="cosmetic" data-testid="radio-cosmetic" />
                <Label htmlFor="cosmetic" className="text-foreground cursor-pointer flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-secondary" />
                  Cosmetic
                </Label>
              </div>
            </RadioGroup>
          </div>

          {rewardType === 'coins' && (
            <div>
              <Label className="text-foreground mb-2 block">Coin Amount</Label>
              <Input
                type="number"
                min="0"
                value={coinAmount}
                onChange={(e) => setCoinAmount(parseInt(e.target.value) || 0)}
                className="bg-card border-border text-foreground"
                data-testid="input-coin-amount"
              />
            </div>
          )}

          {rewardType === 'power_up' && (
            <div className="space-y-3">
              <div>
                <Label className="text-foreground mb-2 block">Search Power-ups</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-card border-border text-foreground pl-10"
                    data-testid="input-search-powerups"
                  />
                </div>
              </div>
              <ScrollArea className="h-64 bg-card/50 rounded-lg border border-border">
                {loadingPowerups ? (
                  <div className="p-4 text-muted-foreground text-center">Loading power-ups...</div>
                ) : filteredPowerups.length === 0 ? (
                  <div className="p-4 text-muted-foreground text-center">No power-ups found</div>
                ) : (
                  <div className="space-y-2 p-2">
                    {filteredPowerups.map((powerup) => (
                      <div
                        key={powerup.id}
                        onClick={() => setSelectedId(powerup.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedId === powerup.id
                            ? 'bg-secondary border border-primary'
                            : 'bg-card hover:bg-muted border border-border'
                        }`}
                        data-testid={`powerup-option-${powerup.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{powerup.name}</span>
                              <Badge variant="outline" className={` ${powerup.tier === 'common' ? 'border-muted-foreground text-muted-foreground' : ''} ${powerup.tier === 'rare' ? 'border-secondary text-secondary' : ''} ${powerup.tier === 'epic' ? 'border-primary text-primary' : ''} ${powerup.tier === 'legendary' ? 'border-[var(--game-gold)] text-glow-gold' : ''} `}>
                                {powerup.tier}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{powerup.description}</p>
                          </div>
                          {selectedId === powerup.id && (
                            <Check className="w-5 h-5 text-foreground flex-shrink-0 ml-2" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}

          {rewardType === 'cosmetic' && (
            <div className="space-y-3">
              <div>
                <Label className="text-foreground mb-2 block">Search Cosmetics</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name or type..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-card border-border text-foreground pl-10"
                    data-testid="input-search-cosmetics"
                  />
                </div>
              </div>
              <ScrollArea className="h-64 bg-card/50 rounded-lg border border-border">
                {loadingCosmetics ? (
                  <div className="p-4 text-muted-foreground text-center">Loading cosmetics...</div>
                ) : filteredCosmetics.length === 0 ? (
                  <div className="p-4 text-muted-foreground text-center">No cosmetics found</div>
                ) : (
                  <div className="space-y-2 p-2">
                    {filteredCosmetics.map((cosmetic) => (
                      <div
                        key={cosmetic.id}
                        onClick={() => setSelectedId(cosmetic.id)}
                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                          selectedId === cosmetic.id
                            ? 'bg-secondary border border-secondary/80'
                            : 'bg-card hover:bg-muted border border-border'
                        }`}
                        data-testid={`cosmetic-option-${cosmetic.id}`}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground">{cosmetic.name}</span>
                              <Badge variant="outline" >
                                {cosmetic.cosmeticType}
                              </Badge>
                              <Badge variant="outline" className={` ${cosmetic.tier === 'common' ? 'border-muted-foreground text-muted-foreground' : ''} ${cosmetic.tier === 'rare' ? 'border-secondary text-secondary' : ''} ${cosmetic.tier === 'epic' ? 'border-primary text-primary' : ''} ${cosmetic.tier === 'legendary' ? 'border-[var(--game-gold)] text-glow-gold' : ''} `}>
                                {cosmetic.tier}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground mt-1">{cosmetic.description}</p>
                          </div>
                          {selectedId === cosmetic.id && (
                            <Check className="w-5 h-5 text-foreground flex-shrink-0 ml-2" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}
            className="border-border text-foreground hover:bg-muted"
            data-testid="button-cancel-reward"
          >
            Cancel
          </Button>
          <Button onClick={handleSelect} disabled={(rewardType !== 'coins' && !selectedId)} data-testid="button-select-reward" >
            Select Reward
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tier Builder Component
function TierBuilder({
  tiers,
  onTiersChange,
}: {
  tiers: TierReward[];
  onTiersChange: (tiers: TierReward[]) => void;
}) {
  const [editingTier, setEditingTier] = useState<{ tier: number; isPremium: boolean } | null>(null);

  const handleRewardSelect = (reward: { rewardType: string; rewardId: string | null; rewardAmount: number | null }) => {
    if (!editingTier) return;

    const newTiers = tiers.map(t => {
      if (t.tier === editingTier.tier) {
        if (editingTier.isPremium) {
          return {
            ...t,
            premiumReward: {
              rewardType: reward.rewardType as any,
              rewardId: reward.rewardId,
              rewardAmount: reward.rewardAmount,
            },
          };
        } else {
          return {
            ...t,
            freeReward: {
              rewardType: reward.rewardType as any,
              rewardId: reward.rewardId,
              rewardAmount: reward.rewardAmount,
            },
          };
        }
      }
      return t;
    });

    onTiersChange(newTiers);
    setEditingTier(null);
  };

  const getRewardDisplay = (reward: TierReward['freeReward']) => {
    if (!reward) return <span className="text-muted-foreground">Not set</span>;
    if (!reward.rewardType) return <span className="text-muted-foreground">Not set</span>;

    if (reward.rewardType === 'coins') {
      return (
        <span className="flex items-center gap-1 text-glow-gold">
          <Coins className="w-4 h-4" />
          {reward.rewardAmount} coins
        </span>
      );
    }

    if (reward.rewardType === 'power_up') {
      return (
        <span className="flex items-center gap-1 text-primary">
          <Zap className="w-4 h-4" />
          Power-up
        </span>
      );
    }

    if (reward.rewardType === 'cosmetic') {
      return (
        <span className="flex items-center gap-1 text-secondary">
          <Sparkles className="w-4 h-4" />
          Cosmetic
        </span>
      );
    }

    return <span className="text-muted-foreground">Unknown</span>;
  };

  return (
    <div className="space-y-4">
      <div className="bg-card/50 rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground font-semibold">Tier</TableHead>
              <TableHead className="text-muted-foreground font-semibold">XP Required</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Free Reward</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Premium Reward</TableHead>
              <TableHead className="text-muted-foreground font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tiers.map((tier) => (
              <TableRow key={tier.tier} className="border-border">
                <TableCell className="text-foreground font-semibold">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-glow-gold" />
                    {tier.tier}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">{tier.xpRequired.toLocaleString()} XP</TableCell>
                <TableCell className="text-muted-foreground">
                  {getRewardDisplay(tier.freeReward)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {tier.tier <= 4 ? (
                    <span className="text-muted-foreground text-xs">Free tier</span>
                  ) : (
                    getRewardDisplay(tier.premiumReward)
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setEditingTier({ tier: tier.tier, isPremium: false })}
                      className="border-border text-foreground hover:bg-muted"
                      data-testid={`button-edit-free-${tier.tier}`}
                    >
                      <Edit className="w-3 h-3 mr-1" />
                      Free
                    </Button>
                    {tier.tier > 4 && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingTier({ tier: tier.tier, isPremium: true })}
                        className="border-secondary text-primary hover:bg-primary/10"
                        data-testid={`button-edit-premium-${tier.tier}`}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        Premium
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <CatalogItemPicker
        open={!!editingTier}
        onOpenChange={(open) => !open && setEditingTier(null)}
        onSelect={handleRewardSelect}
        tier={editingTier?.tier || 1}
        isPremium={editingTier?.isPremium || false}
      />
    </div>
  );
}

// Season Pass Editor Dialog
function SeasonPassEditorDialog({
  open,
  onOpenChange,
  seasonPass,
  organizationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  seasonPass?: any;
  organizationId: string;
}) {
  const { toast } = useToast();
  const [showTierBuilder, setShowTierBuilder] = useState(false);
  const [advantagesInput, setAdvantagesInput] = useState('');
  
  // Initialize tier rewards (12 tiers with 1000 XP increment per tier)
  const [tierRewards, setTierRewards] = useState<TierReward[]>(
    Array.from({ length: 12 }, (_, i) => ({
      tier: i + 1,
      xpRequired: (i + 1) * 1000,
      freeReward: { rewardType: null, rewardId: null, rewardAmount: null },
      premiumReward: { rewardType: null, rewardId: null, rewardAmount: null },
    }))
  );

  const isGlobal = organizationId === 'global';

  const form = useForm<SeasonPassFormData>({
    resolver: zodResolver(seasonPassFormSchema),
    defaultValues: {
      seasonNumber: seasonPass?.seasonNumber || 1,
      seasonName: seasonPass?.seasonName || '',
      description: seasonPass?.description || '',
      startDate: seasonPass?.startDate ? new Date(seasonPass.startDate) : new Date(),
      endDate: seasonPass?.endDate ? new Date(seasonPass.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      scope: isGlobal ? 'global' : 'organization',
      organizationId: isGlobal ? undefined : organizationId,
      coinCost: seasonPass?.coinCost || 1000,
      coinMultiplier: seasonPass?.coinMultiplier ? parseFloat(seasonPass.coinMultiplier) : 1.5,
      xpMultiplier: seasonPass?.xpMultiplier ? parseFloat(seasonPass.xpMultiplier) : 1.5,
      advantages: [],
    },
  });

  // Load existing season pass data when editing
  useEffect(() => {
    // Reset form values when seasonPass changes
    if (seasonPass) {
      form.reset({
        seasonNumber: seasonPass.seasonNumber || 1,
        seasonName: seasonPass.seasonName || '',
        description: seasonPass.description || '',
        startDate: seasonPass.startDate ? new Date(seasonPass.startDate) : new Date(),
        endDate: seasonPass.endDate ? new Date(seasonPass.endDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        scope: seasonPass.scope || (isGlobal ? 'global' : 'organization'),
        organizationId: seasonPass.organizationId || (isGlobal ? undefined : organizationId),
        coinCost: seasonPass.coinCost || 1000,
        coinMultiplier: seasonPass.coinMultiplier ? parseFloat(seasonPass.coinMultiplier) : 1.5,
        xpMultiplier: seasonPass.xpMultiplier ? parseFloat(seasonPass.xpMultiplier) : 1.5,
        advantages: [],
      });
    } else {
      // Reset to default values for new season pass
      form.reset({
        seasonNumber: 1,
        seasonName: '',
        description: '',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        scope: isGlobal ? 'global' : 'organization',
        organizationId: isGlobal ? undefined : organizationId,
        coinCost: 1000,
        coinMultiplier: 1.5,
        xpMultiplier: 1.5,
        advantages: [],
      });
      
      // Reset tier rewards to defaults
      setTierRewards(Array.from({ length: 12 }, (_, i) => ({
        tier: i + 1,
        xpRequired: (i + 1) * 1000,
        freeReward: { rewardType: null, rewardId: null, rewardAmount: null },
        premiumReward: { rewardType: null, rewardId: null, rewardAmount: null },
      })));
    }
    
    if (seasonPass?.tierDefinitions) {
      const existingTiers = JSON.parse(
        typeof seasonPass.tierDefinitions === 'string'
          ? seasonPass.tierDefinitions
          : JSON.stringify(seasonPass.tierDefinitions)
      );
      if (Array.isArray(existingTiers) && existingTiers.length > 0) {
        // Normalize tier data: check if backend returned raw columns or nested objects
        const normalizedTiers = existingTiers.map((tier: any) => {
          // If tier already has nested freeReward/premiumReward objects, use as-is
          if (tier.freeReward && typeof tier.freeReward === 'object') {
            return tier;
          }
          
          // Otherwise, transform raw columns to nested object structure
          return {
            tier: tier.tier,
            xpRequired: tier.xpRequired || tier.requiredXP || (tier.tier * 1000),
            freeReward: {
              rewardType: tier.freeRewardType || null,
              rewardId: tier.freeRewardId || null,
              rewardAmount: tier.freeRewardAmount || null,
            },
            premiumReward: {
              rewardType: tier.premiumRewardType || null,
              rewardId: tier.premiumRewardId || null,
              rewardAmount: tier.premiumRewardAmount || null,
            },
          };
        });
        
        // Ensure all 12 tiers are present with proper defaults
        const completeTiers = Array.from({ length: 12 }, (_, i) => {
          const existingTier = normalizedTiers.find((t: any) => t.tier === i + 1);
          return existingTier || {
            tier: i + 1,
            xpRequired: (i + 1) * 1000,
            freeReward: { rewardType: null, rewardId: null, rewardAmount: null },
            premiumReward: { rewardType: null, rewardId: null, rewardAmount: null },
          };
        });
        
        setTierRewards(completeTiers);
      }
    }

    if (seasonPass?.advantages) {
      const advantagesArray = Array.isArray(seasonPass.advantages)
        ? seasonPass.advantages
        : typeof seasonPass.advantages === 'string'
        ? [seasonPass.advantages]
        : [];
      setAdvantagesInput(advantagesArray.join('\n'));
      form.setValue('advantages', advantagesArray);
    }
  }, [seasonPass, open]);

  const saveMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = seasonPass?.id
        ? `/api/season-pass/${seasonPass.id}`
        : '/api/season-pass';
      const method = seasonPass?.id ? 'PATCH' : 'POST';

      return apiRequest(endpoint, {
        method,
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/season-pass/list'] });
      toast({ title: 'Success!', description: `Season pass ${seasonPass?.id ? 'updated' : 'created'} successfully.` });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save season pass.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: SeasonPassFormData) => {
    const advantagesArray = advantagesInput
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const payload = {
      seasonNumber: data.seasonNumber,
      seasonName: data.seasonName,
      description: data.description || '',
      startDate: data.startDate.toISOString(),
      endDate: data.endDate.toISOString(),
      scope: data.scope,
      organizationId: data.scope === 'organization' ? data.organizationId : null,
      coinCost: data.coinCost,
      coinMultiplier: data.coinMultiplier.toFixed(2),
      xpMultiplier: data.xpMultiplier.toFixed(2),
      advantages: advantagesArray,
      tierDefinitions: tierRewards,
    };

    saveMutation.mutate(payload);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Award className="w-5 h-5 text-primary" />
            {seasonPass ? 'Edit Season Pass' : 'Create New Season Pass'}
          </DialogTitle>
          <DialogDescription>
            Configure season pass settings and tier rewards
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {!showTierBuilder ? (
              <>
                {/* Basic Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="seasonNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Season Number</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                            className="bg-card border-border text-foreground"
                            data-testid="input-season-number"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="seasonName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Season Name</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Season 1: The Beginning"
                            className="bg-card border-border text-foreground"
                            data-testid="input-season-name"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Description</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Describe this season pass..."
                          className="bg-card border-border text-foreground"
                          rows={3}
                          data-testid="input-description"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">Start Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-start-date" >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? tzFormat(field.value, 'PPP') : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-card border-border">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground">End Date</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button variant="outline" className="w-full justify-start text-left font-normal" data-testid="button-end-date" >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {field.value ? tzFormat(field.value, 'PPP') : <span>Pick a date</span>}
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0 bg-card border-border">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="coinCost"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground flex items-center gap-2">
                          <Coins className="w-4 h-4 text-glow-gold" />
                          Coin Cost
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                            className="bg-card border-border text-foreground"
                            data-testid="input-coin-cost"
                          />
                        </FormControl>
                        <FormDescription>Cost to unlock premium pass</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="coinMultiplier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground flex items-center gap-2">
                          <Coins className="w-4 h-4 text-glow-gold" />
                          Coin Multiplier
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                            className="bg-card border-border text-foreground"
                            data-testid="input-coin-multiplier"
                          />
                        </FormControl>
                        <FormDescription>e.g., 2 for 2x coins</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="xpMultiplier"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground flex items-center gap-2">
                          <Star className="w-4 h-4 text-secondary" />
                          XP Multiplier
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            step="0.1"
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 1)}
                            className="bg-card border-border text-foreground"
                            data-testid="input-xp-multiplier"
                          />
                        </FormControl>
                        <FormDescription>e.g., 1.5 for 1.5x XP</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div>
                  <Label className="text-foreground mb-2 block">Premium Pass Advantages</Label>
                  <Textarea
                    value={advantagesInput}
                    onChange={(e) => setAdvantagesInput(e.target.value)}
                    className="bg-card border-border text-foreground"
                    placeholder="Enter each advantage on a new line&#10;e.g.,&#10;Double XP rewards&#10;Exclusive cosmetics&#10;Bonus coins per tier"
                    rows={4}
                    data-testid="input-advantages"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Enter each advantage on a new line</p>
                </div>

                <div className="flex gap-2">
                  <Button type="button" onClick={() => setShowTierBuilder(true)}
                    className="flex-1 bg-secondary hover:bg-secondary/90"
                    data-testid="button-configure-tiers"
                  >
                    <Trophy className="w-4 h-4 mr-2" />
                    Configure Tier Rewards
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-foreground">Configure Tier Rewards</h3>
                    <Button type="button" variant="outline" onClick={() => setShowTierBuilder(false)}
                      className="border-border text-foreground hover:bg-muted"
                      data-testid="button-back-to-settings"
                    >
                      Back to Settings
                    </Button>
                  </div>

                  <div className="bg-secondary/10 border border-secondary/50 rounded-lg p-4">
                    <p className="text-sm text-secondary/80">
                      <strong>Note:</strong> Tiers 1-4 are available to all players (free tier).
                      Tiers 5-12 require premium pass purchase to unlock rewards.
                    </p>
                  </div>

                  <TierBuilder tiers={tierRewards} onTiersChange={setTierRewards} />
                </div>
              </>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => {
                  onOpenChange(false);
                  setShowTierBuilder(false);
                }}
                className="border-border text-foreground hover:bg-muted"
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              {!showTierBuilder && (
                <Button type="submit" disabled={saveMutation.isPending} data-testid="button-save-season-pass" >
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? 'Saving...' : seasonPass ? 'Update Season Pass' : 'Create Season Pass'}
                </Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

// Season Pass Tab Component
function SeasonPassTab({ organizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedPass, setSelectedPass] = useState<any>(null);

  const { data: seasonPasses = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/season-pass/list'],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/season-pass/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/season-pass/list'] });
      toast({ title: 'Deleted!', description: 'Season pass deleted successfully.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete season pass.',
        variant: 'destructive',
      });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/season-pass/${id}/activate`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/season-pass/list'] });
      toast({ title: 'Activated!', description: 'Season pass activated successfully.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to activate season pass.',
        variant: 'destructive',
      });
    },
  });

  const expireMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/season-pass/${id}/expire`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/season-pass/list'] });
      toast({ title: 'Expired!', description: 'Season pass marked as expired.' });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to expire season pass.',
        variant: 'destructive',
      });
    },
  });

  const filteredPasses = seasonPasses.filter(pass => {
    if (statusFilter === 'all') return true;
    return pass.status === statusFilter;
  });

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; text: string }> = {
      draft: { color: 'bg-muted text-muted-foreground', text: 'Draft' },
      scheduled: { color: 'bg-secondary text-secondary/10', text: 'Scheduled' },
      active: { color: 'bg-[var(--game-success)] text-foreground', text: 'Active' },
      expired: { color: 'bg-destructive text-destructive-foreground', text: 'Expired' },
    };

    const variant = variants[status] || variants.draft;
    return (
      <Badge className={variant.color} data-testid={`badge-status-${status}`}>
        {variant.text}
      </Badge>
    );
  };

  const handleCreateNew = () => {
    setSelectedPass(null);
    setEditorOpen(true);
  };

  const handleEdit = (pass: any) => {
    setSelectedPass(pass);
    setEditorOpen(true);
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading season passes...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header with filters and create button */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setStatusFilter('all')}
            variant={statusFilter === 'all' ? 'default' : 'outline'}
            size="sm"
            className={statusFilter === 'all' ? 'bg-secondary hover:bg-secondary/90' : 'border-border text-foreground hover:bg-muted'}
            data-testid="filter-all"
          >
            <Filter className="w-4 h-4 mr-1" />
            All
          </Button>
          <Button onClick={() => setStatusFilter('draft')}
            variant={statusFilter === 'draft' ? 'default' : 'outline'}
            size="sm"
            className={statusFilter === 'draft' ? 'bg-muted hover:bg-muted/80' : 'border-border text-foreground hover:bg-muted'}
            data-testid="filter-draft"
          >
            Draft
          </Button>
          <Button onClick={() => setStatusFilter('scheduled')}
            variant={statusFilter === 'scheduled' ? 'default' : 'outline'}
            size="sm"
            className={statusFilter === 'scheduled' ? 'bg-secondary hover:bg-secondary/90' : 'border-border text-foreground hover:bg-muted'}
            data-testid="filter-scheduled"
          >
            Scheduled
          </Button>
          <Button onClick={() => setStatusFilter('active')}
            variant={statusFilter === 'active' ? 'default' : 'outline'}
            size="sm"
            className={statusFilter === 'active' ? 'bg-[var(--game-success)] hover:bg-[var(--game-success)]/80' : 'border-border text-foreground hover:bg-muted'}
            data-testid="filter-active"
          >
            Active
          </Button>
          <Button onClick={() => setStatusFilter('expired')}
            variant={statusFilter === 'expired' ? 'default' : 'outline'}
            size="sm"
            className={statusFilter === 'expired' ? 'bg-destructive hover:bg-destructive/80' : 'border-border text-foreground hover:bg-muted'}
            data-testid="filter-expired"
          >
            Expired
          </Button>
        </div>

        <Button onClick={handleCreateNew} data-testid="button-create-new" >
          <Plus className="w-4 h-4 mr-2" />
          Create New Season
        </Button>
      </div>

      {/* Season Pass List */}
      <Card className="bg-card/50 border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <Trophy className="w-5 h-5 text-glow-gold" />
            Season Passes
          </CardTitle>
          <CardDescription>
            Manage season pass configurations and rewards
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredPasses.length === 0 ? (
            <div className="text-center py-12">
              <Trophy className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground text-lg mb-2">No season passes found</p>
              <p className="text-muted-foreground text-sm mb-4">
                {statusFilter === 'all' 
                  ? 'Create your first season pass to get started'
                  : `No ${statusFilter} season passes`
                }
              </p>
              {statusFilter === 'all' && (
                <Button onClick={handleCreateNew} data-testid="button-create-first" >
                  <Plus className="w-4 h-4 mr-2" />
                  Create New Season
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Season</TableHead>
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Date Range</TableHead>
                  <TableHead className="text-muted-foreground">Price</TableHead>
                  <TableHead className="text-muted-foreground">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPasses.map((pass) => (
                  <TableRow key={pass.id} className="border-border">
                    <TableCell className="text-foreground font-semibold">
                      Season {pass.seasonNumber}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{pass.seasonName}</TableCell>
                    <TableCell>{getStatusBadge(pass.status)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(pass.startDate).toLocaleDateString()} - {new Date(pass.endDate).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-glow-gold flex items-center gap-1">
                      <Coins className="w-4 h-4" />
                      {pass.coinCost || 0}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleEdit(pass)}
                          className="border-border text-foreground hover:bg-muted"
                          data-testid={`button-edit-${pass.id}`}
                        >
                          <Edit className="w-3 h-3" />
                        </Button>
                        
                        {(pass.status === 'draft' || pass.status === 'scheduled') && (
                          <Button size="sm" onClick={() => activateMutation.mutate(pass.id)}
                            disabled={activateMutation.isPending}
                            className="bg-[var(--game-success)] hover:bg-[var(--game-success)]/80"
                            data-testid={`button-activate-${pass.id}`}
                          >
                            <PlayCircle className="w-3 h-3" />
                          </Button>
                        )}
                        
                        {pass.status === 'active' && (
                          <Button size="sm" onClick={() => expireMutation.mutate(pass.id)}
                            disabled={expireMutation.isPending}
                            className="bg-accent hover:bg-accent/80"
                            data-testid={`button-expire-${pass.id}`}
                          >
                            <StopCircle className="w-3 h-3" />
                          </Button>
                        )}
                        
                        {pass.status === 'draft' && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive" data-testid={`button-delete-${pass.id}`} >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="bg-card border-border">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-foreground">Delete Season Pass</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete "{pass.seasonName}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="border-border text-foreground hover:bg-muted">
                                  Cancel
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteMutation.mutate(pass.id)}
                                  className="bg-destructive hover:bg-destructive/80"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <SeasonPassEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        seasonPass={selectedPass}
        organizationId={organizationId}
      />
    </div>
  );
}

// Student Balances Tab Component
function StudentBalancesTab({ organizationId: propOrganizationId }: { organizationId: string }) {
  const { toast } = useToast();
  const { terminology } = useOrganizationTerminology();
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [adjustmentAmount, setAdjustmentAmount] = useState(0);
  const [adjustmentReason, setAdjustmentReason] = useState('');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>('');
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all-grades');
  const [selectedSubUnitId, setSelectedSubUnitId] = useState<string>('all-classes');

  const isSuperAdmin = propOrganizationId === 'global';

  // Fetch organizations for super-admin dropdown
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: isSuperAdmin,
  });

  // Auto-select first organization for super-admins or use prop for regular admins
  useEffect(() => {
    if (isSuperAdmin && organizations.length > 0 && !selectedOrganizationId) {
      setSelectedOrganizationId(organizations[0].id);
    } else if (!isSuperAdmin && propOrganizationId) {
      setSelectedOrganizationId(propOrganizationId);
    }
  }, [isSuperAdmin, organizations, selectedOrganizationId, propOrganizationId]);

  // Reset grade/class filters when organization changes
  useEffect(() => {
    setSelectedUnitId('all-grades');
    setSelectedSubUnitId('all-classes');
  }, [selectedOrganizationId]);

  // Use selected org for queries (either from dropdown or prop)
  const effectiveOrganizationId = selectedOrganizationId;

  // Fetch organization units (grades)
  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/units', effectiveOrganizationId],
    queryFn: async () => {
      const url = `/api/organization/units?organizationId=${effectiveOrganizationId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch units');
      return response.json();
    },
    enabled: !!effectiveOrganizationId,
  });

  // Fetch sub-units (classes) for selected grade
  const { data: subUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/organization/sub-units', selectedUnitId, effectiveOrganizationId],
    queryFn: async () => {
      const url = `/api/organization/sub-units/${selectedUnitId}?organizationId=${effectiveOrganizationId}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch sub-units');
      return response.json();
    },
    enabled: !!effectiveOrganizationId && selectedUnitId !== 'all-grades',
  });

  // Build query string with filters
  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.append('organizationId', effectiveOrganizationId);
    if (selectedUnitId && selectedUnitId !== 'all-grades') {
      params.append('unitId', selectedUnitId);
    }
    if (selectedSubUnitId && selectedSubUnitId !== 'all-classes') {
      params.append('subUnitId', selectedSubUnitId);
    }
    return params.toString();
  };

  const queryString = buildQueryString();

  const { data: students, isLoading } = useQuery<any[]>({
    queryKey: [`/api/admin/gamification/student-balances`, effectiveOrganizationId, selectedUnitId, selectedSubUnitId],
    queryFn: async () => {
      const response = await fetch(`/api/admin/gamification/student-balances?${queryString}`);
      if (!response.ok) throw new Error('Failed to fetch students');
      return response.json();
    },
    enabled: !!effectiveOrganizationId,
  });

  const adjustMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/admin/gamification/adjust-coins', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      // Invalidate with the correct query key that includes all filter parameters
      queryClient.invalidateQueries({ 
        queryKey: ['/api/admin/gamification/student-balances', effectiveOrganizationId, selectedUnitId, selectedSubUnitId] 
      });
      toast({ title: 'Success!', description: 'Coin balance adjusted successfully.' });
      setSelectedStudent(null);
      setAdjustmentAmount(0);
      setAdjustmentReason('');
    },
  });

  const handleAdjust = () => {
    if (!selectedStudent || !adjustmentReason) {
      toast({ title: 'Error', description: `Please select a ${terminology?.learner?.toLowerCase()} and provide a reason.`, variant: 'destructive' });
      return;
    }
    adjustMutation.mutate({
      userId: selectedStudent.id,
      organizationId: effectiveOrganizationId,
      amount: adjustmentAmount,
      reason: adjustmentReason,
    });
  };

  if (isLoading) {
    return <div className="text-muted-foreground">Loading {terminology?.learner?.toLowerCase()} balances...</div>;
  }

  return (
    <div className="space-y-[var(--space-lg)]">
      <Card className="bg-card/50 border-border">
        <CardHeader className="p-[var(--card-padding)]">
          <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
            <Users className="w-5 h-5 text-secondary" />
            {terminology?.learner} Coin Balances
          </CardTitle>
          <CardDescription>View and manage {terminology?.learner?.toLowerCase()} coin balances</CardDescription>
        </CardHeader>
        <CardContent className="p-[var(--card-padding)] pt-0">
          {/* Filters */}
          <div className="mb-[var(--space-lg)] space-y-[var(--space-md)]">
            {/* Organization Filter (Super-Admin only) */}
            {isSuperAdmin && (
              <div>
                <Label className="text-foreground mb-2 block">Filter by Organization</Label>
                <Select value={selectedOrganizationId} onValueChange={(value) => {
                  setSelectedOrganizationId(value);
                  setSelectedUnitId('all-grades');
                  setSelectedSubUnitId('all-classes');
                }} data-testid="select-student-organization-filter">
                  <SelectTrigger className="min-h-[44px] touch-manipulation bg-card border-border text-foreground">
                    <SelectValue placeholder="Select Organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Grade and Class Filters */}
            {effectiveOrganizationId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                {/* Grade Filter */}
                <div>
                  <Label className="text-foreground mb-2 block">Filter by {terminology?.unit}</Label>
                  <Select value={selectedUnitId} onValueChange={(value) => {
                    setSelectedUnitId(value);
                    setSelectedSubUnitId('all-classes');
                  }} data-testid="select-student-grade-filter">
                    <SelectTrigger className="min-h-[44px] touch-manipulation bg-card border-border text-foreground">
                      <SelectValue placeholder={`All ${terminology?.unitPlural}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-grades">All {terminology?.unitPlural}</SelectItem>
                      {units.map((unit) => (
                        <SelectItem key={unit.id} value={unit.id}>
                          {unit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Class Filter */}
                <div>
                  <Label className="text-foreground mb-2 block">Filter by {terminology?.subUnit}</Label>
                  <Select 
                    value={selectedSubUnitId} 
                    onValueChange={setSelectedSubUnitId}
                    disabled={selectedUnitId === 'all-grades'}
                    data-testid="select-student-class-filter"
                  >
                    <SelectTrigger className="min-h-[44px] touch-manipulation bg-card border-border text-foreground disabled:opacity-50">
                      <SelectValue placeholder={`All ${terminology?.subUnitPlural}`} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all-classes">All {terminology?.subUnitPlural}</SelectItem>
                      {subUnits.map((subUnit) => (
                        <SelectItem key={subUnit.id} value={subUnit.id}>
                          {subUnit.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </div>
          
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border">
                <TableHead className="text-muted-foreground">{terminology?.learner}</TableHead>
                <TableHead className="text-muted-foreground">Email</TableHead>
                {isSuperAdmin && (
                  <TableHead className="text-muted-foreground">Organization</TableHead>
                )}
                <TableHead className="text-muted-foreground">Level</TableHead>
                <TableHead className="text-muted-foreground">XP</TableHead>
                <TableHead className="text-muted-foreground">Balance</TableHead>
                <TableHead className="text-muted-foreground">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students && students.length > 0 ? (
                students.map((student: any) => (
                  <TableRow key={student.id} className="border-border">
                    <TableCell className="text-foreground font-semibold">
                      {student.gamerName || `${student.firstName} ${student.lastName}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{student.email}</TableCell>
                    {isSuperAdmin && (
                      <TableCell className="text-muted-foreground">{student.organizationName || 'N/A'}</TableCell>
                    )}
                    <TableCell className="text-primary">{student.currentLevel}</TableCell>
                    <TableCell className="text-secondary">{student.currentXP}</TableCell>
                    <TableCell className="text-glow-gold flex items-center gap-1">
                      <Coins className="w-4 h-4" />
                      {student.coinBalance || 0}
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => setSelectedStudent(student)}
                        size="sm"
                        className="bg-secondary hover:bg-secondary/90"
                        data-testid={`button-adjust-${student.id}`}
                      >
                        <DollarSign className="w-4 h-4 mr-1" />
                        Adjust
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow className="border-border">
                  <TableCell colSpan={isSuperAdmin ? 7 : 6} className="text-center text-muted-foreground">
                    No {terminology?.learnerPlural?.toLowerCase()} found{isSuperAdmin ? ' across all organizations' : ' in this organization'}.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {selectedStudent && (
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <CardTitle className="flex items-center gap-2 text-foreground text-[length:var(--text-xl)]">
              <DollarSign className="w-5 h-5 text-primary" />
              Adjust Coins for {selectedStudent.gamerName}
            </CardTitle>
            <CardDescription>Add or remove coins from {terminology?.learner?.toLowerCase()} balance</CardDescription>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div>
              <Label className="text-foreground">Amount (positive to add, negative to remove)</Label>
              <Input
                type="number"
                value={adjustmentAmount}
                onChange={(e) => setAdjustmentAmount(parseInt(e.target.value) || 0)}
                className="min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                placeholder="100"
                data-testid="input-adjustment-amount"
              />
            </div>
            <div>
              <Label className="text-foreground">Reason</Label>
              <Textarea
                value={adjustmentReason}
                onChange={(e) => setAdjustmentReason(e.target.value)}
                className="min-h-[44px] touch-manipulation bg-card border-border text-foreground"
                placeholder="Bonus reward for excellent participation"
                data-testid="input-adjustment-reason"
              />
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleAdjust} disabled={adjustMutation.isPending} className="flex-1 min-h-[44px] touch-manipulation" data-testid="button-confirm-adjustment" >
                <Save className="w-4 h-4 mr-2" />
                Confirm Adjustment
              </Button>
              <Button onClick={() => setSelectedStudent(null)}
                variant="outline"
                className="min-h-[44px] touch-manipulation border-border"
                data-testid="button-cancel-adjustment"
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Catalog Tab Component - Manage Powerups and Cosmetics
function CatalogTab() {
  const { toast } = useToast();
  const [catalogView, setCatalogView] = useState<'powerups' | 'cosmetics'>('powerups');
  
  // Dialog states for power-ups
  const [createDialog, setCreateDialog] = useState(false);
  const [editDialog, setEditDialog] = useState(false);
  const [editingPowerup, setEditingPowerup] = useState<any>(null);
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deletingPowerup, setDeletingPowerup] = useState<any>(null);

  // Fetch powerup catalog
  const { data: powerups = [], isLoading: loadingPowerups, refetch: refetchPowerups } = useQuery<any[]>({
    queryKey: ['/api/gamification/powerups/catalog'],
  });

  // Fetch cosmetic catalog
  const { data: cosmetics = [], isLoading: loadingCosmetics, refetch: refetchCosmetics } = useQuery<any[]>({
    queryKey: ['/api/gamification/cosmetics/catalog'],
  });

  // Create power-up mutation
  const createPowerupMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/admin/gamification/powerups', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/catalog'] });
      toast({ title: 'Created!', description: 'Power-up created successfully.' });
      setCreateDialog(false);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error?.message || 'Failed to create power-up.', 
        variant: 'destructive' 
      });
    },
  });

  // Update power-up mutation
  const updatePowerupMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      return apiRequest(`/api/admin/gamification/powerups/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/catalog'] });
      toast({ title: 'Updated!', description: 'Power-up updated successfully.' });
      setEditDialog(false);
      setEditingPowerup(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error?.message || 'Failed to update power-up.', 
        variant: 'destructive' 
      });
    },
  });

  // Delete power-up mutation
  const deletePowerupMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/admin/gamification/powerups/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/catalog'] });
      toast({ title: 'Deleted!', description: 'Power-up deleted successfully.' });
      setDeleteDialog(false);
      setDeletingPowerup(null);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error', 
        description: error?.message || 'Failed to delete power-up.', 
        variant: 'destructive' 
      });
    },
  });

  const handleRefresh = () => {
    if (catalogView === 'powerups') {
      refetchPowerups();
      toast({ title: 'Refreshed', description: 'Powerup catalog refreshed' });
    } else {
      refetchCosmetics();
      toast({ title: 'Refreshed', description: 'Cosmetic catalog refreshed' });
    }
  };

  return (
    <div className="space-y-[var(--space-lg)]">
      <Card className="bg-card/50 border-border">
        <CardHeader className="p-[var(--card-padding)]">
          <CardTitle className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)] text-foreground text-[length:var(--text-xl)]">
            <div className="flex items-center gap-2">
              <Star className="w-5 h-5 text-glow-gold" />
              Powerups & Cosmetics Catalog
            </div>
            <div className="flex gap-2">
              <Button onClick={handleRefresh} variant="outline" size="sm" className="min-h-[44px] touch-manipulation" data-testid="button-refresh-catalog" >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </Button>
              {catalogView === 'powerups' && (
                <Button onClick={() => setCreateDialog(true)}
                  size="sm"
                  className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/80"
                  data-testid="button-add-powerup"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Power-Up
                </Button>
              )}
            </div>
          </CardTitle>
          <CardDescription>
            Manage powerups (full control) and cosmetics (price/status only)
          </CardDescription>
        </CardHeader>
        <CardContent className="p-[var(--card-padding)] pt-0">
          {/* View Toggle */}
          <div className="flex flex-col sm:flex-row gap-2 mb-[var(--space-lg)]">
            <Button onClick={() => setCatalogView('powerups')}
              variant={catalogView === 'powerups' ? 'default' : 'outline'}
              className={`min-h-[44px] touch-manipulation ${catalogView === 'powerups' ? 'bg-secondary hover:bg-secondary/90' : 'border-border'}`}
              data-testid="button-view-powerups"
            >
              <Zap className="w-4 h-4 mr-2" />
              Powerups ({powerups.length})
            </Button>
            <Button onClick={() => setCatalogView('cosmetics')}
              variant={catalogView === 'cosmetics' ? 'default' : 'outline'}
              className={`min-h-[44px] touch-manipulation ${catalogView === 'cosmetics' ? 'bg-secondary hover:bg-secondary/90' : 'border-border'}`}
              data-testid="button-view-cosmetics"
            >
              <Star className="w-4 h-4 mr-2" />
              Cosmetics ({cosmetics.length})
            </Button>
          </div>

          {/* Powerups View */}
          {catalogView === 'powerups' && (
            <div>
              {loadingPowerups ? (
                <div className="text-muted-foreground text-center py-8">Loading powerups...</div>
              ) : powerups.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No powerups found. Initialize the catalog first.</p>
                </div>
              ) : (
                <div className="space-y-[var(--space-md)]">
                  {powerups.map((powerup) => (
                    <Card key={powerup.id} className="bg-muted/30 border-border">
                      <CardContent className="p-[var(--card-padding)]">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-[var(--space-md)]">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h4 className="text-foreground font-semibold">{powerup.name}</h4>
                              <Badge variant="outline" className={` ${powerup.tier === 'common' ? 'border-muted-foreground text-muted-foreground' : ''} ${powerup.tier === 'rare' ? 'border-secondary text-secondary' : ''} ${powerup.tier === 'epic' ? 'border-primary text-primary' : ''} ${powerup.tier === 'legendary' ? 'border-[var(--game-gold)] text-glow-gold' : ''} `}>
                                {powerup.tier}
                              </Badge>
                              <Badge variant={powerup.isActive ? 'default' : 'secondary'}>
                                {powerup.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-sm mb-2">{powerup.description}</p>
                            <div className="flex items-center gap-[var(--space-md)] text-sm flex-wrap">
                              <span className="text-muted-foreground">
                                <Coins className="w-4 h-4 inline mr-1 text-glow-gold" />
                                {powerup.coinCost} coins
                              </span>
                              <span className="text-muted-foreground">Type: {powerup.type}</span>
                              {powerup.effect?.multiplier && (
                                <span className="text-primary">{powerup.effect.multiplier}x multiplier</span>
                              )}
                              {powerup.effect?.duration && (
                                <span className="text-secondary">{powerup.effect.duration}s duration</span>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button onClick={() => {
                                setEditingPowerup(powerup);
                                setEditDialog(true);
                              }}
                              size="sm"
                              variant="outline"
                              className="min-h-[44px] touch-manipulation border-border"
                              data-testid={`button-edit-powerup-${powerup.id}`}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button onClick={() => {
                                setDeletingPowerup(powerup);
                                setDeleteDialog(true);
                              }}
                              size="sm"
                              variant="destructive"
                              className="min-h-[44px] touch-manipulation"
                              data-testid={`button-delete-powerup-${powerup.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Cosmetics View */}
          {catalogView === 'cosmetics' && (
            <div>
              {loadingCosmetics ? (
                <div className="text-muted-foreground text-center py-8">Loading cosmetics...</div>
              ) : cosmetics.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">No cosmetics found. Initialize the catalog first.</p>
                </div>
              ) : (
                <div className="space-y-[var(--space-md)]">
                  {cosmetics.map((cosmetic) => (
                    <Card key={cosmetic.id} className="bg-muted/30 border-border">
                      <CardContent className="p-[var(--card-padding)]">
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-[var(--space-md)]">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h4 className="text-foreground font-semibold">{cosmetic.name}</h4>
                              <Badge variant="outline" className={` ${cosmetic.tier === 'common' ? 'border-muted-foreground text-muted-foreground' : ''} ${cosmetic.tier === 'rare' ? 'border-secondary text-secondary' : ''} ${cosmetic.tier === 'epic' ? 'border-primary text-primary' : ''} ${cosmetic.tier === 'legendary' ? 'border-[var(--game-gold)] text-glow-gold' : ''} `}>
                                {cosmetic.tier}
                              </Badge>
                              <Badge variant={cosmetic.isActive ? 'default' : 'secondary'}>
                                {cosmetic.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-sm mb-2">{cosmetic.description}</p>
                            <div className="flex items-center gap-[var(--space-md)] text-sm flex-wrap">
                              <span className="text-muted-foreground">
                                <Coins className="w-4 h-4 inline mr-1 text-glow-gold" />
                                {cosmetic.coinCost} coins
                              </span>
                              <span className="text-muted-foreground">Type: {cosmetic.type}</span>
                              {cosmetic.effect?.color && (
                                <span className="flex items-center gap-1">
                                  <div 
                                    className="w-4 h-4 rounded-full border border-border" 
                                    style={{ backgroundColor: cosmetic.effect.color }}
                                  />
                                  <span className="text-muted-foreground">{cosmetic.effect.color}</span>
                                </span>
                              )}
                              {cosmetic.effect?.animation && (
                                <span className="text-primary">{cosmetic.effect.animation}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-secondary/10 border-secondary/30">
        <CardContent className="p-[var(--card-padding)]">
          <p className="text-secondary/80 text-sm">
            <strong>Note:</strong> This catalog shows what items are available in the shop. 
            Powerup prices, effects, and availability can be configured here. 
            Cosmetic prices can be adjusted in the Shop Pricing tab.
            To add missing items, use the "Initialize Catalog" button above.
          </p>
        </CardContent>
      </Card>

      {/* Create Power-Up Dialog */}
      <CreatePowerUpDialog 
        open={createDialog}
        onOpenChange={setCreateDialog}
        onSubmit={(data) => createPowerupMutation.mutate(data)}
        isPending={createPowerupMutation.isPending}
      />

      {/* Edit Power-Up Dialog */}
      <EditPowerUpDialog
        open={editDialog}
        onOpenChange={setEditDialog}
        powerup={editingPowerup}
        onSubmit={(data) => {
          if (editingPowerup?.id) {
            updatePowerupMutation.mutate({ id: editingPowerup.id, data });
          }
        }}
        isPending={updatePowerupMutation.isPending}
      />

      {/* Delete Power-Up Dialog */}
      <DeletePowerUpDialog
        open={deleteDialog}
        onOpenChange={setDeleteDialog}
        powerup={deletingPowerup}
        onConfirm={() => {
          if (deletingPowerup?.id) {
            deletePowerupMutation.mutate(deletingPowerup.id);
          }
        }}
        isPending={deletePowerupMutation.isPending}
      />
    </div>
  );
}

// Create Power-Up Dialog Component
function CreatePowerUpDialog({ 
  open, 
  onOpenChange, 
  onSubmit, 
  isPending 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void; 
  onSubmit: (data: any) => void; 
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'xp_boost',
    coinCost: 100,
    tier: 'common',
    effectMultiplier: '',
    effectDuration: '',
    effectBonus: '',
    effectUses: '',
    isActive: true,
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.description) {
      return;
    }

    const effect: any = {};
    if (formData.effectMultiplier) effect.multiplier = parseFloat(formData.effectMultiplier);
    if (formData.effectDuration) effect.duration = parseInt(formData.effectDuration);
    if (formData.effectBonus) effect.bonus = parseFloat(formData.effectBonus);
    if (formData.effectUses) effect.uses = parseInt(formData.effectUses);

    onSubmit({
      name: formData.name,
      description: formData.description,
      type: formData.type,
      coinCost: formData.coinCost,
      tier: formData.tier,
      effect,
      isActive: formData.isActive,
    });

    setFormData({
      name: '',
      description: '',
      type: 'xp_boost',
      coinCost: 100,
      tier: 'common',
      effectMultiplier: '',
      effectDuration: '',
      effectBonus: '',
      effectUses: '',
      isActive: true,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New Power-Up</DialogTitle>
          <DialogDescription>Add a new power-up to the catalog</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-foreground">Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-card border-border text-foreground"
              placeholder="XP Boost (10 min)"
              data-testid="input-create-powerup-name"
            />
          </div>
          <div>
            <Label className="text-foreground">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-card border-border text-foreground"
              placeholder="Doubles XP gained for 10 minutes"
              data-testid="input-create-powerup-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-foreground">Type</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-create-powerup-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xp_boost">XP Boost</SelectItem>
                  <SelectItem value="coin_multiplier">Coin Multiplier</SelectItem>
                  <SelectItem value="time_extension">Time Extension</SelectItem>
                  <SelectItem value="change_answer">Change Answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-foreground">Coin Cost</Label>
              <Input
                type="number"
                min="0"
                value={formData.coinCost}
                onChange={(e) => setFormData({ ...formData, coinCost: parseInt(e.target.value) || 0 })}
                className="bg-card border-border text-foreground"
                data-testid="input-create-powerup-coincost"
              />
            </div>
          </div>
          <div>
            <Label className="text-foreground">Tier</Label>
            <Select value={formData.tier} onValueChange={(value) => setFormData({ ...formData, tier: value })}>
              <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-create-powerup-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="common">Common</SelectItem>
                <SelectItem value="rare">Rare</SelectItem>
                <SelectItem value="epic">Epic</SelectItem>
                <SelectItem value="legendary">Legendary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Effect Properties (optional)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Multiplier</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.effectMultiplier}
                  onChange={(e) => setFormData({ ...formData, effectMultiplier: e.target.value })}
                  className="bg-card border-border text-foreground"
                  placeholder="2.0"
                  data-testid="input-create-powerup-multiplier"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Duration (seconds)</Label>
                <Input
                  type="number"
                  value={formData.effectDuration}
                  onChange={(e) => setFormData({ ...formData, effectDuration: e.target.value })}
                  className="bg-card border-border text-foreground"
                  placeholder="600"
                  data-testid="input-create-powerup-duration"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Bonus</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.effectBonus}
                  onChange={(e) => setFormData({ ...formData, effectBonus: e.target.value })}
                  className="bg-card border-border text-foreground"
                  placeholder="1.5"
                  data-testid="input-create-powerup-bonus"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Uses</Label>
                <Input
                  type="number"
                  value={formData.effectUses}
                  onChange={(e) => setFormData({ ...formData, effectUses: e.target.value })}
                  className="bg-card border-border text-foreground"
                  placeholder="3"
                  data-testid="input-create-powerup-uses"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="create-active"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4"
              data-testid="checkbox-create-powerup-active"
            />
            <Label htmlFor="create-active" className="text-foreground">Active (available in shop)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}
            variant="outline"
            className="border-border"
            data-testid="button-cancel-create-powerup"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !formData.name || !formData.description} data-testid="button-submit-create-powerup" >
            {isPending ? 'Creating...' : 'Create Power-Up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Edit Power-Up Dialog Component
function EditPowerUpDialog({ 
  open, 
  onOpenChange, 
  powerup,
  onSubmit, 
  isPending 
}: { 
  open: boolean; 
  onOpenChange: (open: boolean) => void;
  powerup: any;
  onSubmit: (data: any) => void; 
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'xp_boost',
    coinCost: 100,
    tier: 'common',
    effectMultiplier: '',
    effectDuration: '',
    effectBonus: '',
    effectUses: '',
    isActive: true,
  });

  useEffect(() => {
    if (powerup) {
      setFormData({
        name: powerup.name || '',
        description: powerup.description || '',
        type: powerup.type || 'xp_boost',
        coinCost: powerup.coinCost || 100,
        tier: powerup.tier || 'common',
        effectMultiplier: powerup.effect?.multiplier?.toString() || '',
        effectDuration: powerup.effect?.duration?.toString() || '',
        effectBonus: powerup.effect?.bonus?.toString() || '',
        effectUses: powerup.effect?.uses?.toString() || '',
        isActive: powerup.isActive ?? true,
      });
    }
  }, [powerup]);

  const handleSubmit = () => {
    if (!formData.name || !formData.description) {
      return;
    }

    const effect: any = {};
    if (formData.effectMultiplier) effect.multiplier = parseFloat(formData.effectMultiplier);
    if (formData.effectDuration) effect.duration = parseInt(formData.effectDuration);
    if (formData.effectBonus) effect.bonus = parseFloat(formData.effectBonus);
    if (formData.effectUses) effect.uses = parseInt(formData.effectUses);

    onSubmit({
      name: formData.name,
      description: formData.description,
      type: formData.type,
      coinCost: formData.coinCost,
      tier: formData.tier,
      effect,
      isActive: formData.isActive,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Edit Power-Up</DialogTitle>
          <DialogDescription>Update power-up details</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-foreground">Name</Label>
            <Input
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="bg-card border-border text-foreground"
              data-testid="input-edit-powerup-name"
            />
          </div>
          <div>
            <Label className="text-foreground">Description</Label>
            <Textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="bg-card border-border text-foreground"
              data-testid="input-edit-powerup-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-foreground">Type</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-edit-powerup-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="xp_boost">XP Boost</SelectItem>
                  <SelectItem value="coin_multiplier">Coin Multiplier</SelectItem>
                  <SelectItem value="time_extension">Time Extension</SelectItem>
                  <SelectItem value="change_answer">Change Answer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-foreground">Coin Cost</Label>
              <Input
                type="number"
                min="0"
                value={formData.coinCost}
                onChange={(e) => setFormData({ ...formData, coinCost: parseInt(e.target.value) || 0 })}
                className="bg-card border-border text-foreground"
                data-testid="input-edit-powerup-coincost"
              />
            </div>
          </div>
          <div>
            <Label className="text-foreground">Tier</Label>
            <Select value={formData.tier} onValueChange={(value) => setFormData({ ...formData, tier: value })}>
              <SelectTrigger className="bg-card border-border text-foreground" data-testid="select-edit-powerup-tier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="common">Common</SelectItem>
                <SelectItem value="rare">Rare</SelectItem>
                <SelectItem value="epic">Epic</SelectItem>
                <SelectItem value="legendary">Legendary</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-foreground">Effect Properties (optional)</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-muted-foreground text-sm">Multiplier</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.effectMultiplier}
                  onChange={(e) => setFormData({ ...formData, effectMultiplier: e.target.value })}
                  className="bg-card border-border text-foreground"
                  data-testid="input-edit-powerup-multiplier"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Duration (seconds)</Label>
                <Input
                  type="number"
                  value={formData.effectDuration}
                  onChange={(e) => setFormData({ ...formData, effectDuration: e.target.value })}
                  className="bg-card border-border text-foreground"
                  data-testid="input-edit-powerup-duration"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Bonus</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={formData.effectBonus}
                  onChange={(e) => setFormData({ ...formData, effectBonus: e.target.value })}
                  className="bg-card border-border text-foreground"
                  data-testid="input-edit-powerup-bonus"
                />
              </div>
              <div>
                <Label className="text-muted-foreground text-sm">Uses</Label>
                <Input
                  type="number"
                  value={formData.effectUses}
                  onChange={(e) => setFormData({ ...formData, effectUses: e.target.value })}
                  className="bg-card border-border text-foreground"
                  data-testid="input-edit-powerup-uses"
                />
              </div>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="edit-active"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4"
              data-testid="checkbox-edit-powerup-active"
            />
            <Label htmlFor="edit-active" className="text-foreground">Active (available in shop)</Label>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}
            variant="outline"
            className="border-border"
            data-testid="button-cancel-edit-powerup"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isPending || !formData.name || !formData.description} data-testid="button-submit-edit-powerup" >
            {isPending ? 'Updating...' : 'Update Power-Up'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Delete Power-Up Dialog Component
function DeletePowerUpDialog({
  open,
  onOpenChange,
  powerup,
  onConfirm,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  powerup: any;
  onConfirm: () => void;
  isPending: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-foreground">Delete Power-Up</AlertDialogTitle>
          <AlertDialogDescription className="text-muted-foreground">
            Are you sure you want to delete <strong className="text-foreground">{powerup?.name}</strong>?
            <br /><br />
            This action cannot be undone. Students who already own this power-up will keep it, 
            but it will no longer be available for purchase.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-border" data-testid="button-cancel-delete-powerup">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isPending}
            className="bg-destructive hover:bg-destructive/80"
            data-testid="button-confirm-delete-powerup"
          >
            {isPending ? 'Deleting...' : 'Delete Power-Up'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Initialize Catalog Button Component
function InitializeCatalogButton() {
  const { toast } = useToast();
  const [isInitializing, setIsInitializing] = useState(false);

  const handleInitialize = async () => {
    setIsInitializing(true);
    try {
      const response = await apiRequest('/api/superadmin/initialize-catalogs', {
        method: 'POST',
      });

      const result = await response.json();
      
      toast({
        title: 'Catalog Initialized!',
        description: `Created ${result.powerUpsCreated} power-ups and ${result.cosmeticsCreated} cosmetics. Updated ${result.powerUpsUpdated + result.cosmeticsUpdated} items.`,
      });
      
      // Invalidate relevant queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/catalog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/cosmetics/catalog'] });
    } catch (error: any) {
      toast({
        title: 'Initialization Failed',
        description: error?.message || 'Failed to initialize gamification catalogs',
        variant: 'destructive',
      });
    } finally {
      setIsInitializing(false);
    }
  };

  return (
    <Card className="bg-primary hover:bg-primary/90 border-primary/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground">
          <Database className="w-5 h-5 text-primary" />
          Gamification Catalog Initialization
        </CardTitle>
        <CardDescription>
          Initialize or update power-ups and cosmetics catalog. This is safe to run multiple times.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={isInitializing} data-testid="button-initialize-catalog-trigger" >
              {isInitializing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Initializing...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  Initialize Catalog
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-foreground">Initialize Gamification Catalogs?</AlertDialogTitle>
              <AlertDialogDescription className="text-muted-foreground">
                This will create or update the power-up and cosmetic catalogs with default items.
                <br /><br />
                <strong>What this does:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Creates missing power-ups and cosmetics</li>
                  <li>Updates descriptions and effects of existing items</li>
                  <li>Preserves custom prices and active/inactive status</li>
                  <li>Safe to run multiple times (idempotent)</li>
                </ul>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-border" data-testid="button-cancel-initialize">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleInitialize}
                className="bg-secondary hover:bg-secondary/90"
                data-testid="button-confirm-initialize"
              >
                Initialize Catalog
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
