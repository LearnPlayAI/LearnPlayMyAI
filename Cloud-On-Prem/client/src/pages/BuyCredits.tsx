import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CheckCircle2, ShoppingCart, Loader2, Wallet, BookOpen, ImageIcon, Building2, User, AlertTriangle, Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useCurrencyPreference } from '@/hooks/useCurrencyPreference';
import { useAuth } from '@/hooks/useAuth';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { useUser } from '@/hooks/use-user';
import { EmailVerificationModal, useEmailVerification } from '@/components/EmailVerificationModal';
import { CheckoutConversionConfirmation, useCheckoutConfirmation } from '@/components/CheckoutConversionConfirmation';
import { SuperAdminPaymentModeModal, useSuperAdminPaymentMode, type YocoPaymentMode } from '@/components/SuperAdminPaymentModeModal';
import { useLessonCreditCosts } from '@/hooks/useLessonCreditCosts';
import { useWalletBalance } from '@/hooks/useWallet';
import { invalidatePurchaseCaches, invalidateWalletCaches } from '@/lib/queryClient';
import { PurchaseConfirmationModal } from '@/components/PurchaseConfirmationModal';
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from '@shared/creditConstants';
import { LPCreditIcon } from '@/components/LPCreditIcon';
import { LpCreditAmount } from '@/components/LpCreditAmount';
import type { CreditPurchasePackage } from '@shared/schema';
import type { CurrencyCode } from '@/hooks/useCurrencyDisplay';

type PurchaseTarget = 'personal' | 'organization';

interface OrgWalletBalanceResponse {
  organizationId: string;
  organizationName: string;
  balance: number;
  isEnabled: boolean;
  allowTeachersToSpendCredits: boolean;
}

const colorSchemeStyles = {
  green: {
    gradient: 'from-[var(--action-primary)]/20',
    border: 'border-primary/40 hover:border-primary',
    badgeBg: 'bg-primary hover:bg-primary/90',
    iconBg: 'bg-primary/20',
    iconText: 'text-primary',
    badgeText: 'text-primary-foreground',
  },
  blue: {
    gradient: 'from-[var(--action-secondary)]/20',
    border: 'border-secondary/40 hover:border-secondary',
    badgeBg: 'bg-primary hover:bg-primary/90',
    iconBg: 'bg-secondary/20',
    iconText: 'text-secondary',
    badgeText: 'text-secondary-foreground',
  },
  purple: {
    gradient: 'from-[var(--action-primary)]/20',
    border: 'border-primary/40 hover:border-primary',
    badgeBg: 'bg-primary hover:bg-primary/90',
    iconBg: 'bg-primary/20',
    iconText: 'text-primary',
    badgeText: 'text-primary-foreground',
  },
  orange: {
    gradient: 'from-[var(--warning)]/20',
    border: 'border-[var(--warning)]/40 hover:border-[var(--warning)]',
    badgeBg: 'bg-warning',
    iconBg: 'bg-warning/20',
    iconText: 'text-warning',
    badgeText: 'text-warning-foreground',
  },
};

