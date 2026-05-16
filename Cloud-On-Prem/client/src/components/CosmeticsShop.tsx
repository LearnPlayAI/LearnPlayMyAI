import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Coins, ShoppingCart, Check, X, Eye, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { useRewardNotification } from '@/hooks/useRewardNotification';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface Cosmetic {
  id: string;
  name: string;
  description: string;
  type: string;
  tier: string;
  coinCost: number;
  effectConfig: any;
  isOwned: boolean;
  isEquipped: boolean;
}

const TIER_COLORS = {
  common: {
    gradient: 'from-muted',
    text: 'text-muted-foreground',
    border: 'border-muted-foreground/50',
    borderColor: 'var(--text-muted)',
    glow: 'shadow-muted-foreground/20',
  },
  rare: {
    gradient: 'from-[var(--action-secondary)]',
    text: 'text-secondary',
    border: 'border-secondary/50',
    borderColor: 'var(--action-secondary)',
    glow: 'shadow-elevated',
  },
  epic: {
    gradient: 'from-[var(--action-primary)]',
    text: 'text-primary',
    border: 'border-primary/50',
    borderColor: 'var(--action-primary)',
    glow: 'shadow-elevated',
  },
  legendary: {
    gradient: 'from-[var(--game-gold)]',
    text: 'text-glow-gold',
    border: 'border-[var(--game-gold)]/50',
    borderColor: 'var(--game-gold)',
    glow: 'shadow-[var(--game-gold)]/50',
  },
};

const RARITY_COLORS = {
  common: 'bg-success/20 text-success dark:text-success border-success',
  rare: 'bg-primary/20 text-primary dark:text-primary border-primary', 
  epic: 'bg-primary/20 text-primary dark:text-primary border-primary',
  legendary: 'bg-warning/20 text-warning dark:text-warning border-[var(--warning)]'
};

