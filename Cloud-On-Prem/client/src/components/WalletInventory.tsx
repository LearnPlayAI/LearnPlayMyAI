import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Coins, Zap, Sparkles, Trophy, TrendingUp, TrendingDown, ArrowRightLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { getThemeAvatarFallbackGradient, getThemeAvatarFallbackRing } from '@/lib/themePalettes';
import { useToast } from '@/hooks/use-toast';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';

interface WalletInventoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WalletInventory({ open, onOpenChange }: WalletInventoryProps) {
  const [activeTab, setActiveTab] = useState('coins');
  const { toast } = useToast();

  const { data: user } = useQuery<any>({ 
    queryKey: ['/api/user-status'],
    enabled: open,
  });

  const { data: dashboard } = useQuery<any>({ 
    queryKey: ['/api/gamification/dashboard'],
    enabled: open,
  });

  const { data: coinTransactions = [] } = useQuery<any[]>({
    queryKey: ['/api/gamification/coins/transactions'],
    enabled: open && activeTab === 'coins',
  });

  const { data: powerUps = [] } = useQuery<any[]>({
    queryKey: ['/api/gamification/powerups/inventory'],
    enabled: open && activeTab === 'powerups',
    refetchInterval: 5000, // Refetch every 5 seconds to update inventory
  });

  const { data: cosmetics = [] } = useQuery<any[]>({
    queryKey: ['/api/gamification/cosmetics/owned'],
    enabled: open && activeTab === 'cosmetics',
  });

  const { data: equipped = [] } = useQuery<any[]>({
    queryKey: ['/api/gamification/cosmetics/equipped'],
    enabled: open && activeTab === 'cosmetics',
  });

  const { data: activePowerUps = [] } = useQuery<any[]>({
    queryKey: ['/api/gamification/powerups/active'],
    enabled: open && activeTab === 'powerups',
    refetchInterval: 5000, // Refetch every 5 seconds to update timers
  });

