import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Loader2, Mail, Home, RefreshCw, Sparkles, Gift } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiRequest } from '@/lib/queryClient';
import { getThemeConfettiColors } from '@/lib/themePalettes';
import { useAuth } from '@/hooks/useAuth';
import { useBrandingLogo } from '@/contexts/BrandingContext';

const Confetti = () => {
  const themeColors = getThemeConfettiColors();
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 0.5,
    duration: 2 + Math.random() * 2,
    x: Math.random() * 100,
    rotation: Math.random() * 360,
    color: themeColors[Math.floor(Math.random() * themeColors.length)],
    size: 4 + Math.random() * 8
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {confettiPieces.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute rounded-sm"
          style={{
            backgroundColor: piece.color,
            width: piece.size,
            height: piece.size,
            left: `${piece.x}%`,
            top: '-20px'
          }}
          initial={{ y: -20, rotate: 0, scale: 0, opacity: 1 }}
          animate={{ 
            y: typeof window !== 'undefined' ? window.innerHeight + 50 : 800,
            rotate: piece.rotation * 4,
            scale: [0, 1, 1, 0.8, 0],
            opacity: [1, 1, 1, 0.8, 0],
            x: [0, Math.random() * 100 - 50, Math.random() * 150 - 75]
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
};

export default function VerifyEmail() {
  const [token, setToken] = useState<string | null>(null);
  const [creditsAwarded, setCreditsAwarded] = useState<number>(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const { isAuthenticated } = useAuth();
  const { orgName } = useBrandingLogo();

  const verifyMutation = useMutation({
    mutationFn: async (verifyToken: string) => {
      return await apiRequest('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verifyToken }),
      });
    },
    onSuccess: (data: any) => {
      setCreditsAwarded(data.creditsAwarded || 0);
      setShowConfetti(true);
    },
  });

  const resendMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/auth/resend-verification', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      setResendSuccess(true);
    },
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    setToken(tokenParam);

    if (tokenParam) {
      verifyMutation.mutate(tokenParam);
    }
  }, []);

  const isLoading = verifyMutation.isPending;
  const isSuccess = verifyMutation.isSuccess;
  const isError = verifyMutation.isError;
  const errorMessage = verifyMutation.error?.message || 'Email verification failed. Please try again.';

  return (
    <div className="min-h-screen bg-primary/30 flex items-center justify-center p-[var(--container-padding)] relative overflow-hidden">
      {showConfetti && <Confetti />}
      
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-secondary/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-secondary/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-border bg-card/90 backdrop-blur-sm shadow-dialog" data-testid="card-verify-email">
          <CardHeader className="space-y-3 text-center p-[var(--card-padding)] sm:p-6">
            {isLoading && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center"
              >
                <Loader2 className="h-10 w-10 text-primary animate-spin" />
              </motion.div>
            )}
            
            {isSuccess && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="w-20 h-20 mx-auto bg-primary/20 rounded-full flex items-center justify-center"
              >
                <CheckCircle2 className="h-10 w-10 text-primary" />
              </motion.div>
            )}
            
            {isError && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 mx-auto bg-destructive/20 rounded-full flex items-center justify-center"
              >
                <XCircle className="h-10 w-10 text-destructive" />
              </motion.div>
            )}
            
            {!token && !isLoading && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="w-20 h-20 mx-auto bg-accent/20 rounded-full flex items-center justify-center"
              >
                <Mail className="h-10 w-10 text-accent" />
              </motion.div>
            )}

            <CardTitle className="text-[length:var(--text-2xl)] text-foreground" data-testid="title-verify-email">
              {isLoading && "Verifying Email..."}
              {isSuccess && "Email verified successfully!"}
              {isError && "Verification Failed"}
              {!token && !isLoading && "Missing Token"}
            </CardTitle>
            
            <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]" data-testid="description-verify-email">
              {isLoading && "Please wait while we verify your email address."}
              {isSuccess && "Your email has been verified and your account is now active."}
              {isError && "We couldn't verify your email address."}
              {!token && !isLoading && "No verification token was found in the URL."}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-[var(--card-padding)] sm:p-6 pt-0">
            {isSuccess && creditsAwarded > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Alert data-testid="alert-credits-awarded">
                  <Gift className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-foreground flex flex-col sm:flex-row items-start sm:items-center gap-2 text-[length:var(--text-sm)]">
                    <Sparkles className="h-4 w-4 flex-shrink-0" />
                    <span>You've been awarded <strong className="text-primary">{creditsAwarded} credits</strong> for verifying your email!</span>
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            {isError && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Alert variant="destructive" data-testid="alert-error">
                  <AlertDescription className="text-foreground text-[length:var(--text-sm)]">
                    {errorMessage}
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            {!token && !isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Alert data-testid="alert-missing-token">
                  <AlertDescription className="text-foreground text-[length:var(--text-sm)]">
                    Please check your email for the verification link and make sure you're using the complete URL.
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            {resendSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Alert data-testid="alert-resend-success">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-foreground text-[length:var(--text-sm)]">
                    Verification email sent! Please check your inbox.
                  </AlertDescription>
                </Alert>
              </motion.div>
            )}

            <div className="space-y-3">
              {isSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <Link href="/">
                    <Button className="w-full min-h-[44px] font-semibold py-3 touch-manipulation" data-testid="button-go-home" >
                      <Home className="mr-2 h-4 w-4" />
                      Go to Dashboard
                    </Button>
                  </Link>
                </motion.div>
              )}

              {(isError || (!token && !isLoading)) && (
                <div className="space-y-3">
                  {isAuthenticated && !resendSuccess && (
                    <Button onClick={() => resendMutation.mutate()}
                      disabled={resendMutation.isPending}
                      className="w-full min-h-[44px] bg-primary text-primary-foreground hover:bg-primary/90 text-primary-foreground font-semibold touch-manipulation"
                      data-testid="button-resend-verification"
                    >
                      {resendMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Resend Verification Email
                        </>
                      )}
                    </Button>
                  )}

                  <Link href="/">
                    <Button variant="outline" className="w-full min-h-[44px] touch-manipulation" data-testid="button-back-home" >
                      <Home className="mr-2 h-4 w-4" />
                      Back to Home
                    </Button>
                  </Link>

                  {!isAuthenticated && (
                    <Link href="/login">
                      <Button variant="ghost" className="w-full min-h-[44px] touch-manipulation" data-testid="button-go-login" >
                        Sign in to resend verification
                      </Button>
                    </Link>
                  )}
                </div>
              )}

              {isLoading && (
                <div className="flex justify-center">
                  <div className="flex items-center gap-2 text-primary/80">
                    <div className="flex space-x-1">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-2 h-2 bg-primary rounded-full"
                          animate={{ y: [0, -8, 0] }}
                          transition={{
                            duration: 0.6,
                            repeat: Infinity,
                            delay: i * 0.1,
                          }}
                        />
                      ))}
                    </div>
                    <span className="text-[length:var(--text-sm)]">Processing...</span>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-center mt-6"
        >
          <Link 
            href="/" 
            className="text-primary/80 hover:text-primary transition-colors text-[length:var(--text-sm)] inline-block py-2 touch-manipulation"
            data-testid="link-home"
          >
            ← Back to {orgName}
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
