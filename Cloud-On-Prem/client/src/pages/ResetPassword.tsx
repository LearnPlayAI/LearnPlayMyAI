import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Lock, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

const resetPasswordSchema = z.object({
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be less than 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const form = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  // Extract token from URL query parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenParam = params.get('token');
    const normalizedToken = tokenParam?.trim().replace(/\s+/g, '') || null;
    
    if (!normalizedToken) {
      setIsVerifying(false);
      setTokenError('No reset token provided. Please check your email for the reset link.');
      return;
    }

    setToken(normalizedToken);
    verifyToken(normalizedToken);
  }, []);

  const verifyToken = async (tokenToVerify: string) => {
    setIsVerifying(true);
    setTokenError(null);

    try {
      const response = await fetch(`/api/auth/verify-reset-token/${encodeURIComponent(tokenToVerify)}`);
      const data = await response.json();

      if (data.valid) {
        setIsTokenValid(true);
      } else {
        setIsTokenValid(false);
        setTokenError(data.error || 'Invalid or expired reset token');
      }
    } catch (err: any) {
      setIsTokenValid(false);
      setTokenError('Failed to verify reset token. Please try again.');
    } finally {
      setIsVerifying(false);
    }
  };

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!token) return;

    setIsLoading(true);
    setError(null);

    try {
      await apiRequest('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          token,
          newPassword: data.newPassword,
        }),
      });

      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        setLocation('/login');
      }, 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Password strength indicator
  const getPasswordStrength = (password: string): { strength: number; label: string; color: string } => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;

    if (strength <= 2) return { strength: 1, label: 'Weak', color: 'bg-destructive' };
    if (strength <= 4) return { strength: 2, label: 'Medium', color: 'bg-warning' };
    return { strength: 3, label: 'Strong', color: 'bg-success' };
  };

  const passwordValue = form.watch('newPassword');
  const passwordStrength = passwordValue ? getPasswordStrength(passwordValue) : null;

  return (
    <div className="min-h-screen bg-primary/30 flex items-center justify-center p-[var(--container-padding)] pt-24 sm:pt-32">
      <div className="w-full max-w-md">
        <Card className="border-border bg-card/90 backdrop-blur-sm shadow-elevated">
          <CardHeader className="space-y-3 p-[var(--card-padding)] sm:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <Lock className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              <CardTitle className="text-[length:var(--text-2xl)] text-foreground text-center sm:text-left">Reset Password</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
              Create a new password for your account.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-[var(--card-padding)] sm:p-6 pt-0">
            {isVerifying ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-4">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="text-muted-foreground text-[length:var(--text-sm)]">Verifying reset token...</p>
              </div>
            ) : !isTokenValid ? (
              <div className="space-y-4">
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-[length:var(--text-sm)]">{tokenError}</AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <Link href="/forgot-password">
                    <Button className="w-full min-h-[44px] touch-manipulation" data-testid="button-request-new-link" >
                      Request New Reset Link
                    </Button>
                  </Link>

                  <Link href="/login">
                    <Button variant="outline" className="w-full min-h-[44px] touch-manipulation" data-testid="link-back-to-login" >
                      Back to Login
                    </Button>
                  </Link>
                </div>
              </div>
            ) : success ? (
              <div className="space-y-4">
                <Alert >
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-foreground text-[length:var(--text-sm)]">
                    Password reset successful! You can now login with your new password.
                    Redirecting to login page...
                  </AlertDescription>
                </Alert>

                <Link href="/login">
                  <Button className="w-full min-h-[44px] touch-manipulation" data-testid="button-go-to-login" >
                    Go to Login
                  </Button>
                </Link>
              </div>
            ) : (
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription className="text-[length:var(--text-sm)]">{error}</AlertDescription>
                    </Alert>
                  )}

                  <FormField
                    control={form.control}
                    name="newPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground text-[length:var(--text-sm)]">New Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showPassword ? 'text' : 'password'}
                              placeholder="Enter your new password"
                              disabled={isLoading}
                              className="min-h-[44px] bg-background/50 border-border/50 text-foreground placeholder:text-muted-foreground pr-12 focus:border-primary touch-manipulation"
                              autoFocus
                              autoComplete="new-password"
                              data-testid="input-new-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                              tabIndex={-1}
                              data-testid="button-toggle-password"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        {passwordStrength && (
                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">Password strength:</span>
                              <span className={passwordStrength.strength === 3 ? 'text-primary' : passwordStrength.strength === 2 ? 'text-accent' : 'text-destructive'}>
                                {passwordStrength.label}
                              </span>
                            </div>
                            <div className="h-1 w-full bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${passwordStrength.strength === 3 ? 'bg-primary' : passwordStrength.strength === 2 ? 'bg-accent' : 'bg-destructive'}`}
                                style={{ width: `${(passwordStrength.strength / 3) * 100}%` }}
                              />
                            </div>
                          </div>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="confirmPassword"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground text-[length:var(--text-sm)]">Confirm Password</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showConfirmPassword ? 'text' : 'password'}
                              placeholder="Confirm your new password"
                              disabled={isLoading}
                              className="min-h-[44px] bg-background/50 border-border/50 text-foreground placeholder:text-muted-foreground pr-12 focus:border-primary touch-manipulation"
                              autoComplete="new-password"
                              data-testid="input-confirm-password"
                            />
                            <button
                              type="button"
                              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                              tabIndex={-1}
                              data-testid="button-toggle-confirm-password"
                            >
                              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="bg-muted/50 border border-border rounded-lg p-3 sm:p-4">
                    <p className="text-[length:var(--text-sm)] text-foreground font-medium mb-2">Password requirements:</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      <li>• At least 8 characters long</li>
                      <li>• Contains uppercase and lowercase letters</li>
                      <li>• Contains at least one number</li>
                      <li>• Contains at least one special character</li>
                    </ul>
                  </div>

                  <Button type="submit" className="w-full min-h-[44px] touch-manipulation" disabled={isLoading} data-testid="button-reset-password" >
                    {isLoading ? 'Resetting Password...' : 'Reset Password'}
                  </Button>

                  <Link href="/login">
                    <Button type="button" variant="ghost" className="w-full min-h-[44px] touch-manipulation" disabled={isLoading} data-testid="link-cancel" >
                      Cancel
                    </Button>
                  </Link>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
