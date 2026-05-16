import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { BillingPageHeader, BillingCard, BillingCardGrid } from "@/components/BillingCard";
import { WalletBalanceSkeleton, CreditPackageCardSkeleton } from "@/components/BillingSkeletons";
import { Button } from "@/components/ui/button";
import { apiRequest, invalidatePurchaseCaches, invalidateWalletCaches } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { Wallet, Check, CreditCard, Lock } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useUser } from "@/hooks/use-user";
import { useAuth, canViewCredits } from "@/hooks/useAuth";
import { PremiumHeader } from '@/pages/landing';
import { PurchaseConfirmationModal } from "@/components/PurchaseConfirmationModal";
import { CheckoutConversionConfirmation, useCheckoutConfirmation } from "@/components/CheckoutConversionConfirmation";
import { LP_CREDITS_NAME, LP_CREDITS_SHORT } from "@shared/creditConstants";
import type { CurrencyCode } from "@/hooks/useCurrencyDisplay";

interface CreditPackage {
  id: string;
  name: string;
  creditsAmount: number;
  priceAmount: string;
  currency: 'ZAR' | 'USD' | 'EUR';
  features: string[] | null;
  badge: string | null;
  colorScheme: string | null;
  isActive: boolean;
  displayOrder: number;
}

interface WalletBalance {
  organizationId: string;
  organizationName: string;
  balance: number;
}

