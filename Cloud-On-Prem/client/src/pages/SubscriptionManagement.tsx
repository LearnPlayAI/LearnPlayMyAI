import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { BillingPageHeader, BillingCard, BillingCardGrid } from "@/components/BillingCard";
import { SubscriptionCardSkeleton, PlanCardSkeleton } from "@/components/BillingSkeletons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient, invalidatePurchaseCaches } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { 
  Check, 
  X, 
  CreditCard, 
  AlertTriangle, 
  RotateCcw, 
  Building2, 
  CheckCircle2, 
  Users, 
  GraduationCap, 
  UserCog,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Crown,
  Zap,
  ArrowRight,
  Info,
  UserPlus
} from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { useAuth } from "@/hooks/useAuth";
import { PremiumHeader } from '@/pages/landing';
import { EmailVerificationModal, useEmailVerification } from "@/components/EmailVerificationModal";
import { PurchaseConfirmationModal } from "@/components/PurchaseConfirmationModal";
import { SuperAdminPaymentModeModal, useSuperAdminPaymentMode, type YocoPaymentMode } from "@/components/SuperAdminPaymentModeModal";
import { TrialStatusIndicator } from "@/components/TrialStatusIndicator";
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from "@shared/creditConstants";
import { useOrganizationTerminology } from "@/contexts/OrganizationContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Subscription {
  id: string;
  planId: string;
  targetType: 'organization' | 'user';
  targetId: string;
  status: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  autoRenew: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  cancelAtPeriodEnd: boolean;
  billingInterval?: 'monthly' | 'annual';
  scheduledDowngrade?: {
    packageId: string;
    effectiveDate: string;
    packageName: string;
  } | null;
}

interface SubscriptionPlan {
  id: string;
  name: string;
  tier: string;
  monthlyCredits: number;
  pricePerTeacher: string;
  annualPrice?: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  features: string[];
  badge: string | null;
  colorScheme: string;
  isActive: boolean;
  displayOrder: number;
  maxLearners?: number;
  maxTeachers?: number;
  maxOrgAdmins?: number;
}

interface SeatUtilization {
  learners: { current: number; max: number; percentage: number };
  teachers: { current: number; max: number; percentage: number };
  orgAdmins: { current: number; max: number; percentage: number };
}

interface EligiblePackage extends SubscriptionPlan {
  isUpgrade: boolean;
  isDowngrade: boolean;
  isCurrent: boolean;
  proratedAmount?: number;
  userLimitWarning?: string;
}

interface TrialStatus {
  isTrialActive: boolean;
  daysRemaining: number;
  trialEndDate: string | null;
}

interface DisabledUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

