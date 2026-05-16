import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Sparkles, Zap, Crown, Rocket, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useLessonCreditCosts } from "@/hooks/useLessonCreditCosts";
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from "@shared/creditConstants";

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: 'trial' | 'standard' | 'premium' | 'enterprise';
  monthlyCredits: number;
  pricePerTeacher: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  badge?: string;
  colorScheme?: string;
  features?: string[];
  isActive: boolean;
  displayOrder: number;
}

// Removed hardcoded tierConfig - now using database-driven values
// const tierConfig = {
//   trial: {
//     icon: Sparkles,
//     label: "Trial",
//     color: "from-success",
//     borderColor: "border-success/50",
//     badgeColor: "bg-success",
//   },
//   standard: {
//     icon: Zap,
//     label: "Standard",
//     color: "from-primary",
//     borderColor: "border-border",
//     badgeColor: "bg-primary",
//   },
//   premium: {
//     icon: Crown,
//     label: "Premium",
//     color: "from-primary",
//     borderColor: "border-border",
//     badgeColor: "bg-primary",
//   },
//   enterprise: {
//     icon: Rocket,
//     label: "Enterprise",
//     color: "from-warning",
//     borderColor: "border-warning/50",
//     badgeColor: "bg-warning",
//   },
// };

// Dynamic color configuration based on colorScheme from database
const getColorConfig = (colorScheme: string) => {
  switch(colorScheme) {
    case 'green': return { color: "from-[var(--action-primary)]", borderColor: "border-primary/50", badgeColor: "bg-primary" };
    case 'blue': return { color: "from-[var(--action-secondary)]", borderColor: "border-secondary/50", badgeColor: "bg-secondary" };
    case 'purple': return { color: "from-[var(--action-primary)]", borderColor: "border-primary/50", badgeColor: "bg-primary" };
    case 'orange': return { color: "from-[var(--warning)]", borderColor: "border-[var(--warning)]/50", badgeColor: "bg-warning" };
    default: return { color: "from-[var(--action-secondary)]", borderColor: "border-secondary/50", badgeColor: "bg-secondary" };
  }
};

// Dynamic icon selection based on tier
const getTierIcon = (tier: string) => {
  switch(tier) {
    case 'trial': return Sparkles;
    case 'standard': return Zap;
    case 'premium': return Crown;
    case 'enterprise': return Rocket;
    default: return Zap;
  }
};