export default function CreditPurchase() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { user } = useUser();
  const { isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles, isLoading: authLoading } = useAuth();
  const { formatPrice } = useCurrencyPreference();
  const { paymentGatewayEnabled } = usePlatformMode();
  const { getLockedRateData } = useCheckoutConfirmation();
  const [intentId, setIntentId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showConversionConfirmation, setShowConversionConfirmation] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<CreditPackage | null>(null);

  // Fetch admin check for navbar
  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin?: boolean; isSuperAdmin?: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;

  // Redirect learners - credits are only for teachers, org admins, and super admins
  useEffect(() => {
    if (!authLoading && user && !canViewCredits({ isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles })) {
      toast({
        variant: 'destructive',
        title: 'Access Restricted',
        description: `${LP_CREDITS_NAME} are only available for teachers and administrators.`,
      });
      setLocation('/subscriptions');
    }
  }, [user, authLoading, isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles, toast, setLocation]);

  useEffect(() => {
    if (!paymentGatewayEnabled) {
      toast({
        variant: 'destructive',
        title: 'Purchases Unavailable',
        description: 'Credit purchases are not available in this deployment.',
      });
      setLocation('/');
    }
  }, [paymentGatewayEnabled, toast, setLocation]);

  // Handle payment status from URL - show confirmation modal instead of toast
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    const urlIntentId = params.get('intentId');
    const urlCheckoutId = params.get('checkoutId');

    if (paymentStatus === 'success' && (urlIntentId || urlCheckoutId)) {
      setIntentId(urlIntentId);
      setCheckoutId(urlCheckoutId);
      setShowConfirmationModal(true);
      invalidateWalletCaches(); // Refresh wallet balance immediately after successful payment
      window.history.replaceState({}, '', '/credits');
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
      window.history.replaceState({}, '', '/credits');
    } else if (paymentStatus === 'cancelled') {
      toast({
        title: "Payment cancelled",
        description: "Your payment was cancelled.",
      });
      window.history.replaceState({}, '', '/credits');
    }
  }, [toast]);

  const handleConfirmationClose = () => {
    setShowConfirmationModal(false);
    setIntentId(null);
    setCheckoutId(null);
    invalidatePurchaseCaches();
  };

  // Fetch wallet balance (uses session auth, no org ID needed in URL)
  const { data: walletData, isLoading: isLoadingWallet } = useQuery<WalletBalance>({
    queryKey: ['/api/wallet/balance'],
    queryFn: async () => {
      const response = await fetch('/api/wallet/balance', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('Failed to fetch wallet balance');
      return response.json();
    },
    enabled: !!user,
  });

  // Fetch credit packages
  const { data: packagesData, isLoading: isLoadingPackages } = useQuery<{ packages: CreditPackage[] }>({
    queryKey: ['/api/credit-packages', 'active'],
    queryFn: async () => {
      const response = await fetch('/api/credit-packages?activeOnly=true');
      if (!response.ok) throw new Error('Failed to fetch credit packages');
      return response.json();
    },
  });

  const packages = packagesData?.packages || [];

  // Fetch YOCO payment mode and test mode restrictions
  interface YocoModeResponse {
    mode: 'test' | 'live';
    isTestMode: boolean;
    canPurchaseCreditsInTestMode: boolean;
    testModeRestrictionReason: string | null;
    canPurchaseCourses: boolean;
  }
  
  const { data: yocoModeData } = useQuery<YocoModeResponse>({
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

  type LockedRateData = { exchangeRate: string; rateLockedAt: string; originalCurrency: string } | null | undefined;

  // Purchase mutation
  const purchaseMutation = useMutation({
    mutationFn: async ({ packageId, lockedRateData }: { packageId: string; lockedRateData: LockedRateData }) => {
      const response = await apiRequest(`/api/credit-packages/${packageId}/purchase`, {
        method: 'POST',
        body: JSON.stringify({
          ...(lockedRateData && { lockedRate: lockedRateData }),
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
        description: error.message || "Failed to initiate credit purchase",
        variant: "destructive",
      });
      setSelectedPackage(null);
    },
  });

  const handlePurchaseClick = (pkg: CreditPackage) => {
    setSelectedPackage(pkg);
    setShowConversionConfirmation(true);
  };

  const handleConversionConfirm = () => {
    if (selectedPackage) {
      setShowConversionConfirmation(false);
      const lockedRateData = getLockedRateData(selectedPackage.currency as CurrencyCode);
      purchaseMutation.mutate({ packageId: selectedPackage.id, lockedRateData });
    }
  };

  const handleConversionCancel = () => {
    setShowConversionConfirmation(false);
    setSelectedPackage(null);
  };

  if (isLoadingWallet || isLoadingPackages) {
    return (
      <div className="min-h-screen bg-hero-gradient text-foreground relative overflow-hidden">
        <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
        
        <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 relative z-10">
          <div className="mb-[var(--space-lg)]">
            <h1 className="text-[length:var(--text-4xl)] font-bold mb-2 bg-gradient-primary bg-clip-text text-transparent drop-shadow-elevated">
              Purchase {LP_CREDITS_NAME}
            </h1>
            <p className="text-muted-foreground text-[length:var(--text-lg)]">
              Buy {LP_CREDITS_NAME} for your organization
            </p>
          </div>
          <div className="mt-[var(--space-lg)] space-y-[var(--space-lg)]">
            <WalletBalanceSkeleton />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
              <CreditPackageCardSkeleton />
              <CreditPackageCardSkeleton />
              <CreditPackageCardSkeleton />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-hero-gradient text-foreground relative overflow-hidden">
      <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
      
      <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 relative z-10">
        <div className="mb-[var(--space-lg)]">
          <h1 className="text-[length:var(--text-4xl)] font-bold mb-2 text-foreground drop-shadow-elevated">
            Buy {LP_CREDITS_NAME}
          </h1>
          <p className="text-muted-foreground text-[length:var(--text-lg)]">
            Purchase {LP_CREDITS_NAME} packages to generate more AI-powered lessons
          </p>
        </div>

      <div className="mt-[var(--space-lg)] space-y-[var(--space-xl)]">
        {/* YOCO Test Mode Restriction Banner */}
        {isTestModeRestricted && (
          <Alert data-testid="alert-test-mode-restricted">
            <Lock className="h-4 w-4 text-warning" />
            <AlertTitle className="text-warning">Test Mode - Credit Purchases Restricted</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              {yocoModeData?.testModeRestrictionReason || 'LP Credit purchases are currently restricted to authorized team members during test mode.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Wallet Balance */}
        <BillingCard
          title={`${LP_CREDITS_SHORT} Wallet`}
          description={`Your current ${LP_CREDITS_NAME} balance`}
          testId="card-wallet-balance"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-[var(--space-md)] py-[var(--space-md)]">
            <div className="flex items-center gap-[var(--space-md)]">
              <div className="p-3 rounded-full bg-primary/10">
                <Wallet className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-[length:var(--text-sm)] text-muted-foreground">Available {LP_CREDITS_SHORT}</p>
                <p className="text-[length:var(--text-3xl)] font-bold">{walletData?.balance || 0}</p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[length:var(--text-sm)] text-muted-foreground">Organization</p>
              <p className="font-medium">{walletData?.organizationName || 'N/A'}</p>
            </div>
          </div>
        </BillingCard>

        {/* Available Packages */}
        <div>
          <h2 className="text-[length:var(--text-2xl)] font-bold mb-[var(--space-md)]">Available {LP_CREDITS_NAME} Packages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
            {packages.map((pkg) => {
              const getVariant = (name: string) => {
                if (name.toLowerCase().includes('small')) return 'small';
                if (name.toLowerCase().includes('standard')) return 'standard';
                return 'default';
              };
              
              return (
              <BillingCard
                key={pkg.id}
                title={pkg.name}
                testId={`card-package-${pkg.id}`}
                variant={getVariant(pkg.name)}
                badge={pkg.badge || undefined}
              >
                <div className="space-y-[var(--space-md)]">
                  <div className="text-center py-[var(--space-lg)] bg-muted/30 rounded-lg border border-border/50">
                    <p className="text-[length:var(--text-5xl)] font-bold text-foreground">
                      {pkg.creditsAmount}
                    </p>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground mt-1">{LP_CREDITS_SHORT}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[length:var(--text-3xl)] font-bold text-foreground">
                      {formatPrice(pkg.priceAmount, pkg.currency, { showCode: true })}
                    </p>
                    <p className="text-[length:var(--text-sm)] text-muted-foreground">
                      One-time purchase
                    </p>
                  </div>
                  {pkg.features && pkg.features.length > 0 && (
                    <div className="space-y-2">
                      <ul className="space-y-2">
                        {pkg.features.map((feature, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-[length:var(--text-sm)]">
                            <Check className="h-5 w-5 text-success mt-0.5 flex-shrink-0" />
                            <span className="text-muted-foreground">{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <Button className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation hover:opacity-90 text-sm sm:text-base disabled:opacity-50" disabled={purchaseMutation.isPending || isTestModeRestricted} onClick={() => handlePurchaseClick(pkg)}
                    data-testid={`button-purchase-${pkg.id}`}
                  >
                    {isTestModeRestricted ? (
                      <>
                        <Lock className="h-4 w-4 mr-2" />
                        Restricted in Test Mode
                      </>
                    ) : (
                      <>
                        <CreditCard className="h-4 w-4 mr-2" />
                        {purchaseMutation.isPending && selectedPackage?.id === pkg.id ? 'Processing...' : `Purchase ${LP_CREDITS_SHORT}`}
                      </>
                    )}
                  </Button>
                </div>
              </BillingCard>
              );
            })}
          </div>
        </div>
      </div>
      </div>

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

      {selectedPackage && (
        <CheckoutConversionConfirmation
          isOpen={showConversionConfirmation}
          onConfirm={handleConversionConfirm}
          onCancel={handleConversionCancel}
          amount={Number(selectedPackage.priceAmount)}
          fromCurrency={selectedPackage.currency as CurrencyCode}
          itemName={`${selectedPackage.name} (${selectedPackage.creditsAmount.toLocaleString()} ${LP_CREDITS_SHORT})`}
          itemType="credits"
          isLoading={purchaseMutation.isPending}
        />
      )}
    </div>
  );
}
