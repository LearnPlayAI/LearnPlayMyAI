import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, Mail, Lock, Gamepad2, LogIn, AlertCircle, Clock, XCircle } from 'lucide-react';
import { useBranding, useBrandingCopy } from '@/contexts/BrandingContext';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { loginUserSchema } from '@shared/schema';

// Animated background component
const AnimatedBackground = () => {
  return (
    <div className="fixed inset-0 -z-10">
      <div className="starfield"></div>
      <div className="absolute inset-0 bg-secondary/5"></div>
    </div>
  );
};

// Floating game elements
const FloatingElements = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-5">
      <div className="absolute top-32 left-16 animate-pulse opacity-20 animation-delay-500">
        <LogIn size={36} className="text-primary" />
      </div>
      <div className="absolute top-48 right-16 animate-bounce opacity-15 animation-delay-1500">
        <div className="w-10 h-14 bg-accent/30 rounded-lg border border-secondary/30"></div>
      </div>
      <div className="absolute bottom-40 left-12 animate-pulse opacity-10 animation-delay-2500">
        <div className="w-6 h-10 bg-secondary/40 rounded-md"></div>
      </div>
      <div className="absolute bottom-24 right-20 animate-bounce opacity-25 animation-delay-1000">
        <Gamepad2 size={28} className="text-accent" />
      </div>
    </div>
  );
};

// Floating cards animation
const FloatingCards = () => {
  return (
    <div className="absolute top-10 right-10 opacity-10">
      <div className="relative">
        <div className="w-16 h-24 bg-surface-base rounded-xl border border-accent/20 transform rotate-12 animate-pulse"></div>
        <div className="absolute -top-2 -left-2 w-16 h-24 bg-secondary/20 rounded-xl border border-accent/20 transform -rotate-6 animate-pulse animation-delay-1000"></div>
      </div>
    </div>
  );
};