export function CosmeticsShop() {
  const { toast } = useToast();
  const { showCosmetic } = useRewardNotification();
  const [selectedCosmetic, setSelectedCosmetic] = useState<Cosmetic | null>(null);
  const [previewCosmetic, setPreviewCosmetic] = useState<Cosmetic | null>(null);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [justPurchased, setJustPurchased] = useState<Cosmetic | null>(null);

  const { data: cosmetics = [], isLoading } = useQuery<Cosmetic[]>({
    queryKey: ['/api/gamification/cosmetics/catalog'],
  });

  const { data: dashboard } = useQuery<any>({
    queryKey: ['/api/gamification/dashboard'],
  });

  const { data: user } = useQuery<any>({ 
    queryKey: ['/api/user-status'],
  });

  const purchaseMutation = useMutation({
    mutationFn: async (cosmeticId: string) => {
      return apiRequest(`/api/gamification/cosmetics/${cosmeticId}/purchase`, {
        method: 'POST',
      });
    },
    onSuccess: (_data, cosmeticId) => {
      const purchased = cosmetics.find(c => c.id === cosmeticId);
      if (purchased) {
        showCosmetic(purchased.name, purchased.tier as 'common' | 'rare' | 'epic' | 'legendary');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/cosmetics/catalog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/wallet/inventory'] });
      setSelectedCosmetic(null);
      
      if (purchased) {
        setJustPurchased(purchased);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Not enough coins or cosmetic already owned.',
        variant: 'destructive',
      });
    },
  });

  const equipMutation = useMutation({
    mutationFn: async (cosmeticId: string) => {
      return apiRequest(`/api/gamification/cosmetics/${cosmeticId}/equip`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/cosmetics/catalog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/wallet/inventory'] });
      toast({
        title: 'Cosmetic Equipped!',
        description: 'Your cosmetic is now active.',
      });
      setJustPurchased(null);
    },
  });

  const unequipMutation = useMutation({
    mutationFn: async (cosmeticId: string) => {
      return apiRequest(`/api/gamification/cosmetics/${cosmeticId}/unequip`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/cosmetics/catalog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/wallet/inventory'] });
      toast({
        title: 'Cosmetic Unequipped',
        description: 'Your cosmetic has been removed.',
      });
    },
  });

  useEffect(() => {
    if (selectedCosmetic || previewCosmetic || justPurchased) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedCosmetic, previewCosmetic, justPurchased]);

  const canPurchase = (cosmetic: Cosmetic) => {
    return dashboard?.coinBalance >= cosmetic.coinCost && !cosmetic.isOwned;
  };

  const types = ['all', ...Array.from(new Set(cosmetics.map(c => c.type)))];
  const filteredCosmetics = selectedType === 'all' 
    ? cosmetics 
    : cosmetics.filter(c => c.type === selectedType);

  const getTierColor = (tier: string) => {
    return TIER_COLORS[tier as keyof typeof TIER_COLORS] || TIER_COLORS.common;
  };

  const getRarityColor = (tier: string) => {
    return RARITY_COLORS[tier as keyof typeof RARITY_COLORS] || RARITY_COLORS.common;
  };

  const renderCosmeticPreview = (cosmetic: Cosmetic, showAnimations = false) => {
    const tierColor = getTierColor(cosmetic.tier);
    const initials = user?.username?.substring(0, 2).toUpperCase() || 'U';

    const getGlowColor = () => {
      if (cosmetic.name.toLowerCase().includes('blue')) {
        return 'color-mix(in srgb, var(--chart-1) 80%, transparent)';
      }
      if (cosmetic.name.toLowerCase().includes('green')) {
        return 'color-mix(in srgb, var(--chart-2) 80%, transparent)';
      }
      if (cosmetic.name.toLowerCase().includes('red')) {
        return 'color-mix(in srgb, var(--destructive) 80%, transparent)';
      }
      if (cosmetic.name.toLowerCase().includes('gold')) {
        return 'color-mix(in srgb, var(--chart-3) 80%, transparent)';
      }
      return cosmetic.tier === 'legendary' 
        ? 'color-mix(in srgb, var(--chart-3) 80%, transparent)'
        : cosmetic.tier === 'epic'
        ? 'color-mix(in srgb, var(--chart-4) 80%, transparent)'
        : cosmetic.tier === 'rare'
        ? 'color-mix(in srgb, var(--chart-1) 80%, transparent)'
        : 'color-mix(in srgb, var(--text-muted) 50%, transparent)';
    };

    const glowColor = getGlowColor();

    return (
      <div className="relative w-32 h-32 mx-auto">
        {showAnimations && (cosmetic.type === 'avatar_ring' || cosmetic.effectConfig?.glow) && (
          <>
            <motion.div
              className="absolute inset-[-20px] rounded-full blur-2xl"
              style={{ background: glowColor }}
              animate={{ 
                opacity: [0.4, 0.8, 0.4],
                scale: [0.95, 1.05, 0.95]
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <motion.div
              className="absolute inset-[-10px] rounded-full blur-xl"
              style={{ background: glowColor }}
              animate={{ 
                opacity: [0.6, 1, 0.6]
              }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </>
        )}

        <div className="relative z-10">
          <Avatar 
            className="w-32 h-32 border-4" 
            style={{ 
              borderColor: (cosmetic.type === 'avatar_ring' && showAnimations) ? glowColor : tierColor.borderColor,
              boxShadow: showAnimations ? `0 0 20px ${glowColor}` : 'none'
            }}
          >
            <AvatarFallback className="text-4xl font-bold bg-surface-raised">
              {initials}
            </AvatarFallback>
          </Avatar>
          
          {showAnimations && (cosmetic.type === 'avatar_ring' || cosmetic.effectConfig?.ring) && (
            <>
              <motion.div
                className="absolute inset-0 rounded-full border-4"
                style={{ borderColor: glowColor }}
                animate={{
                  opacity: [0.5, 1, 0.5],
                  scale: [1, 1.15, 1],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-[-4px] rounded-full border-2"
                style={{ borderColor: glowColor }}
                animate={{
                  opacity: [0.3, 0.7, 0.3],
                  scale: [1, 1.2, 1],
                }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
              />
            </>
          )}

          {showAnimations && cosmetic.effectConfig?.particles && (
            <div className="absolute inset-0">
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-3 h-3 rounded-full"
                  style={{
                    top: '50%',
                    left: '50%',
                    background: glowColor,
                    boxShadow: `0 0 10px ${glowColor}`,
                  }}
                  animate={{
                    x: [0, Math.cos(i * 45 * Math.PI / 180) * 70],
                    y: [0, Math.sin(i * 45 * Math.PI / 180) * 70],
                    opacity: [1, 0],
                    scale: [1, 0],
                  }}
                  transition={{
                    duration: 2.5,
                    repeat: Infinity,
                    delay: i * 0.15,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="h-80 bg-muted/50 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-card text-foreground p-6 rounded-xl border border-border">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-chart-2" />
            Cosmetics Shop
          </h2>
          <p className="text-muted-foreground mt-1">Customize your appearance with unique effects</p>
        </div>
        <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
          <Coins className="w-5 h-5 text-glow-gold" />
          <span className="text-xl font-bold text-foreground" data-testid="text-cosmetics-balance">
            {dashboard?.coinBalance?.toLocaleString() || 0}
          </span>
        </div>
      </div>

      <Tabs value={selectedType} onValueChange={setSelectedType}>
        <TabsList className="bg-card border border-border gap-2 flex flex-col sm:flex-row h-auto p-2">
          {types.map(type => (
            <TabsTrigger
              key={type}
              value={type}
              className={`capitalize justify-start ${
                selectedType === type
                  ? 'bg-primary hover:bg-primary/90 text-btn-primary-foreground'
                  : 'bg-muted/50 border border-border text-foreground hover:bg-muted/80'
              }`}
              data-testid={`filter-${type}`}
            >
              {type === 'all' && <Sparkles className="w-4 h-4 mr-2" />}
              {type.replace('_', ' ')}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
        <AnimatePresence>
            {filteredCosmetics.map((cosmetic, index) => {
              const tierColor = getTierColor(cosmetic.tier);
              
              return (
                <motion.div
                  key={cosmetic.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: index * 0.05 }}
                  whileHover={{ scale: 1.02 }}
                  className="relative"
                >
                  <Card className={` ${tierColor.gradient} p-[2px] border-0 ${tierColor.glow} shadow-elevated`}>
                    <div className="bg-card rounded-lg h-full">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CardTitle className="text-foreground">{cosmetic.name}</CardTitle>
                              {cosmetic.isEquipped && (
                                <Badge >
                                  <Check className="w-3 h-3 mr-1" />
                                  Equipped
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={`${getRarityColor(cosmetic.tier)} border capitalize`}>
                                <Star className="w-3 h-3 mr-1" />
                                {cosmetic.tier}
                              </Badge>
                              <Badge className="capitalize">
                                {cosmetic.type.replace('_', ' ')}
                              </Badge>
                            </div>
                            <CardDescription className="text-muted-foreground">
                              {cosmetic.description}
                            </CardDescription>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent className="space-y-3">
                        <div className="bg-muted/50 rounded-lg p-4">
                          {renderCosmeticPreview(cosmetic, true)}
                        </div>

                        <div className="flex items-center gap-2 pt-2 border-t border-border">
                          <Coins className="w-5 h-5 text-glow-gold" />
                          <span className="text-2xl font-bold text-foreground">{cosmetic.coinCost}</span>
                          <span className="text-muted-foreground text-sm">coins</span>
                        </div>

                        <div className="flex gap-2">
                          {cosmetic.isOwned ? (
                            <>
                              {cosmetic.isEquipped ? (
                                <Button onClick={() => unequipMutation.mutate(cosmetic.id)}
                                  disabled={unequipMutation.isPending}
                                  variant="outline"
                                  className="flex-1 border-border"
                                  data-testid={`button-unequip-${cosmetic.id}`}
                                >
                                  <X className="w-4 h-4 mr-2" />
                                  Unequip
                                </Button>
                              ) : (
                                <Button onClick={() => equipMutation.mutate(cosmetic.id)}
                                  disabled={equipMutation.isPending}
                                  className="flex-1 bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                                  data-testid={`button-equip-${cosmetic.id}`}
                                >
                                  <Check className="w-4 h-4 mr-2" />
                                  Equip
                                </Button>
                              )}
                              <Button onClick={() => setPreviewCosmetic(cosmetic)}
                                variant="outline"
                                className="border-primary/50 hover:bg-primary/30"
                                data-testid={`button-preview-${cosmetic.id}`}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </>
                          ) : (
                            <Button onClick={() => setSelectedCosmetic(cosmetic)}
                              disabled={!canPurchase(cosmetic) || purchaseMutation.isPending}
                              className={`flex-1 ${
                                canPurchase(cosmetic)
                                  ? 'bg-primary hover:bg-primary/90 text-btn-primary-foreground'
                                  : 'bg-muted dark:bg-muted cursor-not-allowed text-muted-foreground dark:text-muted-foreground'
                              }`}
                              data-testid={`button-buy-${cosmetic.id}`}
                            >
                              {dashboard?.coinBalance < cosmetic.coinCost ? (
                                <>
                                  <X className="w-4 h-4 mr-2" />
                                  Not Enough Coins
                                </>
                              ) : (
                                <>
                                  <ShoppingCart className="w-4 h-4 mr-2" />
                                  Purchase
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedCosmetic && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedCosmetic(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-primary/30 max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="text-center space-y-4">
                <div className={`w-20 h-20 mx-auto rounded-full  ${getTierColor(selectedCosmetic.tier).gradient} flex items-center justify-center`}>
                  <Sparkles className="w-10 h-10 text-btn-primary-foreground" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">{selectedCosmetic.name}</h3>
                <Badge className={`${getRarityColor(selectedCosmetic.tier)} border capitalize`}>
                  <Star className="w-3 h-3 mr-1" />
                  {selectedCosmetic.tier}
                </Badge>
                <p className="text-muted-foreground">{selectedCosmetic.description}</p>
                
                <div className="bg-muted/50 rounded-lg p-4">
                  {renderCosmeticPreview(selectedCosmetic, true)}
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-muted-foreground">Cost:</span>
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-glow-gold" />
                    <span className="text-2xl font-bold text-foreground">{selectedCosmetic.coinCost}</span>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Your Balance:</span>
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-glow-gold" />
                    <span className="text-lg font-semibold text-foreground">{dashboard?.coinBalance || 0}</span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setSelectedCosmetic(null)}
                  variant="outline"
                  className="flex-1 border-border hover:bg-muted"
                  data-testid="button-cancel-cosmetic-purchase"
                >
                  Cancel
                </Button>
                <Button onClick={() => purchaseMutation.mutate(selectedCosmetic.id)}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                  data-testid="button-confirm-cosmetic-purchase"
                >
                  {purchaseMutation.isPending ? (
                    'Purchasing...'
                  ) : (
                    <>
                      <ShoppingCart className="w-4 h-4 mr-2" />
                      Confirm Purchase
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {previewCosmetic && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 flex items-center justify-center z-50 p-4"
            onClick={() => setPreviewCosmetic(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-primary/30 max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-2xl font-bold text-foreground text-center">Preview: {previewCosmetic.name}</h3>
              <div className="bg-muted/50 rounded-lg p-8">
                {renderCosmeticPreview(previewCosmetic, true)}
              </div>
              <Button onClick={() => setPreviewCosmetic(null)}
                className="w-full bg-primary hover:bg-primary/90"
                data-testid="button-close-preview"
              >
                Close Preview
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {justPurchased && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 flex items-center justify-center z-50 p-4"
            onClick={() => setJustPurchased(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-[var(--game-success)]/30 max-w-md w-full p-6 space-y-4"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 mx-auto rounded-full bg-[var(--game-success)] flex items-center justify-center">
                  <Check className="w-8 h-8 text-btn-primary-foreground" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">Purchase Successful!</h3>
                <p className="text-muted-foreground">
                  {justPurchased.name} has been added to your collection.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 text-center space-y-2">
                <p className="text-muted-foreground text-sm">Would you like to equip it now?</p>
                <Badge className={`${getRarityColor(justPurchased.tier)} border capitalize`}>
                  {justPurchased.tier}
                </Badge>
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setJustPurchased(null)}
                  variant="outline"
                  className="flex-1 border-border hover:bg-muted"
                  data-testid="button-skip-equip"
                >
                  Maybe Later
                </Button>
                <Button onClick={() => equipMutation.mutate(justPurchased.id)}
                  disabled={equipMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                  data-testid="button-equip-now"
                >
                  {equipMutation.isPending ? (
                    'Equipping...'
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Equip Now
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
