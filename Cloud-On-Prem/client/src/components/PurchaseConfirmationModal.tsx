import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, CreditCard, BookOpen, Crown, Sparkles } from "lucide-react";
import { usePurchaseConfirmation, PurchaseConfirmation } from "@/hooks/usePurchaseConfirmation";
import { formatCurrency } from "@/lib/currency";
import { useIsMobile } from "@/hooks/use-mobile";

interface PurchaseConfirmationModalProps {
  intentId?: string | null;
  checkoutId?: string | null;
  onClose: () => void;
  onSuccess?: (data: PurchaseConfirmation) => void;
}

export function PurchaseConfirmationModal({
  intentId,
  checkoutId,
  onClose,
  onSuccess,
}: PurchaseConfirmationModalProps) {
  const isMobile = useIsMobile();
  const [isOpen, setIsOpen] = useState(false);
  
  const { confirmation, isLoading, isPolling, error, isPending } = usePurchaseConfirmation({
    intentId,
    checkoutId,
    onFulfilled: (data) => {
      onSuccess?.(data);
    },
  });

  // Open modal when we have either an intentId or checkoutId
  const hasPaymentId = intentId || checkoutId;

  useEffect(() => {
    if (hasPaymentId) {
      setIsOpen(true);
    }
  }, [hasPaymentId]);

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  const getIcon = () => {
    if (isLoading || isPolling) {
      return <Loader2 className="h-16 w-16 text-primary animate-spin" />;
    }
    if (error || confirmation?.status === 'failed') {
      return <XCircle className="h-16 w-16 text-destructive" />;
    }
    if (confirmation?.fulfilled) {
      return <CheckCircle2 className="h-16 w-16 text-success" />;
    }
    return <Loader2 className="h-16 w-16 text-primary animate-spin" />;
  };

  const getTitle = () => {
    if (isLoading) return "Processing Payment...";
    if (isPolling) return "Confirming Purchase...";
    if (error) return "Payment Error";
    if (confirmation?.status === 'failed') return "Payment Failed";
    if (confirmation?.fulfilled) return "Payment Successful!";
    return "Processing...";
  };

  const getDescription = () => {
    if (isLoading || isPolling) {
      return "Please wait while we confirm your payment. This may take a few moments.";
    }
    if (error) {
      return error instanceof Error ? error.message : "An error occurred while processing your payment.";
    }
    if (confirmation?.status === 'failed') {
      return "Your payment could not be processed. Please try again or contact support.";
    }
    if (confirmation?.fulfilled) {
      return "Your purchase has been completed successfully!";
    }
    return "Processing your payment...";
  };

  const getTypeIcon = () => {
    switch (confirmation?.intentType) {
      case 'credits':
        return <Sparkles className="h-6 w-6 text-warning" />;
      case 'course':
        return <BookOpen className="h-6 w-6 text-secondary" />;
      case 'subscription':
        return <Crown className="h-6 w-6 text-primary" />;
      case 'license':
        return <CreditCard className="h-6 w-6 text-primary" />;
      default:
        return null;
    }
  };

  const renderDetails = () => {
    if (!confirmation?.fulfilled) return null;

    return (
      <div className="mt-6 space-y-4">
        <div className="bg-card/50 rounded-lg p-4 border border-border">
          <div className="flex items-center gap-3 mb-3">
            {getTypeIcon()}
            <span className="text-lg font-semibold text-foreground">
              {confirmation.intentType === 'credits' && 'Credit Package'}
              {confirmation.intentType === 'course' && 'Course Purchase'}
              {confirmation.intentType === 'subscription' && 'Subscription'}
              {confirmation.intentType === 'license' && 'License'}
            </span>
          </div>

          {confirmation.intentType === 'credits' && (
            <div className="space-y-3">
              {confirmation.packageName && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Package</span>
                  <span className="text-foreground font-medium">{confirmation.packageName}</span>
                </div>
              )}
              {confirmation.creditsReceived !== undefined && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Credits Received</span>
                  <span className="text-success font-bold text-xl">+{confirmation.creditsReceived}</span>
                </div>
              )}
              {confirmation.newBalance !== undefined && (
                <div className="flex justify-between items-center pt-2 border-t border-border">
                  <span className="text-muted-foreground">New Balance</span>
                  <span className="text-foreground font-bold text-xl">{confirmation.newBalance.toLocaleString()}</span>
                </div>
              )}
            </div>
          )}

          {confirmation.intentType === 'course' && (
            <div className="space-y-3">
              {confirmation.courseName && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Course</span>
                  <span className="text-foreground font-medium">{confirmation.courseName}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                <span className={`font-medium ${confirmation.enrolled ? 'text-success' : 'text-warning'}`}>
                  {confirmation.enrolled ? 'Enrolled' : 'Pending Enrollment'}
                </span>
              </div>
            </div>
          )}

          {confirmation.intentType === 'subscription' && (
            <div className="space-y-3">
              {confirmation.planName && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Plan</span>
                  <span className="text-foreground font-medium">{confirmation.planName}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                <span className="text-success font-medium capitalize">{confirmation.subscriptionStatus}</span>
              </div>
            </div>
          )}

          {confirmation.intentType === 'license' && (
            <div className="space-y-3">
              {confirmation.licenseTier && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">License Tier</span>
                  <span className="text-foreground font-medium capitalize">{confirmation.licenseTier}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Status</span>
                <span className="text-success font-medium capitalize">{confirmation.licenseStatus}</span>
              </div>
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-border">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Amount Paid</span>
              <span className="text-foreground font-medium">
                {formatCurrency({
                  currency: confirmation.currency,
                  amount: confirmation.amount,
                  showCode: true,
                })}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent 
        className="bg-card border-primary/30 text-foreground sm:max-w-md"
        data-testid="modal-purchase-confirmation"
      >
        <DialogHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="transition-all duration-300 ease-out motion-reduce:transition-none">
              {getIcon()}
            </div>
          </div>
          <DialogTitle className="text-xl sm:text-2xl font-bold text-foreground text-center" data-testid="text-confirmation-title">
            {getTitle()}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-center text-sm sm:text-base" data-testid="text-confirmation-description">
            {getDescription()}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="max-h-[50vh] sm:max-h-[60vh]">
          {renderDetails()}
        </DialogBody>

        <DialogFooter className="flex-col gap-3 sm:gap-2 border-t-0 pt-2">
          {confirmation?.fulfilled && (
            <Button onClick={handleClose} className="w-full min-h-[48px] sm:min-h-[44px] text-base" data-testid="button-close-confirmation" >
              Continue
            </Button>
          )}
          
          {(error && !isPending) && (
            <Button onClick={handleClose} className="w-full min-h-[48px] sm:min-h-[44px] text-base" data-testid="button-close-confirmation" >
              Close
            </Button>
          )}
          
          {(isPolling || isPending) && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                {isPending ? 'Waiting for payment confirmation...' : 'Checking for confirmation...'}
              </p>
              <Button onClick={handleClose} variant="outline" className="w-full min-h-[48px] sm:min-h-[44px] text-base" data-testid="button-close-while-pending" >
                Close and Check Later
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
