import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Mail, Send, CheckCircle, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface EmailVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified?: () => void;
  onContinueAnyway?: () => void;
  showContinueAnyway?: boolean;
}

export function useEmailVerification(enabled: boolean = true) {
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery<{ emailVerified: boolean }>({
    queryKey: ['/api/auth/verification-status'],
    enabled,
    staleTime: 30000,
    retry: false,
  });

  const checkVerification = async () => {
    const result = await refetch();
    return result.data?.emailVerified ?? false;
  };

  const invalidateStatus = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/auth/verification-status'] });
  };

  return {
    isEmailVerified: data?.emailVerified ?? false,
    isLoading,
    checkVerification,
    invalidateStatus,
  };
}

export function EmailVerificationModal({ isOpen, onClose, onVerified, onContinueAnyway, showContinueAnyway = false }: EmailVerificationModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);

  const resendMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/auth/resend-verification', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      toast({
        title: 'Verification Email Sent',
        description: 'Please check your inbox and click the verification link.',
      });
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Failed to Send Email',
        description: error.message || 'Please try again later.',
      });
    },
  });

  const handleResendVerification = () => {
    resendMutation.mutate();
  };

  const handleCheckVerification = async () => {
    setIsCheckingStatus(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/verification-status'] });
      const result = await queryClient.fetchQuery<{ emailVerified: boolean }>({
        queryKey: ['/api/auth/verification-status'],
        queryFn: async () => {
          const response = await fetch('/api/auth/verification-status', {
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Failed to check verification status');
          return response.json();
        },
      });

      if (result?.emailVerified) {
        toast({
          title: 'Email Verified!',
          description: 'Your email has been successfully verified. You can now proceed with your purchase.',
        });
        onVerified?.();
        onClose();
      } else {
        toast({
          variant: 'destructive',
          title: 'Email Not Yet Verified',
          description: 'Please click the verification link in your email first.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Verification Check Failed',
        description: 'Unable to check verification status. Please try again.',
      });
    } finally {
      setIsCheckingStatus(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent 
        className="w-[calc(100%-2rem)] max-w-md mx-auto bg-card border-primary/30"
        data-testid="modal-email-verification"
      >
        <DialogHeader className="text-center space-y-4">
          <div className="mx-auto flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-warning/20" data-testid="icon-container-warning">
            <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-warning" data-testid="icon-warning" />
          </div>
          <DialogTitle className="text-lg sm:text-xl font-bold text-card-foreground" data-testid="title-verification-required">
            Email Verification Required
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base text-muted-foreground" data-testid="description-verification">
            Please verify your email address before making a purchase. This helps us keep your account secure and ensure you receive important updates about your orders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4 sm:mt-6">
          <div className="p-3 sm:p-4 bg-primary/10 border border-primary/20 rounded-lg" data-testid="container-instructions">
            <div className="flex items-start gap-3">
              <Mail className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" data-testid="icon-mail" />
              <div className="text-sm text-muted-foreground">
                <p className="font-medium text-primary/80 mb-1" data-testid="text-check-inbox">Check your inbox</p>
                <p data-testid="text-instructions">
                  We sent a verification link to your email address. Click the link to verify your account, then come back here.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 pb-[env(safe-area-inset-bottom)]">
            <Button onClick={handleCheckVerification} disabled={isCheckingStatus} className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation font-semibold" data-testid="button-check-verification" >
              {isCheckingStatus ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Checking...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  I've Verified My Email
                </>
              )}
            </Button>

            <Button variant="outline" onClick={handleResendVerification} disabled={resendMutation.isPending} className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation" data-testid="button-resend-verification" >
              {resendMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Resend Verification Email
                </>
              )}
            </Button>

            {showContinueAnyway && onContinueAnyway && (
              <Button variant="ghost" onClick={onContinueAnyway} className="w-full min-h-[48px] sm:min-h-[44px] touch-manipulation" data-testid="button-continue-anyway" >
                Continue without verification
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center" data-testid="text-spam-notice">
            Didn't receive the email? Check your spam folder or request a new one.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
