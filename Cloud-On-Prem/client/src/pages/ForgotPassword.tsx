import { useState } from 'react';
import { Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPassword() {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    setIsLoading(true);
    setError(null);

    try {
      await apiRequest('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Failed to send reset email. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary/30 flex items-center justify-center p-[var(--container-padding)] pt-24 sm:pt-32">
      <div className="w-full max-w-md">
        <Card className="border-border bg-card/90 backdrop-blur-sm shadow-elevated">
          <CardHeader className="space-y-3 p-[var(--card-padding)] sm:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <Mail className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
              <CardTitle className="text-[length:var(--text-2xl)] text-foreground text-center sm:text-left">Forgot Password</CardTitle>
            </div>
            <CardDescription className="text-muted-foreground text-[length:var(--text-sm)] text-center sm:text-left">
              Enter your email address and we'll send you a link to reset your password.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6 p-[var(--card-padding)] sm:p-6 pt-0">
            {success ? (
              <div className="space-y-4">
                <Alert >
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-foreground text-[length:var(--text-sm)]">
                    If that email address is registered, you will receive password reset instructions shortly.
                    Please check your inbox and spam folder.
                  </AlertDescription>
                </Alert>

                <div className="space-y-3">
                  <p className="text-[length:var(--text-sm)] text-muted-foreground">
                    Didn't receive an email? Check your spam folder or try again.
                  </p>
                  
                  <Button variant="outline" className="w-full min-h-[44px] touch-manipulation" onClick={() => {
                      setSuccess(false);
                      form.reset();
                    }}
                    data-testid="button-try-again"
                  >
                    Try Another Email
                  </Button>

                  <Link href="/login">
                    <Button variant="ghost" className="w-full min-h-[44px] touch-manipulation" data-testid="button-back-to-login" >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Login
                    </Button>
                  </Link>
                </div>
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
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-foreground text-[length:var(--text-sm)]">Email Address</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            placeholder="your@email.com"
                            disabled={isLoading}
                            className="min-h-[44px] bg-background/50 border-border/50 text-foreground placeholder:text-muted-foreground focus:border-primary touch-manipulation"
                            autoFocus
                            autoComplete="email"
                            data-testid="input-email"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full min-h-[44px] touch-manipulation" disabled={isLoading} data-testid="button-submit" >
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                  </Button>

                  <Link href="/login">
                    <Button type="button" variant="ghost" className="w-full min-h-[44px] touch-manipulation" disabled={isLoading} data-testid="link-back-to-login" >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Login
                    </Button>
                  </Link>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <p className="text-[length:var(--text-sm)] text-muted-foreground">
            Don't have an account?{' '}
            <Link href="/register" className="text-primary hover:text-primary/80 font-medium inline-block py-1 touch-manipulation">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
