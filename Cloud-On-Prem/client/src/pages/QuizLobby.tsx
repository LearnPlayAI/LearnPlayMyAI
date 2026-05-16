import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Brain, Zap, Trophy, X } from 'lucide-react';
import { QuizLeaderboard } from '@/components/QuizLeaderboard';
import { StudentProgressWidget } from '@/components/StudentProgressWidget';
import { GamificationHUD } from '@/components/GamificationHUD';
import { UnifiedShop } from '@/components/UnifiedShop';
import { ChallengesPanel } from '@/components/ChallengesPanel';
import { WalletInventory } from '@/components/WalletInventory';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useOrgContext } from '@/contexts/OrganizationContext';
// @ts-ignore - importing from .jsx file
import { PremiumHeader } from '@/pages/landing';

export default function QuizLobby() {
  const { terminology, terminologyLower, isResolved } = useOrgContext();
  const [shopOpen, setShopOpen] = useState(false);
  const [inventoryOpen, setInventoryOpen] = useState(false);

  const { data: user } = useQuery<any>({ queryKey: ['/api/user-status'], retry: false });
  
  const { data: userContext } = useQuery<any>({
    queryKey: ['/api/user/roles'],
    enabled: !!user && user?.isAuthenticated,
  });

  const normalizeRole = (value: string | null | undefined) =>
    (value || '').toLowerCase().replace(/[\s-]/g, '_');
  
  const isTeacherOrOrgAdmin = userContext?.roles?.some((role: any) => {
    const normalizedRole = normalizeRole(role.role);
    return normalizedRole === 'teacher' || normalizedRole === 'org_admin' || normalizedRole === 'orgadmin';
  }) || false;
  
  const isSuperAdmin = userContext?.isSuperAdmin === true;

  if (!isResolved || !terminology || !terminologyLower) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <PremiumHeader 
        isAuthenticated={user?.isAuthenticated} 
        isAdmin={isSuperAdmin || isTeacherOrOrgAdmin}
        isSuperAdmin={isSuperAdmin}
        user={user}
        isAdminLoading={false}
      />
      <div className="min-h-screen bg-game-surface-base p-[var(--container-padding)] pt-32">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Brain className="w-10 h-10 md:w-12 md:h-12 text-primary" />
            <h1 className="text-4xl md:text-5xl font-bold bg-primary hover:bg-primary/90 bg-clip-text text-transparent drop-shadow-sm" style={{ WebkitTextStroke: '0.5px color-mix(in srgb, var(--text-primary) 10%, transparent)' }}>Learning Mode</h1>
          </div>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto">
            Test your knowledge! Answer questions simultaneously and compete for the highest score.
          </p>
        </div>

        {user && user?.isAuthenticated && !isSuperAdmin && (
          <>
            <div className="flex justify-center gap-[var(--space-sm)] mb-6 flex-wrap">
              <Button onClick={() => setShopOpen(true)}
                className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-[var(--space-lg)] py-3 text-base shadow-elevated transition-all touch-manipulation"
                data-testid="button-open-shop"
              >
                <Zap className="w-5 h-5 mr-2" />
                Shop
              </Button>
              <Button onClick={() => setInventoryOpen(true)}
                className="min-h-[44px] bg-warning hover:bg-warning/90 active:bg-warning/80 text-warning-foreground font-bold px-[var(--space-lg)] py-3 text-base shadow-elevated transition-all touch-manipulation"
                data-testid="button-open-inventory"
              >
                <Trophy className="w-5 h-5 mr-2" />
                Inventory
              </Button>
            </div>

            <GamificationHUD />
          </>
        )}

        {user && user?.isAuthenticated && !isSuperAdmin && (
          <StudentProgressWidget />
        )}

        {user && user?.isAuthenticated && !isSuperAdmin && (
          <div className="mb-6">
            <ChallengesPanel />
          </div>
        )}

        {user && user?.isAuthenticated && (
          <div className="mt-8">
            <div className="hidden md:block">
              <Card surface="raised" className="border-l-4 border-l-warning">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-foreground">
                    <Trophy className="w-5 h-5 text-glow-gold animate-pulse" />
                    Top Quiz Masters 🏆
                  </CardTitle>
                  <CardDescription className="text-muted-foreground">Compete for glory!</CardDescription>
                </CardHeader>
                <CardContent>
                  <QuizLeaderboard collectionType="organization" />
                </CardContent>
              </Card>
            </div>
            <div className="md:hidden">
              <CollapsibleSection
                title="Top Quiz Masters 🏆"
                description="Compete for glory!"
                icon={Trophy}
                defaultOpen={false}
                className="bg-surface-raised shadow-card border-l-4 border-l-warning"
              >
                <QuizLeaderboard collectionType="organization" />
              </CollapsibleSection>
            </div>
          </div>
        )}
      </div>

      <Dialog open={shopOpen} onOpenChange={setShopOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl md:max-w-4xl lg:max-w-6xl xl:max-w-[90vw] 2xl:max-w-[85vw] max-h-[90vh] bg-[var(--surface-primary)] border-primary/30 overflow-y-auto">
          <button
            onClick={() => setShopOpen(false)}
            className="absolute top-4 right-4 z-50 rounded-full bg-destructive/90 hover:bg-destructive active:bg-destructive/80 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors shadow-elevated touch-manipulation"
            data-testid="button-close-shop"
            aria-label="Close shop"
          >
            <X className="w-5 h-5 text-destructive-foreground" />
          </button>
          <DialogTitle className="sr-only">Gamification Shop</DialogTitle>
          <UnifiedShop />
        </DialogContent>
      </Dialog>

      <WalletInventory open={inventoryOpen} onOpenChange={setInventoryOpen} />
      </div>
    </>
  );
}
