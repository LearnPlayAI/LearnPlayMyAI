import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { AlertTriangle, CreditCard, TestTube2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export type YocoPaymentMode = 'test' | 'live';

interface SuperAdminPaymentModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mode: YocoPaymentMode) => void;
  isLoading?: boolean;
  productName?: string;
}

export function SuperAdminPaymentModeModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading = false,
  productName = 'this item',
}: SuperAdminPaymentModeModalProps) {
  const [selectedMode, setSelectedMode] = useState<YocoPaymentMode>('test');

  const handleConfirm = () => {
    onConfirm(selectedMode);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-primary" />
            SuperAdmin Payment Mode
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            As a SuperAdmin, you can choose the payment mode for this transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={selectedMode}
            onValueChange={(value) => setSelectedMode(value as YocoPaymentMode)}
            className="space-y-3"
            data-testid="payment-mode-radio-group"
          >
            <div
              className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                selectedMode === 'test'
                  ? 'border-[var(--warning)]/50 bg-warning/10'
                  : 'border-border bg-muted/50 hover:border-border/80'
              }`}
              onClick={() => setSelectedMode('test')}
            >
              <RadioGroupItem value="test" id="mode-test" className="mt-0.5" data-testid="radio-mode-test" />
              <div className="flex-1">
                <Label htmlFor="mode-test" className="flex items-center gap-2 text-foreground cursor-pointer">
                  <TestTube2 className="w-4 h-4 text-warning" />
                  Test Mode
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Uses YOCO test environment. No real money is charged.
                  Payment will be marked as a test transaction and excluded from revenue reports.
                </p>
              </div>
            </div>

            <div
              className={`flex items-start space-x-3 p-4 rounded-lg border transition-colors cursor-pointer ${
                selectedMode === 'live'
                  ? 'border-primary/50 bg-primary/10'
                  : 'border-border bg-muted/50 hover:border-border/80'
              }`}
              onClick={() => setSelectedMode('live')}
            >
              <RadioGroupItem value="live" id="mode-live" className="mt-0.5" data-testid="radio-mode-live" />
              <div className="flex-1">
                <Label htmlFor="mode-live" className="flex items-center gap-2 text-foreground cursor-pointer">
                  <CreditCard className="w-4 h-4 text-primary" />
                  Live Mode
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Uses YOCO production environment. Real money will be charged.
                  This transaction will be included in revenue reports.
                </p>
              </div>
            </div>
          </RadioGroup>

          {selectedMode === 'test' && (
            <Alert className="mt-4">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-warning">
                <strong>Test Mode Selected:</strong> Use test card 4000 0000 0000 0036 with any future expiry and CVV.
                This payment will NOT appear in revenue reports.
              </AlertDescription>
            </Alert>
          )}

          {selectedMode === 'live' && (
            <Alert className="mt-4">
              <CreditCard className="h-4 w-4 text-primary" />
              <AlertDescription className="text-primary/80">
                <strong>Live Mode Selected:</strong> Your real payment method will be charged.
                This transaction will be included in all revenue calculations.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={isLoading} data-testid="btn-cancel-payment-mode" >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={isLoading} className={selectedMode === 'test' ? 'bg-warning hover:bg-warning/90 text-warning-foreground' : 'bg-primary hover:bg-primary/90 text-btn-primary-foreground' } data-testid="btn-confirm-payment-mode" >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                {selectedMode === 'test' ? (
                  <>
                    <TestTube2 className="w-4 h-4 mr-2" />
                    Continue with Test Payment
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4 mr-2" />
                    Continue with Live Payment
                  </>
                )}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useSuperAdminPaymentMode() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingCallback, setPendingCallback] = useState<((mode: YocoPaymentMode) => void) | null>(null);

  const requestPaymentMode = (callback: (mode: YocoPaymentMode) => void) => {
    setPendingCallback(() => callback);
    setIsModalOpen(true);
  };

  const handleConfirm = (mode: YocoPaymentMode) => {
    setIsModalOpen(false);
    if (pendingCallback) {
      pendingCallback(mode);
      setPendingCallback(null);
    }
  };

  const handleClose = () => {
    setIsModalOpen(false);
    setPendingCallback(null);
  };

  return {
    isModalOpen,
    requestPaymentMode,
    handleConfirm,
    handleClose,
  };
}
