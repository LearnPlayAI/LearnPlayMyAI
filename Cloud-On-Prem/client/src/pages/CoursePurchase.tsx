import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useLocation, Link } from 'wouter';
import { ShoppingCart, CreditCard, CheckCircle, XCircle, ArrowLeft, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useUser } from '@/hooks/use-user';
import { useAuth } from '@/hooks/useAuth';
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { EmailVerificationModal, useEmailVerification } from '@/components/EmailVerificationModal';
import { CheckoutConversionConfirmation, useCheckoutConfirmation } from '@/components/CheckoutConversionConfirmation';
import { SuperAdminPaymentModeModal, useSuperAdminPaymentMode, type YocoPaymentMode } from '@/components/SuperAdminPaymentModeModal';
import type { CurrencyCode } from '@/hooks/useCurrencyDisplay';
import { getCourseThumbnail, hasThumbnail } from '@/lib/thumbnailResolver';

type Course = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficultyLevel: string;
  currency: string;
  price: string;
  isPaid: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  thumbnailSignedUrl?: string;
  totalEnrollments: number;
  hasAccess?: boolean;
  hasPurchased?: boolean;
  lessons?: Array<{
    id: string;
    lessonId: string;
    topicName: string;
    lesson: {
      id: string;
      title: string;
      description?: string;
      learningObjectives?: Array<{id: string; objective: string; bloomLevel: string}>;
    };
  }>;
};