export default function SubscriptionManagement() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const { user } = useUser();
  const { formatPrice, userCurrency } = useCurrencyPreference();
  const { isDemo, isSuperAdmin: authSuperAdmin, impersonatedOrganization, effectiveOrganizationId } = useAuth();
  const { terminology: rawTerminology } = useOrganizationTerminology();
  const terminology = rawTerminology || {
    learner: 'Learner',
    learnerPlural: 'Learners',
    educator: 'Instructor',
    educatorPlural: 'Instructors',
  };
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showDowngradeDialog, setShowDowngradeDialog] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<EligiblePackage | null>(null);
  
  const { isEmailVerified, isLoading: verificationLoading } = useEmailVerification(!!user);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const { isModalOpen: isPaymentModeModalOpen, requestPaymentMode, handleConfirm: handlePaymentModeConfirm, handleClose: handlePaymentModeClose } = useSuperAdminPaymentMode();
  
  const [intentId, setIntentId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showReenableDialog, setShowReenableDialog] = useState(false);
  const [disabledUsersToReenable, setDisabledUsersToReenable] = useState<DisabledUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const orgId = params.id || impersonatedOrganization?.id || effectiveOrganizationId || user?.organizationId;

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean; isOrgAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;
  const isOrgAdmin = adminCheck?.isOrgAdmin || false;

  const { data: userRolesData } = useQuery<{ roles: Array<{ role: string }> }>({
    queryKey: ['/api/user/roles'],
    enabled: !!user,
  });
  
  const userRoles = userRolesData?.roles?.map(r => r.role) || [];
  const isStudent = userRoles.includes('student') || userRoles.includes('employee');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const urlIntentId = params.get('intentId');
    const urlCheckoutId = params.get('checkoutId');

    if (paymentStatus === 'success' && (urlIntentId || urlCheckoutId)) {
      setIntentId(urlIntentId);
      setCheckoutId(urlCheckoutId);
      setShowConfirmationModal(true);
      window.history.replaceState({}, '', '/subscriptions');
    } else if (paymentStatus === 'failed') {
      if (urlIntentId || urlCheckoutId) {
        setIntentId(urlIntentId);
        setCheckoutId(urlCheckoutId);
        setShowConfirmationModal(true);
      } else {
        toast({
          title: "Payment failed",
          description: "Please try again or contact support.",
          variant: "destructive",
        });
      }
      window.history.replaceState({}, '', '/subscriptions');
    } else if (paymentStatus === 'cancelled') {
      toast({
        title: "Payment cancelled",
        description: "Your payment was cancelled.",
      });
      window.history.replaceState({}, '', '/subscriptions');
    }
  }, [toast]);

  const handleConfirmationClose = () => {
    setShowConfirmationModal(false);
    setIntentId(null);
    setCheckoutId(null);
    invalidatePurchaseCaches();
  };

  const { data: orgSubscription, isLoading: isLoadingOrgSubscription } = useQuery<{ subscription: Subscription | null }>({
    queryKey: ['/api/organizations', orgId, 'subscription'],
    enabled: !!orgId && isOrgAdmin,
  });

  const { data: eligiblePackagesData, isLoading: isLoadingEligiblePackages } = useQuery<{ packages: EligiblePackage[] }>({
    queryKey: ['/api/organizations', orgId, 'eligible-packages'],
    enabled: !!orgId && isOrgAdmin,
  });

  const { data: seatUtilizationData, isLoading: isLoadingSeatUtilization } = useQuery<SeatUtilization>({
    queryKey: ['/api/organizations', orgId, 'seat-utilization'],
    enabled: !!orgId && isOrgAdmin,
  });

  const { data: trialStatusData, isLoading: isLoadingTrialStatus } = useQuery<TrialStatus>({
    queryKey: ['/api/trial-status'],
    enabled: !!user,
  });

  const { data: subscriptionsData, isLoading: isLoadingSubscription } = useQuery({
    queryKey: ['/api/subscriptions', { targetType: isStudent && !isOrgAdmin ? 'user' : 'organization', targetId: isStudent && !isOrgAdmin ? user?.id : orgId }],
    queryFn: async () => {
      const params = new URLSearchParams();
      const targetType = isStudent && !isOrgAdmin ? 'user' : 'organization';
      const targetId = isStudent && !isOrgAdmin ? user?.id : orgId;
      
      params.append('targetType', targetType);
      if (targetId) params.append('targetId', targetId);

      const response = await fetch(`/api/subscriptions?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch subscriptions');
      }
      return response.json();
    },
    enabled: !!user && (isStudent || isOrgAdmin),
  });

  const subscriptions = (subscriptionsData as any)?.subscriptions || [];
  const currentSubscription: Subscription | null = orgSubscription?.subscription || subscriptions.find(
    (s: Subscription) => s.status === 'active' || s.status === 'past_due'
  ) || null;

  const { data: educatorPlansData, isLoading: isLoadingEducatorPlans } = useQuery<{ subscriptionPlans: SubscriptionPlan[] }>({
    queryKey: ['/api/public/subscription-plans', { planType: 'educator', currency: userCurrency }],
    queryFn: async () => {
      const response = await fetch(`/api/public/subscription-plans?planType=educator&currency=${userCurrency}`);
      if (!response.ok) {
        throw new Error('Failed to fetch educator plans');
      }
      return response.json();
    },
    enabled: !!user && isOrgAdmin,
    staleTime: 30 * 1000, // 30 seconds - pricing should be fresh from SuperAdmin
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  const { data: learnerPlansData, isLoading: isLoadingLearnerPlans } = useQuery<{ subscriptionPlans: SubscriptionPlan[] }>({
    queryKey: ['/api/public/subscription-plans', { planType: 'learner', currency: userCurrency }],
    queryFn: async () => {
      const response = await fetch(`/api/public/subscription-plans?planType=learner&currency=${userCurrency}`);
      if (!response.ok) {
        throw new Error('Failed to fetch learner plans');
      }
      return response.json();
    },
    enabled: !!user && isStudent && !isOrgAdmin,
    staleTime: 30 * 1000, // 30 seconds - pricing should be fresh from SuperAdmin
    refetchOnWindowFocus: true, // Refetch when user returns to tab
  });

  const educatorPlans = educatorPlansData?.subscriptionPlans || [];
  const learnerPlans = learnerPlansData?.subscriptionPlans || [];
  const eligiblePackages = eligiblePackagesData?.packages || educatorPlans.map(plan => ({
    ...plan,
    isUpgrade: false,
    isDowngrade: false,
    isCurrent: currentSubscription?.planId === plan.id,
  }));
  const seatUtilization = seatUtilizationData || {
    learners: { current: 0, max: 100, percentage: 0 },
    teachers: { current: 0, max: 10, percentage: 0 },
    orgAdmins: { current: 0, max: 3, percentage: 0 },
  };

  const upgradeMutation = useMutation({
    mutationFn: async ({ packageId, forceYocoMode }: { packageId: string; forceYocoMode?: YocoPaymentMode }) => {
      return await apiRequest(`/api/organizations/${orgId}/upgrade`, {
        method: 'POST',
        body: JSON.stringify({ packageId, forceYocoMode }),
      });
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId] });
        queryClient.invalidateQueries({ queryKey: ['/api/subscriptions'] });
        toast({
          title: "Upgrade successful",
          description: "Your subscription has been upgraded.",
        });
        setShowUpgradeDialog(false);
        setSelectedPackage(null);
        
        if (data.reenableOpportunity?.canReenableUsers && data.reenableOpportunity?.disabledUsers?.length > 0) {
          setDisabledUsersToReenable(data.reenableOpportunity.disabledUsers);
          setSelectedUserIds(data.reenableOpportunity.disabledUsers.map((u: DisabledUser) => u.id));
          setShowReenableDialog(true);
        }
      }
    },
    onError: (error: any) => {
      toast({
        title: "Upgrade failed",
        description: error.message || "Failed to upgrade subscription",
        variant: "destructive",
      });
    },
  });

  const reenableUsersMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      return await apiRequest(`/api/organizations/${orgId}/reenable-users`, {
        method: 'POST',
        body: JSON.stringify({ userIds }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId, 'seat-utilization'] });
      const enabledCount = data.enabled?.filter((e: any) => e.success).length || 0;
      toast({
        title: "Users re-enabled",
        description: `Successfully re-enabled ${enabledCount} user${enabledCount !== 1 ? 's' : ''}. ${data.emailsSent || 0} welcome back email${data.emailsSent !== 1 ? 's' : ''} sent.`,
      });
      setShowReenableDialog(false);
      setDisabledUsersToReenable([]);
      setSelectedUserIds([]);
    },
    onError: (error: any) => {
      toast({
        title: "Re-enable failed",
        description: error.message || "Failed to re-enable users",
        variant: "destructive",
      });
    },
  });

  const downgradeMutation = useMutation({
    mutationFn: async ({ packageId }: { packageId: string }) => {
      return await apiRequest(`/api/organizations/${orgId}/schedule-downgrade`, {
        method: 'POST',
        body: JSON.stringify({ packageId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId] });
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions'] });
      toast({
        title: "Downgrade scheduled",
        description: `Your subscription will be downgraded at the end of the current billing period.`,
      });
      setShowDowngradeDialog(false);
      setSelectedPackage(null);
    },
    onError: (error: any) => {
      toast({
        title: "Downgrade failed",
        description: error.message || "Failed to schedule downgrade",
        variant: "destructive",
      });
    },
  });

  const purchaseMutation = useMutation({
    mutationFn: async ({ planId, forceYocoMode }: { planId: string; forceYocoMode?: YocoPaymentMode }) => {
      const targetType = isOrgAdmin ? 'organization' : 'user';
      const targetId = isOrgAdmin ? orgId : user?.id;

      const response = await apiRequest(`/api/subscription-plans/${planId}/purchase`, {
        method: 'POST',
        body: JSON.stringify({
          targetType,
          targetId,
          ...(forceYocoMode && { forceYocoMode }),
        }),
      });

      return response;
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    },
    onError: (error: any) => {
      toast({
        title: "Purchase failed",
        description: error.message || "Failed to initiate subscription purchase",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!currentSubscription) return;

      return await apiRequest(`/api/subscriptions/${currentSubscription.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ 
          reason: cancelReason || 'User requested cancellation',
          cancelImmediately: false
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId] });
      toast({
        title: "Cancellation scheduled",
        description: "Your subscription will be cancelled at the end of the current billing period.",
      });
      setCancelReason("");
      setShowCancelDialog(false);
    },
    onError: (error: any) => {
      toast({
        title: "Cancellation failed",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    },
  });

  const undoCancelMutation = useMutation({
    mutationFn: async () => {
      if (!currentSubscription) return;

      return await apiRequest(`/api/subscriptions/${currentSubscription.id}/undo-cancel`, {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscriptions'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/organizations', orgId] });
      toast({
        title: "Subscription reactivated",
        description: "Your subscription has been reactivated and will continue as normal.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Reactivation failed",
        description: error.message || "Failed to reactivate subscription",
        variant: "destructive",
      });
    },
  });

  const isLoadingData = isLoadingSubscription || isLoadingEducatorPlans || isLoadingLearnerPlans || 
    adminLoading || verificationLoading || isLoadingOrgSubscription || isLoadingEligiblePackages || 
    isLoadingSeatUtilization || isLoadingTrialStatus;

  const executePurchase = (planId: string, forceYocoMode?: YocoPaymentMode) => {
    purchaseMutation.mutate({ planId, forceYocoMode });
  };

  const handleSubscribe = (planId: string) => {
    if (!isEmailVerified) {
      setPendingPlanId(planId);
      setShowVerificationModal(true);
      return;
    }
    if (isSuperAdmin) {
      setPendingPlanId(planId);
      requestPaymentMode((mode) => {
        executePurchase(planId, mode);
        setPendingPlanId(null);
      });
    } else {
      executePurchase(planId);
    }
  };

  const handleUpgrade = (pkg: EligiblePackage) => {
    if (!isEmailVerified) {
      setPendingPlanId(pkg.id);
      setShowVerificationModal(true);
      return;
    }
    setSelectedPackage(pkg);
    setShowUpgradeDialog(true);
  };

  const handleDowngrade = (pkg: EligiblePackage) => {
    setSelectedPackage(pkg);
    setShowDowngradeDialog(true);
  };

  const confirmUpgrade = () => {
    if (!selectedPackage) return;
    if (isSuperAdmin) {
      requestPaymentMode((mode) => {
        upgradeMutation.mutate({ packageId: selectedPackage.id, forceYocoMode: mode });
      });
    } else {
      upgradeMutation.mutate({ packageId: selectedPackage.id });
    }
  };

  const confirmDowngrade = () => {
    if (!selectedPackage) return;
    downgradeMutation.mutate({ packageId: selectedPackage.id });
  };

  const handleVerificationComplete = () => {
    setShowVerificationModal(false);
    if (pendingPlanId) {
      if (isSuperAdmin) {
        requestPaymentMode((mode) => {
          executePurchase(pendingPlanId, mode);
          setPendingPlanId(null);
        });
      } else {
        executePurchase(pendingPlanId);
        setPendingPlanId(null);
      }
    }
  };

  const handleCancelClick = () => {
    setShowCancelDialog(true);
  };

  const handleCancelConfirm = () => {
    cancelMutation.mutate();
  };

  const formatPeriodEndDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getSeatUtilizationVariant = (percentage: number): "default" | "success" | "warning" | "error" => {
    if (percentage >= 90) return "error";
    if (percentage >= 75) return "warning";
    return "default";
  };

  const PendingCancellationWarning = ({ periodEndDate }: { periodEndDate: string }) => (
    <div 
      className="bg-warning/20 border border-[var(--warning)]/50 rounded-lg p-[var(--card-padding)] mb-[var(--space-md)]"
      data-testid="text-cancellation-warning"
    >
      <div className="flex flex-col sm:flex-row items-start gap-[var(--space-sm)]">
        <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-warning/90 font-medium text-[length:var(--text-base)]">Cancellation Scheduled</p>
          <p className="text-warning/70 text-[length:var(--text-sm)] mt-1">
            Your subscription is scheduled for cancellation at the end of the current period ({formatPeriodEndDate(periodEndDate)}). 
            You will retain access to all features until then.
          </p>
        </div>
      </div>
      <div className="mt-[var(--space-sm)] sm:ml-8">
        <Button variant="outline" size="sm" onClick={() => undoCancelMutation.mutate()}
          disabled={undoCancelMutation.isPending}
          className="border-[var(--warning)]/50 text-warning/90 hover:bg-warning/20 min-h-[44px] touch-manipulation w-full sm:w-auto"
          data-testid="button-undo-cancel"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          {undoCancelMutation.isPending ? 'Reactivating...' : 'Keep Subscription'}
        </Button>
      </div>
    </div>
  );

  const ScheduledDowngradeWarning = ({ downgrade }: { downgrade: Subscription['scheduledDowngrade'] }) => {
    if (!downgrade) return null;
    return (
      <div 
        className="bg-secondary/20 border border-secondary/50 rounded-lg p-[var(--card-padding)] mb-[var(--space-md)]"
        data-testid="text-downgrade-warning"
      >
        <div className="flex flex-col sm:flex-row items-start gap-[var(--space-sm)]">
          <TrendingDown className="h-5 w-5 text-secondary flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-secondary/90 font-medium text-[length:var(--text-base)]">Downgrade Scheduled</p>
            <p className="text-secondary/70 text-[length:var(--text-sm)] mt-1">
              Your subscription will be downgraded to <strong>{downgrade.packageName}</strong> on {formatPeriodEndDate(downgrade.effectiveDate)}.
            </p>
          </div>
        </div>
      </div>
    );
  };

  const SeatUtilizationCard = () => (
    <BillingCard
      title="Seat Utilization"
      description="Current usage of your subscription seats"
      testId="card-seat-utilization"
    >
      <div className="space-y-[var(--space-lg)]">
        <div className="space-y-[var(--space-sm)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-primary" />
              <span className="text-[length:var(--text-sm)] font-medium">{terminology.learnerPlural}</span>
            </div>
            <span className="text-[length:var(--text-sm)] text-muted-foreground">
              {seatUtilization.learners.current} / {seatUtilization.learners.max === -1 ? 'Unlimited' : seatUtilization.learners.max}
            </span>
          </div>
          <Progress 
            value={seatUtilization.learners.max === -1 ? 10 : seatUtilization.learners.percentage} 
            variant={getSeatUtilizationVariant(seatUtilization.learners.percentage)}
            className="h-2"
          />
          {seatUtilization.learners.percentage >= 90 && seatUtilization.learners.max !== -1 && (
            <p className="text-[length:var(--text-xs)] text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Near seat limit - consider upgrading
            </p>
          )}
        </div>

        <div className="space-y-[var(--space-sm)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-secondary" />
              <span className="text-[length:var(--text-sm)] font-medium">{terminology.educatorPlural}</span>
            </div>
            <span className="text-[length:var(--text-sm)] text-muted-foreground">
              {seatUtilization.teachers.current} / {seatUtilization.teachers.max === -1 ? 'Unlimited' : seatUtilization.teachers.max}
            </span>
          </div>
          <Progress 
            value={seatUtilization.teachers.max === -1 ? 10 : seatUtilization.teachers.percentage} 
            variant={getSeatUtilizationVariant(seatUtilization.teachers.percentage)}
            className="h-2"
          />
          {seatUtilization.teachers.percentage >= 90 && seatUtilization.teachers.max !== -1 && (
            <p className="text-[length:var(--text-xs)] text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Near seat limit - consider upgrading
            </p>
          )}
        </div>

        <div className="space-y-[var(--space-sm)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserCog className="h-4 w-4 text-warning" />
              <span className="text-[length:var(--text-sm)] font-medium">Org Admins</span>
            </div>
            <span className="text-[length:var(--text-sm)] text-muted-foreground">
              {seatUtilization.orgAdmins.current} / {seatUtilization.orgAdmins.max === -1 ? 'Unlimited' : seatUtilization.orgAdmins.max}
            </span>
          </div>
          <Progress 
            value={seatUtilization.orgAdmins.max === -1 ? 10 : seatUtilization.orgAdmins.percentage} 
            variant={getSeatUtilizationVariant(seatUtilization.orgAdmins.percentage)}
            className="h-2"
          />
          {seatUtilization.orgAdmins.percentage >= 90 && seatUtilization.orgAdmins.max !== -1 && (
            <p className="text-[length:var(--text-xs)] text-destructive flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Near seat limit - consider upgrading
            </p>
          )}
        </div>
      </div>
    </BillingCard>
  );

  const TrialStatusCard = () => {
    if (!trialStatusData?.isTrialActive) return null;
    
    const daysRemaining = trialStatusData.daysRemaining;
    const isUrgent = daysRemaining <= 7;
    const isCritical = daysRemaining <= 3;
    
    return (
      <Card 
        className={`border-2 ${isCritical ? 'border-[var(--destructive)] bg-destructive/10' : isUrgent ? 'border-[var(--warning)] bg-warning/10' : 'border-primary bg-primary/10'}`}
        data-testid="card-trial-status"
      >
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-[length:var(--text-lg)]">
            <Clock className={`h-5 w-5 ${isCritical ? 'text-destructive' : isUrgent ? 'text-warning' : 'text-primary'}`} />
            Trial Period Active
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className={`text-[length:var(--text-2xl)] font-bold ${isCritical ? 'text-destructive' : isUrgent ? 'text-warning' : 'text-primary'}`}>
                {daysRemaining} {daysRemaining === 1 ? 'day' : 'days'} remaining
              </p>
              {trialStatusData.trialEndDate && (
                <p className="text-[length:var(--text-sm)] text-muted-foreground mt-1">
                  Trial ends on {formatPeriodEndDate(trialStatusData.trialEndDate)}
                </p>
              )}
            </div>
            <Button onClick={() => setLocation('/license/checkout')}
              className="min-h-[44px] touch-manipulation"
              variant={isCritical ? 'destructive' : 'default'}
              data-testid="button-upgrade-trial"
            >
              <Crown className="h-4 w-4 mr-2" />
              Upgrade Now
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (isLoadingData) {
    return (
      <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
        <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
        
        <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 relative z-10">
          <div className="mb-[var(--space-lg)]">
            <h1 className="text-[length:var(--text-4xl)] font-bold mb-[var(--space-sm)] text-foreground drop-shadow-elevated">
              {isOrgAdmin ? 'Subscription Management' : 'Subscription Plans'}
            </h1>
            <p className="text-muted-foreground text-[length:var(--text-lg)]">
              {isOrgAdmin ? 'Manage your organization subscription and seat allocation' : 'Manage your subscription plan'}
            </p>
          </div>
          <div className="mt-[var(--space-lg)] space-y-[var(--space-lg)]">
            <BillingCardGrid columns={3}>
              <PlanCardSkeleton />
              <PlanCardSkeleton />
              <PlanCardSkeleton />
            </BillingCardGrid>
          </div>
        </div>
      </div>
    );
  }

  const DemoOrganizationBanner = () => (
    <Card className="border-border bg-primary/5 mb-[var(--space-lg)]" data-testid="card-demo-organization">
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="flex items-center gap-2 text-[var(--fg-strong)]">
              Demo Organization
              <Badge >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Full Access
              </Badge>
            </CardTitle>
            <CardDescription>Browse available subscription packages below</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="text-muted-foreground text-[length:var(--text-sm)]">
          This is a demo organization with full platform access. All features and {LP_CREDITS_SHORT} are available without purchasing.
          <span className="block mt-2 text-primary">View the packages below to see what's included in each subscription tier.</span>
        </p>
      </CardContent>
    </Card>
  );

  const isEffectiveDemo = isDemo && !authSuperAdmin;
  const isTrialActive = trialStatusData?.isTrialActive || false;

  const getVariant = (colorScheme: string, tier: string) => {
    if (tier === 'trial') return 'trial';
    if (colorScheme === 'blue') return 'budget';
    if (colorScheme === 'purple') return 'premium';
    if (colorScheme === 'orange') return 'orange';
    if (colorScheme === 'green') return 'trial';
    return 'default';
  };

  const currentPlan = educatorPlans.find(p => p.id === currentSubscription?.planId) || 
                      learnerPlans.find(p => p.id === currentSubscription?.planId);

  return (
    <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
      <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
      
      <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 relative z-10">
        <div className="mb-[var(--space-lg)]">
          <h1 className="text-[length:var(--text-4xl)] font-bold mb-[var(--space-sm)] text-foreground drop-shadow-elevated">
            {isOrgAdmin ? 'Subscription Management' : 'Subscription Plans'}
          </h1>
          <p className="text-muted-foreground text-[length:var(--text-lg)]">
            {isOrgAdmin ? 'Manage your organization subscription and seat allocation' : 'Manage your subscription plan'}
          </p>
        </div>

        <div className="mt-[var(--space-lg)] space-y-[var(--space-xl)]">
          {isEffectiveDemo && <DemoOrganizationBanner />}
          <TrialStatusCard />

          {isOrgAdmin && (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-[var(--space-lg)]">
                {currentSubscription && (
                  <BillingCard
                    title="Current Subscription"
                    description="Your active organization subscription"
                    testId="card-current-subscription"
                    badge={currentPlan?.badge || undefined}
                  >
                    <div className="space-y-[var(--space-md)]">
                      {currentSubscription.cancelAtPeriodEnd && (
                        <PendingCancellationWarning periodEndDate={currentSubscription.currentPeriodEnd} />
                      )}
                      
                      {currentSubscription.scheduledDowngrade && (
                        <ScheduledDowngradeWarning downgrade={currentSubscription.scheduledDowngrade} />
                      )}
                      
                      <div className="flex items-center gap-3 mb-4">
                        <div className="h-12 w-12 rounded-xl bg-surface-raised flex items-center justify-center">
                          <Crown className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <div>
                          <p className="text-[length:var(--text-xl)] font-bold text-foreground">
                            {currentPlan?.name || 'Unknown Plan'}
                          </p>
                          <Badge variant="outline" className="mt-1">
                            {currentPlan?.tier || 'standard'} tier
                          </Badge>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-[length:var(--text-xs)] text-muted-foreground uppercase tracking-wide">Billing Interval</p>
                          <p className="text-[length:var(--text-base)] font-semibold capitalize">
                            {currentSubscription.billingInterval || 'Monthly'}
                          </p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-[length:var(--text-xs)] text-muted-foreground uppercase tracking-wide">Status</p>
                          <Badge variant={currentSubscription.status === 'active' ? 'default' : 'destructive'}>
                            {currentSubscription.cancelAtPeriodEnd ? 'Cancelling' : currentSubscription.status}
                          </Badge>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-[length:var(--text-xs)] text-muted-foreground uppercase tracking-wide">Current Period</p>
                          <p className="text-[length:var(--text-sm)]">
                            {new Date(currentSubscription.currentPeriodStart).toLocaleDateString()} - {new Date(currentSubscription.currentPeriodEnd).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-[length:var(--text-xs)] text-muted-foreground uppercase tracking-wide">Next Billing Date</p>
                          <p className="text-[length:var(--text-sm)] flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {currentSubscription.cancelAtPeriodEnd 
                              ? 'No further billing' 
                              : new Date(currentSubscription.nextBillingDate).toLocaleDateString()}
                          </p>
                        </div>
                        {currentPlan && (
                          <div className="bg-muted/50 rounded-lg p-3 sm:col-span-2">
                            <p className="text-[length:var(--text-xs)] text-muted-foreground uppercase tracking-wide">Price</p>
                            <p className="text-[length:var(--text-2xl)] font-bold text-foreground">
                              {formatPrice(currentPlan.pricePerTeacher, currentPlan.currency)}
                              <span className="text-[length:var(--text-sm)] font-normal text-muted-foreground ml-1">
                                /{currentSubscription.billingInterval === 'annual' ? 'year' : 'month'}
                              </span>
                            </p>
                          </div>
                        )}
                      </div>

                      {currentPlan && currentPlan.monthlyCredits > 0 && (
                        <div className="bg-primary hover:bg-primary/90 rounded-lg p-4 border border-primary/30">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[length:var(--text-sm)] text-muted-foreground">Monthly Credits</p>
                              <p className="text-[length:var(--text-2xl)] font-bold text-foreground">
                                {currentPlan.monthlyCredits} {LP_CREDITS_SHORT}
                              </p>
                            </div>
                            <Zap className="h-8 w-8 text-primary" />
                          </div>
                        </div>
                      )}
                      
                      {!currentSubscription.cancelAtPeriodEnd && (
                        <div className="pt-[var(--space-md)] border-t flex flex-wrap gap-2">
                          <Button variant="destructive" onClick={handleCancelClick} disabled={cancelMutation.isPending} className="min-h-[44px] touch-manipulation" data-testid="button-cancel-subscription" >
                            {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
                          </Button>
                        </div>
                      )}
                    </div>
                  </BillingCard>
                )}

                <SeatUtilizationCard />
              </div>

              <div>
                <h2 className="text-[length:var(--text-2xl)] font-bold mb-[var(--space-md)] text-foreground flex items-center gap-2">
                  {currentSubscription ? 'Available Packages' : `${LP_CREDITS_NAME} Packages`}
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Select a package to upgrade or downgrade your subscription</p>
                    </TooltipContent>
                  </Tooltip>
                </h2>
                <BillingCardGrid columns={3}>
                  {eligiblePackages.map((pkg) => {
                    const isCurrent = currentSubscription?.planId === pkg.id;
                    
                    return (
                      <BillingCard
                        key={pkg.id}
                        title={pkg.name}
                        testId={`card-package-${pkg.id}`}
                        variant={getVariant(pkg.colorScheme, pkg.tier)}
                        badge={pkg.badge || undefined}
                        className={isCurrent ? 'ring-2 ring-[var(--action-primary)] ring-offset-2 ring-offset-background' : ''}
                      >
                        <div className="space-y-[var(--space-md)]">
                          {isCurrent && (
                            <Badge >
                              Current Plan
                            </Badge>
                          )}
                          
                          <div className="text-center py-[var(--space-lg)] bg-muted rounded-lg border border-border">
                            <p className="text-[length:var(--text-4xl)] font-bold text-foreground">
                              {formatPrice(pkg.pricePerTeacher, pkg.currency, { showCode: true })}
                            </p>
                            <p className="text-[length:var(--text-sm)] text-muted-foreground mt-1">per month</p>
                            {pkg.annualPrice && (
                              <p className="text-[length:var(--text-xs)] text-muted-foreground mt-2">
                                or {formatPrice(pkg.annualPrice, pkg.currency)}/year (save 20%)
                              </p>
                            )}
                          </div>

                          {pkg.monthlyCredits > 0 && (
                            <div className="bg-primary hover:bg-primary/90 rounded-lg p-[var(--space-sm)] border border-primary/30">
                              <p className="text-[length:var(--text-2xl)] font-bold text-foreground text-center">
                                {pkg.monthlyCredits}
                              </p>
                              <p className="text-[length:var(--text-xs)] text-muted-foreground text-center">{LP_CREDITS_SHORT}/month</p>
                            </div>
                          )}

                          {pkg.maxLearners && (
                            <div className="text-[length:var(--text-sm)] text-muted-foreground flex items-center gap-2">
                              <GraduationCap className="h-4 w-4" />
                              Up to {pkg.maxLearners === -1 ? 'Unlimited' : pkg.maxLearners} learners
                            </div>
                          )}

                          {pkg.features && pkg.features.length > 0 && (
                            <div className="space-y-[var(--space-sm)]">
                              <p className="font-semibold text-[length:var(--text-sm)] text-foreground">Features:</p>
                              <ul className="space-y-1">
                                {pkg.features.map((feature, idx) => (
                                  <li key={idx} className="flex items-start gap-[var(--space-sm)] text-[length:var(--text-sm)]">
                                    <Check className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                                    <span className="text-muted-foreground">{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {'proratedAmount' in pkg && pkg.proratedAmount !== undefined && pkg.isUpgrade && (
                            <div className="bg-success/10 border border-[var(--success)]/30 rounded-lg p-3">
                              <p className="text-[length:var(--text-xs)] text-muted-foreground">Prorated upgrade cost</p>
                              <p className="text-[length:var(--text-lg)] font-bold text-success">
                                {formatPrice(pkg.proratedAmount, pkg.currency)}
                              </p>
                            </div>
                          )}

                          {'userLimitWarning' in pkg && pkg.userLimitWarning && pkg.isDowngrade && (
                            <div className="bg-warning/10 border border-[var(--warning)]/30 rounded-lg p-3">
                              <p className="text-[length:var(--text-xs)] text-warning flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {pkg.userLimitWarning}
                              </p>
                            </div>
                          )}

                          {isTrialActive && !currentSubscription && (
                            <div className="bg-secondary/10 border border-secondary/30 rounded-lg p-2 mb-2">
                              <p className="text-[length:var(--text-xs)] text-secondary text-center">
                                Available after trial ends
                              </p>
                            </div>
                          )}

                          <div className="pt-2">
                            {isEffectiveDemo ? (
                              <Button disabled className="w-full min-h-[44px]" data-testid={`button-demo-disabled-${pkg.id}`} >
                                Demo Mode - Purchase Disabled
                              </Button>
                            ) : isCurrent ? (
                              <Button disabled className="w-full min-h-[44px]">
                                Current Plan
                              </Button>
                            ) : pkg.isUpgrade ? (
                              <Button className="w-full min-h-[44px] touch-manipulation" onClick={() => handleUpgrade(pkg)}
                                disabled={upgradeMutation.isPending}
                                data-testid={`button-upgrade-${pkg.id}`}
                              >
                                <TrendingUp className="h-4 w-4 mr-2" />
                                {upgradeMutation.isPending ? 'Processing...' : 'Upgrade'}
                                <ArrowRight className="h-4 w-4 ml-2" />
                              </Button>
                            ) : pkg.isDowngrade ? (
                              <Button variant="outline" className="w-full min-h-[44px] touch-manipulation" onClick={() => handleDowngrade(pkg)}
                                disabled={downgradeMutation.isPending}
                                data-testid={`button-downgrade-${pkg.id}`}
                              >
                                <TrendingDown className="h-4 w-4 mr-2" />
                                {downgradeMutation.isPending ? 'Processing...' : 'Schedule Downgrade'}
                              </Button>
                            ) : (
                              <Button className="w-full min-h-[44px] touch-manipulation" onClick={() => handleSubscribe(pkg.id)}
                                disabled={purchaseMutation.isPending || !pkg.isActive}
                                data-testid={`button-subscribe-${pkg.id}`}
                              >
                                <CreditCard className="h-4 w-4 mr-2" />
                                {purchaseMutation.isPending ? 'Processing...' : 'Subscribe'}
                              </Button>
                            )}
                          </div>
                        </div>
                      </BillingCard>
                    );
                  })}
                </BillingCardGrid>
              </div>
            </>
          )}

          {isStudent && !isOrgAdmin && (
            <>
              {currentSubscription && (
                <BillingCard
                  title="Current Subscription"
                  description="Your active subscription details"
                  testId="card-current-subscription"
                >
                  <div className="space-y-[var(--space-md)]">
                    {currentSubscription.cancelAtPeriodEnd && (
                      <PendingCancellationWarning periodEndDate={currentSubscription.currentPeriodEnd} />
                    )}
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                      <div>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">Plan</p>
                        <p className="text-[length:var(--text-lg)] font-semibold">{learnerPlans.find(p => p.id === currentSubscription.planId)?.name || 'Unknown Plan'}</p>
                      </div>
                      <div>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">Status</p>
                        <Badge variant={currentSubscription.status === 'active' ? 'default' : 'destructive'}>
                          {currentSubscription.cancelAtPeriodEnd ? 'Cancelling' : currentSubscription.status}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">Current Period</p>
                        <p className="text-[length:var(--text-sm)]">
                          {new Date(currentSubscription.currentPeriodStart).toLocaleDateString()} -{' '}
                          {new Date(currentSubscription.currentPeriodEnd).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">Next Billing Date</p>
                        <p className="text-[length:var(--text-sm)]">
                          {currentSubscription.cancelAtPeriodEnd 
                            ? 'No further billing (cancelled)' 
                            : new Date(currentSubscription.nextBillingDate).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {!currentSubscription.cancelAtPeriodEnd && (
                      <div className="pt-[var(--space-md)] border-t">
                        <Button variant="destructive" onClick={handleCancelClick} disabled={cancelMutation.isPending} className="min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-cancel-subscription" >
                          {cancelMutation.isPending ? 'Cancelling...' : 'Cancel Subscription'}
                        </Button>
                      </div>
                    )}
                  </div>
                </BillingCard>
              )}

              <div>
                <h2 className="text-[length:var(--text-2xl)] font-bold mb-[var(--space-md)] text-foreground">
                  {currentSubscription ? 'Available Plans' : 'Choose a Plan'}
                </h2>
                <BillingCardGrid columns={3}>
                  {learnerPlans.map((plan) => (
                    <BillingCard
                      key={plan.id}
                      title={plan.name}
                      testId={`card-learner-plan-${plan.id}`}
                      variant={getVariant(plan.colorScheme, plan.tier)}
                      badge={plan.badge || undefined}
                      className={currentSubscription?.planId === plan.id ? 'border-primary' : ''}
                    >
                      <div className="space-y-[var(--space-md)]">
                        <div className="text-center py-[var(--space-lg)] bg-muted rounded-lg border border-border">
                          <p className="text-[length:var(--text-4xl)] font-bold text-foreground">
                            {formatPrice(plan.pricePerTeacher, plan.currency, { showCode: true })}
                          </p>
                          <p className="text-[length:var(--text-sm)] text-muted-foreground mt-1">per month</p>
                        </div>
                        <div className="space-y-[var(--space-sm)]">
                          {plan.monthlyCredits > 0 && (
                            <>
                              <p className="font-semibold text-[length:var(--text-sm)] text-foreground">Monthly Credits</p>
                              <div className="bg-primary hover:bg-primary/90 rounded-lg p-[var(--space-sm)] border border-primary/30 mb-[var(--space-sm)]">
                                <p className="text-[length:var(--text-2xl)] font-bold text-foreground text-center">
                                  {plan.monthlyCredits}
                                </p>
                                <p className="text-[length:var(--text-xs)] text-muted-foreground text-center">{LP_CREDITS_SHORT}/month</p>
                              </div>
                            </>
                          )}
                          {plan.features && plan.features.length > 0 && (
                            <>
                              <p className="font-semibold text-[length:var(--text-sm)] text-foreground">Features:</p>
                              <ul className="space-y-1">
                                {plan.features.map((feature, idx) => (
                                  <li key={idx} className="flex items-start gap-[var(--space-sm)] text-[length:var(--text-sm)]">
                                    <Check className="h-4 w-4 text-success mt-0.5 flex-shrink-0" />
                                    <span className="text-muted-foreground">{feature}</span>
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                        </div>
                        
                        {isTrialActive && !currentSubscription && (
                          <div className="bg-secondary/10 border border-secondary/30 rounded-lg p-2 mb-2">
                            <p className="text-[length:var(--text-xs)] text-secondary text-center">
                              Available after trial ends
                            </p>
                          </div>
                        )}

                        {isEffectiveDemo ? (
                          <Button disabled className="w-full min-h-[44px]" data-testid={`button-demo-disabled-${plan.id}`} >
                            Demo Mode - Purchase Disabled
                          </Button>
                        ) : (
                          <Button className="w-full min-h-[44px] touch-manipulation" onClick={() => handleSubscribe(plan.id)}
                            disabled={
                              purchaseMutation.isPending ||
                              !!currentSubscription ||
                              !plan.isActive
                            }
                            data-testid={`button-purchase-${plan.id}`}
                          >
                            {purchaseMutation.isPending ? (
                              'Processing...'
                            ) : currentSubscription?.planId === plan.id ? (
                              'Current Plan'
                            ) : currentSubscription ? (
                              'Cancel Current to Switch'
                            ) : (
                              <>
                                <CreditCard className="h-4 w-4 mr-2" />
                                Subscribe
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </BillingCard>
                  ))}
                </BillingCardGrid>
              </div>
            </>
          )}
        </div>
      </div>
      
      <EmailVerificationModal
        isOpen={showVerificationModal}
        onClose={() => {
          setShowVerificationModal(false);
          setPendingPlanId(null);
        }}
        onVerified={handleVerificationComplete}
      />
      
      {showConfirmationModal && (
        <PurchaseConfirmationModal
          intentId={intentId}
          checkoutId={checkoutId}
          onClose={handleConfirmationClose}
          onSuccess={() => invalidatePurchaseCaches()}
        />
      )}

      {isSuperAdmin && (
        <SuperAdminPaymentModeModal
          isOpen={isPaymentModeModalOpen}
          onClose={handlePaymentModeClose}
          onConfirm={handlePaymentModeConfirm}
          isLoading={purchaseMutation.isPending || upgradeMutation.isPending}
          productName={
            selectedPackage?.name || 
            (pendingPlanId ? [...educatorPlans, ...learnerPlans].find(p => p.id === pendingPlanId)?.name : undefined) || 
            'Subscription'
          }
        />
      )}

      <AlertDialog open={showUpgradeDialog} onOpenChange={setShowUpgradeDialog}>
        <AlertDialogContent className="bg-card border-border max-w-[calc(100vw-2rem)] sm:max-w-lg" data-testid="dialog-upgrade-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-[length:var(--text-xl)] flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-success" />
              Confirm Upgrade
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-[length:var(--text-sm)]">
              You are upgrading to <span className="font-semibold text-foreground">{selectedPackage?.name}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
            {selectedPackage?.proratedAmount !== undefined && (
              <div className="bg-success/10 border border-[var(--success)]/30 rounded-lg p-4">
                <p className="text-[length:var(--text-sm)] text-muted-foreground">Prorated amount due today</p>
                <p className="text-[length:var(--text-2xl)] font-bold text-success">
                  {formatPrice(selectedPackage.proratedAmount, selectedPackage.currency)}
                </p>
                <p className="text-[length:var(--text-xs)] text-muted-foreground mt-1">
                  This covers the difference for the remainder of your billing period
                </p>
              </div>
            )}
            
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-[length:var(--text-sm)] text-muted-foreground">New monthly rate</p>
              <p className="text-[length:var(--text-xl)] font-bold text-foreground">
                {selectedPackage ? formatPrice(selectedPackage.pricePerTeacher, selectedPackage.currency) : ''}/month
              </p>
            </div>
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <AlertDialogCancel 
              className="bg-muted text-foreground border-border hover:bg-muted/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={upgradeMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUpgrade}
              className="bg-success text-success-foreground hover:bg-success/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={upgradeMutation.isPending}
            >
              {upgradeMutation.isPending ? 'Processing...' : 'Confirm Upgrade'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDowngradeDialog} onOpenChange={setShowDowngradeDialog}>
        <AlertDialogContent className="bg-card border-border max-w-[calc(100vw-2rem)] sm:max-w-lg" data-testid="dialog-downgrade-confirmation">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-[length:var(--text-xl)] flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-warning" />
              Schedule Downgrade
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-[length:var(--text-sm)]">
              You are scheduling a downgrade to <span className="font-semibold text-foreground">{selectedPackage?.name}</span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
            <div className="bg-warning/10 border border-[var(--warning)]/30 rounded-lg p-4">
              <p className="text-warning text-[length:var(--text-sm)] flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                The downgrade will take effect at the end of your current billing period
              </p>
            </div>

            {selectedPackage?.userLimitWarning && (
              <div className="bg-destructive/10 border border-[var(--destructive)]/30 rounded-lg p-4">
                <p className="text-destructive text-[length:var(--text-sm)] flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  {selectedPackage.userLimitWarning}
                </p>
                <Button variant="link" className="p-0 h-auto mt-2" onClick={() => {
                    setShowDowngradeDialog(false);
                    setLocation('/user-management');
                  }}
                >
                  Manage Users <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              </div>
            )}
            
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-[length:var(--text-sm)] text-muted-foreground">Effective date</p>
              <p className="text-[length:var(--text-base)] font-semibold text-foreground">
                {currentSubscription ? formatPeriodEndDate(currentSubscription.currentPeriodEnd) : 'End of billing period'}
              </p>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-[length:var(--text-sm)] text-muted-foreground">New monthly rate</p>
              <p className="text-[length:var(--text-xl)] font-bold text-foreground">
                {selectedPackage ? formatPrice(selectedPackage.pricePerTeacher, selectedPackage.currency) : ''}/month
              </p>
            </div>
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <AlertDialogCancel 
              className="bg-muted text-foreground border-border hover:bg-muted/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={downgradeMutation.isPending}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDowngrade}
              className="bg-warning text-warning-foreground hover:bg-warning/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={downgradeMutation.isPending}
            >
              {downgradeMutation.isPending ? 'Processing...' : 'Schedule Downgrade'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <AlertDialogContent data-testid="dialog-cancel-confirmation" className="bg-card border-border max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-[length:var(--text-xl)]">Cancel Subscription</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-[length:var(--text-sm)]">
              Your subscription will remain active until{' '}
              <span className="font-semibold text-warning">
                {currentSubscription ? formatPeriodEndDate(currentSubscription.currentPeriodEnd) : 'the end of the billing period'}
              </span>
              . After that, you'll lose access to premium features.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
            <div className="bg-warning/10 border border-[var(--warning)]/30 rounded-lg p-[var(--space-sm)]">
              <p className="text-warning/90 text-[length:var(--text-sm)] flex items-center gap-[var(--space-sm)]">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                You can undo this cancellation anytime before the period ends.
              </p>
            </div>
            
            <div className="space-y-[var(--space-sm)]">
              <label className="text-[length:var(--text-sm)] text-muted-foreground">Reason for cancelling (optional)</label>
              <Textarea
                placeholder="Help us improve by sharing your reason..."
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="bg-muted border-border text-foreground placeholder:text-muted-foreground resize-none min-h-[80px]"
                rows={3}
                data-testid="textarea-cancel-reason"
              />
            </div>
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <AlertDialogCancel 
              className="bg-muted text-foreground border-border hover:bg-muted/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={cancelMutation.isPending}
            >
              Keep Subscription
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={cancelMutation.isPending}
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showReenableDialog} onOpenChange={setShowReenableDialog}>
        <AlertDialogContent data-testid="dialog-reenable-users" className="bg-card border-border max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground text-[length:var(--text-xl)] flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-success" />
              Re-enable Previously Disabled Users
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground text-[length:var(--text-sm)]">
              Your upgrade includes more seats! Would you like to restore access for users who were previously disabled?
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-[var(--space-md)] py-[var(--space-md)]">
            <div className="bg-success/10 border border-[var(--success)]/30 rounded-lg p-4">
              <p className="text-success text-[length:var(--text-sm)] flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5" />
                Select the users you want to re-enable. They will receive a welcome back email notification.
              </p>
            </div>

            <div className="space-y-[var(--space-sm)] max-h-[300px] overflow-y-auto">
              <div className="flex items-center gap-2 pb-2 border-b border-border">
                <Checkbox
                  id="select-all"
                  checked={selectedUserIds.length === disabledUsersToReenable.length}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedUserIds(disabledUsersToReenable.map(u => u.id));
                    } else {
                      setSelectedUserIds([]);
                    }
                  }}
                />
                <label htmlFor="select-all" className="text-[length:var(--text-sm)] font-medium cursor-pointer">
                  Select All ({disabledUsersToReenable.length} users)
                </label>
              </div>
              
              {disabledUsersToReenable.map((user) => (
                <div key={user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                  <Checkbox
                    id={`user-${user.id}`}
                    checked={selectedUserIds.includes(user.id)}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedUserIds([...selectedUserIds, user.id]);
                      } else {
                        setSelectedUserIds(selectedUserIds.filter(id => id !== user.id));
                      }
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <label htmlFor={`user-${user.id}`} className="text-[length:var(--text-sm)] font-medium cursor-pointer block truncate">
                      {user.name}
                    </label>
                    <p className="text-[length:var(--text-xs)] text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <Badge variant="outline" className="text-[length:var(--text-xs)] shrink-0">
                    {user.role === 'student' || user.role === 'employee' || user.role === 'learner' ? terminology.learner : 
                     user.role === 'teacher' || user.role === 'team_lead' || user.role === 'instructor' ? terminology.educator : 
                     user.role === 'org_admin' ? 'Org Admin' : user.role}
                  </Badge>
                </div>
              ))}
            </div>

            {selectedUserIds.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-[length:var(--text-sm)] text-muted-foreground">
                  <span className="font-semibold text-foreground">{selectedUserIds.length}</span> user{selectedUserIds.length !== 1 ? 's' : ''} selected for re-enabling
                </p>
              </div>
            )}
          </div>

          <AlertDialogFooter className="flex-col sm:flex-row gap-[var(--space-sm)]">
            <AlertDialogCancel 
              className="bg-muted text-foreground border-border hover:bg-muted/80 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={reenableUsersMutation.isPending}
              onClick={() => {
                setDisabledUsersToReenable([]);
                setSelectedUserIds([]);
              }}
            >
              Skip for Now
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedUserIds.length > 0) {
                  reenableUsersMutation.mutate(selectedUserIds);
                }
              }}
              className="bg-success text-success-foreground hover:bg-success/90 min-h-[44px] touch-manipulation w-full sm:w-auto"
              disabled={reenableUsersMutation.isPending || selectedUserIds.length === 0}
            >
              {reenableUsersMutation.isPending ? 'Re-enabling...' : `Re-enable ${selectedUserIds.length} User${selectedUserIds.length !== 1 ? 's' : ''}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