export default function Login() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [errorDialog, setErrorDialog] = useState({ open: false, type: null, message: '' });
  const queryClient = useQueryClient();
  const { branding, isOrgDomain } = useBranding();
  const { loginTitle, loginSubtitle, loginCta, loginHelper, orgName } = useBrandingCopy();
  const { onpremMode } = usePlatformMode();
  const logoUrl = branding?.logoUrl;
  const orgInitials = orgName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  const form = useForm({
    resolver: zodResolver(loginUserSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data) => {
      return await apiRequest('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: async (data) => {
      // Invalidate and refetch critical auth queries first
      await queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/user/roles'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/admin/check'] });
      
      // Clear other stale cached queries
      queryClient.removeQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          // Keep the critical auth queries we just invalidated
          return key !== '/api/auth/user' && key !== '/api/user/roles' && key !== '/api/admin/check';
        }
      });
      
      // Role-based redirect after login
      // Org Admins go to Central Management Hub, others to home page
      if (data.primaryRole === 'org_admin') {
        setLocation('/org-management');
      } else {
        setLocation('/');
      }
    },
    onError: (error) => {
      // Extract clean message from error
      let userMessage = '';
      let errorType = 'error';
      
      // Check if it's a pending or denied join request
      if (error.status === 'pending') {
        errorType = 'pending';
        userMessage = 'Your join request is still under review. Please wait for an administrator to approve your request.';
      } else if (error.status === 'denied') {
        errorType = 'denied';
        // Extract denial reason if present in the message
        if (error.message && error.message.includes('Reason:')) {
          userMessage = error.message;
        } else {
          userMessage = 'Your join request was denied. Please contact your organization administrator for more information.';
        }
      } else {
        // Generic login error
        userMessage = 'Invalid credentials. Please check your email/username and password.';
      }
      
      setErrorDialog({
        open: true,
        type: errorType,
        message: userMessage
      });
    },
  });

  const onSubmit = (data) => {
    loginMutation.mutate(data);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-[var(--container-padding)] py-8 relative">
      <AnimatedBackground />
      <FloatingElements />
      <FloatingCards />
      
      <div className="w-full max-w-md relative">
        {/* Main login card */}
        <div className="bg-card/90 backdrop-blur-xl border border-border/50 rounded-3xl p-[var(--card-padding)] sm:p-8 shadow-dialog animate-fade-in-up">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={`${orgName} logo`}
                className="w-20 h-20 mx-auto mb-4 object-contain rounded-lg"
                data-testid="img-org-logo"
              />
            ) : (
              <div className="w-20 h-20 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary" data-testid="text-org-initials">
                  {orgInitials}
                </span>
              </div>
            )}
            <h1 className="text-[length:var(--text-3xl)] font-black text-foreground mb-2" data-testid="title-login">
              {loginTitle}
            </h1>
            <p className="text-muted-foreground text-[length:var(--text-sm)]" data-testid="text-login-subtitle">
              {loginSubtitle}
            </p>
          </div>

          {/* Login form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6">
              {/* Email Field */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Email / Gamer Name / Full Name</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type="text"
                          placeholder="e.g., john@example.com or GameMaster or John Doe"
                          className="pl-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-email"
                        />
                      </div>
                    </FormControl>
                    <p className="text-xs text-muted-foreground mt-2">
                      You can sign in using your email address, gamer name, or your first and last name.
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password Field */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Password</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Enter your password"
                          className="pl-11 pr-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Forgot Password Link */}
              <div className="text-right">
                <Link 
                  href="/forgot-password" 
                  className="text-[length:var(--text-sm)] text-primary hover:text-primary/80 font-medium transition-colors inline-block py-2 touch-manipulation"
                  data-testid="link-forgot-password"
                >
                  Forgot Password?
                </Link>
              </div>

              {/* Submit Button */}
              <Button type="submit" disabled={loginMutation.isPending} className="w-full min-h-[44px] h-12 text-base sm:text-lg font-bold touch-manipulation" data-testid="button-login" >
                {loginMutation.isPending ? 'Signing In...' : loginCta}
              </Button>
            </form>
          </Form>

          {/* Register link */}
          <div className="text-center mt-6">
            <p className="text-foreground/80 text-[length:var(--text-sm)]">
              {loginHelper}{' '}
              <Link 
                href="/register" 
                className="text-primary hover:text-primary/90 font-semibold transition-colors inline-block py-1 touch-manipulation underline-offset-2 hover:underline"
                data-testid="link-register"
              >
                Create Account
              </Link>
            </p>
          </div>
        </div>

        {/* Back to landing link */}
        <div className="text-center mt-6">
          <Link 
            href="/" 
            className="text-muted-foreground hover:text-foreground transition-colors text-[length:var(--text-sm)] inline-block py-2 touch-manipulation underline-offset-2 hover:underline"
            data-testid="link-home"
          >
            ← Back
          </Link>
        </div>

      </div>

      {/* Error Dialog */}
      <Dialog open={errorDialog.open} onOpenChange={(open) => setErrorDialog({ ...errorDialog, open })}>
        <DialogContent className="sm:max-w-md mx-4 p-[var(--dialog-padding)]" data-testid="dialog-login-error">
          <DialogHeader>
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-2">
              {errorDialog.type === 'pending' && (
                <div className="w-12 h-12 rounded-full bg-secondary/20 flex items-center justify-center flex-shrink-0">
                  <Clock className="w-6 h-6 text-secondary" />
                </div>
              )}
              {errorDialog.type === 'denied' && (
                <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center flex-shrink-0">
                  <XCircle className="w-6 h-6 text-destructive" />
                </div>
              )}
              {errorDialog.type === 'error' && (
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                  <AlertCircle className="w-6 h-6 text-accent" />
                </div>
              )}
              <DialogTitle data-testid="text-error-title" className="text-lg sm:text-xl text-center sm:text-left">
                {errorDialog.type === 'pending' && 'Account Pending Approval'}
                {errorDialog.type === 'denied' && 'Access Denied'}
                {errorDialog.type === 'error' && 'Unable to Sign In'}
              </DialogTitle>
            </div>
            <DialogDescription className="text-[length:var(--text-base)] leading-relaxed pt-2" data-testid="text-error-description">
              {errorDialog.message}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button onClick={() => setErrorDialog({ ...errorDialog, open: false })}
              className="w-full min-h-[44px] touch-manipulation"
              data-testid="button-close-error"
            >
              {errorDialog.type === 'pending' ? 'Got It' : errorDialog.type === 'denied' ? 'Understood' : 'Try Again'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
