import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Sparkles, Languages, FileQuestion, Wand2, ShoppingCart, ImageIcon, MessageSquare, Brain, BookOpen, CheckCircle } from "lucide-react";
import { usePlatformMode } from "@/hooks/usePlatformMode";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface PricingData {
  platformPricing?: Record<string, any>;
  quizTierPricing?: Record<string, number>;
  lessonCreditPricing?: Record<string, any>;
  [key: string]: any;
}

interface PricingCard {
  title: string;
  description: string;
  icon: any;
  fields: { key: string; label: string; type: 'number' | 'percent' | 'currency'; description?: string }[];
}

const PRICING_CARDS: PricingCard[] = [
  {
    title: "E-Learning Marketplace",
    description: "Price limits for course marketplace",
    icon: ShoppingCart,
    fields: [
      { key: "minCoursePrice", label: "Minimum Course Price", type: "currency", description: "Lowest allowed course price" },
      { key: "maxCoursePrice", label: "Maximum Course Price", type: "currency", description: "Highest allowed course price" },
    ],
  },
  {
    title: "Quiz Generation",
    description: "Credit cost for AI-powered quiz generation",
    icon: FileQuestion,
    fields: [
      { key: "creditsPerQuizGeneration10", label: "Credits per 10-question Quiz", type: "number", description: "LPC deducted for 10-question quiz generation" },
      { key: "creditsPerQuizGeneration15", label: "Credits per 15-question Quiz", type: "number", description: "LPC deducted for 15-question quiz generation" },
      { key: "creditsPerQuizGeneration20", label: "Credits per 20-question Quiz", type: "number", description: "LPC deducted for 20-question quiz generation" },
    ],
  },
  {
    title: "Podcast Generation",
    description: "Estimate and settlement controls for ElevenLabs podcast usage",
    icon: MessageSquare,
    fields: [
      { key: "podcastEstimateLpcPerCharacter", label: "Estimate LPC per Character", type: "number", description: "Used for pre-generation LPC estimate" },
      { key: "podcastConversationMultiplier", label: "Conversation Mode Multiplier", type: "number", description: "Applied to host+guest estimate mode" },
      { key: "podcastMinLpc", label: "Minimum LPC", type: "number", description: "Minimum LPC charged for podcast generation" },
      { key: "podcastElevenUsdPer1kChars", label: "ElevenLabs USD per 1k Chars", type: "number", description: "Provider cost basis in USD" },
      { key: "podcastElevenSubscriptionUsdMonthly", label: "Subscription USD / Month", type: "number", description: "Monthly ElevenLabs subscription cost in USD" },
      { key: "podcastElevenSubscriptionIncludedChars", label: "Included Monthly Chars", type: "number", description: "Characters included in subscription package" },
      { key: "podcastElevenTopupUsdPer1kChars", label: "Top-up USD per 1k Chars", type: "number", description: "Additional token top-up unit price in USD" },
      { key: "podcastElevenExpectedMonthlyChars", label: "Expected Monthly Chars", type: "number", description: "Used to calculate blended subscription + top-up provider unit cost" },
      { key: "podcastUsdToLocalFxRate", label: "USD to Local FX Rate", type: "number", description: "Manual FX used to convert USD provider cost" },
      { key: "podcastTargetMarginPercent", label: "Target Margin %", type: "percent", description: "Gross margin target for settled LPC" },
      { key: "podcastLocalCurrencyPerLpc", label: "Local Currency per LPC", type: "currency", description: "Local currency value represented by 1 LPC" },
      { key: "podcastSettlementGuardrailPct", label: "Settlement Guardrail %", type: "percent", description: "Caps final LPC increase over estimate" },
      { key: "podcastUsePackageFloorLpcValue", label: "Use package floor LPC value", type: "number", description: "1 = derive local currency per LPC from package pricing floor; 0 = manual value" },
      { key: "podcastEnforceNoLossFloor", label: "Enforce no-loss settlement", type: "number", description: "1 = never settle below provider break-even; 0 = allow under-recovery" },
    ],
  },
  {
    title: "AI Content Generation",
    description: "Credit costs for AI lesson creation and fixes",
    icon: Sparkles,
    fields: [
      { key: "creditsPerLessonGeneration", label: "Credits per Lesson", type: "number", description: "LPC deducted per lesson generation" },
      { key: "creditsPerAiFix", label: "Credits per AI Fix", type: "number", description: "LPC deducted per AI content fix" },
      { key: "creditsPerOverviewGeneration", label: "Credits per Overview", type: "number", description: "LPC deducted per course overview generation" },
      { key: "creditsPerKeyTakeawaysGeneration", label: "Credits per Key Takeaways", type: "number", description: "LPC deducted per key takeaways generation" },
    ],
  },
  {
    title: "Translation Costs",
    description: "Credit costs for translating content across languages",
    icon: Languages,
    fields: [
      { key: "creditsPerLessonTranslation", label: "Lesson Translation", type: "number", description: "LPC per lesson translation (includes digest + podcast script translation)" },
      { key: "creditsPerQuizTranslation", label: "Quiz Translation", type: "number", description: "LPC per quiz translation" },
      { key: "creditsPerCourseTranslation", label: "Course Translation", type: "number", description: "LPC per course translation" },
      { key: "creditsPerTranslatedPptxGeneration", label: "PPTX Translation", type: "number", description: "LPC per translated PPTX generation" },
    ],
  },
  {
    title: "AI Thumbnails",
    description: "Credit cost for AI-generated course thumbnails",
    icon: ImageIcon,
    fields: [
      { key: "creditsPerThumbnailGeneration", label: "Credits per Thumbnail", type: "number", description: "LPC deducted per AI thumbnail generation" },
    ],
  },
  {
    title: "Lesson Feedback",
    description: "Credit cost for AI-powered lesson quality reports",
    icon: MessageSquare,
    fields: [
      { key: "creditsPerHealthReport", label: "Credits per Report", type: "number", description: "LPC deducted per lesson feedback/health report" },
    ],
  },
  {
    title: "Topic Analysis",
    description: "Credit cost for AI topic analysis in Course Document Wizard",
    icon: Brain,
    fields: [
      { key: "creditsPerTopicAnalysis", label: "Credits per Analysis", type: "number", description: "LPC deducted per AI topic analysis" },
    ],
  },
  {
    title: "Framework Generation",
    description: "Credit cost for AI-powered course framework generation",
    icon: BookOpen,
    fields: [
      { key: "creditsPerFrameworkGeneration", label: "Credits per Framework", type: "number", description: "LPC deducted per course framework generation" },
    ],
  },
  {
    title: "Quiz Explanations",
    description: "Credit cost for AI-generated quiz answer explanations",
    icon: Wand2,
    fields: [
      { key: "creditsPerExplanationGeneration", label: "Credits per Explanation", type: "number", description: "LPC deducted per quiz explanation generation" },
    ],
  },
  {
    title: "Quiz Answer Verification",
    description: "Credit cost for AI-powered quiz answer checking",
    icon: CheckCircle,
    fields: [
      { key: "creditsPerAnswerCheck", label: "Credits per Check", type: "number", description: "LPC deducted per quiz answer verification" },
    ],
  },
];