  // Activate power-up mutation
  const activateMutation = useMutation({
    mutationFn: async (powerUpId: string) => {
      return apiRequest('/api/gamification/powerups/activate', {
        method: 'POST',
        body: JSON.stringify({ powerUpId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/active'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
      toast({
        title: 'Power-Up Activated!',
        description: 'Your power-up is now active',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Activation Failed',
        description: error.message || 'Could not activate power-up',
        variant: 'destructive',
      });
    },
  });

  // Equip cosmetic mutation
  const equipMutation = useMutation({
    mutationFn: async ({ cosmeticId, slot }: { cosmeticId: string; slot: string }) => {
      return apiRequest('/api/gamification/cosmetics/equip', {
        method: 'POST',
        body: JSON.stringify({ cosmeticId, slot }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/cosmetics/equipped'] });
      toast({
        title: 'Cosmetic Equipped',
        description: 'Your cosmetic is now active!',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Equip',
        description: error.message || 'Could not equip cosmetic',
        variant: 'destructive',
      });
    },
  });

  // Unequip cosmetic mutation
  const unequipMutation = useMutation({
    mutationFn: async (slot: string) => {
      return apiRequest('/api/gamification/cosmetics/unequip', {
        method: 'POST',
        body: JSON.stringify({ slot }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/cosmetics/equipped'] });
      toast({
        title: 'Cosmetic Unequipped',
        description: 'Your cosmetic has been removed',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to Unequip',
        description: error.message || 'Could not unequip cosmetic',
        variant: 'destructive',
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] bg-card border-primary/30 text-foreground overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Wallet & Inventory
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Manage your coins, power-ups, and cosmetics
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col flex-1 min-h-0">
          <TabsList className="grid w-full grid-cols-3 bg-[var(--surface-muted)] border border-primary/20 flex-shrink-0">
            <TabsTrigger value="coins" className="text-muted-foreground" data-testid="tab-coins">
              <Coins className="w-4 h-4 mr-2" />
              Coins
            </TabsTrigger>
            <TabsTrigger value="powerups" className="text-muted-foreground" data-testid="tab-powerups">
              <Zap className="w-4 h-4 mr-2" />
              Power-Ups
            </TabsTrigger>
            <TabsTrigger value="cosmetics" className="text-muted-foreground" data-testid="tab-cosmetics">
              <Sparkles className="w-4 h-4 mr-2" />
              Cosmetics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="coins" className="mt-4 flex-1 overflow-y-auto pr-2">
            <div className="space-y-4">
              {/* Player Avatar */}
              {user?.id && (
                <motion.div
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex justify-center mb-4"
                >
                  <PlayerAvatar user={user} size="xl" showCountry={false} showGlow={false} showCosmetics={true} className="" />
                </motion.div>
              )}

              {/* Coins Balance Card */}
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
              >
                <Card className="bg-[var(--game-gold)]/20 border-[var(--game-gold)]/30">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-glow-gold">Current Balance</span>
                      <Coins className="w-6 h-6 text-glow-gold" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-4xl font-bold text-foreground" data-testid="text-wallet-balance">
                      {dashboard?.coinBalance?.toLocaleString() || 0}
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">Coins</p>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Transaction History */}
              <Card className="bg-card/50 border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Transaction History</CardTitle>
                  <CardDescription>Recent coin activity</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {coinTransactions.length === 0 ? (
                      <div className="text-center py-8 text-muted-foreground">
                        No transactions yet
                      </div>
                    ) : (
                      coinTransactions.map((transaction: any, index: number) => (
                          <motion.div
                            key={transaction.id}
                            initial={{ x: -20, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            transition={{ delay: index * 0.05 }}
                            className="flex items-center justify-between p-3 bg-[var(--surface-muted)]/50 hover:bg-[var(--surface-muted)]/70 rounded-lg transition-colors"
                            data-testid={`transaction-${transaction.id}`}
                          >
                            <div className="flex items-center gap-3">
                              <div className={`p-2 rounded-full ${
                                transaction.amount > 0 ? 'bg-[var(--game-success)]/30' : 'bg-destructive/30'
                              }`}>
                                {transaction.amount > 0 ? (
                                  <TrendingUp className="w-4 h-4 text-success" />
                                ) : (
                                  <TrendingDown className="w-4 h-4 text-destructive" />
                                )}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-foreground">
                                  {transaction.description}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(transaction.createdAt).toLocaleDateString()} at{' '}
                                  {new Date(transaction.createdAt).toLocaleTimeString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className={`text-lg font-bold ${
                                transaction.amount > 0 ? 'text-success' : 'text-destructive'
                              }`}>
                                {transaction.amount > 0 ? '+' : ''}{transaction.amount}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                Balance: {transaction.balance}
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="powerups" className="mt-4 flex-1 overflow-y-auto pr-2">
              {/* Active Power-Ups Section */}
              {activePowerUps.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-primary/70 mb-3 flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Active Power-Ups
                  </h3>
                  <div className="space-y-2">
                    {activePowerUps.map((active: any) => {
                      const timeLeft = Math.max(0, new Date(active.expiresAt).getTime() - Date.now());
                      const secondsLeft = Math.floor(timeLeft / 1000);
                      const minutesLeft = Math.floor(secondsLeft / 60);
                      const displaySeconds = secondsLeft % 60;
                      
                      return (
                        <Card key={active.id} className="bg-primary hover:bg-primary/90 border-primary/50">
                          <CardContent className="p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Zap className="w-4 h-4 text-primary" />
                                <span className="text-sm font-medium text-foreground">{active.name || 'Power-Up'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge >
                                  {minutesLeft}:{displaySeconds.toString().padStart(2, '0')} left
                                </Badge>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Inventory Section */}
              <div>
                <h3 className="text-sm font-semibold text-primary/70 mb-3 flex items-center gap-2">
                  <Trophy className="w-4 h-4" />
                  Inventory
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                  {powerUps.length === 0 ? (
                    <div className="col-span-2 text-center py-12 text-muted-foreground">
                      No power-ups yet. Visit the shop to purchase some!
                    </div>
                  ) : (
                    powerUps.map((powerUp: any, index: number) => (
                      <motion.div
                        key={powerUp.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: index * 0.1 }}
                        data-testid={`powerup-inventory-${powerUp.id}`}
                      >
                        <Card className="bg-surface-raised border-primary/30 hover:border-primary/50 transition-all">
                          <CardHeader>
                            <CardTitle className="flex items-center justify-between text-foreground">
                              <div className="flex items-center gap-2">
                                <Zap className="w-5 h-5 text-primary" />
                                {powerUp.name}
                              </div>
                              <Badge >
                                x{powerUp.quantity}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                              {powerUp.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Duration:</span>
                                <span className="text-primary/70">
                                  {powerUp.duration ? `${Math.floor(powerUp.duration / 60)} min${powerUp.duration >= 120 ? 's' : ''}` : 'N/A'}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Effect:</span>
                                <span className="text-primary/70 capitalize">{powerUp.effectType?.replace('_', ' ')}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Tier:</span>
                                <Badge className={getTierColor(powerUp.tier || 'common')}>
                                  {powerUp.tier || 'common'}
                                </Badge>
                              </div>
                            </div>
                            <Button className="w-full mt-3 font-medium" size="sm" onClick={() => activateMutation.mutate(powerUp.powerUpId)}
                              disabled={activateMutation.isPending || powerUp.quantity === 0}
                              data-testid={`button-activate-${powerUp.id}`}
                            >
                              Activate Power-Up
                            </Button>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
          </TabsContent>

          <TabsContent value="cosmetics" className="mt-4 flex-1 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-4">
                {cosmetics.length === 0 ? (
                  <div className="col-span-2 text-center py-12 text-muted-foreground">
                    No cosmetics yet. Visit the shop to customize your profile!
                  </div>
                ) : (
                  cosmetics.map((cosmetic: any, index: number) => {
                    const isEquipped = equipped.some((e: any) => e.cosmeticId === cosmetic.cosmeticId);
                    // Handle both itemType and type fields
                    const cosmeticType = cosmetic.itemType || cosmetic.type || 'unknown';
                    
                    return (
                      <motion.div
                        key={cosmetic.id}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: index * 0.1 }}
                        data-testid={`cosmetic-owned-${cosmetic.id}`}
                      >
                        <Card className={` border transition-all ${
                          isEquipped
                            ? 'from-[var(--action-secondary)]/60 border-secondary/50'
                            : 'from-[var(--action-secondary)]/40 border-secondary/30 hover:border-secondary/50'
                        }`}>
                          <CardHeader>
                            <CardTitle className="flex items-center justify-between text-secondary/90">
                              <div className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5 text-secondary" />
                                {cosmetic.cosmeticName || 'Unknown Cosmetic'}
                              </div>
                              {isEquipped && (
                                <Badge >Equipped</Badge>
                              )}
                            </CardTitle>
                            <CardDescription className="text-muted-foreground">
                              {cosmetic.cosmeticDescription || cosmetic.description || 'No description'}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            {/* Visual Preview */}
                            <div className="mb-4 p-4 bg-card/50 rounded-lg border border-border">
                              <div className="text-xs text-muted-foreground mb-2 text-center">Preview</div>
                              {cosmeticType === 'name_color' && (
                                <div className="text-center">
                                  <span 
                                    className="text-2xl font-bold"
                                    style={{ color: cosmetic.value || 'var(--action-primary-fg)' }}
                                  >
                                    PlayerName
                                  </span>
                                </div>
                              )}
                              {cosmeticType === 'avatar_ring' && (
                                <div className="flex justify-center">
                                  <div 
                                    className="w-16 h-16 rounded-full flex items-center justify-center"
                                    style={{ 
                                      boxShadow: `0 0 20px ${cosmetic.value || 'var(--action-primary-fg)'}`,
                                      border: cosmetic.value
                                        ? `3px solid ${cosmetic.value}`
                                        : getThemeAvatarFallbackRing(),
                                    }}
                                  >
                                    <div className="w-12 h-12 rounded-full bg-surface-raised" />
                                  </div>
                                </div>
                              )}
                              {cosmeticType === 'avatar_frame' && (
                                <div className="flex justify-center">
                                  <div 
                                    className="relative w-20 h-20 rounded-lg"
                                    style={{ 
                                      background: cosmetic.value || getThemeAvatarFallbackGradient(),
                                      padding: '4px'
                                    }}
                                  >
                                    <div className="w-full h-full rounded-lg bg-surface-raised" />
                                  </div>
                                </div>
                              )}
                              {cosmeticType === 'profile_badge' && (
                                <div className="flex justify-center">
                                  <div 
                                    className="px-3 py-1 rounded-full text-sm font-bold"
                                    style={{ 
                                      background: cosmetic.value || 'var(--action-primary)',
                                      color: 'var(--action-primary-fg)'
                                    }}
                                  >
                                    {cosmetic.cosmeticName}
                                  </div>
                                </div>
                              )}
                              {!['name_color', 'avatar_ring', 'avatar_frame', 'profile_badge'].includes(cosmeticType) && (
                                <div className="text-center text-muted-foreground text-sm">
                                  No preview available (Type: {cosmeticType})
                                </div>
                              )}
                            </div>
                            
                            <div className="space-y-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Type:</span>
                                <span className="text-secondary/80 capitalize">{cosmeticType.replace('_', ' ')}</span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground">Tier:</span>
                                <Badge className={`${getTierColor(cosmetic.tier)}`}>
                                  {cosmetic.tier || 'common'}
                                </Badge>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Unlocked: {cosmetic.purchasedAt ? new Date(cosmetic.purchasedAt).toLocaleDateString() : 'Unknown'}
                              </div>
                              
                              {/* Equip/Unequip Button */}
                              <div className="pt-2">
                                {isEquipped ? (
                                  <Button size="sm" variant="outline" className="w-full" onClick={() => unequipMutation.mutate(cosmetic.itemType || cosmetic.type || 'avatar_ring')}
                                    disabled={unequipMutation.isPending}
                                    data-testid={`button-unequip-${cosmetic.id}`}
                                  >
                                    Unequip
                                  </Button>
                                ) : (
                                  <Button size="sm" className="w-full" onClick={() => equipMutation.mutate({ 
                                      cosmeticId: cosmetic.cosmeticId || cosmetic.id, 
                                      slot: cosmetic.itemType || cosmetic.type || 'avatar_ring'
                                    })}
                                    disabled={equipMutation.isPending}
                                    data-testid={`button-equip-${cosmetic.id}`}
                                  >
                                    Equip
                                  </Button>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })
                )}
              </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function getTierColor(tier: string | null | undefined): string {
  if (!tier) return 'bg-success/20 text-success dark:text-success border border-success'; // Default to common
  
  switch (tier.toLowerCase()) {
    case 'common':
      return 'bg-success/20 text-success dark:text-success border border-success';
    case 'uncommon':
      return 'bg-primary/20 text-primary dark:text-primary border border-primary';
    case 'rare':
      return 'bg-primary/20 text-primary dark:text-primary border border-primary';
    case 'epic':
      return 'bg-primary/20 text-primary dark:text-primary border border-primary';
    case 'legendary':
      return 'bg-warning/20 text-warning dark:text-warning border border-[var(--warning)]';
    default:
      return 'bg-success/20 text-success dark:text-success border border-success';
  }
}
