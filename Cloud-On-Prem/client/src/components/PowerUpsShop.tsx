import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, Coins, ShoppingCart, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useRewardNotification } from '@/hooks/useRewardNotification';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface PowerUp {
  id: string;
  name: string;
  description: string;
  effectType: string;
  effectValue: number;
  duration: number | null;
  coinCost: number;
  isActive: boolean;
  userActive?: boolean;
  iconColor: string;
}

export function PowerUpsShop() {
  const { toast } = useToast();
  const { showPowerUp } = useRewardNotification();
  const [selectedPowerUp, setSelectedPowerUp] = useState<PowerUp | null>(null);
  const [justPurchased, setJustPurchased] = useState<PowerUp | null>(null);

  const { data: powerUps = [], isLoading } = useQuery<PowerUp[]>({
    queryKey: ['/api/gamification/powerups/catalog'],
  });

  const { data: dashboard } = useQuery<any>({
    queryKey: ['/api/gamification/dashboard'],
  });

  const purchaseMutation = useMutation({
    mutationFn: async (powerUpId: string) => {
      return apiRequest(`/api/gamification/powerups/${powerUpId}/purchase`, {
        method: 'POST',
      });
    },
    onSuccess: (_data, powerUpId) => {
      const purchased = powerUps.find(p => p.id === powerUpId);
      if (purchased) {
        showPowerUp(purchased.name, 'rare');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/catalog'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/active'] });
      setSelectedPowerUp(null);
      
      if (purchased && purchased.duration) {
        setJustPurchased(purchased);
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Not enough coins or power-up already active.',
        variant: 'destructive',
      });
    },
  });

  const activateMutation = useMutation({
    mutationFn: async (powerUpId: string) => {
      return apiRequest('/api/gamification/powerups/activate', {
        method: 'POST',
        body: JSON.stringify({ powerUpId }),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/inventory'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/powerups/active'] });
      toast({
        title: 'Power-Up Activated!',
        description: 'Your power-up is now active and ready to use.',
      });
      setJustPurchased(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Activation Failed',
        description: error.message || 'Could not activate power-up.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (selectedPowerUp || justPurchased) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [selectedPowerUp, justPurchased]);

  const canPurchase = (powerUp: PowerUp) => {
    return dashboard?.coinBalance >= powerUp.coinCost && !powerUp.userActive;
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'Permanent';
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
  };

  const getEffectDescription = (powerUp: PowerUp) => {
    switch (powerUp.effectType) {
      case 'xp_multiplier':
        return `+${(powerUp.effectValue * 100 - 100).toFixed(0)}% XP`;
      case 'coin_multiplier':
        return `+${(powerUp.effectValue * 100 - 100).toFixed(0)}% Coins`;
      case 'change_answer':
        return `${powerUp.effectValue} use${powerUp.effectValue > 1 ? 's' : ''}`;
      case 'hint_reveal':
        return `${powerUp.effectValue} hint${powerUp.effectValue > 1 ? 's' : ''}`;
      default:
        return powerUp.description;
    }
  };

  const getEffectColor = (effectType: string) => {
    switch (effectType) {
      case 'xp_multiplier':
        return 'from-[var(--game-xp)]';
      case 'coin_multiplier':
        return 'from-[var(--game-gold)]';
      case 'change_answer':
        return 'from-[var(--action-primary)]';
      case 'hint_reveal':
        return 'from-[var(--chart-2)]';
      default:
        return 'from-muted';
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-64 bg-muted/50 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 bg-card text-foreground p-6 rounded-xl border border-border">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="w-6 h-6 text-glow-gold" />
            Power-Ups Shop
          </h2>
          <p className="text-muted-foreground mt-1">Boost your quiz performance with special abilities</p>
        </div>
        <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border shadow-sm">
          <Coins className="w-5 h-5 text-glow-gold" />
          <span className="text-xl font-bold text-foreground" data-testid="text-shop-balance">
            {dashboard?.coinBalance?.toLocaleString() || 0}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
        <AnimatePresence>
            {powerUps.map((powerUp, index) => (
              <motion.div
                key={powerUp.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ scale: 1.02 }}
                className="relative"
              >
                <Card className={` ${getEffectColor(powerUp.effectType)} p-[2px] border-0`}>
                  <div className="bg-card rounded-lg h-full">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <CardTitle className="text-foreground flex items-center gap-2">
                            <Zap className="w-5 h-5" style={{ color: powerUp.iconColor }} />
                            {powerUp.name}
                          </CardTitle>
                          <CardDescription className="text-muted-foreground mt-2">
                            {powerUp.description}
                          </CardDescription>
                        </div>
                        {powerUp.userActive && (
                          <Badge >
                            Active
                          </Badge>
                        )}
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Zap className="w-4 h-4" />
                        <span className="font-semibold">{getEffectDescription(powerUp)}</span>
                      </div>
                      {powerUp.duration && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>Duration: {formatDuration(powerUp.duration)}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <Coins className="w-5 h-5 text-glow-gold" />
                        <span className="text-2xl font-bold text-foreground">{powerUp.coinCost}</span>
                        <span className="text-muted-foreground text-sm">coins</span>
                      </div>
                    </CardContent>

                    <CardFooter>
                      <Button onClick={() => setSelectedPowerUp(powerUp)}
                        disabled={!canPurchase(powerUp) || purchaseMutation.isPending}
                        className={`w-full ${
                          canPurchase(powerUp)
                            ? 'bg-primary hover:bg-primary/90 text-primary-foreground'
                            : 'bg-muted dark:bg-muted cursor-not-allowed text-muted-foreground dark:text-muted-foreground'
                        }`}
                        data-testid={`button-buy-${powerUp.id}`}
                      >
                        {powerUp.userActive ? (
                          <>
                            <Check className="w-4 h-4 mr-2" />
                            Active
                          </>
                        ) : dashboard?.coinBalance < powerUp.coinCost ? (
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
                    </CardFooter>
                  </div>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
      </div>

      <AnimatePresence>
        {selectedPowerUp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPowerUp(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-lg border border-primary/30 max-w-md w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="text-center space-y-2">
                <div className={`w-16 h-16 mx-auto rounded-full  ${getEffectColor(selectedPowerUp.effectType)} flex items-center justify-center`}>
                  <Zap className="w-8 h-8 text-btn-primary-foreground" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">{selectedPowerUp.name}</h3>
                <p className="text-muted-foreground">{selectedPowerUp.description}</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Effect:</span>
                  <span className="text-foreground font-semibold">{getEffectDescription(selectedPowerUp)}</span>
                </div>
                {selectedPowerUp.duration && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="text-foreground font-semibold">{formatDuration(selectedPowerUp.duration)}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-muted-foreground">Cost:</span>
                  <div className="flex items-center gap-2">
                    <Coins className="w-5 h-5 text-glow-gold" />
                    <span className="text-2xl font-bold text-foreground">{selectedPowerUp.coinCost}</span>
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
                <Button onClick={() => setSelectedPowerUp(null)}
                  variant="outline"
                  className="flex-1 border-border hover:bg-muted"
                  data-testid="button-cancel-purchase"
                >
                  Cancel
                </Button>
                <Button onClick={() => purchaseMutation.mutate(selectedPowerUp.id)}
                  disabled={purchaseMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground"
                  data-testid="button-confirm-purchase"
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
                  {justPurchased.name} has been added to your inventory.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4 text-center space-y-2">
                <p className="text-muted-foreground text-sm">Would you like to activate it now?</p>
                {justPurchased.duration && (
                  <p className="text-foreground font-semibold">
                    Duration: {formatDuration(justPurchased.duration)}
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button onClick={() => setJustPurchased(null)}
                  variant="outline"
                  className="flex-1 border-border hover:bg-muted"
                  data-testid="button-skip-activation"
                >
                  Maybe Later
                </Button>
                <Button onClick={() => activateMutation.mutate(justPurchased.id)}
                  disabled={activateMutation.isPending}
                  className="flex-1 bg-primary hover:bg-primary/90 text-btn-primary-foreground"
                  data-testid="button-activate-now"
                >
                  {activateMutation.isPending ? (
                    'Activating...'
                  ) : (
                    <>
                      <Zap className="w-4 h-4 mr-2" />
                      Activate Now
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
