import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';
import { 
  DollarSign, 
  Save,
  AlertCircle,
  AlertTriangle,
  Sparkles,
  Building2,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Package,
  Edit,
  Trash2,
  CreditCard,
  Webhook,
  Eye,
  EyeOff,
  Copy,
  Link,
  ImageIcon,
  MessageSquare,
  BarChart3,
  Wand2,
  FileQuestion,
  Languages
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import LessonCreditPricingCalculator from '@/components/LessonCreditPricingCalculator';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from "@shared/creditConstants";
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { useAuth } from '@/hooks/useAuth';

interface PlatformPricing {
  id: string;
  learnerMonthlyCost: string;
  elearningLearnerMonthlyCost?: string;
  elearningLearnerDiscountPercent?: string;
  currency: string;
  defaultCourseCommissionRate?: string;
  minCoursePrice?: string;
  maxCoursePrice?: string;
  creditsPerLessonGeneration?: number;
  creditsPerAiFix?: number;
  creditsPerQuizGeneration?: number;
  creditsPerOverviewGeneration?: number;
  creditsPerKeyTakeawaysGeneration?: number;
  creditsPerLessonTranslation?: number;
  creditsPerQuizTranslation?: number;
  creditsPerCourseTranslation?: number;
  creditsPerTranslatedPptxGeneration?: number;
  podcastEstimateLpcPerCharacter?: string;
  podcastConversationMultiplier?: string;
  podcastMinLpc?: number;
  podcastMaxLpc?: number;
  podcastElevenUsdPer1kChars?: string;
  podcastElevenSubscriptionUsdMonthly?: string;
  podcastElevenSubscriptionIncludedChars?: number;
  podcastElevenTopupUsdPer1kChars?: string;
  podcastElevenExpectedMonthlyChars?: number;
  podcastUsePackageFloorLpcValue?: boolean;
  podcastEnforceNoLossFloor?: boolean;
  podcastUsdToLocalFxRate?: string;
  podcastTargetMarginPercent?: string;
  podcastLocalCurrencyPerLpc?: string;
  podcastSettlementGuardrailPct?: string;
  updatedAt: string;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  monthlyCredits: number;
  pricePerTeacher: string;
  currency: string;
  features: string[];
  displayOrder: number;
  badge?: string;
  colorScheme?: string;
}

interface PaymentSettings {
  id: string;
  yocoMode: 'test' | 'live';
  updatedAt: string;
  updatedBy: string | null;
}

interface WebhookStatus {
  currentMode: 'test' | 'live';
  webhookSecretConfigured: boolean;
  webhookUrl: string;
  activeWebhook: {
    id: string;
    webhookId: string;
    mode: 'test' | 'live';
    webhookUrl: string;
    registeredAt: string;
  } | null;
}

interface WebhookRegistrationResponse {
  webhookId: string;
  webhookSecret: string;
  webhookUrl: string;
  mode: 'test' | 'live';
  registeredAt: string;
}

interface QuizTierPricing {
  tier: '10' | '15' | '20';
  creditCost: number;
  questionCount: number;
  label: string;
}

interface QuizTierPricingResponse {
  tiers: QuizTierPricing[];
  isOrganizationOverride: boolean;
}

interface PlatformPricingPageProps {
  view?: 'pricing' | 'payment';
}

export default function PlatformPricing({ view = 'pricing' }: PlatformPricingPageProps) {
  const { toast } = useToast();
  const { formatPrice } = useCurrencyPreference();
  const { baseUrl } = usePlatformMode();
  const { isCustSuper } = useAuth();
  const isPaymentIntegrationView = view === 'payment';
  const pageTitle = isPaymentIntegrationView ? 'Payment Integration' : 'Platform Pricing';
  const pageDescription = isPaymentIntegrationView
    ? 'Configure YOCO mode and webhook integration'
    : `Manage pricing for learners and ${LP_CREDITS_SHORT} tiers`;
  const activeSection = isPaymentIntegrationView ? 'payment-integration' : 'platform-pricing';
  const [elearningLearnerCost, setElearningLearnerCost] = useState('');
  const [elearningDiscountPercent, setElearningDiscountPercent] = useState('');
  const [commissionRate, setCommissionRate] = useState('');
  const [minCoursePrice, setMinCoursePrice] = useState('');
  const [maxCoursePrice, setMaxCoursePrice] = useState('');
  const [planEdits, setPlanEdits] = useState<Record<string, { monthlyCredits: number; pricePerTeacher: string }>>({});
  const [webhookSecret, setWebhookSecret] = useState<string | null>(null);
  const [registeredWebhookId, setRegisteredWebhookId] = useState<string | null>(null);
  const [showWebhookSecret, setShowWebhookSecret] = useState(false);
  const [manualWebhookId, setManualWebhookId] = useState('');
  const [yocoWebhooks, setYocoWebhooks] = useState<{ mode: string; webhooks: any[] } | null>(null);
  const [showPackageModal, setShowPackageModal] = useState(false);
  const [editingPackage, setEditingPackage] = useState<any>(null);
  const [packageForm, setPackageForm] = useState({
    name: '',
    creditsAmount: '',
    priceAmount: '',
    currency: 'USD',
    badge: '',
    features: '',
    displayOrder: '',
    colorScheme: 'green',
    isActive: true,
  });
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [planForm, setPlanForm] = useState({
    name: '',
    monthlyCredits: '',
    pricePerTeacher: '',
    currency: 'ZAR',
    badge: '',
    features: '',
    displayOrder: '',
    colorScheme: 'green',
  });
  const [quizTierPricing, setQuizTierPricing] = useState<{ tier10: string; tier15: string; tier20: string }>({
    tier10: '',
    tier15: '',
    tier20: '',
  });
  const [thumbnailCreditCost, setThumbnailCreditCost] = useState<string>('');
  const [originalThumbnailCost, setOriginalThumbnailCost] = useState<string>('');
  const [healthReportCreditCost, setHealthReportCreditCost] = useState<string>('');
  const [originalHealthReportCost, setOriginalHealthReportCost] = useState<string>('');
  const [topicAnalysisCreditCost, setTopicAnalysisCreditCost] = useState<string>('');
  const [originalTopicAnalysisCost, setOriginalTopicAnalysisCost] = useState<string>('');
  const [frameworkGenerationCreditCost, setFrameworkGenerationCreditCost] = useState<string>('');
  const [originalFrameworkGenerationCost, setOriginalFrameworkGenerationCost] = useState<string>('');
  const [explanationCreditCost, setExplanationCreditCost] = useState<string>('');
  const [originalExplanationCost, setOriginalExplanationCost] = useState<string>('');
  const [answerCheckCreditCost, setAnswerCheckCreditCost] = useState<string>('');
  const [originalAnswerCheckCost, setOriginalAnswerCheckCost] = useState<string>('');
  const [lessonGenerationCost, setLessonGenerationCost] = useState<string>('');
  const [originalLessonGenerationCost, setOriginalLessonGenerationCost] = useState<string>('');
  const [aiFixCost, setAiFixCost] = useState<string>('');
  const [originalAiFixCost, setOriginalAiFixCost] = useState<string>('');
  const [overviewGenerationCost, setOverviewGenerationCost] = useState<string>('');
  const [originalOverviewGenerationCost, setOriginalOverviewGenerationCost] = useState<string>('');
  const [keyTakeawaysCost, setKeyTakeawaysCost] = useState<string>('');
  const [originalKeyTakeawaysCost, setOriginalKeyTakeawaysCost] = useState<string>('');
  const [quizGenerationCost, setQuizGenerationCost] = useState<string>('');
  const [originalQuizGenerationCost, setOriginalQuizGenerationCost] = useState<string>('');
  const [lessonTranslationCost, setLessonTranslationCost] = useState<string>('');
  const [originalLessonTranslationCost, setOriginalLessonTranslationCost] = useState<string>('');
  const [quizTranslationCost, setQuizTranslationCost] = useState<string>('');
  const [originalQuizTranslationCost, setOriginalQuizTranslationCost] = useState<string>('');
  const [courseTranslationCost, setCourseTranslationCost] = useState<string>('');
  const [originalCourseTranslationCost, setOriginalCourseTranslationCost] = useState<string>('');
  const [translatedPptxCost, setTranslatedPptxCost] = useState<string>('');
  const [originalTranslatedPptxCost, setOriginalTranslatedPptxCost] = useState<string>('');
  const [podcastEstimateRate, setPodcastEstimateRate] = useState<string>('');
  const [originalPodcastEstimateRate, setOriginalPodcastEstimateRate] = useState<string>('');
  const [podcastConversationMultiplier, setPodcastConversationMultiplier] = useState<string>('');
  const [originalPodcastConversationMultiplier, setOriginalPodcastConversationMultiplier] = useState<string>('');
  const [podcastMinLpc, setPodcastMinLpc] = useState<string>('');
  const [originalPodcastMinLpc, setOriginalPodcastMinLpc] = useState<string>('');
  const [podcastMaxLpc, setPodcastMaxLpc] = useState<string>('');
  const [originalPodcastMaxLpc, setOriginalPodcastMaxLpc] = useState<string>('');
  const [podcastElevenUsdPer1kChars, setPodcastElevenUsdPer1kChars] = useState<string>('');
  const [originalPodcastElevenUsdPer1kChars, setOriginalPodcastElevenUsdPer1kChars] = useState<string>('');
  const [podcastElevenSubscriptionUsdMonthly, setPodcastElevenSubscriptionUsdMonthly] = useState<string>('');
  const [originalPodcastElevenSubscriptionUsdMonthly, setOriginalPodcastElevenSubscriptionUsdMonthly] = useState<string>('');
  const [podcastElevenSubscriptionIncludedChars, setPodcastElevenSubscriptionIncludedChars] = useState<string>('');
  const [originalPodcastElevenSubscriptionIncludedChars, setOriginalPodcastElevenSubscriptionIncludedChars] = useState<string>('');
  const [podcastElevenTopupUsdPer1kChars, setPodcastElevenTopupUsdPer1kChars] = useState<string>('');
  const [originalPodcastElevenTopupUsdPer1kChars, setOriginalPodcastElevenTopupUsdPer1kChars] = useState<string>('');
  const [podcastElevenExpectedMonthlyChars, setPodcastElevenExpectedMonthlyChars] = useState<string>('');
  const [originalPodcastElevenExpectedMonthlyChars, setOriginalPodcastElevenExpectedMonthlyChars] = useState<string>('');
  const [podcastUsePackageFloorLpcValue, setPodcastUsePackageFloorLpcValue] = useState<boolean>(true);
  const [originalPodcastUsePackageFloorLpcValue, setOriginalPodcastUsePackageFloorLpcValue] = useState<boolean>(true);
  const [podcastEnforceNoLossFloor, setPodcastEnforceNoLossFloor] = useState<boolean>(true);
  const [originalPodcastEnforceNoLossFloor, setOriginalPodcastEnforceNoLossFloor] = useState<boolean>(true);
  const [podcastUsdToLocalFxRate, setPodcastUsdToLocalFxRate] = useState<string>('');
  const [originalPodcastUsdToLocalFxRate, setOriginalPodcastUsdToLocalFxRate] = useState<string>('');
  const [podcastTargetMarginPercent, setPodcastTargetMarginPercent] = useState<string>('');
  const [originalPodcastTargetMarginPercent, setOriginalPodcastTargetMarginPercent] = useState<string>('');
  const [podcastLocalCurrencyPerLpc, setPodcastLocalCurrencyPerLpc] = useState<string>('');
  const [originalPodcastLocalCurrencyPerLpc, setOriginalPodcastLocalCurrencyPerLpc] = useState<string>('');
  const [podcastSettlementGuardrailPct, setPodcastSettlementGuardrailPct] = useState<string>('');
  const [originalPodcastSettlementGuardrailPct, setOriginalPodcastSettlementGuardrailPct] = useState<string>('');


  const { data, isLoading, isError, error } = useQuery<{ platformPricing: PlatformPricing; subscriptionPlans: SubscriptionPlan[] }>({
    queryKey: ['/api/admin/platform-pricing'],
    retry: false,
  });

  const { data: packagesData } = useQuery<{packages: any[]}>({
    queryKey: ['/api/admin/credit-packages'],
    queryFn: async () => {
      const response = await fetch('/api/admin/credit-packages', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch credit packages');
      return response.json();
    },
  });

  const { data: paymentSettingsData } = useQuery<{ paymentSettings: PaymentSettings }>({
    queryKey: ['/api/superadmin/payment-settings'],
  });

  const { data: webhookStatusData, refetch: refetchWebhookStatus } = useQuery<WebhookStatus>({
    queryKey: ['/api/superadmin/webhook-status'],
  });

  const { data: quizTierData, isLoading: isLoadingQuizTiers } = useQuery<QuizTierPricingResponse>({
    queryKey: ['/api/admin/platform-pricing', 'quiz-tiers'],
    queryFn: async () => {
      const response = await fetch('/api/admin/platform-pricing/quiz-tiers', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch quiz tier pricing');
      return response.json();
    },
  });

  const { data: thumbnailPricingData, isLoading: isLoadingThumbnailPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/admin/platform-pricing', 'thumbnail-credits'],
    queryFn: async () => {
      const response = await fetch('/api/admin/platform-pricing/thumbnail-credits', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch thumbnail pricing');
      return response.json();
    },
  });

  const { data: healthReportPricingData, isLoading: isLoadingHealthReportPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/admin/platform-pricing', 'health-report-credits'],
    queryFn: async () => {
      const response = await fetch('/api/admin/platform-pricing/health-report-credits', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch health report pricing');
      return response.json();
    },
  });

  const { data: topicAnalysisPricingData, isLoading: isLoadingTopicAnalysisPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/admin/platform-pricing', 'topic-analysis-credits'],
    queryFn: async () => {
      const response = await fetch('/api/admin/platform-pricing/topic-analysis-credits', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch topic analysis pricing');
      return response.json();
    },
  });

  const { data: frameworkGenerationPricingData, isLoading: isLoadingFrameworkGenerationPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/admin/platform-pricing', 'framework-generation-credits'],
    queryFn: async () => {
      const response = await fetch('/api/admin/platform-pricing/framework-generation-credits', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch framework generation pricing');
      return response.json();
    },
  });

  const { data: explanationPricingData, isLoading: isLoadingExplanationPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/admin/platform-pricing', 'explanation-credits'],
    queryFn: async () => {
      const response = await fetch('/api/admin/platform-pricing/explanation-credits', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch explanation pricing');
      return response.json();
    },
  });

  const { data: answerCheckPricingData, isLoading: isLoadingAnswerCheckPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/admin/platform-pricing', 'answer-check-credits'],
    queryFn: async () => {
      const response = await fetch('/api/admin/platform-pricing/answer-check-credits', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch answer check pricing');
      return response.json();
    },
  });

  const registerWebhookMutation = useMutation({
    mutationFn: async (): Promise<WebhookRegistrationResponse> => {
      const result = await apiRequest('/api/superadmin/register-webhook', {
        method: 'POST',
      });
      return result as unknown as WebhookRegistrationResponse;
    },
    onSuccess: (data: WebhookRegistrationResponse) => {
      setWebhookSecret(data.webhookSecret);
      setRegisteredWebhookId(data.webhookId);
      setShowWebhookSecret(true); // Auto-show the secret so user doesn't miss it
      refetchWebhookStatus();
      toast({
        title: "Webhook Registered Successfully!",
        description: `IMPORTANT: Copy the webhook secret (whsec_...) shown below and add it to your Replit Secrets.`,
        duration: 10000, // Keep toast visible longer
      });
    },
    onError: (error: any) => {
      toast({
        title: "Registration Failed",
        description: error.message || "Failed to register webhook with YOCO",
        variant: "destructive",
      });
    },
  });

  const deleteWebhookMutation = useMutation({
    mutationFn: async ({ webhookId }: { webhookId: string }) => {
      return await apiRequest(`/api/superadmin/webhook/${webhookId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      refetchWebhookStatus();
      setManualWebhookId('');
      setYocoWebhooks(null);
      toast({
        title: "Webhook Deleted",
        description: "You can now register a new webhook",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete webhook",
        variant: "destructive",
      });
    },
  });

  const listWebhooksMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/superadmin/webhooks/list`, {
        method: 'GET',
      });
    },
    onSuccess: (data: any) => {
      setYocoWebhooks(data);
      if (!data.webhooks || data.webhooks.length === 0) {
        toast({
          title: "No Webhooks Found",
          description: `No webhooks registered in ${data.mode} mode on YOCO`,
        });
      } else {
        toast({
          title: "Webhooks Listed",
          description: `Found ${data.webhooks.length} webhook(s) in ${data.mode} mode`,
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "List Failed",
        description: error.message || "Failed to list webhooks from YOCO",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (data) {
      if (data.platformPricing) {
        setElearningLearnerCost(data.platformPricing.elearningLearnerMonthlyCost || '19.99');
        setElearningDiscountPercent(data.platformPricing.elearningLearnerDiscountPercent || '15.00');
        setCommissionRate(data.platformPricing.defaultCourseCommissionRate || '0.30');
        setMinCoursePrice(data.platformPricing.minCoursePrice || '50.00');
        setMaxCoursePrice(data.platformPricing.maxCoursePrice || '10000.00');
        const lessonGenCost = (data.platformPricing.creditsPerLessonGeneration ?? 50).toString();
        setLessonGenerationCost(lessonGenCost);
        setOriginalLessonGenerationCost(lessonGenCost);
        const aiFixCostVal = (data.platformPricing.creditsPerAiFix ?? 10).toString();
        setAiFixCost(aiFixCostVal);
        setOriginalAiFixCost(aiFixCostVal);
        const overviewGenCost = (data.platformPricing.creditsPerOverviewGeneration ?? 25).toString();
        setOverviewGenerationCost(overviewGenCost);
        setOriginalOverviewGenerationCost(overviewGenCost);
        const keyTakeawaysCostVal = (data.platformPricing.creditsPerKeyTakeawaysGeneration ?? 25).toString();
        setKeyTakeawaysCost(keyTakeawaysCostVal);
        setOriginalKeyTakeawaysCost(keyTakeawaysCostVal);
        const quizGenCost = (data.platformPricing.creditsPerQuizGeneration ?? 15).toString();
        setQuizGenerationCost(quizGenCost);
        setOriginalQuizGenerationCost(quizGenCost);
        const lessonTransCost = (data.platformPricing.creditsPerLessonTranslation ?? 10).toString();
        setLessonTranslationCost(lessonTransCost);
        setOriginalLessonTranslationCost(lessonTransCost);
        const quizTransCost = (data.platformPricing.creditsPerQuizTranslation ?? 5).toString();
        setQuizTranslationCost(quizTransCost);
        setOriginalQuizTranslationCost(quizTransCost);
        const courseTransCost = (data.platformPricing.creditsPerCourseTranslation ?? 50).toString();
        setCourseTranslationCost(courseTransCost);
        setOriginalCourseTranslationCost(courseTransCost);
        const pptxTransCost = (data.platformPricing.creditsPerTranslatedPptxGeneration ?? 50).toString();
        setTranslatedPptxCost(pptxTransCost);
        setOriginalTranslatedPptxCost(pptxTransCost);
        const podcastEstimateRateVal = (data.platformPricing.podcastEstimateLpcPerCharacter ?? '0.06').toString();
        setPodcastEstimateRate(podcastEstimateRateVal);
        setOriginalPodcastEstimateRate(podcastEstimateRateVal);
        const podcastConversationMultiplierVal = (data.platformPricing.podcastConversationMultiplier ?? '1.15').toString();
        setPodcastConversationMultiplier(podcastConversationMultiplierVal);
        setOriginalPodcastConversationMultiplier(podcastConversationMultiplierVal);
        const podcastMinLpcVal = (data.platformPricing.podcastMinLpc ?? 40).toString();
        setPodcastMinLpc(podcastMinLpcVal);
        setOriginalPodcastMinLpc(podcastMinLpcVal);
        const podcastMaxLpcVal = "0";
        setPodcastMaxLpc(podcastMaxLpcVal);
        setOriginalPodcastMaxLpc(podcastMaxLpcVal);
        const podcastUsdPer1kVal = (data.platformPricing.podcastElevenUsdPer1kChars ?? '0.3').toString();
        setPodcastElevenUsdPer1kChars(podcastUsdPer1kVal);
        setOriginalPodcastElevenUsdPer1kChars(podcastUsdPer1kVal);
        const podcastSubscriptionMonthlyUsdVal = (data.platformPricing.podcastElevenSubscriptionUsdMonthly ?? '0').toString();
        setPodcastElevenSubscriptionUsdMonthly(podcastSubscriptionMonthlyUsdVal);
        setOriginalPodcastElevenSubscriptionUsdMonthly(podcastSubscriptionMonthlyUsdVal);
        const podcastSubscriptionIncludedCharsVal = (data.platformPricing.podcastElevenSubscriptionIncludedChars ?? 0).toString();
        setPodcastElevenSubscriptionIncludedChars(podcastSubscriptionIncludedCharsVal);
        setOriginalPodcastElevenSubscriptionIncludedChars(podcastSubscriptionIncludedCharsVal);
        const podcastTopupUsdPer1kVal = (data.platformPricing.podcastElevenTopupUsdPer1kChars ?? '0.3').toString();
        setPodcastElevenTopupUsdPer1kChars(podcastTopupUsdPer1kVal);
        setOriginalPodcastElevenTopupUsdPer1kChars(podcastTopupUsdPer1kVal);
        const podcastExpectedCharsVal = (data.platformPricing.podcastElevenExpectedMonthlyChars ?? 0).toString();
        setPodcastElevenExpectedMonthlyChars(podcastExpectedCharsVal);
        setOriginalPodcastElevenExpectedMonthlyChars(podcastExpectedCharsVal);
        const podcastUsePackageFloorVal = data.platformPricing.podcastUsePackageFloorLpcValue !== false;
        setPodcastUsePackageFloorLpcValue(podcastUsePackageFloorVal);
        setOriginalPodcastUsePackageFloorLpcValue(podcastUsePackageFloorVal);
        const podcastNoLossVal = data.platformPricing.podcastEnforceNoLossFloor !== false;
        setPodcastEnforceNoLossFloor(podcastNoLossVal);
        setOriginalPodcastEnforceNoLossFloor(podcastNoLossVal);
        const podcastFxVal = (data.platformPricing.podcastUsdToLocalFxRate ?? '18.5').toString();
        setPodcastUsdToLocalFxRate(podcastFxVal);
        setOriginalPodcastUsdToLocalFxRate(podcastFxVal);
        const podcastMarginVal = (data.platformPricing.podcastTargetMarginPercent ?? '35').toString();
        setPodcastTargetMarginPercent(podcastMarginVal);
        setOriginalPodcastTargetMarginPercent(podcastMarginVal);
        const podcastCurrencyPerLpcVal = (data.platformPricing.podcastLocalCurrencyPerLpc ?? '1').toString();
        setPodcastLocalCurrencyPerLpc(podcastCurrencyPerLpcVal);
        setOriginalPodcastLocalCurrencyPerLpc(podcastCurrencyPerLpcVal);
        const podcastGuardrailVal = (data.platformPricing.podcastSettlementGuardrailPct ?? '20').toString();
        setPodcastSettlementGuardrailPct(podcastGuardrailVal);
        setOriginalPodcastSettlementGuardrailPct(podcastGuardrailVal);
      }
      const initialEdits: Record<string, { monthlyCredits: number; pricePerTeacher: string }> = {};
      data.subscriptionPlans.forEach((plan: SubscriptionPlan) => {
        initialEdits[plan.id] = {
          monthlyCredits: plan.monthlyCredits,
          pricePerTeacher: plan.pricePerTeacher
        };
      });
      setPlanEdits(initialEdits);
    }
  }, [data]);

  useEffect(() => {
    if (quizTierData?.tiers) {
      const tier10 = quizTierData.tiers.find(t => t.tier === '10');
      const tier15 = quizTierData.tiers.find(t => t.tier === '15');
      const tier20 = quizTierData.tiers.find(t => t.tier === '20');
      setQuizTierPricing({
        tier10: tier10?.creditCost.toString() || '',
        tier15: tier15?.creditCost.toString() || '',
        tier20: tier20?.creditCost.toString() || '',
      });
    }
  }, [quizTierData]);

  useEffect(() => {
    if (thumbnailPricingData) {
      const costStr = thumbnailPricingData.creditCost.toString();
      setThumbnailCreditCost(costStr);
      setOriginalThumbnailCost(costStr);
    }
  }, [thumbnailPricingData]);

  useEffect(() => {
    if (healthReportPricingData) {
      const costStr = healthReportPricingData.creditCost.toString();
      setHealthReportCreditCost(costStr);
      setOriginalHealthReportCost(costStr);
    }
  }, [healthReportPricingData]);

  useEffect(() => {
    if (topicAnalysisPricingData) {
      const costStr = topicAnalysisPricingData.creditCost.toString();
      setTopicAnalysisCreditCost(costStr);
      setOriginalTopicAnalysisCost(costStr);
    }
  }, [topicAnalysisPricingData]);

  useEffect(() => {
    if (frameworkGenerationPricingData?.creditCost !== undefined) {
      const costStr = frameworkGenerationPricingData.creditCost.toString();
      setFrameworkGenerationCreditCost(costStr);
      setOriginalFrameworkGenerationCost(costStr);
    }
  }, [frameworkGenerationPricingData]);

  useEffect(() => {
    if (explanationPricingData?.creditCost !== undefined) {
      const costStr = explanationPricingData.creditCost.toString();
      setExplanationCreditCost(costStr);
      setOriginalExplanationCost(costStr);
    }
  }, [explanationPricingData]);

  useEffect(() => {
    if (answerCheckPricingData?.creditCost !== undefined) {
      const costStr = answerCheckPricingData.creditCost.toString();
      setAnswerCheckCreditCost(costStr);
      setOriginalAnswerCheckCost(costStr);
    }
  }, [answerCheckPricingData]);

  const updatePricingMutation = useMutation({
    mutationFn: async (pricingData: { 
      learnerMonthlyCost?: number; 
      elearningLearnerMonthlyCost?: number;
      elearningLearnerDiscountPercent?: number;
      defaultCourseCommissionRate?: number;
      minCoursePrice?: number;
      maxCoursePrice?: number;
    }) => {
      return await apiRequest('/api/admin/platform-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pricingData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing'] });
      toast({
        title: 'Updated',
        description: 'Platform pricing settings updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update pricing settings',
      });
    },
  });

  const updateSubscriptionPlanMutation = useMutation({
    mutationFn: async ({ planId, planData }: { planId: string; planData: any }) => {
      return await apiRequest(`/api/admin/subscription-plans/${planId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(planData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing'] });
      queryClient.invalidateQueries({ queryKey: ['/api/public/subscription-plans'] });
      toast({
        title: 'Updated',
        description: 'Subscription plan updated successfully',
      });
      setShowPlanModal(false);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update subscription plan',
      });
    },
  });

  const createPackageMutation = useMutation({
    mutationFn: async (packageData: any) => {
      return await apiRequest('/api/admin/credit-packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packageData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-packages'] });
      toast({
        title: 'Created',
        description: 'Credit package created successfully',
      });
      setShowPackageModal(false);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Creation failed',
        description: error.message || 'Failed to create credit package',
      });
    },
  });

  const updatePackageMutation = useMutation({
    mutationFn: async ({ id, packageData }: { id: string; packageData: any }) => {
      return await apiRequest(`/api/admin/credit-packages/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packageData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-packages'] });
      toast({
        title: 'Updated',
        description: 'Credit package updated successfully',
      });
      setShowPackageModal(false);
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update credit package',
      });
    },
  });

  const deletePackageMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/admin/credit-packages/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/credit-packages'] });
      toast({
        title: 'Deleted',
        description: 'Credit package deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error.message || 'Failed to delete credit package',
      });
    },
  });

  const updatePaymentModeMutation = useMutation({
    mutationFn: async (yocoMode: 'test' | 'live') => {
      return await apiRequest('/api/superadmin/payment-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yocoMode }),
      });
    },
    onSuccess: (result: any) => {
      if (result?.paymentSettings) {
        queryClient.setQueryData(['/api/superadmin/payment-settings'], {
          paymentSettings: result.paymentSettings,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/payment-settings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/superadmin/webhook-status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/payments/yoco-mode'] });
      toast({
        title: 'Updated',
        description: 'Payment gateway mode updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update payment mode',
      });
    },
  });

  const updateQuizTierPricingMutation = useMutation({
    mutationFn: async (tiers: { tier: '10' | '15' | '20'; creditCost: number }[]) => {
      return await apiRequest('/api/admin/platform-pricing/quiz-tiers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tiers }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing', 'quiz-tiers'] });
      toast({
        title: 'Updated',
        description: 'Quiz tier pricing updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update quiz tier pricing',
      });
    },
  });

  const updateThumbnailPricingMutation = useMutation({
    mutationFn: async (creditCost: number) => {
      return await apiRequest('/api/admin/platform-pricing/thumbnail-credits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditCost }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing', 'thumbnail-credits'] });
      setOriginalThumbnailCost(thumbnailCreditCost);
      toast({
        title: 'Updated',
        description: 'AI thumbnail generation pricing updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Update failed',
        description: error.message || 'Failed to update thumbnail pricing',
      });
    },
  });

  const updateHealthReportPricingMutation = useMutation({
    mutationFn: async (creditCost: number) => {
      return await apiRequest('/api/admin/platform-pricing/health-report-credits', {
        method: 'PUT',
        body: JSON.stringify({ creditCost }),
      });
    },
    onSuccess: () => {
      setOriginalHealthReportCost(healthReportCreditCost);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing', 'health-report-credits'] });
      toast({ title: 'Success', description: 'Health report pricing updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update health report pricing', variant: 'destructive' });
    },
  });

  const updateTopicAnalysisPricingMutation = useMutation({
    mutationFn: async (creditCost: number) => {
      return await apiRequest('/api/admin/platform-pricing/topic-analysis-credits', {
        method: 'PUT',
        body: JSON.stringify({ creditCost }),
      });
    },
    onSuccess: () => {
      setOriginalTopicAnalysisCost(topicAnalysisCreditCost);
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing', 'topic-analysis-credits'] });
      toast({ title: 'Success', description: 'Topic analysis pricing updated successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update topic analysis pricing', variant: 'destructive' });
    },
  });

  const updateFrameworkGenerationPricingMutation = useMutation({
    mutationFn: async (creditCost: number) => {
      return await apiRequest('/api/admin/platform-pricing/framework-generation-credits', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditCost }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing', 'framework-generation-credits'] });
      setOriginalFrameworkGenerationCost(frameworkGenerationCreditCost);
      toast({ title: 'Saved', description: 'Framework generation pricing updated successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update framework generation pricing' });
    },
  });

  const updateExplanationPricingMutation = useMutation({
    mutationFn: async (creditCost: number) => {
      return await apiRequest('/api/admin/platform-pricing/explanation-credits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditCost }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing', 'explanation-credits'] });
      setOriginalExplanationCost(explanationCreditCost);
      toast({ title: 'Saved', description: 'Explanation generation pricing updated successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update explanation pricing' });
    },
  });

  const updateAnswerCheckPricingMutation = useMutation({
    mutationFn: async (creditCost: number) => {
      return await apiRequest('/api/admin/platform-pricing/answer-check-credits', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creditCost }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing', 'answer-check-credits'] });
      setOriginalAnswerCheckCost(answerCheckCreditCost);
      toast({ title: 'Saved', description: 'Answer check pricing updated successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update answer check pricing' });
    },
  });

  const updateAiGenerationCostsMutation = useMutation({
    mutationFn: async (costs: { creditsPerLessonGeneration?: number; creditsPerAiFix?: number; creditsPerQuizGeneration?: number; creditsPerOverviewGeneration?: number; creditsPerKeyTakeawaysGeneration?: number }) => {
      return await apiRequest('/api/admin/platform-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costs),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing'] });
      setOriginalLessonGenerationCost(lessonGenerationCost);
      setOriginalAiFixCost(aiFixCost);
      setOriginalQuizGenerationCost(quizGenerationCost);
      setOriginalOverviewGenerationCost(overviewGenerationCost);
      setOriginalKeyTakeawaysCost(keyTakeawaysCost);
      toast({ title: 'Saved', description: 'AI generation costs updated successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update AI generation costs' });
    },
  });

  const handleSaveAiGenerationCosts = () => {
    const lessonGen = parseInt(lessonGenerationCost, 10);
    const fix = parseInt(aiFixCost, 10);
    const quizGen = parseInt(quizGenerationCost, 10);
    const overviewGen = parseInt(overviewGenerationCost, 10);
    const keyTakeaways = parseInt(keyTakeawaysCost, 10);

    if (isNaN(lessonGen) || lessonGen < 1 || lessonGen > 500) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Lesson generation cost must be between 1 and 500' });
      return;
    }
    if (isNaN(fix) || fix < 1 || fix > 100) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'AI fix cost must be between 1 and 100' });
      return;
    }
    if (isNaN(quizGen) || quizGen < 1 || quizGen > 100) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Quiz generation cost must be between 1 and 100' });
      return;
    }
    if (isNaN(overviewGen) || overviewGen < 1 || overviewGen > 500) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Overview generation cost must be between 1 and 500' });
      return;
    }
    if (isNaN(keyTakeaways) || keyTakeaways < 1 || keyTakeaways > 500) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Key takeaways generation cost must be between 1 and 500' });
      return;
    }

    updateAiGenerationCostsMutation.mutate({
      creditsPerLessonGeneration: lessonGen,
      creditsPerAiFix: fix,
      creditsPerQuizGeneration: quizGen,
      creditsPerOverviewGeneration: overviewGen,
      creditsPerKeyTakeawaysGeneration: keyTakeaways,
    });
  };

  const updateTranslationCostsMutation = useMutation({
    mutationFn: async (costs: { creditsPerLessonTranslation?: number; creditsPerQuizTranslation?: number; creditsPerCourseTranslation?: number; creditsPerTranslatedPptxGeneration?: number }) => {
      return await apiRequest('/api/admin/platform-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(costs),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing'] });
      setOriginalLessonTranslationCost(lessonTranslationCost);
      setOriginalQuizTranslationCost(quizTranslationCost);
      setOriginalCourseTranslationCost(courseTranslationCost);
      setOriginalTranslatedPptxCost(translatedPptxCost);
      toast({ title: 'Saved', description: 'Translation costs updated successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update translation costs' });
    },
  });

  const handleSaveTranslationCosts = () => {
    const lessonTrans = parseInt(lessonTranslationCost, 10);
    const quizTrans = parseInt(quizTranslationCost, 10);
    const courseTrans = parseInt(courseTranslationCost, 10);
    const pptxTrans = parseInt(translatedPptxCost, 10);

    if (isNaN(lessonTrans) || lessonTrans < 1 || lessonTrans > 500) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Lesson translation cost must be between 1 and 500' });
      return;
    }
    if (isNaN(quizTrans) || quizTrans < 1 || quizTrans > 500) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Quiz translation cost must be between 1 and 500' });
      return;
    }
    if (isNaN(courseTrans) || courseTrans < 1 || courseTrans > 500) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Course translation cost must be between 1 and 500' });
      return;
    }
    if (isNaN(pptxTrans) || pptxTrans < 1 || pptxTrans > 500) {
      toast({ variant: 'destructive', title: 'Invalid Value', description: 'Translated PPTX generation cost must be between 1 and 500' });
      return;
    }

    updateTranslationCostsMutation.mutate({
      creditsPerLessonTranslation: lessonTrans,
      creditsPerQuizTranslation: quizTrans,
      creditsPerCourseTranslation: courseTrans,
      creditsPerTranslatedPptxGeneration: pptxTrans,
    });
  };

  const updatePodcastPricingMutation = useMutation({
    mutationFn: async (payload: Record<string, number | boolean>) => {
      return await apiRequest('/api/admin/platform-pricing', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/platform-pricing'] });
      setOriginalPodcastEstimateRate(podcastEstimateRate);
      setOriginalPodcastConversationMultiplier(podcastConversationMultiplier);
      setOriginalPodcastMinLpc(podcastMinLpc);
      setOriginalPodcastMaxLpc(podcastMaxLpc);
      setOriginalPodcastElevenUsdPer1kChars(podcastElevenUsdPer1kChars);
      setOriginalPodcastElevenSubscriptionUsdMonthly(podcastElevenSubscriptionUsdMonthly);
      setOriginalPodcastElevenSubscriptionIncludedChars(podcastElevenSubscriptionIncludedChars);
      setOriginalPodcastElevenTopupUsdPer1kChars(podcastElevenTopupUsdPer1kChars);
      setOriginalPodcastElevenExpectedMonthlyChars(podcastElevenExpectedMonthlyChars);
      setOriginalPodcastUsePackageFloorLpcValue(podcastUsePackageFloorLpcValue);
      setOriginalPodcastEnforceNoLossFloor(podcastEnforceNoLossFloor);
      setOriginalPodcastUsdToLocalFxRate(podcastUsdToLocalFxRate);
      setOriginalPodcastTargetMarginPercent(podcastTargetMarginPercent);
      setOriginalPodcastLocalCurrencyPerLpc(podcastLocalCurrencyPerLpc);
      setOriginalPodcastSettlementGuardrailPct(podcastSettlementGuardrailPct);
      toast({ title: 'Saved', description: 'Podcast pricing settings updated successfully' });
    },
    onError: (error: any) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update podcast pricing settings' });
    },
  });

  const handleSavePodcastPricing = () => {
    const estimateRate = Number(podcastEstimateRate);
    const convMultiplier = Number(podcastConversationMultiplier);
    const minLpc = Number(podcastMinLpc);
    const maxLpc = Number(podcastMaxLpc);
    const usdPer1k = Number(podcastElevenUsdPer1kChars);
    const subscriptionMonthlyUsd = Number(podcastElevenSubscriptionUsdMonthly);
    const subscriptionIncludedChars = Number(podcastElevenSubscriptionIncludedChars);
    const topupUsdPer1k = Number(podcastElevenTopupUsdPer1kChars || podcastElevenUsdPer1kChars);
    const expectedMonthlyChars = Number(podcastElevenExpectedMonthlyChars);
    const fxRate = Number(podcastUsdToLocalFxRate);
    const marginPercent = Number(podcastTargetMarginPercent);
    const localPerLpc = Number(podcastLocalCurrencyPerLpc);
    const guardrailPct = Number(podcastSettlementGuardrailPct);

    if (!Number.isFinite(estimateRate) || estimateRate <= 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Estimate LPC per character must be greater than 0' });
    if (!Number.isFinite(convMultiplier) || convMultiplier < 1) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Conversation multiplier must be 1 or greater' });
    if (!Number.isFinite(minLpc) || minLpc < 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Minimum LPC must be 0 or greater' });
    if (!Number.isFinite(maxLpc) || maxLpc < 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Maximum LPC must be 0 or greater' });
    if (!Number.isFinite(usdPer1k) || usdPer1k <= 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'ElevenLabs USD per 1k chars must be greater than 0' });
    if (!Number.isFinite(subscriptionMonthlyUsd) || subscriptionMonthlyUsd < 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'ElevenLabs subscription USD/month must be 0 or greater' });
    if (!Number.isFinite(subscriptionIncludedChars) || subscriptionIncludedChars < 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Included chars must be 0 or greater' });
    if (!Number.isFinite(topupUsdPer1k) || topupUsdPer1k <= 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Top-up USD per 1k chars must be greater than 0' });
    if (!Number.isFinite(expectedMonthlyChars) || expectedMonthlyChars < 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Expected monthly chars must be 0 or greater' });
    if (!Number.isFinite(fxRate) || fxRate <= 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'USD to local FX rate must be greater than 0' });
    if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Target margin % must be between 0 and 99.99' });
    if (!Number.isFinite(localPerLpc) || localPerLpc <= 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Local currency per LPC must be greater than 0' });
    if (!Number.isFinite(guardrailPct) || guardrailPct < 0) return toast({ variant: 'destructive', title: 'Invalid Value', description: 'Settlement guardrail % must be 0 or greater' });

    updatePodcastPricingMutation.mutate({
      podcastEstimateLpcPerCharacter: estimateRate,
      podcastConversationMultiplier: convMultiplier,
      podcastMinLpc: Math.round(minLpc),
      podcastMaxLpc: 0,
      podcastElevenUsdPer1kChars: usdPer1k,
      podcastElevenSubscriptionUsdMonthly: subscriptionMonthlyUsd,
      podcastElevenSubscriptionIncludedChars: Math.round(subscriptionIncludedChars),
      podcastElevenTopupUsdPer1kChars: topupUsdPer1k,
      podcastElevenExpectedMonthlyChars: Math.round(expectedMonthlyChars),
      podcastUsePackageFloorLpcValue,
      podcastEnforceNoLossFloor,
      podcastUsdToLocalFxRate: fxRate,
      podcastTargetMarginPercent: marginPercent,
      podcastLocalCurrencyPerLpc: localPerLpc,
      podcastSettlementGuardrailPct: guardrailPct,
    });
  };

  const handleSaveElearningLearnerSettings = () => {
    const cost = parseFloat(elearningLearnerCost);
    const discount = parseFloat(elearningDiscountPercent);
    
    if (isNaN(cost) || cost < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid cost',
        description: 'Please enter a valid positive subscription cost',
      });
      return;
    }

    if (isNaN(discount) || discount < 0 || discount > 100) {
      toast({
        variant: 'destructive',
        title: 'Invalid discount percentage',
        description: 'Please enter a discount between 0 and 100',
      });
      return;
    }

    updatePricingMutation.mutate({ 
      elearningLearnerMonthlyCost: cost,
      elearningLearnerDiscountPercent: discount 
    });
  };

  const handleSaveElearningPricing = () => {
    const minPrice = parseFloat(minCoursePrice);
    const maxPrice = parseFloat(maxCoursePrice);

    if (!isCustSuper) {
      const commission = parseFloat(commissionRate);
      if (isNaN(commission) || commission < 0 || commission > 1) {
        toast({
          variant: 'destructive',
          title: 'Invalid commission rate',
          description: 'Please enter a rate between 0 and 1 (e.g., 0.30 for 30%)',
        });
        return;
      }
    }

    if (isNaN(minPrice) || minPrice < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid minimum price',
        description: 'Please enter a valid positive number',
      });
      return;
    }

    if (isNaN(maxPrice) || maxPrice < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid maximum price',
        description: 'Please enter a valid positive number',
      });
      return;
    }

    if (minPrice > maxPrice) {
      toast({
        variant: 'destructive',
        title: 'Invalid price range',
        description: 'Minimum price cannot exceed maximum price',
      });
      return;
    }

    const mutationData: any = {
      minCoursePrice: minPrice,
      maxCoursePrice: maxPrice,
    };

    if (!isCustSuper) {
      mutationData.defaultCourseCommissionRate = parseFloat(commissionRate);
    }

    updatePricingMutation.mutate(mutationData);
  };

  const handlePaymentModeToggle = (mode: 'test' | 'live') => {
    updatePaymentModeMutation.mutate(mode);
  };

  const handleSaveQuizTierPricing = () => {
    const tier10Credits = parseInt(quizTierPricing.tier10);
    const tier15Credits = parseInt(quizTierPricing.tier15);
    const tier20Credits = parseInt(quizTierPricing.tier20);

    if (isNaN(tier10Credits) || tier10Credits < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid credits',
        description: 'Please enter a valid positive number for 10 Questions tier',
      });
      return;
    }

    if (isNaN(tier15Credits) || tier15Credits < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid credits',
        description: 'Please enter a valid positive number for 15 Questions tier',
      });
      return;
    }

    if (isNaN(tier20Credits) || tier20Credits < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid credits',
        description: 'Please enter a valid positive number for 20 Questions tier',
      });
      return;
    }

    updateQuizTierPricingMutation.mutate([
      { tier: '10', creditCost: tier10Credits },
      { tier: '15', creditCost: tier15Credits },
      { tier: '20', creditCost: tier20Credits },
    ]);
  };

  const handleSaveThumbnailPricing = () => {
    const credits = parseInt(thumbnailCreditCost);

    if (isNaN(credits) || credits < 1 || credits > 100) {
      toast({
        variant: 'destructive',
        title: 'Invalid credits',
        description: 'Please enter a value between 1 and 100 credits',
      });
      return;
    }

    updateThumbnailPricingMutation.mutate(credits);
  };

  const handleSaveHealthReportPricing = () => {
    const cost = parseInt(healthReportCreditCost, 10);
    if (isNaN(cost) || cost < 1 || cost > 100) {
      toast({ title: 'Invalid Value', description: 'Credit cost must be between 1 and 100', variant: 'destructive' });
      return;
    }
    updateHealthReportPricingMutation.mutate(cost);
  };

  const handleSaveTopicAnalysisPricing = () => {
    const cost = parseInt(topicAnalysisCreditCost, 10);
    if (isNaN(cost) || cost < 1 || cost > 100) {
      toast({ title: 'Invalid Value', description: 'Credit cost must be between 1 and 100', variant: 'destructive' });
      return;
    }
    updateTopicAnalysisPricingMutation.mutate(cost);
  };

  const handleSaveFrameworkGenerationPricing = () => {
    const cost = parseInt(frameworkGenerationCreditCost, 10);
    if (isNaN(cost) || cost < 1 || cost > 100) {
      toast({ title: 'Invalid Value', description: 'Credit cost must be between 1 and 100', variant: 'destructive' });
      return;
    }
    updateFrameworkGenerationPricingMutation.mutate(cost);
  };

  const handleSaveExplanationPricing = () => {
    const cost = parseInt(explanationCreditCost, 10);
    if (isNaN(cost) || cost < 1 || cost > 100) {
      toast({ title: 'Invalid Value', description: 'Credit cost must be between 1 and 100', variant: 'destructive' });
      return;
    }
    updateExplanationPricingMutation.mutate(cost);
  };

  const handleSaveAnswerCheckPricing = () => {
    const cost = parseInt(answerCheckCreditCost, 10);
    if (isNaN(cost) || cost < 1 || cost > 100) {
      toast({ title: 'Invalid Value', description: 'Credit cost must be between 1 and 100', variant: 'destructive' });
      return;
    }
    updateAnswerCheckPricingMutation.mutate(cost);
  };

  const openCreatePackageModal = () => {
    setPackageForm({
      name: '',
      creditsAmount: '',
      priceAmount: '',
      currency: 'USD',
      badge: '',
      features: '',
      displayOrder: '',
      colorScheme: 'green',
      isActive: true,
    });
    setEditingPackage(null);
    setShowPackageModal(true);
  };

  const openEditPackageModal = (pkg: any) => {
    setPackageForm({
      name: pkg.name,
      creditsAmount: pkg.creditsAmount.toString(),
      priceAmount: pkg.priceAmount.toString(),
      currency: pkg.currency,
      badge: pkg.badge || '',
      features: Array.isArray(pkg.features) ? pkg.features.join(', ') : '',
      displayOrder: pkg.displayOrder.toString(),
      colorScheme: pkg.colorScheme || 'green',
      isActive: pkg.isActive,
    });
    setEditingPackage(pkg);
    setShowPackageModal(true);
  };

  const handleSavePackage = () => {
    if (!packageForm.name || !packageForm.creditsAmount || !packageForm.priceAmount || !packageForm.displayOrder) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Please fill in all required fields',
      });
      return;
    }

    const creditsAmount = parseInt(packageForm.creditsAmount);
    const priceAmount = parseFloat(packageForm.priceAmount);
    const displayOrder = parseInt(packageForm.displayOrder);

    if (isNaN(creditsAmount) || creditsAmount < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid credits',
        description: 'Please enter a valid positive number of credits',
      });
      return;
    }

    if (isNaN(priceAmount) || priceAmount < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid price',
        description: 'Please enter a valid positive price',
      });
      return;
    }

    if (isNaN(displayOrder) || displayOrder < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid display order',
        description: 'Please enter a valid display order',
      });
      return;
    }

    const features = packageForm.features.split(',').map(f => f.trim()).filter(f => f.length > 0);

    const packageData = {
      name: packageForm.name,
      creditsAmount,
      priceAmount,
      currency: packageForm.currency,
      badge: packageForm.badge,
      features,
      displayOrder,
      colorScheme: packageForm.colorScheme,
      isActive: packageForm.isActive,
    };

    if (editingPackage) {
      updatePackageMutation.mutate({ id: editingPackage.id, packageData });
    } else {
      createPackageMutation.mutate(packageData);
    }
  };

  const handleDeletePackage = (id: string) => {
    if (confirm('Are you sure you want to delete this credit package?')) {
      deletePackageMutation.mutate(id);
    }
  };

  const openEditPlanModal = (plan: SubscriptionPlan) => {
    setPlanForm({
      name: plan.name,
      monthlyCredits: plan.monthlyCredits.toString(),
      pricePerTeacher: plan.pricePerTeacher,
      currency: plan.currency,
      badge: plan.badge || '',
      features: Array.isArray(plan.features) ? plan.features.join(', ') : '',
      displayOrder: plan.displayOrder.toString(),
      colorScheme: plan.colorScheme || 'green',
    });
    setEditingPlan(plan);
    setShowPlanModal(true);
  };

  const handleSavePlan = () => {
    if (!planForm.name || !planForm.monthlyCredits || !planForm.pricePerTeacher || !planForm.displayOrder) {
      toast({
        variant: 'destructive',
        title: 'Validation error',
        description: 'Please fill in all required fields',
      });
      return;
    }

    const monthlyCredits = parseInt(planForm.monthlyCredits);
    const pricePerTeacher = parseFloat(planForm.pricePerTeacher);
    const displayOrder = parseInt(planForm.displayOrder);

    if (isNaN(monthlyCredits) || monthlyCredits < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid credits',
        description: 'Please enter a valid positive number of credits',
      });
      return;
    }

    if (isNaN(pricePerTeacher) || pricePerTeacher < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid price',
        description: 'Please enter a valid positive price',
      });
      return;
    }

    if (isNaN(displayOrder) || displayOrder < 0) {
      toast({
        variant: 'destructive',
        title: 'Invalid display order',
        description: 'Please enter a valid display order',
      });
      return;
    }

    const features = planForm.features.split(',').map(f => f.trim()).filter(f => f.length > 0);

    const planData = {
      name: planForm.name,
      monthlyCredits,
      pricePerTeacher,
      currency: planForm.currency,
      badge: planForm.badge,
      features,
      displayOrder,
      colorScheme: planForm.colorScheme,
    };

    if (editingPlan) {
      updateSubscriptionPlanMutation.mutate({ planId: editingPlan.id, planData });
    }
  };

  const handleCopyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({
        title: "Copied!",
        description: `${label} copied to clipboard`,
      });
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Please copy manually",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <QuizAdminLayout title={pageTitle} description={pageDescription} activeSection={activeSection}>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading pricing settings...</p>
          </div>
        </div>
      </QuizAdminLayout>
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : "Failed to load platform pricing settings.";
    return (
      <QuizAdminLayout title={pageTitle} description={pageDescription} activeSection={activeSection}>
        <div className="p-[var(--container-padding)]">
          <Card className="border-[var(--destructive)]/35 bg-destructive/8">
            <CardHeader>
              <CardTitle className="text-destructive">Unable to load platform pricing</CardTitle>
              <CardDescription className="text-destructive">
                {message}
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title={pageTitle} description={pageDescription} activeSection={activeSection}>
      <div className="space-y-[var(--space-lg)] p-[var(--container-padding)] max-w-5xl">
        {isPaymentIntegrationView && (
          <>
        <Card className="border-secondary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-secondary/10">
                <CreditCard className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Payment Gateway Settings</CardTitle>
                <CardDescription>
                  Configure YOCO payment gateway mode for all transactions
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)] p-[var(--card-padding)] bg-muted border border-border rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="payment-mode" className="text-sm font-medium">
                  Payment Mode
                </Label>
                <p className="text-xs text-muted-foreground">
                  Current mode: <span className="font-semibold text-foreground">
                    {paymentSettingsData?.paymentSettings.yocoMode === 'live' ? 'LIVE' : 'TEST'}
                  </span>
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className={`text-sm ${paymentSettingsData?.paymentSettings.yocoMode === 'test' ? 'text-warning font-semibold' : 'text-muted-foreground'}`}>
                    Test Mode
                  </span>
                  <Switch
                    id="payment-mode"
                    checked={paymentSettingsData?.paymentSettings.yocoMode === 'live'}
                    onCheckedChange={(checked) => handlePaymentModeToggle(checked ? 'live' : 'test')}
                    disabled={updatePaymentModeMutation.isPending}
                    data-testid="switch-payment-mode"
                  />
                  <span className={`text-sm ${paymentSettingsData?.paymentSettings.yocoMode === 'live' ? 'text-success font-semibold' : 'text-muted-foreground'}`}>
                    Live Mode
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-warning/10 border border-[var(--warning)]/20 rounded-lg">
              <ShieldAlert className="h-4 w-4 text-warning mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="text-warning font-medium mb-1">Important</p>
                <p className="text-warning/80">
                  {paymentSettingsData?.paymentSettings.yocoMode === 'live' 
                    ? 'LIVE MODE ACTIVE: Real payments will be processed using live YOCO keys.'
                    : 'TEST MODE ACTIVE: All payments use sandbox YOCO keys. No real charges will be made.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook Management Card */}
        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <Webhook className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">YOCO Webhook Management</CardTitle>
                <CardDescription>
                  Register and manage YOCO payment webhooks for secure transaction verification
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {/* Current Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)] p-[var(--card-padding)] bg-primary/5 border border-primary/20 rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Current Mode</p>
                <p className="text-sm font-medium">
                  {webhookStatusData?.currentMode.toUpperCase() || 'Loading...'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Webhook Secret Status</p>
                <div className="flex items-center gap-2">
                  {webhookStatusData?.webhookSecretConfigured ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-success" />
                      <span className="text-sm font-medium text-success">Configured</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-warning" />
                      <span className="text-sm font-medium text-warning">Not Configured</span>
                    </>
                  )}
                </div>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-muted px-2 py-1 rounded flex-1">
                    {webhookStatusData?.webhookUrl || `${baseUrl}/api/webhooks/yoco`}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => handleCopyToClipboard(webhookStatusData?.webhookUrl || `${baseUrl}/api/webhooks/yoco`, 'Webhook URL')}
                    data-testid="button-copy-webhook-url"
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {webhookStatusData?.activeWebhook && (
                <div className="md:col-span-2 pt-3 border-t border-primary/20">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs text-muted-foreground">Active Webhook (LIVE)</p>
                    <Button size="sm" variant="destructive" onClick={() => deleteWebhookMutation.mutate({ 
                        webhookId: webhookStatusData.activeWebhook!.webhookId
                      })}
                      disabled={deleteWebhookMutation.isPending}
                      className="h-6 text-xs"
                      data-testid="button-delete-webhook"
                    >
                      {deleteWebhookMutation.isPending ? 'Deleting...' : 'Delete Webhook'}
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Webhook ID</p>
                      <code className="text-xs bg-muted px-2 py-0.5 rounded">{webhookStatusData.activeWebhook.webhookId}</code>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Registered</p>
                      <p className="text-xs">{new Date(webhookStatusData.activeWebhook.registeredAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* List Webhooks from YOCO */}
            <div className="p-4 bg-secondary/10 border border-secondary/20 rounded-lg space-y-3">
              <p className="text-sm font-medium text-secondary">List Webhooks from YOCO (LIVE)</p>
              <p className="text-xs text-muted-foreground">
                Check what webhooks are currently registered on YOCO using LIVE credentials
              </p>
              <Button size="sm" variant="outline" onClick={() => listWebhooksMutation.mutate()}
                disabled={listWebhooksMutation.isPending}
                data-testid="button-list-webhooks"
              >
                {listWebhooksMutation.isPending ? 'Loading...' : 'List Registered Webhooks'}
              </Button>
              
              {/* Display Listed Webhooks */}
              {yocoWebhooks && (
                <div className="mt-3 space-y-2">
                  <p className="text-xs font-medium">
                    Registered Webhooks ({yocoWebhooks.webhooks?.length || 0} found):
                  </p>
                  {yocoWebhooks.webhooks && yocoWebhooks.webhooks.length > 0 ? (
                    <div className="space-y-2">
                      {yocoWebhooks.webhooks.map((webhook: any) => (
                        <div key={webhook.id} className="flex items-center justify-between p-2 bg-muted rounded">
                          <div className="flex-1 min-w-0">
                            <code className="text-xs break-all">{webhook.id}</code>
                            <p className="text-xs text-muted-foreground truncate">{webhook.url || webhook.name}</p>
                          </div>
                          <Button size="sm" variant="destructive" onClick={() => deleteWebhookMutation.mutate({ 
                              webhookId: webhook.id
                            })}
                            disabled={deleteWebhookMutation.isPending}
                            className="h-6 text-xs ml-2 flex-shrink-0"
                            data-testid={`button-delete-listed-webhook-${webhook.id}`}
                          >
                            Delete
                          </Button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No webhooks registered</p>
                  )}
                </div>
              )}
            </div>

            {/* Manual Webhook ID Delete */}
            <div className="p-4 bg-warning/10 border border-[var(--warning)]/20 rounded-lg space-y-3">
              <p className="text-sm font-medium text-warning">Manual Webhook Delete</p>
              <p className="text-xs text-muted-foreground">
                Enter a webhook ID (sub_...) to delete it directly from YOCO using LIVE credentials
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="sub_xxxxxxxx..."
                  value={manualWebhookId}
                  onChange={(e) => setManualWebhookId(e.target.value)}
                  className="flex-1 h-8 text-xs"
                  data-testid="input-manual-webhook-id"
                />
                <Button size="sm" variant="destructive" onClick={() => manualWebhookId && deleteWebhookMutation.mutate({ 
                    webhookId: manualWebhookId
                  })}
                  disabled={!manualWebhookId || deleteWebhookMutation.isPending}
                  className="h-8 text-xs"
                  data-testid="button-delete-manual"
                >
                  {deleteWebhookMutation.isPending ? 'Deleting...' : 'Delete Webhook'}
                </Button>
              </div>
            </div>

            {/* Registration Section */}
            <div className="space-y-3">
              <Button onClick={() => registerWebhookMutation.mutate()}
                disabled={registerWebhookMutation.isPending}
                className="w-full bg-primary hover:bg-primary/90 min-h-[44px] touch-manipulation"
                data-testid="button-register-webhook"
              >
                <Link className="h-4 w-4 mr-2" />
                {registerWebhookMutation.isPending ? 'Registering...' : 'Register New Webhook (LIVE)'}
              </Button>

              {/* One-time Secret Display */}
              {webhookSecret && (
                <div className="p-4 bg-success/10 border border-[var(--success)]/20 rounded-lg space-y-3">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-success mb-1">Webhook Registered Successfully!</p>
                      <p className="text-xs text-muted-foreground">
                        Copy the webhook secret below and add it to Replit Secrets. This secret will only be shown once.
                      </p>
                    </div>
                  </div>

                  {/* Webhook ID Display */}
                  {registeredWebhookId && (
                    <div className="space-y-2">
                      <Label className="text-xs">Webhook ID</Label>
                      <div className="flex items-center gap-2">
                        <code className="text-xs bg-muted px-3 py-2 rounded flex-1 font-mono break-all">
                          {registeredWebhookId}
                        </code>
                        <Button size="sm" variant="outline" onClick={() => handleCopyToClipboard(registeredWebhookId, 'Webhook ID')}
                          data-testid="button-copy-webhook-id"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* Webhook Secret Display */}
                  <div className="space-y-2">
                    <Label className="text-xs text-success font-semibold">Webhook Secret (One-Time Display - Save This!)</Label>
                    <div className="flex items-center gap-2">
                      <code className="text-xs bg-success/15 border border-[var(--success)]/30 px-3 py-2 rounded flex-1 font-mono break-all text-success">
                        {showWebhookSecret ? webhookSecret : '•'.repeat(40)}
                      </code>
                      <Button size="sm" variant="outline" onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        data-testid="button-toggle-secret-visibility"
                      >
                        {showWebhookSecret ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleCopyToClipboard(webhookSecret, 'Webhook secret')}
                        data-testid="button-copy-webhook-secret"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Step-by-Step Instructions */}
                  <div className="space-y-2 pt-3 border-t border-[var(--success)]/20">
                    <p className="text-xs font-medium text-success">Next Steps:</p>
                    <ol className="text-xs space-y-1 text-muted-foreground list-decimal list-inside">
                      <li>Click the copy button above to copy the webhook secret</li>
                      <li>Open Replit Secrets (lock icon 🔒 in left sidebar)</li>
                      <li>Click "+ New Secret"</li>
                      <li>Name: <code className="bg-muted px-1 rounded">YOCO_WEBHOOK_SECRET</code></li>
                      <li>Paste the secret value and click "Add Secret"</li>
                      <li>Restart your application to apply the changes</li>
                    </ol>
                  </div>

                  <Button size="sm" variant="ghost" onClick={() => {
                      setWebhookSecret(null);
                      setRegisteredWebhookId(null);
                    }}
                    className="w-full"
                    data-testid="button-dismiss-secret"
                  >
                    Dismiss (Secret added to Replit Secrets)
                  </Button>
                </div>
              )}
            </div>

            {/* Information Alert */}
            <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <div className="text-sm text-primary/80 space-y-1">
                <p>Webhooks enable secure payment verification for YOCO transactions.</p>
                <p className="text-xs">The webhook secret (whsec_...) is used to verify that payment callbacks actually come from YOCO and haven't been tampered with. Webhooks are always registered using LIVE credentials to obtain a valid verification secret.</p>
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}

        {!isPaymentIntegrationView && (
          <>
        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">E-Learning Learner Subscription</CardTitle>
                <CardDescription>
                  Settings for learner subscriptions that provide discounts on e-learning course purchases
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[var(--space-md)]">
              <div>
                <Label htmlFor="elearning-learner-cost" className="text-sm font-medium">
                  Monthly Subscription Cost (ZAR)
                </Label>
                <div className="relative mt-1.5">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="elearning-learner-cost"
                    type="number"
                    step="0.01"
                    min="0"
                    value={elearningLearnerCost}
                    onChange={(e) => setElearningLearnerCost(e.target.value)}
                    className="pl-10"
                    placeholder="19.99"
                    data-testid="input-elearning-learner-cost"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="elearning-discount-percent" className="text-sm font-medium">
                  Course Discount Percentage
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="elearning-discount-percent"
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={elearningDiscountPercent}
                    onChange={(e) => setElearningDiscountPercent(e.target.value)}
                    placeholder="15.00"
                    data-testid="input-elearning-discount-percent"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    %
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Discount applied to e-learning course purchases
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSaveElearningLearnerSettings} disabled={updatePricingMutation.isPending} className="min-h-[44px] touch-manipulation" data-testid="button-save-elearning-settings" >
                <Save className="h-4 w-4 mr-2" />
                {updatePricingMutation.isPending ? 'Saving...' : 'Save E-Learning Settings'}
              </Button>
            </div>
            <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-primary/80">
                These settings apply to all courses in the marketplace. Commission is deducted from instructor earnings. Price limits ensure fair pricing across all courses.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-secondary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-secondary/10">
                <Building2 className="h-6 w-6 text-secondary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">E-Learning Marketplace Pricing</CardTitle>
                <CardDescription>
                  Configure commission rates and price limits for course sales
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[var(--space-md)]">
              {!isCustSuper && (
              <div>
                <Label htmlFor="commission-rate" className="text-sm font-medium">
                  Platform Commission Rate
                </Label>
                <div className="relative mt-1.5">
                  <Input
                    id="commission-rate"
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={commissionRate}
                    onChange={(e) => setCommissionRate(e.target.value)}
                    placeholder="0.30"
                    data-testid="input-commission-rate"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    (0-1)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  e.g., 0.30 = 30% commission
                </p>
              </div>
              )}

              <div>
                <Label htmlFor="min-course-price" className="text-sm font-medium">
                  Min Course Price (ZAR)
                </Label>
                <div className="relative mt-1.5">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="min-course-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={minCoursePrice}
                    onChange={(e) => setMinCoursePrice(e.target.value)}
                    className="pl-10"
                    placeholder="50.00"
                    data-testid="input-min-course-price"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="max-course-price" className="text-sm font-medium">
                  Max Course Price (ZAR)
                </Label>
                <div className="relative mt-1.5">
                  <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="max-course-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={maxCoursePrice}
                    onChange={(e) => setMaxCoursePrice(e.target.value)}
                    className="pl-10"
                    placeholder="10000.00"
                    data-testid="input-max-course-price"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveElearningPricing} disabled={updatePricingMutation.isPending} className="min-h-[44px] touch-manipulation" data-testid="button-save-elearning-pricing" >
                <Save className="h-4 w-4 mr-2" />
                {updatePricingMutation.isPending ? 'Saving...' : 'Save E-Learning Settings'}
              </Button>
            </div>

            <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-secondary/10 border border-secondary/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-secondary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-secondary/80">
                These settings apply to all courses in the marketplace. Commission is deducted from instructor earnings. Price limits ensure fair pricing across all courses.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">{LP_CREDITS_SHORT} Tiers</CardTitle>
                <CardDescription>
                  Manage monthly {LP_CREDITS_SHORT} and pricing for each subscription tier
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <Alert variant="warning" className="mb-[var(--space-md)]">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-2">Legacy Subscription Plans</p>
                <p className="text-sm mb-3">
                  These plans are being deprecated. Please use the new Business Package system for organization subscriptions. Access via <a href="/super-admin" className="underline hover:opacity-80 transition-opacity font-semibold">Super Admin Dashboard &gt; Packages tab</a>.
                </p>
              </AlertDescription>
            </Alert>
            {data?.subscriptionPlans.map((plan) => (
              <div 
                key={plan.id} 
                className={`p-[var(--card-padding)] border-2 rounded-xl bg-surface-raised transition-all ${
                  plan.colorScheme === 'green' ? 'border-primary/40' :
                  plan.colorScheme === 'blue' ? 'border-secondary/40' :
                  plan.colorScheme === 'purple' ? 'border-primary/40' :
                  plan.colorScheme === 'orange' ? 'border-[var(--warning)]/40' :
                  'border-primary/30'
                }`}
                data-testid={`plan-${plan.id}`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-[var(--space-md)] items-center">
                  <div className="md:col-span-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Building2 className="h-5 w-5 text-primary" />
                      <h3 className="font-semibold text-foreground text-lg">{plan.name}</h3>
                    </div>
                    {plan.badge && (
                      <span className="text-xs text-muted-foreground">{plan.badge}</span>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">Tier: {plan.tier}</div>
                  </div>
                  
                  <div className="text-sm">
                    <div className="text-muted-foreground">Monthly Credits</div>
                    <div className="font-semibold" data-testid={`plan-credits-${plan.id}`}>{plan.monthlyCredits}</div>
                  </div>
                  
                  <div className="text-sm">
                    <div className="text-muted-foreground">Price</div>
                    <div className="font-semibold" data-testid={`plan-price-${plan.id}`}>
                      {formatPrice(plan.pricePerTeacher, plan.currency as 'ZAR' | 'USD' | 'EUR')}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-end sm:col-span-2 md:col-span-1">
                    <Button onClick={() => openEditPlanModal(plan)}
                      className="min-h-[44px] touch-manipulation"
                      data-testid={`button-edit-plan-${plan.id}`}
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Lesson Credit Pricing Calculator */}
        <LessonCreditPricingCalculator />

        {/* Quiz Generation Pricing */}
        <Card className="border-accent/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-accent/10">
                <Sparkles className="h-6 w-6 text-accent" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Quiz Generation Pricing</CardTitle>
                <CardDescription>
                  Set the {LP_CREDITS_SHORT} cost for AI-generated quizzes based on question count tiers
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {isLoadingQuizTiers ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
                <span className="ml-3 text-muted-foreground">Loading quiz tier pricing...</span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-[var(--space-md)]">
                  <div className="p-[var(--card-padding)] bg-muted border border-border rounded-lg">
                    <Label htmlFor="quiz-tier-10" className="text-sm font-medium flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-accent/20 text-accent text-xs font-bold">10</span>
                      Questions Tier
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="quiz-tier-10"
                        type="number"
                        min="0"
                        value={quizTierPricing.tier10}
                        onChange={(e) => setQuizTierPricing({ ...quizTierPricing, tier10: e.target.value })}
                        placeholder="20"
                        className="pr-24"
                        data-testid="input-quiz-tier-10"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                  </div>

                  <div className="p-[var(--card-padding)] bg-muted border border-border rounded-lg">
                    <Label htmlFor="quiz-tier-15" className="text-sm font-medium flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-accent/20 text-accent text-xs font-bold">15</span>
                      Questions Tier
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="quiz-tier-15"
                        type="number"
                        min="0"
                        value={quizTierPricing.tier15}
                        onChange={(e) => setQuizTierPricing({ ...quizTierPricing, tier15: e.target.value })}
                        placeholder="25"
                        className="pr-24"
                        data-testid="input-quiz-tier-15"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                  </div>

                  <div className="p-[var(--card-padding)] bg-muted border border-border rounded-lg">
                    <Label htmlFor="quiz-tier-20" className="text-sm font-medium flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-accent/20 text-accent text-xs font-bold">20</span>
                      Questions Tier
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="quiz-tier-20"
                        type="number"
                        min="0"
                        value={quizTierPricing.tier20}
                        onChange={(e) => setQuizTierPricing({ ...quizTierPricing, tier20: e.target.value })}
                        placeholder="30"
                        className="pr-24"
                        data-testid="input-quiz-tier-20"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSaveQuizTierPricing} disabled={updateQuizTierPricingMutation.isPending} className="min-h-[44px] touch-manipulation" data-testid="button-save-quiz-tier-pricing" >
                    <Save className="h-4 w-4 mr-2" />
                    {updateQuizTierPricingMutation.isPending ? 'Saving...' : 'Save Quiz Pricing'}
                  </Button>
                </div>

                <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-accent/10 border border-accent/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-accent mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-accent">
                    These LP Credit costs apply platform-wide when users generate AI quizzes. Higher question counts require more LP Credits due to increased AI processing.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* AI Content Generation Costs */}
        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <Wand2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">AI Content Generation Costs</CardTitle>
                <CardDescription>
                  Configure {LP_CREDITS_SHORT} costs for AI-powered content generation features
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div className="grid gap-[var(--space-md)] sm:grid-cols-3">
              <div>
                <Label htmlFor="lesson-generation-credits" className="text-sm font-medium flex items-center gap-2">
                  Lesson Generation
                  {lessonGenerationCost !== originalLessonGenerationCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="lesson-generation-credits"
                    type="number"
                    min="1"
                    max="500"
                    value={lessonGenerationCost}
                    onChange={(e) => setLessonGenerationCost(e.target.value)}
                    placeholder="50"
                    className="pr-16"
                    data-testid="input-lesson-generation-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Per "Generate with AI" lesson
                </p>
              </div>

              <div>
                <Label htmlFor="ai-fix-credits" className="text-sm font-medium flex items-center gap-2">
                  AI Fix
                  {aiFixCost !== originalAiFixCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="ai-fix-credits"
                    type="number"
                    min="1"
                    max="100"
                    value={aiFixCost}
                    onChange={(e) => setAiFixCost(e.target.value)}
                    placeholder="10"
                    className="pr-16"
                    data-testid="input-ai-fix-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Per AI fix suggestion
                </p>
              </div>

              <div>
                <Label htmlFor="overview-generation-credits" className="text-sm font-medium flex items-center gap-2">
                  Overview Generation
                  {overviewGenerationCost !== originalOverviewGenerationCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="overview-generation-credits"
                    type="number"
                    min="1"
                    max="500"
                    value={overviewGenerationCost}
                    onChange={(e) => setOverviewGenerationCost(e.target.value)}
                    placeholder="25"
                    className="pr-16"
                    data-testid="input-overview-generation-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Per course overview generation
                </p>
              </div>

              <div>
                <Label htmlFor="key-takeaways-credits" className="text-sm font-medium flex items-center gap-2">
                  Key Takeaways Generation
                  {keyTakeawaysCost !== originalKeyTakeawaysCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="key-takeaways-credits"
                    type="number"
                    min="1"
                    max="500"
                    value={keyTakeawaysCost}
                    onChange={(e) => setKeyTakeawaysCost(e.target.value)}
                    placeholder="25"
                    className="pr-16"
                    data-testid="input-key-takeaways-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Per key takeaways generation
                </p>
              </div>

            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveAiGenerationCosts} disabled={updateAiGenerationCostsMutation.isPending || (lessonGenerationCost === originalLessonGenerationCost && aiFixCost === originalAiFixCost && overviewGenerationCost === originalOverviewGenerationCost && keyTakeawaysCost === originalKeyTakeawaysCost)} className="min-h-[48px] touch-manipulation" data-testid="button-save-ai-generation-costs" >
                <Save className="h-4 w-4 mr-2" />
                {updateAiGenerationCostsMutation.isPending ? 'Saving...' : 'Save AI Costs'}
              </Button>
            </div>

            <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-primary">
                These {LP_CREDITS_SHORT} costs are charged when users use AI-powered features. Lesson generation creates content from scratch, and AI fix improves existing content. Quiz generation pricing is configured separately in the Quiz Generation Pricing section.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Podcast Pricing & Settlement */}
        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Podcast Pricing & Settlement</CardTitle>
                <CardDescription>
                  Configure estimate behavior and final ElevenLabs-based LPC settlement logic
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-[var(--space-md)]">
              <div>
                <Label className="text-sm font-medium">Estimate LPC per Character</Label>
                <Input type="number" step="0.0001" min="0" value={podcastEstimateRate} onChange={(e) => setPodcastEstimateRate(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Conversation Multiplier</Label>
                <Input type="number" step="0.01" min="1" value={podcastConversationMultiplier} onChange={(e) => setPodcastConversationMultiplier(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">USD per 1k Chars (ElevenLabs)</Label>
                <Input type="number" step="0.0001" min="0" value={podcastElevenUsdPer1kChars} onChange={(e) => setPodcastElevenUsdPer1kChars(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Subscription USD / Month</Label>
                <Input type="number" step="0.0001" min="0" value={podcastElevenSubscriptionUsdMonthly} onChange={(e) => setPodcastElevenSubscriptionUsdMonthly(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Subscription Included Chars</Label>
                <Input type="number" step="1" min="0" value={podcastElevenSubscriptionIncludedChars} onChange={(e) => setPodcastElevenSubscriptionIncludedChars(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Top-up USD per 1k Chars</Label>
                <Input type="number" step="0.0001" min="0" value={podcastElevenTopupUsdPer1kChars} onChange={(e) => setPodcastElevenTopupUsdPer1kChars(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Expected Monthly Chars</Label>
                <Input type="number" step="1" min="0" value={podcastElevenExpectedMonthlyChars} onChange={(e) => setPodcastElevenExpectedMonthlyChars(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Minimum LPC</Label>
                <Input type="number" step="1" min="0" value={podcastMinLpc} onChange={(e) => setPodcastMinLpc(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Maximum LPC (disabled, uncapped)</Label>
                <Input type="number" step="1" min="0" value={podcastMaxLpc} disabled readOnly />
              </div>
              <div>
                <Label className="text-sm font-medium">Target Margin %</Label>
                <Input type="number" step="0.01" min="0" value={podcastTargetMarginPercent} onChange={(e) => setPodcastTargetMarginPercent(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">USD to Local FX</Label>
                <Input type="number" step="0.0001" min="0" value={podcastUsdToLocalFxRate} onChange={(e) => setPodcastUsdToLocalFxRate(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Local Currency per LPC</Label>
                <Input type="number" step="0.0001" min="0" value={podcastLocalCurrencyPerLpc} onChange={(e) => setPodcastLocalCurrencyPerLpc(e.target.value)} />
              </div>
              <div>
                <Label className="text-sm font-medium">Settlement Guardrail %</Label>
                <Input type="number" step="0.01" min="0" value={podcastSettlementGuardrailPct} onChange={(e) => setPodcastSettlementGuardrailPct(e.target.value)} />
              </div>
              <div className="rounded-md border p-3 flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Use package floor LPC value</Label>
                  <p className="text-xs text-muted-foreground">Derive local currency per LPC from active package floor pricing to avoid undercharging.</p>
                </div>
                <Switch checked={podcastUsePackageFloorLpcValue} onCheckedChange={setPodcastUsePackageFloorLpcValue} />
              </div>
              <div className="rounded-md border p-3 flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium">Enforce no-loss settlement floor</Label>
                  <p className="text-xs text-muted-foreground">Prevents final LPC from settling below provider break-even.</p>
                </div>
                <Switch checked={podcastEnforceNoLossFloor} onCheckedChange={setPodcastEnforceNoLossFloor} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={handleSavePodcastPricing} disabled={ updatePodcastPricingMutation.isPending || ( podcastEstimateRate === originalPodcastEstimateRate && podcastConversationMultiplier === originalPodcastConversationMultiplier && podcastMinLpc === originalPodcastMinLpc && podcastMaxLpc === originalPodcastMaxLpc && podcastElevenUsdPer1kChars === originalPodcastElevenUsdPer1kChars && podcastElevenSubscriptionUsdMonthly === originalPodcastElevenSubscriptionUsdMonthly && podcastElevenSubscriptionIncludedChars === originalPodcastElevenSubscriptionIncludedChars && podcastElevenTopupUsdPer1kChars === originalPodcastElevenTopupUsdPer1kChars && podcastElevenExpectedMonthlyChars === originalPodcastElevenExpectedMonthlyChars && podcastUsePackageFloorLpcValue === originalPodcastUsePackageFloorLpcValue && podcastEnforceNoLossFloor === originalPodcastEnforceNoLossFloor && podcastUsdToLocalFxRate === originalPodcastUsdToLocalFxRate && podcastTargetMarginPercent === originalPodcastTargetMarginPercent && podcastLocalCurrencyPerLpc === originalPodcastLocalCurrencyPerLpc && podcastSettlementGuardrailPct === originalPodcastSettlementGuardrailPct ) } className="min-h-[48px] touch-manipulation" >
                <Save className="h-4 w-4 mr-2" />
                {updatePodcastPricingMutation.isPending ? 'Saving...' : 'Save Podcast Pricing'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Translation Costs */}
        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <Languages className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Translation Costs</CardTitle>
                <CardDescription>
                  Configure {LP_CREDITS_SHORT} costs for AI-powered translation operations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-[var(--space-md)]">
              <div>
                <Label htmlFor="lesson-translation-credits" className="text-sm font-medium flex items-center gap-2">
                  AI Lesson Translation
                  {lessonTranslationCost !== originalLessonTranslationCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="lesson-translation-credits"
                    type="number"
                    min="1"
                    max="500"
                    value={lessonTranslationCost}
                    onChange={(e) => setLessonTranslationCost(e.target.value)}
                    placeholder="10"
                    className="pr-16"
                    data-testid="input-lesson-translation-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {LP_CREDITS_SHORT} cost per AI-powered lesson translation (title, description, content, slides)
                </p>
              </div>

              <div>
                <Label htmlFor="quiz-translation-credits" className="text-sm font-medium flex items-center gap-2">
                  AI Quiz Translation
                  {quizTranslationCost !== originalQuizTranslationCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="quiz-translation-credits"
                    type="number"
                    min="1"
                    max="500"
                    value={quizTranslationCost}
                    onChange={(e) => setQuizTranslationCost(e.target.value)}
                    placeholder="5"
                    className="pr-16"
                    data-testid="input-quiz-translation-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {LP_CREDITS_SHORT} cost per AI-powered quiz translation (questions and answers)
                </p>
              </div>

              <div>
                <Label htmlFor="course-translation-credits" className="text-sm font-medium flex items-center gap-2">
                  Course Translation
                  {courseTranslationCost !== originalCourseTranslationCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="course-translation-credits"
                    type="number"
                    min="1"
                    max="500"
                    value={courseTranslationCost}
                    onChange={(e) => setCourseTranslationCost(e.target.value)}
                    placeholder="50"
                    className="pr-16"
                    data-testid="input-course-translation-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {LP_CREDITS_SHORT} cost per AI-powered course framework translation
                </p>
              </div>

              <div>
                <Label htmlFor="translated-pptx-credits" className="text-sm font-medium flex items-center gap-2">
                  Translated PPTX Generation
                  {translatedPptxCost !== originalTranslatedPptxCost && (
                    <span className="text-xs text-primary">(unsaved)</span>
                  )}
                </Label>
                <div className="relative mt-2">
                  <Input
                    id="translated-pptx-credits"
                    type="number"
                    min="1"
                    max="500"
                    value={translatedPptxCost}
                    onChange={(e) => setTranslatedPptxCost(e.target.value)}
                    placeholder="50"
                    className="pr-16"
                    data-testid="input-translated-pptx-credits"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {LP_CREDITS_SHORT}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {LP_CREDITS_SHORT} cost per Gamma PPTX generation from translated content
                </p>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveTranslationCosts} disabled={updateTranslationCostsMutation.isPending || (lessonTranslationCost === originalLessonTranslationCost && quizTranslationCost === originalQuizTranslationCost && courseTranslationCost === originalCourseTranslationCost && translatedPptxCost === originalTranslatedPptxCost)} className="min-h-[48px] touch-manipulation" data-testid="button-save-translation-costs" >
                <Save className="h-4 w-4 mr-2" />
                {updateTranslationCostsMutation.isPending ? 'Saving...' : 'Save Translation Costs'}
              </Button>
            </div>

            <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
              <p className="text-sm text-primary">
                Manual uploads (Word .docx and PPTX) are free. Lesson digest and podcast script translation are included in lesson translation runs at no extra {LP_CREDITS_SHORT}.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* AI Thumbnail Generation Pricing */}
        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <ImageIcon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">AI Thumbnail Generation</CardTitle>
                <CardDescription>
                  Configure credit cost for AI-powered course thumbnails
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {isLoadingThumbnailPricing ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading thumbnail pricing...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-[var(--space-md)]">
                  <div className="flex-1">
                    <Label htmlFor="thumbnail-credits" className="text-sm font-medium flex items-center gap-2">
                      Credit Cost per Thumbnail
                      {thumbnailCreditCost !== originalThumbnailCost && (
                        <span className="text-xs text-primary" data-testid="text-thumbnail-pricing-status">
                          (unsaved changes)
                        </span>
                      )}
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="thumbnail-credits"
                        type="number"
                        min="1"
                        max="100"
                        value={thumbnailCreditCost}
                        onChange={(e) => setThumbnailCreditCost(e.target.value)}
                        placeholder="5"
                        className="pr-24"
                        data-testid="input-thumbnail-credits"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valid range: 1-100 credits
                    </p>
                  </div>
                  <Button onClick={handleSaveThumbnailPricing} disabled={updateThumbnailPricingMutation.isPending || thumbnailCreditCost === originalThumbnailCost} className="min-h-[48px] touch-manipulation sm:w-auto w-full" data-testid="button-save-thumbnail-pricing" >
                    <Save className="h-4 w-4 mr-2" />
                    {updateThumbnailPricingMutation.isPending ? 'Saving...' : 'Save Thumbnail Pricing'}
                  </Button>
                </div>

                <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-primary">
                    This {LP_CREDITS_SHORT} cost is charged when users generate AI-powered thumbnails for their courses. The AI creates professional, visually appealing thumbnails based on course content.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Lesson Feedback Credits Pricing */}
        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Lesson Feedback Credits</CardTitle>
                <CardDescription>
                  Configure credit cost for AI-powered lesson feedback reports
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {isLoadingHealthReportPricing ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading health report pricing...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-[var(--space-md)]">
                  <div className="flex-1">
                    <Label htmlFor="health-report-credits" className="text-sm font-medium flex items-center gap-2">
                      Credit Cost per Health Report
                      {healthReportCreditCost !== originalHealthReportCost && (
                        <span className="text-xs text-primary" data-testid="text-health-report-pricing-status">
                          (unsaved changes)
                        </span>
                      )}
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="health-report-credits"
                        type="number"
                        min="1"
                        max="100"
                        value={healthReportCreditCost}
                        onChange={(e) => setHealthReportCreditCost(e.target.value)}
                        placeholder="5"
                        className="pr-24"
                        data-testid="input-health-report-credits"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valid range: 1-100 credits
                    </p>
                  </div>
                  <Button onClick={handleSaveHealthReportPricing} disabled={updateHealthReportPricingMutation.isPending || healthReportCreditCost === originalHealthReportCost} className="min-h-[48px] touch-manipulation sm:w-auto w-full" data-testid="button-save-health-report-pricing" >
                    <Save className="h-4 w-4 mr-2" />
                    {updateHealthReportPricingMutation.isPending ? 'Saving...' : 'Save Health Report Pricing'}
                  </Button>
                </div>

                <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-primary">
                    This {LP_CREDITS_SHORT} cost is charged when users request detailed AI feedback on lesson content quality. The feedback includes a quality score and improvement suggestions.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <BarChart3 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Topic Analysis Credits</CardTitle>
                <CardDescription>
                  {LP_CREDITS_SHORT} cost for AI topic analysis in Course Document Wizard
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {isLoadingTopicAnalysisPricing ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading topic analysis pricing...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-[var(--space-md)]">
                  <div className="flex-1">
                    <Label htmlFor="topic-analysis-credits" className="text-sm font-medium flex items-center gap-2">
                      Credit Cost per Topic Analysis
                      {topicAnalysisCreditCost !== originalTopicAnalysisCost && (
                        <span className="text-xs text-primary" data-testid="text-topic-analysis-pricing-status">
                          (unsaved changes)
                        </span>
                      )}
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="topic-analysis-credits"
                        type="number"
                        min="1"
                        max="100"
                        value={topicAnalysisCreditCost}
                        onChange={(e) => setTopicAnalysisCreditCost(e.target.value)}
                        placeholder="5"
                        className="pr-24"
                        data-testid="input-topic-analysis-credits"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valid range: 1-100 credits
                    </p>
                  </div>
                  <Button onClick={handleSaveTopicAnalysisPricing} disabled={updateTopicAnalysisPricingMutation.isPending || topicAnalysisCreditCost === originalTopicAnalysisCost} className="min-h-[48px] touch-manipulation sm:w-auto w-full" data-testid="button-save-topic-analysis-pricing" >
                    <Save className="h-4 w-4 mr-2" />
                    {updateTopicAnalysisPricingMutation.isPending ? 'Saving...' : 'Save Topic Analysis Pricing'}
                  </Button>
                </div>

                <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-primary">
                    This {LP_CREDITS_SHORT} cost is charged when users use AI to analyze topics from uploaded documents in the Course Document Wizard.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Course Framework Generation Credits</CardTitle>
                <CardDescription>
                  {LP_CREDITS_SHORT} cost for generating course frameworks from documents
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {isLoadingFrameworkGenerationPricing ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading framework generation pricing...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-[var(--space-md)]">
                  <div className="flex-1">
                    <Label htmlFor="framework-generation-credits" className="text-sm font-medium flex items-center gap-2">
                      Credit Cost per Framework
                      {frameworkGenerationCreditCost !== originalFrameworkGenerationCost && (
                        <span className="text-xs text-primary" data-testid="text-framework-generation-pricing-status">
                          (unsaved changes)
                        </span>
                      )}
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="framework-generation-credits"
                        type="number"
                        min="1"
                        max="100"
                        value={frameworkGenerationCreditCost}
                        onChange={(e) => setFrameworkGenerationCreditCost(e.target.value)}
                        placeholder="5"
                        className="pr-24"
                        data-testid="input-framework-generation-credits"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valid range: 1-100 credits
                    </p>
                  </div>
                  <Button onClick={handleSaveFrameworkGenerationPricing} disabled={updateFrameworkGenerationPricingMutation.isPending || frameworkGenerationCreditCost === originalFrameworkGenerationCost} className="min-h-[48px] touch-manipulation sm:w-auto w-full" data-testid="button-save-framework-generation-pricing" >
                    <Save className="h-4 w-4 mr-2" />
                    {updateFrameworkGenerationPricingMutation.isPending ? 'Saving...' : 'Save Framework Pricing'}
                  </Button>
                </div>

                <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-primary">
                    This {LP_CREDITS_SHORT} cost is charged when users generate a course framework from uploaded documents.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Quiz Explanation Generation Credits</CardTitle>
                <CardDescription>
                  {LP_CREDITS_SHORT} cost for AI-generated quiz explanations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {isLoadingExplanationPricing ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading explanation pricing...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-[var(--space-md)]">
                  <div className="flex-1">
                    <Label htmlFor="explanation-credits" className="text-sm font-medium flex items-center gap-2">
                      Credit Cost per Explanation Generation
                      {explanationCreditCost !== originalExplanationCost && (
                        <span className="text-xs text-primary" data-testid="text-explanation-pricing-status">
                          (unsaved changes)
                        </span>
                      )}
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="explanation-credits"
                        type="number"
                        min="1"
                        max="100"
                        value={explanationCreditCost}
                        onChange={(e) => setExplanationCreditCost(e.target.value)}
                        placeholder="25"
                        className="pr-24"
                        data-testid="input-explanation-credits"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valid range: 1-100 credits
                    </p>
                  </div>
                  <Button onClick={handleSaveExplanationPricing} disabled={updateExplanationPricingMutation.isPending || explanationCreditCost === originalExplanationCost} className="min-h-[48px] touch-manipulation sm:w-auto w-full" data-testid="button-save-explanation-pricing" >
                    <Save className="h-4 w-4 mr-2" />
                    {updateExplanationPricingMutation.isPending ? 'Saving...' : 'Save Explanation Pricing'}
                  </Button>
                </div>

                <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-primary">
                    This {LP_CREDITS_SHORT} cost is charged when AI generates and caches answer explanations for all questions in a quiz. Users see instant explanations during gameplay.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-primary/10">
                <CheckCircle2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Quiz Answer Check Credits</CardTitle>
                <CardDescription>
                  {LP_CREDITS_SHORT} cost for AI answer verification
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            {isLoadingAnswerCheckPricing ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <span className="ml-3 text-muted-foreground">Loading answer check pricing...</span>
              </div>
            ) : (
              <>
                <div className="flex flex-col sm:flex-row sm:items-end gap-[var(--space-md)]">
                  <div className="flex-1">
                    <Label htmlFor="answer-check-credits" className="text-sm font-medium flex items-center gap-2">
                      Credit Cost per Answer Check
                      {answerCheckCreditCost !== originalAnswerCheckCost && (
                        <span className="text-xs text-primary" data-testid="text-answer-check-pricing-status">
                          (unsaved changes)
                        </span>
                      )}
                    </Label>
                    <div className="relative mt-2">
                      <Input
                        id="answer-check-credits"
                        type="number"
                        min="1"
                        max="100"
                        value={answerCheckCreditCost}
                        onChange={(e) => setAnswerCheckCreditCost(e.target.value)}
                        placeholder="20"
                        className="pr-24"
                        data-testid="input-answer-check-credits"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                        {LP_CREDITS_SHORT}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Valid range: 1-100 credits
                    </p>
                  </div>
                  <Button onClick={handleSaveAnswerCheckPricing} disabled={updateAnswerCheckPricingMutation.isPending || answerCheckCreditCost === originalAnswerCheckCost} className="min-h-[48px] touch-manipulation sm:w-auto w-full" data-testid="button-save-answer-check-pricing" >
                    <Save className="h-4 w-4 mr-2" />
                    {updateAnswerCheckPricingMutation.isPending ? 'Saving...' : 'Save Answer Check Pricing'}
                  </Button>
                </div>

                <div className="flex items-start gap-[var(--space-sm)] p-[var(--space-md)] bg-primary/10 border border-primary/20 rounded-lg">
                  <AlertCircle className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-primary">
                    This {LP_CREDITS_SHORT} cost is charged when AI validates all answers in a quiz and reports any issues found. Ensures quiz accuracy before publishing.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="border-primary/20 bg-surface-raised">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--space-md)]">
              <div className="flex items-center gap-[var(--space-md)]">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Package className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-[length:var(--text-lg)]">{LP_CREDITS_SHORT} Purchase Packages</CardTitle>
                  <CardDescription>
                    Configure packages users can purchase to add {LP_CREDITS_SHORT}
                  </CardDescription>
                </div>
              </div>
              <Button onClick={openCreatePackageModal} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-create-package" >
                <Package className="h-4 w-4 mr-2" />
                Create Package
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0">
            {packagesData && packagesData.packages.length > 0 ? (
              <div className="space-y-[var(--space-md)]">
                {packagesData.packages.map((pkg: any) => (
                  <div 
                    key={pkg.id}
                    className={`p-[var(--card-padding)] border-2 rounded-lg bg-muted transition-all ${
                      pkg.colorScheme === 'green' ? 'border-primary/40' :
                      pkg.colorScheme === 'blue' ? 'border-secondary/40' :
                      pkg.colorScheme === 'purple' ? 'border-primary/40' :
                      pkg.colorScheme === 'orange' ? 'border-[var(--warning)]/40' :
                      'border-border'
                    }`}
                    data-testid={`package-${pkg.id}`}
                  >
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-[var(--space-md)] items-center">
                      <div className="md:col-span-2">
                        <div className="font-semibold text-lg">{pkg.name}</div>
                        {pkg.badge && (
                          <span className="text-xs text-muted-foreground">{pkg.badge}</span>
                        )}
                      </div>
                      
                      <div className="text-sm">
                        <div className="text-muted-foreground">Credits</div>
                        <div className="font-semibold" data-testid={`package-credits-${pkg.id}`}>{pkg.creditsAmount}</div>
                      </div>
                      
                      <div className="text-sm">
                        <div className="text-muted-foreground">Price</div>
                        <div className="font-semibold" data-testid={`package-price-${pkg.id}`}>
                          {formatPrice(pkg.priceAmount, pkg.currency as 'ZAR' | 'USD' | 'EUR')}
                        </div>
                      </div>
                      
                      <div className="text-sm">
                        <div className="text-muted-foreground">Order</div>
                        <div className="font-semibold" data-testid={`package-order-${pkg.id}`}>{pkg.displayOrder}</div>
                      </div>
                      
                      <div className="flex items-center justify-end gap-[var(--space-sm)] col-span-2 sm:col-span-1 md:col-span-1">
                        <div className={`px-2 py-1 rounded text-xs ${pkg.isActive ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'}`} data-testid={`package-status-${pkg.id}`}>
                          {pkg.isActive ? 'Active' : 'Inactive'}
                        </div>
                        <Button size="sm" variant="ghost" className="min-h-[44px] touch-manipulation" onClick={() => openEditPackageModal(pkg)}
                          data-testid={`button-edit-package-${pkg.id}`}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="min-h-[44px] touch-manipulation" onClick={() => handleDeletePackage(pkg.id)}
                          data-testid={`button-delete-package-${pkg.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No credit packages configured yet</p>
                <p className="text-sm mt-2">Click "Create Package" to add your first package</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-[var(--warning)]/20 bg-warning/5">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-2 rounded-lg bg-warning/10">
                <ShieldAlert className="h-6 w-6 text-warning" />
              </div>
              <div>
                <CardTitle className="text-[length:var(--text-lg)]">Trial Organization {LP_CREDITS_SHORT} Policy</CardTitle>
                <CardDescription>
                  Safeguards to prevent {LP_CREDITS_SHORT} abuse in trial organizations
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-[var(--space-md)] p-[var(--card-padding)] pt-0">
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">One-time 150 {LP_CREDITS_SHORT}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Trial organizations receive a one-time allocation of 150 {LP_CREDITS_SHORT} for testing AI lesson generation. No monthly resets.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Designated User Only</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Only the organization creator can use {LP_CREDITS_SHORT}. This prevents credit farming by creating multiple admin accounts.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <XCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Zero {LP_CREDITS_SHORT} for Additional Admins</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Additional admin users in trial organizations receive zero {LP_CREDITS_SHORT} and cannot use AI lesson generation.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Free PPTX Upload Available</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    All admin users can still upload PPTX files manually for free, regardless of trial credit restrictions.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium">SuperAdmin Bypass</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    SuperAdmin users receive unlimited {LP_CREDITS_SHORT} (999,999) in trial organizations for testing and management purposes.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 p-3 bg-success/10 border border-[var(--success)]/20 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
              <div className="text-sm text-success space-y-1">
                <p className="font-medium">{LP_CREDITS_SHORT} Purchase System Available</p>
                <p className="text-xs">
                  Users can purchase additional {LP_CREDITS_SHORT} via YOCO payment integration. Purchased {LP_CREDITS_SHORT} are added directly to the user's personal balance.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
          </>
        )}
      </div>

      <Dialog open={showPackageModal} onOpenChange={setShowPackageModal}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[var(--dialog-max-height)] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[length:var(--text-xl)]">
              {editingPackage ? 'Edit Credit Package' : 'Create Credit Package'}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure a credit package for users to purchase
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)] py-[var(--space-md)]">
            <div className="col-span-2">
              <Label htmlFor="package-name" className="text-foreground">
                Package Name *
              </Label>
              <Input
                id="package-name"
                value={packageForm.name}
                onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                placeholder="e.g., Starter Pack"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-package-name"
              />
            </div>
            
            <div>
              <Label htmlFor="package-credits" className="text-foreground">
                Credits Amount *
              </Label>
              <Input
                id="package-credits"
                type="number"
                min="0"
                value={packageForm.creditsAmount}
                onChange={(e) => setPackageForm({ ...packageForm, creditsAmount: e.target.value })}
                placeholder="100"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-package-credits-amount"
              />
            </div>
            
            <div>
              <Label htmlFor="package-price" className="text-foreground">
                Price Amount *
              </Label>
              <Input
                id="package-price"
                type="number"
                step="0.01"
                min="0"
                value={packageForm.priceAmount}
                onChange={(e) => setPackageForm({ ...packageForm, priceAmount: e.target.value })}
                placeholder="99.99"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-package-price-amount"
              />
            </div>
            
            <div>
              <Label htmlFor="package-currency" className="text-foreground">
                Currency
              </Label>
              <Select 
                value={packageForm.currency} 
                onValueChange={(value) => setPackageForm({ ...packageForm, currency: value })}
              >
                <SelectTrigger 
                  id="package-currency" 
                  className="mt-1.5 bg-muted border-border text-foreground"
                  data-testid="select-package-currency"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  <SelectItem value="ZAR">ZAR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Canonical storage is USD. Non-USD inputs are converted to USD when saved.
              </p>
            </div>
            
            <div>
              <Label htmlFor="package-badge" className="text-foreground">
                Badge (optional)
              </Label>
              <Input
                id="package-badge"
                value={packageForm.badge}
                onChange={(e) => setPackageForm({ ...packageForm, badge: e.target.value })}
                placeholder="e.g., Most Popular"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-package-badge"
              />
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="package-features" className="text-foreground">
                Features
              </Label>
              <Textarea
                id="package-features"
                value={packageForm.features}
                onChange={(e) => setPackageForm({ ...packageForm, features: e.target.value })}
                placeholder="Feature 1, Feature 2, Feature 3"
                className="mt-1.5 bg-muted border-border text-foreground"
                rows={3}
                data-testid="textarea-package-features"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter features as comma-separated list
              </p>
            </div>
            
            <div>
              <Label htmlFor="package-order" className="text-foreground">
                Display Order *
              </Label>
              <Input
                id="package-order"
                type="number"
                min="0"
                value={packageForm.displayOrder}
                onChange={(e) => setPackageForm({ ...packageForm, displayOrder: e.target.value })}
                placeholder="1"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-package-display-order"
              />
            </div>
            
            <div>
              <Label htmlFor="package-color" className="text-foreground">
                Color Scheme
              </Label>
              <Select 
                value={packageForm.colorScheme} 
                onValueChange={(value) => setPackageForm({ ...packageForm, colorScheme: value })}
              >
                <SelectTrigger 
                  id="package-color" 
                  className="mt-1.5 bg-muted border-border text-foreground"
                  data-testid="select-package-color-scheme"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  <SelectItem value="green">Green (Trial)</SelectItem>
                  <SelectItem value="blue">Blue (Standard)</SelectItem>
                  <SelectItem value="purple">Purple (Premium)</SelectItem>
                  <SelectItem value="orange">Orange (Enterprise)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="sm:col-span-2 flex items-center gap-[var(--space-sm)]">
              <Switch
                id="package-active"
                checked={packageForm.isActive}
                onCheckedChange={(checked) => setPackageForm({ ...packageForm, isActive: checked })}
                data-testid="switch-package-active"
              />
              <Label htmlFor="package-active" className="text-foreground">
                Active (package is available for purchase)
              </Label>
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <Button variant="outline" onClick={() => setShowPackageModal(false)}
              className="bg-muted border-border text-foreground hover:bg-muted/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="button-cancel-package"
            >
              Cancel
            </Button>
            <Button onClick={handleSavePackage} disabled={createPackageMutation.isPending || updatePackageMutation.isPending} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-save-package" >
              <Save className="h-4 w-4 mr-2" />
              {createPackageMutation.isPending || updatePackageMutation.isPending ? 'Saving...' : 'Save Package'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPlanModal} onOpenChange={setShowPlanModal}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[var(--dialog-max-height)] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground text-[length:var(--text-xl)]">
              Edit Subscription Plan
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Configure subscription plan pricing and features
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)] py-[var(--space-md)]">
            <div className="col-span-2">
              <Label htmlFor="plan-name" className="text-foreground">
                Plan Name *
              </Label>
              <Input
                id="plan-name"
                value={planForm.name}
                onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })}
                placeholder="e.g., Standard Plan"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-plan-name"
              />
            </div>
            
            <div>
              <Label htmlFor="plan-credits" className="text-foreground">
                Monthly Credits *
              </Label>
              <Input
                id="plan-credits"
                type="number"
                min="0"
                value={planForm.monthlyCredits}
                onChange={(e) => setPlanForm({ ...planForm, monthlyCredits: e.target.value })}
                placeholder="500"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-plan-credits"
              />
            </div>
            
            <div>
              <Label htmlFor="plan-price" className="text-foreground">
                Price per Teacher *
              </Label>
              <div className="relative mt-1.5">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="plan-price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={planForm.pricePerTeacher}
                  onChange={(e) => setPlanForm({ ...planForm, pricePerTeacher: e.target.value })}
                  placeholder="99.99"
                  className="pl-10 bg-muted border-border text-foreground"
                  data-testid="input-plan-price"
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="plan-currency" className="text-foreground">
                Currency
              </Label>
              <Select 
                value={planForm.currency} 
                onValueChange={(value) => setPlanForm({ ...planForm, currency: value })}
              >
                <SelectTrigger 
                  id="plan-currency" 
                  className="mt-1.5 bg-muted border-border text-foreground"
                  data-testid="select-plan-currency"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  <SelectItem value="ZAR">ZAR</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="plan-badge" className="text-foreground">
                Badge (optional)
              </Label>
              <Input
                id="plan-badge"
                value={planForm.badge}
                onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })}
                placeholder="e.g., Most Popular"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-plan-badge"
              />
            </div>
            
            <div className="col-span-2">
              <Label htmlFor="plan-features" className="text-foreground">
                Features
              </Label>
              <Textarea
                id="plan-features"
                value={planForm.features}
                onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })}
                placeholder="Feature 1, Feature 2, Feature 3"
                className="mt-1.5 bg-muted border-border text-foreground"
                rows={3}
                data-testid="textarea-plan-features"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Enter features as comma-separated list
              </p>
            </div>
            
            <div>
              <Label htmlFor="plan-order" className="text-foreground">
                Display Order *
              </Label>
              <Input
                id="plan-order"
                type="number"
                min="0"
                value={planForm.displayOrder}
                onChange={(e) => setPlanForm({ ...planForm, displayOrder: e.target.value })}
                placeholder="1"
                className="mt-1.5 bg-muted border-border text-foreground"
                data-testid="input-plan-display-order"
              />
            </div>
            
            <div>
              <Label htmlFor="plan-color" className="text-foreground">
                Color Scheme
              </Label>
              <Select 
                value={planForm.colorScheme} 
                onValueChange={(value) => setPlanForm({ ...planForm, colorScheme: value })}
              >
                <SelectTrigger 
                  id="plan-color" 
                  className="mt-1.5 bg-muted border-border text-foreground"
                  data-testid="select-plan-color-scheme"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-muted border-border">
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="purple">Purple</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <Button variant="outline" onClick={() => setShowPlanModal(false)}
              className="bg-muted border-border text-foreground hover:bg-muted/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
              data-testid="button-cancel-plan"
            >
              Cancel
            </Button>
            <Button onClick={handleSavePlan} disabled={updateSubscriptionPlanMutation.isPending} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-save-plan" >
              <Save className="h-4 w-4 mr-2" />
              {updateSubscriptionPlanMutation.isPending ? 'Saving...' : 'Save Plan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </QuizAdminLayout>
  );
}