export default function CustSuperPricing() {
  const { toast } = useToast();
  const { onpremOwnApiKeys, onpremMode } = usePlatformMode();

  const { data, isLoading } = useQuery<PricingData>({
    queryKey: ["/api/admin/custsuper/pricing"],
  });

  const [formData, setFormData] = useState<Record<string, any>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (data?.platformPricing) {
      const initialData = { ...data.platformPricing };
      if (data.quizTierPricing) {
        initialData.creditsPerQuizGeneration10 = data.quizTierPricing["10"];
        initialData.creditsPerQuizGeneration15 = data.quizTierPricing["15"];
        initialData.creditsPerQuizGeneration20 = data.quizTierPricing["20"];
      } else if (initialData.creditsPerQuizGeneration !== undefined) {
        const defaultQuizCost = Number(initialData.creditsPerQuizGeneration);
        initialData.creditsPerQuizGeneration10 = defaultQuizCost;
        initialData.creditsPerQuizGeneration15 = defaultQuizCost;
        initialData.creditsPerQuizGeneration20 = defaultQuizCost;
      }
      if (!initialData.currency) {
        initialData.currency = "ZAR";
      }
      if (initialData.podcastEstimateLpcPerCharacter === undefined) initialData.podcastEstimateLpcPerCharacter = 0.06;
      if (initialData.podcastConversationMultiplier === undefined) initialData.podcastConversationMultiplier = 1.15;
      if (initialData.podcastMinLpc === undefined) initialData.podcastMinLpc = 40;
      if (initialData.podcastMaxLpc === undefined) initialData.podcastMaxLpc = 0;
      if (initialData.podcastElevenUsdPer1kChars === undefined) initialData.podcastElevenUsdPer1kChars = 0.3;
      if (initialData.podcastElevenSubscriptionUsdMonthly === undefined) initialData.podcastElevenSubscriptionUsdMonthly = 0;
      if (initialData.podcastElevenSubscriptionIncludedChars === undefined) initialData.podcastElevenSubscriptionIncludedChars = 0;
      if (initialData.podcastElevenTopupUsdPer1kChars === undefined) initialData.podcastElevenTopupUsdPer1kChars = 0.3;
      if (initialData.podcastElevenExpectedMonthlyChars === undefined) initialData.podcastElevenExpectedMonthlyChars = 0;
      if (initialData.podcastUsePackageFloorLpcValue === undefined) initialData.podcastUsePackageFloorLpcValue = 1;
      else initialData.podcastUsePackageFloorLpcValue = initialData.podcastUsePackageFloorLpcValue ? 1 : 0;
      if (initialData.podcastEnforceNoLossFloor === undefined) initialData.podcastEnforceNoLossFloor = 1;
      else initialData.podcastEnforceNoLossFloor = initialData.podcastEnforceNoLossFloor ? 1 : 0;
      if (initialData.podcastUsdToLocalFxRate === undefined) initialData.podcastUsdToLocalFxRate = 18.5;
      if (initialData.podcastTargetMarginPercent === undefined) initialData.podcastTargetMarginPercent = 35;
      if (initialData.podcastLocalCurrencyPerLpc === undefined) initialData.podcastLocalCurrencyPerLpc = 1;
      if (initialData.podcastSettlementGuardrailPct === undefined) initialData.podcastSettlementGuardrailPct = 20;
      setFormData(initialData);
      setHasChanges(false);
    }
  }, [data]);

  const updateMutation = useMutation({
    mutationFn: async (updates: Record<string, any>) => {
      return await apiRequest("/api/admin/custsuper/pricing", {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/custsuper/pricing"] });
      toast({ title: "Pricing updated", description: "Your pricing changes have been saved." });
      setHasChanges(false);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update pricing", variant: "destructive" });
    },
  });

  const handleChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = () => {
    const updates: Record<string, any> = {};
    const originalData = data?.platformPricing || {};
    const originalQuizTierPricing = data?.quizTierPricing || {};
    for (const card of PRICING_CARDS) {
      for (const field of card.fields) {
        const val = formData[field.key];
        if (field.key === "creditsPerQuizGeneration10" || field.key === "creditsPerQuizGeneration15" || field.key === "creditsPerQuizGeneration20") {
          continue;
        }
        if (val !== undefined && String(val) !== String(originalData[field.key] ?? "")) {
          updates[field.key] = field.type === "number" ? Number(val) : val;
        }
      }
    }

    const quizTiersChanged =
      String(formData.creditsPerQuizGeneration10 ?? "") !== String(originalQuizTierPricing["10"] ?? "") ||
      String(formData.creditsPerQuizGeneration15 ?? "") !== String(originalQuizTierPricing["15"] ?? "") ||
      String(formData.creditsPerQuizGeneration20 ?? "") !== String(originalQuizTierPricing["20"] ?? "");
    if (quizTiersChanged) {
      updates.quizTierPricing = {
        "10": Number(formData.creditsPerQuizGeneration10 ?? 0),
        "15": Number(formData.creditsPerQuizGeneration15 ?? 0),
        "20": Number(formData.creditsPerQuizGeneration20 ?? 0),
      };
      updates.creditsPerQuizGeneration = Number(formData.creditsPerQuizGeneration10 ?? 0);
    }

    if (String(formData.currency ?? "") !== String(originalData.currency ?? "ZAR")) {
      updates.currency = String(formData.currency || "ZAR").toUpperCase();
    }

    if (Object.keys(updates).length === 0) {
      toast({ title: "No changes", description: "No pricing values have been modified." });
      return;
    }
    updateMutation.mutate(updates);
  };

  if (!onpremMode) {
    return (
      <QuizAdminLayout title="Manage Pricing" description="Configure LPC pricing for AI features" activeSection="manage-pricing">
        <div className="max-w-4xl">
          <Card className="bg-card/50 border-border">
            <CardContent className="p-[var(--card-padding)]">
              <p className="text-muted-foreground">Pricing management is only available when using your own API keys.</p>
            </CardContent>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  if (isLoading) {
    return (
      <QuizAdminLayout title="Manage Pricing" description="Configure LPC pricing for AI features" activeSection="manage-pricing">
        <div className="space-y-[var(--space-lg)] max-w-6xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--card-gap)]">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
              <Card key={i} className="bg-card/50 border-border">
                <CardHeader className="p-[var(--card-padding)]">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-64 mt-2" />
                </CardHeader>
                <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Manage Pricing" description="Configure LPC pricing for AI features" activeSection="manage-pricing">
      <div className="space-y-[var(--space-lg)] max-w-6xl">
        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <CardTitle className="text-foreground text-[length:var(--text-lg)]">Pricing Currency</CardTitle>
            <CardDescription className="text-[length:var(--text-sm)]">
              Source-of-truth currency used for platform pricing and LPC cost configuration.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0">
            <div className="space-y-1.5 max-w-sm">
              <Label htmlFor="currency" className="text-[length:var(--text-sm)] text-foreground">
                Source Currency
              </Label>
              <Select
                value={String(formData.currency || "ZAR")}
                onValueChange={(value) => handleChange("currency", value)}
              >
                <SelectTrigger id="currency" className="bg-background border-border">
                  <SelectValue placeholder="Select currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="ZAR">ZAR</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[length:var(--text-xs)] text-muted-foreground">Use Currency Management to maintain exchange rates.</p>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--card-gap)]">
          {PRICING_CARDS.map(card => {
            const Icon = card.icon;
            return (
              <Card key={card.title} className="bg-card/50 border-border">
                <CardHeader className="p-[var(--card-padding)]">
                  <div className="flex items-center gap-[var(--space-sm)]">
                    <div className="p-2 bg-primary/20 rounded-lg">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-foreground text-[length:var(--text-lg)]">{card.title}</CardTitle>
                      <CardDescription className="text-[length:var(--text-sm)]">{card.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
                  {card.fields.map(field => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={field.key} className="text-[length:var(--text-sm)] text-foreground">
                        {field.label}
                      </Label>
                      <Input
                        id={field.key}
                        type="number"
                        step={field.type === 'percent' || field.type === 'currency' ? '0.01' : '1'}
                        min="0"
                        value={formData[field.key] ?? ''}
                        onChange={e => handleChange(field.key, e.target.value)}
                        className="bg-background border-border"
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                      {field.description && (
                        <p className="text-[length:var(--text-xs)] text-muted-foreground">{field.description}</p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {hasChanges && (
          <div className="fixed bottom-6 right-6 z-50">
            <Button onClick={handleSave} disabled={updateMutation.isPending} size="lg" className="shadow-lg gap-2" >
              {updateMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Changes
            </Button>
          </div>
        )}
      </div>
    </QuizAdminLayout>
  );
}
