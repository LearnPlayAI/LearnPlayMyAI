import { useQuery, useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Trophy, Calendar, Clock, Coins, CheckCircle2, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CollapsibleSection } from '@/components/ui/collapsible-section';
import { useToast } from '@/hooks/use-toast';
import { useRewardNotification } from '@/hooks/useRewardNotification';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface Challenge {
  id: string;
  name: string;
  description: string;
  type: string;
  frequency: string;
  targetValue: number;
  currentProgress: number;
  coinReward: number;
  status: string;
  expiresAt: string;
}

export function ChallengesPanel() {
  const { toast } = useToast();
  const { showChallenge } = useRewardNotification();

  const { data: challenges = [], isLoading } = useQuery<Challenge[]>({
    queryKey: ['/api/gamification/challenges'],
    refetchInterval: 30000,
  });

  const claimMutation = useMutation({
    mutationFn: async (challengeId: string) => {
      return apiRequest(`/api/gamification/challenges/${challengeId}/claim`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any, challengeId: string) => {
      const challenge = challenges.find(c => c.id === challengeId);
      if (challenge && data.coins) {
        showChallenge(challenge.name, data.coins);
      }
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/challenges'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/wallet/transactions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/student/progress-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-leaderboard'] });
    },
    onError: () => {
      toast({
        title: 'Claim Failed',
        description: 'Challenge not completed or already claimed.',
        variant: 'destructive',
      });
    },
  });

  const dailyChallenges = challenges.filter(c => c.frequency === 'daily');
  const weeklyChallenges = challenges.filter(c => c.frequency === 'weekly');
  
  const completedChallengesCount = challenges.filter(c => c.status === 'completed').length;

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date().getTime();
    const expiry = new Date(expiresAt).getTime();
    const diff = expiry - now;

    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `${days}d ${hours % 24}h`;
    }
    return `${hours}h ${minutes}m`;
  };

  const renderChallenge = (challenge: Challenge, index: number) => {
    const progressPercent = (challenge.currentProgress / challenge.targetValue) * 100;
    const isCompleted = challenge.status === 'completed';
    const isClaimed = challenge.status === 'claimed';

    return (
      <motion.div
        key={challenge.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1 }}
      >
        <Card className={` ${
          isClaimed 
            ? 'from-muted/50 border-border' 
            : isCompleted
            ? 'from-[var(--success)]/20 border-[var(--success)]/50'
            : 'from-muted/50 border-primary/30'
        } hover:shadow-elevated transition-all`}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-5 h-5 text-primary" />
                  <CardTitle className="text-lg text-foreground">{challenge.name}</CardTitle>
                </div>
                <CardDescription className="text-muted-foreground">
                  {challenge.description}
                </CardDescription>
              </div>
              {isClaimed ? (
                <Badge >
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Claimed
                </Badge>
              ) : isCompleted ? (
                <Badge className="animate-pulse">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Ready!
                </Badge>
              ) : (
                <Badge >
                  <Clock className="w-3 h-3 mr-1" />
                  {getTimeRemaining(challenge.expiresAt)}
                </Badge>
              )}
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Progress</span>
                <span className="text-foreground font-semibold">
                  {challenge.currentProgress} / {challenge.targetValue}
                </span>
              </div>
              <Progress 
                value={Math.min(progressPercent, 100)} 
                className="h-3 bg-muted"
                data-testid={`progress-challenge-${challenge.id}`}
              />
            </div>

            {/* Reward */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-warning" />
                <span className="text-xl font-bold text-foreground">{challenge.coinReward}</span>
                <span className="text-muted-foreground text-sm">coins</span>
              </div>

              {isCompleted && !isClaimed && (
                <Button onClick={() => claimMutation.mutate(challenge.id)}
                  disabled={claimMutation.isPending}
                  className="bg-success"
                  data-testid={`button-claim-${challenge.id}`}
                >
                  <Trophy className="w-4 h-4 mr-2" />
                  Claim Reward
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-48 bg-muted/50 animate-pulse rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CollapsibleSection
        title="Challenges"
        description="Complete challenges to earn bonus coins"
        icon={Trophy}
        defaultOpen={false}
        badgeCount={completedChallengesCount}
        badgeLabel={completedChallengesCount === 1 ? "1 ready to claim!" : `${completedChallengesCount} ready to claim!`}
        testId="challenges-section"
        className="bg-[var(--surface-raised)] border-primary/30 shadow-card"
      >
        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full max-w-md mx-auto md:mx-0 grid-cols-2 bg-tab border border-stroke-default">
            <TabsTrigger 
              value="daily"
              className="text-tab-foreground"
              data-testid="tab-daily-challenges"
            >
              <Calendar className="w-4 h-4 mr-2" />
              Daily ({dailyChallenges.length})
            </TabsTrigger>
            <TabsTrigger 
              value="weekly"
              className="text-tab-foreground"
              data-testid="tab-weekly-challenges"
            >
              <Clock className="w-4 h-4 mr-2" />
              Weekly ({weeklyChallenges.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="space-y-4 mt-6">
            {dailyChallenges.length === 0 ? (
              <Card className="bg-muted/50 border-border">
                <CardContent className="py-12 text-center">
                  <Calendar className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-muted-foreground">No Daily Challenges</h3>
                  <p className="text-muted-foreground">Check back tomorrow for new challenges!</p>
                </CardContent>
              </Card>
            ) : (
              dailyChallenges.map((challenge, index) => renderChallenge(challenge, index))
            )}
          </TabsContent>

          <TabsContent value="weekly" className="space-y-4 mt-6">
            {weeklyChallenges.length === 0 ? (
              <Card className="bg-muted/50 border-border">
                <CardContent className="py-12 text-center">
                  <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2 text-muted-foreground">No Weekly Challenges</h3>
                  <p className="text-muted-foreground">Check back next week for new challenges!</p>
                </CardContent>
              </Card>
            ) : (
              weeklyChallenges.map((challenge, index) => renderChallenge(challenge, index))
            )}
          </TabsContent>
        </Tabs>
      </CollapsibleSection>
    </div>
  );
}
