import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertCircle, Sparkles, HelpCircle } from "lucide-react";
import { 
  LP_CREDITS_NAME, 
  LP_CREDITS_SHORT,
  QUIZ_TIERS,
  type QuizTier 
} from "@shared/creditConstants";
import { LPCreditIcon } from "./LPCreditIcon";
import { usePlatformMode } from "@/hooks/usePlatformMode";

export type AssetType = 'lesson' | 'quiz';

interface InsufficientCreditsModalProps {
  open?: boolean;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  currentBalance: number;
  requiredCredits: number;
  includeImages?: boolean;
  assetType?: AssetType;
  quizTier?: QuizTier;
}

export function InsufficientCreditsModal({
  open,
  isOpen,
  onOpenChange,
  onClose,
  currentBalance,
  requiredCredits,
  includeImages = false,
  assetType = 'lesson',
  quizTier,
}: InsufficientCreditsModalProps) {
  const { paymentGatewayEnabled } = usePlatformMode();
  const isModalOpen = isOpen ?? open ?? false;
  
  const handleOpenChange = (newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    }
    if (onClose && !newOpen) {
      onClose();
    }
  };

  const handleClose = () => {
    handleOpenChange(false);
  };

  const isNegativeBalance = currentBalance < 0;
  const deficit = isNegativeBalance ? Math.abs(currentBalance) : (requiredCredits - currentBalance);
  
  const quizTierInfo = quizTier ? QUIZ_TIERS[quizTier] : null;

  const getAssetDescription = () => {
    if (assetType === 'quiz') {
      if (quizTierInfo) {
        return `a ${quizTierInfo.questionCount}-question quiz`;
      }
      return 'a quiz';
    }
    return `a lesson ${includeImages ? 'with images' : 'without images'}`;
  };

  const getTitleIcon = () => {
    if (assetType === 'quiz') {
      return <Sparkles className={`h-5 w-5 sm:h-6 sm:w-6 ${isNegativeBalance ? 'text-destructive' : 'text-accent'}`} />;
    }
    return <LPCreditIcon size="lg" />;
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent 
        className="w-[calc(100%-2rem)] max-w-md mx-auto p-[var(--dialog-padding)] border-primary/30 bg-background"
        data-testid="modal-insufficient-credits"
      >
        <DialogHeader>
          <div className="flex items-center gap-[var(--space-sm)] mb-2">
            <div className={`p-2 sm:p-3 ${isNegativeBalance ? 'bg-destructive/20' : 'bg-surface-raised'} rounded-full flex-shrink-0 border ${isNegativeBalance ? 'border-[var(--destructive)]/30' : 'border-accent/30'}`}>
              {getTitleIcon()}
            </div>
            <DialogTitle className="text-[length:var(--text-xl)] sm:text-[length:var(--text-2xl)]">
              {isNegativeBalance ? 'Negative Credit Balance' : `Insufficient ${LP_CREDITS_NAME}`}
            </DialogTitle>
          </div>
          <DialogDescription className="text-[length:var(--text-base)] space-y-[var(--space-sm)] pt-2" asChild>
            <div>
              <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg space-y-2 border border-primary/20">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                  <span className="text-muted-foreground text-[length:var(--text-sm)]">Current Balance:</span>
                  <span className={`text-[length:var(--text-lg)] font-bold ${isNegativeBalance ? 'text-destructive' : 'text-foreground'}`}>
                    {currentBalance} {LP_CREDITS_SHORT}
                  </span>
                </div>
                {!isNegativeBalance && (
                  <>
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                      <span className="text-muted-foreground text-[length:var(--text-sm)]">Required:</span>
                      <span className="text-[length:var(--text-lg)] font-bold text-accent">
                        {requiredCredits} {LP_CREDITS_SHORT}
                        {quizTierInfo && (
                          <span className="text-[length:var(--text-xs)] text-muted-foreground ml-1">
                            ({quizTierInfo.label})
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="border-t border-muted-foreground/20 pt-2 mt-2">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                        <span className="text-muted-foreground text-[length:var(--text-sm)]">Short by:</span>
                        <span className="text-[length:var(--text-lg)] font-bold text-destructive">{deficit} {LP_CREDITS_SHORT}</span>
                      </div>
                    </div>
                  </>
                )}
                {isNegativeBalance && (
                  <div className="border-t border-muted-foreground/20 pt-2 mt-2">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                      <span className="text-muted-foreground text-[length:var(--text-sm)]">Credits needed (clear debt + generation):</span>
                      <span className="text-[length:var(--text-lg)] font-bold text-destructive">{requiredCredits} {LP_CREDITS_SHORT}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className={`flex items-start gap-2 p-[var(--card-padding)] rounded-lg border ${isNegativeBalance ? 'bg-destructive/10 border-[var(--destructive)]/20' : 'bg-primary/10 border-primary/20'}`}>
                <AlertCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isNegativeBalance ? 'text-destructive' : 'text-primary'}`} />
                <div className="text-[length:var(--text-sm)] text-muted-foreground">
                  {isNegativeBalance ? (
                    <>
                      <p className="mb-1 font-semibold text-destructive">
                        Your account has a negative balance of {currentBalance} {LP_CREDITS_SHORT} from a previous generation that exceeded your available credits.
                      </p>
                      <p>
                        {paymentGatewayEnabled
                          ? <>You must purchase at least <strong className="text-foreground">{requiredCredits} {LP_CREDITS_SHORT}</strong> to clear your debt ({Math.abs(currentBalance)} {LP_CREDITS_SHORT}) and generate new content.</>
                          : <>You need at least <strong className="text-foreground">{requiredCredits} {LP_CREDITS_SHORT}</strong> to clear your debt ({Math.abs(currentBalance)} {LP_CREDITS_SHORT}) and generate new content. Contact your administrator to add credits.</>
                        }
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mb-1">
                        You need <strong className="text-accent">{requiredCredits} {LP_CREDITS_SHORT}</strong> to generate {getAssetDescription()}.
                      </p>
                      {paymentGatewayEnabled ? (
                        assetType === 'quiz' ? (
                          <p>
                            Purchase more {LP_CREDITS_NAME} to create AI-powered quizzes from your lessons.
                          </p>
                        ) : (
                          <p>
                            Purchase more {LP_CREDITS_NAME} to continue generating AI-powered lessons, or upload a PPTX file for free.
                          </p>
                        )
                      ) : (
                        <p>
                          Contact your administrator to add more {LP_CREDITS_NAME}{assetType !== 'quiz' ? ', or upload a PPTX file for free' : ''}.
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-accent/5 border border-accent/20">
                <HelpCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-accent" />
                <div className="text-[length:var(--text-xs)] text-muted-foreground">
                  <strong className="text-accent">{LP_CREDITS_NAME}</strong> are used to generate AI-powered learning content including lessons, quizzes, and course frameworks.
                </div>
              </div>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col-reverse sm:flex-row gap-[var(--space-sm)] sm:gap-2 pb-[env(safe-area-inset-bottom)]">
          <Button variant="outline" onClick={handleClose} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-cancel-credits" >
            Cancel
          </Button>
          {paymentGatewayEnabled ? (
            <Link href="/buy-credits" className="w-full sm:w-auto">
              <Button className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full border" data-testid="button-buy-credits-modal" >
                <LPCreditIcon size="sm" className="mr-2" />
                Purchase {LP_CREDITS_NAME}
              </Button>
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground text-center w-full sm:w-auto">
              Contact your administrator to add credits.
            </p>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