export default function CoursePurchase() {
  const [, params] = useRoute('/courses/:id/purchase');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user } = useUser();
  const { isSuperAdmin } = useAuth();
  const { formatPrice } = useCurrencyPreference();
  const { paymentGatewayEnabled } = usePlatformMode();
  const courseId = params?.id;

  const [processingPayment, setProcessingPayment] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  const { isEmailVerified, isLoading: verificationLoading } = useEmailVerification(!!user);
  const { getLockedRateData } = useCheckoutConfirmation();
  const { isModalOpen: isPaymentModeModalOpen, requestPaymentMode, handleConfirm: handlePaymentModeConfirm, handleClose: handlePaymentModeClose } = useSuperAdminPaymentMode();

  const { data: course, isLoading } = useQuery<Course>({
    queryKey: [`/api/courses/${courseId}`],
    enabled: !!courseId,
  });

  type LockedRateData = { exchangeRate: string; rateLockedAt: string; originalCurrency: string } | undefined;
  type PurchaseParams = { lockedRateData?: LockedRateData; forceYocoMode?: YocoPaymentMode };
  
  const purchaseMutation = useMutation<unknown, Error, PurchaseParams>({
    mutationFn: async ({ lockedRateData, forceYocoMode }) => {
      if (!course) throw new Error('Course not found');

      // Free course enrollment
      if (!course.isPaid) {
        return await apiRequest(`/api/courses/${courseId}/purchase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      }

      // On-prem enrollment bypass (no payment gateway)
      if (!paymentGatewayEnabled) {
        return await apiRequest(`/api/courses/${courseId}/onprem-enroll`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
      }

      setProcessingPayment(true);

      // Paid course - use checkout endpoint (matches BuyCredits.tsx pattern)
      const response = await fetch(`/api/courses/${courseId}/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          currency: course.currency,
          ...(lockedRateData && { lockedRate: lockedRateData }),
          ...(forceYocoMode && { forceYocoMode }),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create checkout');
      }

      return response.json();
    },
    onSuccess: (data: any) => {
      if (!course?.isPaid || !paymentGatewayEnabled) {
        // Free course or on-prem enrollment - redirect to course page
        queryClient.invalidateQueries({ queryKey: ['/api/my-courses'] });
        queryClient.invalidateQueries({ queryKey: [`/api/courses/${courseId}`] });
        toast({
          title: 'Enrollment Successful!',
          description: 'You now have access to this course.',
        });
        setLocation(`/courses/${courseId}`);
      } else if (data?.checkoutUrl) {
        // Paid course - redirect to payment page
        window.location.href = data.checkoutUrl;
      } else {
        // No checkout URL - show error
        setProcessingPayment(false);
        toast({
          variant: 'destructive',
          title: 'Checkout Error',
          description: 'Failed to redirect to payment page. Please try again.',
        });
      }
    },
    onError: (error) => {
      setProcessingPayment(false);
      setShowConfirmation(false);
      toast({
        title: 'Purchase Failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const handlePurchase = () => {
    if (!paymentGatewayEnabled) {
      purchaseMutation.mutate({});
      return;
    }

    if (!isEmailVerified) {
      setShowVerificationModal(true);
      return;
    }
    
    if (course?.isPaid) {
      setShowConfirmation(true);
    } else {
      purchaseMutation.mutate({});
    }
  };

  const executePurchase = (forceYocoMode?: YocoPaymentMode) => {
    if (!course) return;
    const lockedRateData = getLockedRateData(course.currency as CurrencyCode);
    purchaseMutation.mutate({ 
      ...(lockedRateData ? { lockedRateData } : {}),
      forceYocoMode 
    });
  };

  const handleConfirmPurchase = () => {
    setShowConfirmation(false);
    if (isSuperAdmin) {
      requestPaymentMode((mode) => {
        executePurchase(mode);
      });
    } else {
      executePurchase();
    }
  };

  const handleCancelConfirmation = () => {
    setShowConfirmation(false);
  };

  const handleVerificationComplete = () => {
    setShowVerificationModal(false);
    if (course?.isPaid) {
      setShowConfirmation(true);
    } else {
      purchaseMutation.mutate({});
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Course Not Found</h1>
          <Link href="/browse-courses">
            <Button>Browse Courses</Button>
          </Link>
        </div>
      </div>
    );
  }

  const alreadyOwned = course.hasAccess || course.hasPurchased;

  if (alreadyOwned) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-success/10 p-4 mb-6">
              <CheckCircle className="h-16 w-16 text-success" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-3 text-foreground text-center">
              You Already Have Access
            </h1>
            <p className="text-muted-foreground text-center mb-8 max-w-md">
              You already have access to <span className="font-semibold text-foreground">{course.title}</span>. No need to purchase again.
            </p>
            <Link href={`/courses/${course.id}`}>
              <Button size="lg" className="min-w-[200px]">
                Go to Course
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const subtotal = parseFloat(course.price);
  const platformFee = course.isPaid && paymentGatewayEnabled ? subtotal * 0.05 : 0;
  const total = subtotal + platformFee;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Link href={`/courses/${course.id}`}>
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Course
          </Button>
        </Link>

        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-4xl font-bold mb-2 text-foreground" data-testid="page-title">
            {!paymentGatewayEnabled ? 'Enroll in Course' : 'Complete Your Purchase'}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground" data-testid="page-description">
            Review your order and complete enrollment
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
          <div className="md:col-span-2 space-y-6">
            <Card className="bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">Order Summary</CardTitle>
              </CardHeader>
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  {hasThumbnail(course) ? (
                    <img
                      src={getCourseThumbnail(course)}
                      alt={course.title}
                      className="w-full sm:w-32 h-32 sm:h-24 object-cover rounded-lg"
                      data-testid="course-image"
                    />
                  ) : (
                    <div className="w-full sm:w-32 h-32 sm:h-24 bg-muted rounded-lg flex items-center justify-center">
                      <ShoppingCart className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-base sm:text-lg mb-1" data-testid="course-title">
                      {course.title}
                    </h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {course.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" data-testid="course-category">
                        {course.category}
                      </Badge>
                      <Badge variant="outline" data-testid="course-difficulty">
                        {course.difficultyLevel}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-left sm:text-right mt-2 sm:mt-0">
                    <p className="font-semibold text-base sm:text-lg" data-testid="course-price">
                      {!paymentGatewayEnabled ? 'Included' : course.isPaid
                        ? formatPrice(course.price, course.currency as 'ZAR' | 'USD' | 'EUR')
                        : 'FREE'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {course.isPaid && paymentGatewayEnabled && (
              <Card className="bg-card border-border">
                <CardHeader>
                  <CardTitle className="text-foreground">Payment Method</CardTitle>
                  <CardDescription className="text-muted-foreground">
                    Secure payment powered by YOCO (Integration Prepared)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Alert>
                    <CreditCard className="h-4 w-4" />
                    <AlertDescription>
                      YOCO payment gateway integration is prepared and ready to be configured with
                      your merchant account. For this demo, clicking "Complete Purchase" will simulate
                      a successful payment.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}
          </div>

          <div>
            <Card className="sticky top-4 bg-card border-border">
              <CardHeader>
                <CardTitle className="text-foreground">{!paymentGatewayEnabled ? 'Enrollment Details' : 'Payment Details'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {paymentGatewayEnabled && (
                  <div className="flex justify-between" data-testid="price-subtotal">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span>
                      {course.isPaid
                        ? formatPrice(course.price, course.currency as 'ZAR' | 'USD' | 'EUR')
                        : 'Free'}
                    </span>
                  </div>
                  )}
                  {course.isPaid && paymentGatewayEnabled && (
                    <div className="flex justify-between text-sm" data-testid="price-platform-fee">
                      <span className="text-muted-foreground">Platform Fee (5%)</span>
                      <span>{formatPrice(platformFee, course.currency as 'ZAR' | 'USD' | 'EUR')}</span>
                    </div>
                  )}
                  <Separator />
                  {paymentGatewayEnabled && (
                  <div className="flex justify-between font-bold text-lg" data-testid="price-total">
                    <span>Total</span>
                    <span>
                      {course.isPaid
                        ? formatPrice(total, course.currency as 'ZAR' | 'USD' | 'EUR')
                        : 'Free'}
                    </span>
                  </div>
                  )}
                </div>

                <Separator />

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>Instant access after purchase</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>Lifetime access to content</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-primary" />
                    <span>Certificate of completion</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="p-4 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6">
                <Button className="w-full min-h-[48px] sm:min-h-[44px] text-sm sm:text-base touch-manipulation" size="lg" onClick={handlePurchase} disabled={purchaseMutation.isPending || processingPayment} data-testid="button-complete-purchase" >
                  {purchaseMutation.isPending || processingPayment ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      {!paymentGatewayEnabled ? 'Enroll Now' : course.isPaid ? 'Complete Purchase' : 'Enroll for Free'}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>

        <Card className="mt-8 bg-card border-border">
          <CardHeader>
            <CardTitle className="text-foreground">What You'll Get</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-muted-foreground">
              {/* Lesson Count */}
              {course.lessons && course.lessons.length > 0 && (
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <span>
                    {course.lessons.length} {course.lessons.length === 1 ? 'lesson' : 'lessons'} included
                  </span>
                </li>
              )}

              {/* Lesson Titles */}
              {course.lessons && course.lessons.length > 0 && (
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <span>
                    Lessons: {course.lessons.slice(0, 5).map(l => l.lesson.title).join(', ')}
                    {course.lessons.length > 5 && ` and ${course.lessons.length - 5} more...`}
                  </span>
                </li>
              )}

              {/* Learning Objectives */}
              {course.lessons && course.lessons.some(l => l.lesson.learningObjectives && l.lesson.learningObjectives.length > 0) && (
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                  <span>
                    Master key concepts: {course.lessons
                      .flatMap(l => l.lesson.learningObjectives || [])
                      .slice(0, 3)
                      .map(obj => obj.objective)
                      .join(', ')}
                    {course.lessons.flatMap(l => l.lesson.learningObjectives || []).length > 3 && ' and more'}
                  </span>
                </li>
              )}

            </ul>
          </CardContent>
        </Card>
      </div>

      <EmailVerificationModal
        isOpen={showVerificationModal}
        onClose={() => setShowVerificationModal(false)}
        onVerified={handleVerificationComplete}
      />

      {course && (
        <CheckoutConversionConfirmation
          isOpen={showConfirmation}
          onConfirm={handleConfirmPurchase}
          onCancel={handleCancelConfirmation}
          amount={total}
          platformFee={platformFee}
          subtotal={subtotal}
          fromCurrency={course.currency as CurrencyCode}
          itemName={course.title}
          itemType="course"
          isLoading={purchaseMutation.isPending || processingPayment}
        />
      )}

      {isSuperAdmin && course && (
        <SuperAdminPaymentModeModal
          isOpen={isPaymentModeModalOpen}
          onClose={handlePaymentModeClose}
          onConfirm={handlePaymentModeConfirm}
          isLoading={purchaseMutation.isPending || processingPayment}
          productName={course.title}
        />
      )}
    </div>
  );
}