export default function BuyCredits() {
  const { toast } = useToast();
  const { isOrgAdmin, isSuperAdmin, isTeacher, isImpersonating, effectiveOrganizationId, isLoading: authLoading } = useAuth();
  const { paymentGatewayEnabled } = usePlatformMode();
  const { user } = useUser();
  const { formatPrice, hasRates, ratesError, isLoading: currencyLoading } = useCurrencyPreference();
  const { costs, calculateLessonsForCredits } = useLessonCreditCosts();
  const [, setLocation] = useLocation();
  const [purchasingPackageId, setPurchasingPackageId] = useState<string | null>(null);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [pendingPackageId, setPendingPackageId] = useState<string | null>(null);
  const [showConversionConfirmation, setShowConversionConfirmation] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPurchasePackage | null>(null);
  const [purchaseTarget, setPurchaseTarget] = useState<PurchaseTarget>('personal');
  const [intentId, setIntentId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);

  const { isEmailVerified, isLoading: verificationLoading } = useEmailVerification(!!user);
  const { getLockedRateData } = useCheckoutConfirmation();
  const { isModalOpen: isPaymentModeModalOpen, requestPaymentMode, handleConfirm: handlePaymentModeConfirm, handleClose: handlePaymentModeClose } = useSuperAdminPaymentMode();

  // Use effectiveOrganizationId from useAuth which handles:
  // - SuperAdmin: only when impersonating
  // - Org Admin/Teacher: from session organizationId or organizationRoles[0]
  const organizationId = effectiveOrganizationId;

  const { data: orgWalletData, isLoading: orgWalletLoading } = useQuery<OrgWalletBalanceResponse>({
    queryKey: ['/api/org-wallet', organizationId, 'balance'],
    queryFn: async () => {
      const response = await fetch(`/api/org-wallet/${organizationId}/balance`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error('Failed to fetch org wallet balance');
      }
      return response.json();
    },
    // Enable for org admin, teacher, or superadmin when impersonating
    enabled: !!organizationId && (isOrgAdmin || isTeacher || (isSuperAdmin && isImpersonating)),
    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  // Can purchase for org: org admin, superadmin impersonating, or teacher when allowTeachersToSpendCredits is enabled
  const canPurchaseForOrg = (isOrgAdmin || (isSuperAdmin && isImpersonating) || (isTeacher && orgWalletData?.allowTeachersToSpendCredits)) && orgWalletData?.isEnabled;
  const orgBalance = orgWalletData?.balance ?? 0;
  const orgName = orgWalletData?.organizationName ?? 'Organization';

  // Redirect learners - credits are only for organization admins and teachers
  const isAdmin = isOrgAdmin || isSuperAdmin;
  const canAccessCreditsPage = isAdmin || isTeacher;
  useEffect(() => {
    if (!authLoading && user && !canAccessCreditsPage) {
      toast({
        variant: 'destructive',
        title: 'Access Restricted',
        description: `${LP_CREDITS_NAME} are only available for organization administrators and teachers.`,
      });
      setLocation('/quiz-lobby');
    }
  }, [user, canAccessCreditsPage, authLoading, toast, setLocation]);

  // Handle payment status from YOCO redirect and start confirmation polling.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const urlIntentId = params.get('intentId');
    const urlCheckoutId = params.get('checkoutId');

    if (paymentStatus === 'success' && (urlIntentId || urlCheckoutId)) {
      setIntentId(urlIntentId);
      setCheckoutId(urlCheckoutId);
      setShowConfirmationModal(true);
      invalidateWalletCaches();
      window.history.replaceState({}, '', '/buy-credits');
    } else if (paymentStatus === 'failed') {
      if (urlIntentId || urlCheckoutId) {
        setIntentId(urlIntentId);
        setCheckoutId(urlCheckoutId);
        setShowConfirmationModal(true);
      } else {
        toast({
          title: 'Payment failed',
          description: 'Please try again or contact support.',
          variant: 'destructive',
        });
      }
      window.history.replaceState({}, '', '/buy-credits');
    } else if (paymentStatus === 'cancelled') {
      toast({
        title: 'Payment cancelled',
        description: 'Your payment was cancelled.',
      });
      window.history.replaceState({}, '', '/buy-credits');
    }
  }, [toast]);

  const { data, isLoading } = useQuery<{ packages: CreditPurchasePackage[] }>({
    queryKey: ['/api/credit-packages'],
    queryFn: async () => {
      const response = await fetch('/api/credit-packages?activeOnly=true', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch packages');
      return response.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  const { balance, isLoading: walletLoading } = useWalletBalance();

  // Fetch YOCO payment mode and test mode restrictions
  interface YocoModeResponse {
    mode: 'test' | 'live';
    isTestMode: boolean;
    canPurchaseCreditsInTestMode: boolean;
    testModeRestrictionReason: string | null;
    canPurchaseCourses: boolean;
  }
  
  const { data: yocoModeData, isLoading: yocoModeLoading } = useQuery<YocoModeResponse>({
    queryKey: ['/api/payments/yoco-mode'],
    queryFn: async () => {
      const response = await fetch('/api/payments/yoco-mode', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch YOCO mode');
      return response.json();
    },
    enabled: !!user,
    staleTime: 60000,
    refetchOnWindowFocus: true,
  });

  const isTestModeRestricted = yocoModeData?.isTestMode && !yocoModeData?.canPurchaseCreditsInTestMode;

  const purchaseMutation = useMutation({
    mutationFn: async ({ packageId, lockedRate, forceYocoMode, purchaseTarget: target, organizationId: orgId }: { 
      packageId: string; 
      lockedRate?: { exchangeRate: string; rateLockedAt: string; originalCurrency: string };
      forceYocoMode?: YocoPaymentMode;
      purchaseTarget?: PurchaseTarget;
      organizationId?: string;
    }) => {
      const response = await fetch(`/api/credit-packages/${packageId}/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          lockedRate, 
          forceYocoMode,
          purchaseTarget: target === 'organization' ? 'organization' : undefined,
          organizationId: target === 'organization' ? orgId : undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout');
      }

      return response.json();
    },
    onSuccess: (data) => {
      invalidateWalletCaches();
      
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        toast({
          variant: 'destructive',
          title: 'Checkout Error',
          description: 'Failed to redirect to payment page. Please try again.',
        });
        setPurchasingPackageId(null);
      }
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Purchase Failed',
        description: error.message,
      });
      setPurchasingPackageId(null);
    },
  });

  const handlePurchase = (pkg: CreditPurchasePackage) => {
    if (!isEmailVerified) {
      setPendingPackageId(pkg.id);
      setSelectedPackage(pkg);
      setShowVerificationModal(true);
      return;
    }
    setSelectedPackage(pkg);
    setShowConversionConfirmation(true);
  };

  const executePurchase = (forceYocoMode?: YocoPaymentMode) => {
    if (selectedPackage) {
      const lockedRate = getLockedRateData(selectedPackage.currency as CurrencyCode);
      
      // Block purchase if rates are unavailable
      if (lockedRate === null) {
        toast({
          variant: 'destructive',
          title: 'Currency Rates Unavailable',
          description: 'Cannot process purchase without current exchange rates. Please try again later.',
        });
        return;
      }
      
      setPurchasingPackageId(selectedPackage.id);
      purchaseMutation.mutate({ 
        packageId: selectedPackage.id, 
        lockedRate, 
        forceYocoMode,
        purchaseTarget: canPurchaseForOrg ? purchaseTarget : 'personal',
        organizationId: purchaseTarget === 'organization' && organizationId ? organizationId : undefined,
      });
    }
  };

  const handleConversionConfirm = () => {
    setShowConversionConfirmation(false);
    if (isSuperAdmin) {
      requestPaymentMode((mode) => {
        executePurchase(mode);
      });
    } else {
      executePurchase();
    }
  };

  const handleConversionCancel = () => {
    setShowConversionConfirmation(false);
    setSelectedPackage(null);
  };

  const handleConfirmationClose = () => {
    setShowConfirmationModal(false);
    setIntentId(null);
    setCheckoutId(null);
    invalidatePurchaseCaches();
  };

  const handleVerificationComplete = () => {
    setShowVerificationModal(false);
    if (pendingPackageId && selectedPackage) {
      setShowConversionConfirmation(true);
      setPendingPackageId(null);
    }
  };

  const handleContinueWithoutVerification = () => {
    setShowVerificationModal(false);
    if (selectedPackage) {
      setShowConversionConfirmation(true);
      setPendingPackageId(null);
    }
  };

  const packages = data?.packages || [];
  const sortedPackages = packages.slice().sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <QuizAdminLayout
      title={`Buy ${LP_CREDITS_NAME}`}
      description={`Purchase ${LP_CREDITS_NAME} packages to generate more AI-powered lessons`}
      activeSection="credit-wallet"
    >
      <div className="max-w-7xl mx-auto">
        {/* Payment Gateway Disabled Message */}
        {!paymentGatewayEnabled && (
          <Card className="mb-8 bg-card border-border" data-testid="payment-gateway-disabled">
            <CardContent className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-muted rounded-full">
                  <Wallet className="w-12 h-12 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    Online Credit Purchases Not Available
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    Online credit purchases are not available on this platform. Your administrator manages credit balances. Contact your administrator for credit adjustments.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {paymentGatewayEnabled && (<>
        {/* Currency Rates Error Banner */}
        {!currencyLoading && !hasRates && (
          <Alert variant="destructive" className="mb-6" data-testid="alert-rates-unavailable">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Currency Rates Unavailable</AlertTitle>
            <AlertDescription>
              {ratesError || 'Unable to fetch current exchange rates. Purchases are temporarily unavailable. Please try again later.'}
            </AlertDescription>
          </Alert>
        )}

        {/* YOCO Test Mode Restriction Banner */}
        {isTestModeRestricted && (
          <Alert className="mb-6" data-testid="alert-test-mode-restricted">
            <Lock className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">Test Mode - Credit Purchases Restricted</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {yocoModeData?.testModeRestrictionReason || 'LP Credit purchases are currently restricted to authorized team members during test mode.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Credit Wallet Section */}
        <Card className="mb-8 bg-card border-border" data-testid="credit-wallet">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-card-foreground">
              <LPCreditIcon size="lg" />
              {LP_CREDITS_NAME} Wallet
            </CardTitle>
            <CardDescription>
              {canPurchaseForOrg 
                ? 'Select which wallet to purchase credits for'
                : `Your current ${LP_CREDITS_NAME} balance`
              }
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {canPurchaseForOrg && (
              <div className="p-4 bg-muted/50 rounded-lg border border-border" data-testid="wallet-toggle">
                <RadioGroup 
                  value={purchaseTarget} 
                  onValueChange={(v) => setPurchaseTarget(v as PurchaseTarget)}
                  className="space-y-3"
                >
                  <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                    purchaseTarget === 'personal' 
                      ? 'border-primary bg-primary/5' 
                      : 'border-transparent hover:bg-muted/50'
                  }`}>
                    <RadioGroupItem value="personal" id="personal" />
                    <Label htmlFor="personal" className="flex items-center gap-2 cursor-pointer flex-1">
                      <User className="w-4 h-4 text-primary" /> 
                      <span className="font-medium">Personal Credits</span>
                      <span className="text-sm text-muted-foreground ml-auto">Credits for your personal wallet</span>
                    </Label>
                  </div>
                  <div className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                    purchaseTarget === 'organization' 
                      ? 'border-secondary bg-secondary/5' 
                      : 'border-transparent hover:bg-muted/50'
                  }`}>
                    <RadioGroupItem value="organization" id="organization" />
                    <Label htmlFor="organization" className="flex items-center gap-2 cursor-pointer flex-1">
                      <Building2 className="w-4 h-4 text-secondary" /> 
                      <span className="font-medium">Organization Credits</span>
                      <span className="text-sm text-muted-foreground ml-auto">Credits for {orgName}</span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {purchaseTarget === 'organization' && canPurchaseForOrg && (
              <div className="p-4 bg-secondary/10 rounded-lg border border-secondary/30" data-testid="org-purchase-banner">
                <div className="flex items-center gap-3">
                  <Building2 className="h-6 w-6 text-secondary" />
                  <div>
                    <p className="font-semibold text-foreground">Purchasing for {orgName}</p>
                    <p className="text-sm text-muted-foreground">Credits will be added to the organization wallet</p>
                  </div>
                </div>
              </div>
            )}

            <div className={`grid gap-4 ${canPurchaseForOrg ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
              <div className={`p-4 rounded-lg border ${
                purchaseTarget === 'personal' && canPurchaseForOrg 
                  ? 'border-primary bg-primary/5' 
                  : canPurchaseForOrg ? 'border-border' : 'border-transparent'
              }`} data-testid="personal-wallet-balance">
                <div className="flex items-center gap-2 mb-2">
                  <User className="h-4 w-4 text-primary" />
                  <p className="text-sm font-medium text-muted-foreground">Personal Balance</p>
                </div>
                {walletLoading ? (
                  <Skeleton className="h-10 w-32" />
                ) : (
                  <LpCreditAmount amount={balance} size="xl" showIcon={false} variant="full" className="text-4xl font-bold text-primary" />
                )}
              </div>

              {canPurchaseForOrg && (
                <div className={`p-4 rounded-lg border ${
                  purchaseTarget === 'organization' 
                    ? 'border-secondary bg-secondary/5' 
                    : 'border-border'
                }`} data-testid="org-wallet-balance">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="h-4 w-4 text-secondary" />
                    <p className="text-sm font-medium text-muted-foreground">{orgName} Balance</p>
                  </div>
                  {orgWalletLoading ? (
                    <Skeleton className="h-10 w-32" />
                  ) : (
                    <LpCreditAmount amount={orgBalance} size="xl" showIcon={false} variant="full" className="text-4xl font-bold text-secondary" />
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="mb-8 flex items-center gap-3">
          <div className="p-3 bg-primary/20 rounded-lg">
            <LPCreditIcon size="xl" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground">Available {LP_CREDITS_NAME} Packages</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Choose a package that fits your AI content generation needs
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="bg-card border-border" data-testid={`skeleton-package-${i}`}>
                <CardHeader>
                  <Skeleton className="h-6 w-24 mb-2" />
                  <Skeleton className="h-8 w-full" />
                </CardHeader>
                <CardContent className="space-y-4">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                  <Skeleton className="h-10 w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : sortedPackages.length === 0 ? (
          <Card className="bg-card border-border" data-testid="empty-state">
            <CardContent className="p-12 text-center">
              <div className="flex flex-col items-center gap-4">
                <div className="p-4 bg-muted rounded-full">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-foreground mb-2">
                    No {LP_CREDITS_NAME} Packages Available
                  </h3>
                  <p className="text-muted-foreground max-w-md">
                    There are currently no active {LP_CREDITS_NAME} packages available for purchase. 
                    Please check back later or contact support for assistance.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="packages-grid">
            {sortedPackages.map((pkg) => {
              const colorScheme = pkg.colorScheme as keyof typeof colorSchemeStyles || 'blue';
              const styles = colorSchemeStyles[colorScheme] || colorSchemeStyles.blue;
              const features = (pkg.features as string[]) || [];

              return (
                <Card
                  key={pkg.id}
                  className={`
                    relative overflow-hidden transition-all duration-300 
                    hover:shadow-dialog hover:-translate-y-1 
                     ${styles.gradient} 
                    border-2 ${styles.border}
                    backdrop-blur-sm
                  `}
                  data-testid={`card-package-${pkg.id}`}
                >
                  {pkg.badge && (
                    <div className="absolute top-4 right-4">
                      <Badge className={`${styles.badgeBg} hover:${styles.badgeBg} ${styles.badgeText} font-semibold border-0 shadow-elevated`} data-testid={`badge-${pkg.id}`} >
                        {pkg.badge}
                      </Badge>
                    </div>
                  )}

                  <CardHeader className="space-y-4 pb-4">
                    <CardTitle className="text-2xl font-bold text-[var(--fg-strong)]" data-testid={`text-name-${pkg.id}`}>
                      {pkg.name}
                    </CardTitle>

                    <div className={`flex items-center gap-3 p-4 rounded-lg ${styles.iconBg}`}>
                      <LPCreditIcon size="xl" />
                      <div>
                        <p className={`text-3xl font-bold ${styles.iconText}`} data-testid={`text-credits-${pkg.id}`}>
                          {pkg.creditsAmount.toLocaleString()}
                        </p>
                        <p className="text-sm text-[var(--fg-muted)]">{LP_CREDITS_SHORT}</p>
                      </div>
                    </div>
                    
                    {/* Lesson Estimates */}
                    <div className="grid grid-cols-2 gap-2 text-xs" data-testid={`lesson-estimates-${pkg.id}`}>
                      <div className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg">
                        <BookOpen className="w-3.5 h-3.5 text-secondary" />
                        <span className="text-[var(--fg-muted)]">
                          {calculateLessonsForCredits(pkg.creditsAmount).textOnly.min}-{calculateLessonsForCredits(pkg.creditsAmount).textOnly.max} text
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 p-2 bg-muted/50 rounded-lg">
                        <ImageIcon className="w-3.5 h-3.5 text-primary" />
                        <span className="text-[var(--fg-muted)]">
                          {calculateLessonsForCredits(pkg.creditsAmount).withImages.min}-{calculateLessonsForCredits(pkg.creditsAmount).withImages.max} w/images
                        </span>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    <div className="text-center py-4 bg-muted/50 rounded-lg" data-testid={`container-price-${pkg.id}`}>
                      <div className="flex items-baseline justify-center gap-2">
                        <span className="text-4xl font-bold text-[var(--fg-strong)]" data-testid={`text-price-${pkg.id}`}>
                          {formatPrice(pkg.priceAmount, pkg.currency as 'ZAR' | 'USD' | 'EUR', { showCode: true })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">One-time purchase</p>
                    </div>

                    {features.length > 0 && (
                      <div className="space-y-3" data-testid={`list-features-${pkg.id}`}>
                        {features.map((feature, idx) => (
                          <div 
                            key={idx} 
                            className="flex items-start gap-3"
                            data-testid={`feature-${pkg.id}-${idx}`}
                          >
                            <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                            <span className="text-sm text-[var(--fg-muted)]">{feature}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <Button size="lg" className="w-full font-semibold disabled:opacity-50" onClick={() => handlePurchase(pkg)}
                      disabled={purchasingPackageId !== null || !hasRates || isTestModeRestricted}
                      data-testid={`button-buy-${pkg.id}`}
                    >
                      {purchasingPackageId === pkg.id ? (
                        <>
                          <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                          Redirecting to Checkout...
                        </>
                      ) : isTestModeRestricted ? (
                        <>
                          <Lock className="mr-2 h-5 w-5" />
                          Restricted in Test Mode
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="mr-2 h-5 w-5" />
                          Purchase Now
                        </>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <div className="mt-8 p-6 bg-card border border-border rounded-lg" data-testid="info-section">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-primary/20 rounded-lg">
              <LPCreditIcon size="lg" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-lg text-foreground mb-2">How {LP_CREDITS_NAME} Work</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  <span>{LP_CREDITS_NAME} are used to generate AI-powered content including lessons, quizzes, and courses</span>
                </li>
                <li className="flex items-start gap-2">
                  <BookOpen className="w-4 h-4 text-secondary flex-shrink-0 mt-0.5" />
                  <span>Text-only lessons: {costs.creditsPerLessonTextOnlyMin}-{costs.creditsPerLessonTextOnlyMax} {LP_CREDITS_SHORT} per lesson</span>
                </li>
                <li className="flex items-start gap-2">
                  <ImageIcon className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
                  <span>Lessons with images: {costs.creditsPerLessonWithImagesMin}-{costs.creditsPerLessonWithImagesMax} {LP_CREDITS_SHORT} per lesson</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  <span>{LP_CREDITS_NAME} never expire and can be used across your entire organization</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
                  <span>Purchase larger packages for better value per {LP_CREDITS_SHORT}</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
        </>)}
      </div>

      <EmailVerificationModal
        isOpen={showVerificationModal}
        onClose={() => {
          setShowVerificationModal(false);
          setPendingPackageId(null);
          setSelectedPackage(null);
        }}
        onVerified={handleVerificationComplete}
        showContinueAnyway={true}
        onContinueAnyway={handleContinueWithoutVerification}
      />

      {selectedPackage && (
        <CheckoutConversionConfirmation
          isOpen={showConversionConfirmation}
          onConfirm={handleConversionConfirm}
          onCancel={handleConversionCancel}
          amount={Number(selectedPackage.priceAmount)}
          fromCurrency={selectedPackage.currency as CurrencyCode}
          itemName={`${selectedPackage.name} (${selectedPackage.creditsAmount.toLocaleString()} ${LP_CREDITS_SHORT})${
            purchaseTarget === 'organization' && canPurchaseForOrg ? ` for ${orgName}` : ''
          }`}
          itemType="credits"
          isLoading={purchaseMutation.isPending}
        />
      )}

      {isSuperAdmin && (
        <SuperAdminPaymentModeModal
          isOpen={isPaymentModeModalOpen}
          onClose={handlePaymentModeClose}
          onConfirm={handlePaymentModeConfirm}
          isLoading={purchaseMutation.isPending}
          productName={selectedPackage ? `${selectedPackage.name} (${selectedPackage.creditsAmount.toLocaleString()} ${LP_CREDITS_SHORT})${
            purchaseTarget === 'organization' && canPurchaseForOrg ? ` for ${orgName}` : ''
          }` : undefined}
        />
      )}

      {showConfirmationModal && (
        <PurchaseConfirmationModal
          intentId={intentId}
          checkoutId={checkoutId}
          onClose={handleConfirmationClose}
          onSuccess={() => {
            invalidatePurchaseCaches();
          }}
        />
      )}
    </QuizAdminLayout>
  );
}