export function LessonCreditTiers() {
  const { formatPrice } = useCurrencyPreference();
  const { costs, getAverageCreditsPerLesson } = useLessonCreditCosts();
  
  const { data, isLoading, isError } = useQuery<{ subscriptionPlans: SubscriptionPlan[] }>({
    queryKey: ['/api/public/subscription-plans'],
    staleTime: 5 * 60 * 1000,
  });

  const plans = data?.subscriptionPlans || [];
  
  const avgTextOnlyCredits = getAverageCreditsPerLesson(false);
  const avgWithImagesCredits = getAverageCreditsPerLesson(true);

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-7xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-8">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl sm:text-4xl font-bold gradient-text mb-4"
          >
            {LP_CREDITS_NAME} for AI Lessons
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg text-muted-foreground max-w-3xl mx-auto"
          >
            Create engaging AI-powered presentations with our AI Lesson Generator. Text-only lessons use {costs.creditsPerLessonTextOnlyMin}-{costs.creditsPerLessonTextOnlyMax} {LP_CREDITS_SHORT} (~{avgTextOnlyCredits} avg), lessons with images use {costs.creditsPerLessonWithImagesMin}-{costs.creditsPerLessonWithImagesMax} {LP_CREDITS_SHORT} (~{avgWithImagesCredits} avg).
          </motion.p>
        </div>

        {/* 150 Free Credits Highlight */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mb-8 p-6 bg-primary hover:bg-primary/90 border-2 border-primary/50 rounded-xl"
          data-testid="free-credits-callout"
        >
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Sparkles className="w-6 h-6 text-primary animate-pulse" />
            <p className="text-lg font-bold text-foreground">
              🎉 New teachers and team leads get <span className="text-primary text-xl">150 FREE {LP_CREDITS_SHORT}</span> to generate their first AI lesson!
            </p>
            <Sparkles className="w-6 h-6 text-primary animate-pulse" />
          </div>
        </motion.div>

        {/* Tier Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {isLoading ? (
            // Loading Skeleton
            Array.from({ length: 4 }).map((_, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <Card className="border-2 border-border/50 bg-card/50 backdrop-blur-sm">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-muted animate-pulse" />
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-12 h-12 bg-muted animate-pulse rounded-lg" />
                      <div className="w-16 h-6 bg-muted animate-pulse rounded" />
                    </div>
                    <div className="mb-4">
                      <div className="w-24 h-8 bg-muted animate-pulse rounded mb-2" />
                      <div className="w-32 h-4 bg-muted animate-pulse rounded" />
                    </div>
                    <div className="mb-4 pb-4 border-b border-border">
                      <div className="w-28 h-6 bg-muted animate-pulse rounded" />
                    </div>
                    <div className="space-y-2">
                      <div className="w-full h-4 bg-muted animate-pulse rounded" />
                      <div className="w-3/4 h-4 bg-muted animate-pulse rounded" />
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))
          ) : isError || plans.length === 0 ? (
            // Error/Empty State
            <div className="col-span-full text-center py-8" data-testid="pricing-error-state">
              <p className="text-muted-foreground mb-4" data-testid="error-message">
                Unable to load pricing tiers at this time. Please try again later.
              </p>
              <p className="text-sm text-muted-foreground">
                Contact <a href="mailto:sales@learnplay.co.za" className="text-primary hover:underline" data-testid="contact-sales-link">sales@learnplay.co.za</a> for pricing information.
              </p>
            </div>
          ) : (
            plans.map((plan, index) => {
            const colorConfig = getColorConfig(plan.colorScheme || 'blue');
            const Icon = getTierIcon(plan.tier);

            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 * index }}
                whileHover={{ y: -8, transition: { duration: 0.2 } }}
                data-testid={`tier-card-${plan.tier}`}
              >
                <Card
                  className={`relative overflow-hidden border-2 ${colorConfig.borderColor} bg-card/50 backdrop-blur-sm transition-all duration-300 hover:shadow-dialog hover:shadow-${colorConfig.color.split('-')[1]}-500/30`}
                >
                  <div className={`absolute top-0 left-0 right-0 h-1  ${colorConfig.color}`} />
                  
                  <CardContent className="p-6">
                    {/* Tier Header */}
                    <div className="flex items-center justify-between mb-4">
                      <div className={`p-3 rounded-lg  ${colorConfig.color}`}>
                        <Icon className="w-6 h-6 text-primary-foreground" />
                      </div>
                      {plan.badge && (
                        <Badge className={`${colorConfig.badgeColor} text-primary-foreground border-0`}>
                          {plan.badge}
                        </Badge>
                      )}
                    </div>

                    {/* Credits */}
                    <div className="mb-4">
                      <div className="text-3xl font-bold gradient-text mb-1" data-testid={`credits-${plan.tier}`}>
                        {plan.monthlyCredits.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {LP_CREDITS_SHORT}/month
                      </div>
                    </div>

                    {/* Price */}
                    <div className="mb-4 pb-4 border-b border-border">
                      <div className="flex items-baseline gap-1" data-testid={`price-${plan.tier}`}>
                        <span className="text-2xl font-bold">{formatPrice(plan.pricePerTeacher, plan.currency || 'ZAR')}</span>
                        <span className="text-sm text-muted-foreground">/teacher/month</span>
                      </div>
                    </div>

                    {/* Features */}
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-muted-foreground" data-testid={`lessons-${plan.tier}`}>
                          ~{Math.floor(plan.monthlyCredits / 150)} AI lessons/month
                        </span>
                      </div>
                      {plan.tier === 'trial' && (
                        <div className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-primary font-semibold">
                            1 FREE lesson included
                          </span>
                        </div>
                      )}
                      {parseFloat(plan.pricePerTeacher) > 0 && (
                        <div className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">
                            Rollover unused {LP_CREDITS_SHORT}
                          </span>
                        </div>
                      )}
                      {plan.features && plan.features.length > 0 && plan.features.map((feature, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <Check className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                          <span className="text-sm text-muted-foreground">
                            {feature}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
          )}
        </div>

        {/* Explainer Text */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="mt-8 p-6 bg-card/30 backdrop-blur-sm rounded-xl border border-border"
        >
          <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            How {LP_CREDITS_NAME} Work
          </h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
            <div>
              <p className="mb-2">
                <span className="font-semibold text-foreground">AI-Powered Presentations:</span> Generate professional slide decks on any topic using our AI Lesson Generator.
              </p>
            </div>
            <div>
              <p className="mb-2">
                <span className="font-semibold text-foreground">Flexible Usage:</span> Each lesson costs ~150 {LP_CREDITS_SHORT}. Unused {LP_CREDITS_SHORT} roll over monthly for paid plans.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
