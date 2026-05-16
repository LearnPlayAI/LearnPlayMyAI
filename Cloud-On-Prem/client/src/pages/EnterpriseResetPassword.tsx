import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { z } from 'zod';
import { Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const resetSchema = z
  .object({
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetForm = z.infer<typeof resetSchema>;

export default function EnterpriseResetPassword() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const token = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token')?.trim().replace(/\s+/g, '') || '';
  }, []);

  const form = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetForm) =>
      apiRequest('/api/enterprise/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password: data.password }),
      }),
    onSuccess: (res: any) => {
      toast({
        title: 'Password updated',
        description: res?.message || 'Password reset successful.',
      });
      setLocation('/enterprise/login');
    },
    onError: (error: any) => {
      toast({
        title: 'Reset failed',
        description: error.message || 'Reset link is invalid or expired.',
        variant: 'destructive',
      });
    },
  });

  if (!token) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-border">
          <CardHeader>
            <CardTitle className="text-center">Invalid Reset Link</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground text-sm mb-4">This reset link is missing a valid token.</p>
            <Link href="/enterprise/forgot-password" className="text-primary hover:text-primary font-medium">
              Request a new reset link
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-border">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary rounded-xl flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Set New Enterprise Password</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => resetMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">New Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Enter new password"
                          className="h-11 border-border focus:border-primary focus:ring-primary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Confirm Password</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="password"
                          placeholder="Confirm new password"
                          className="h-11 border-border focus:border-primary focus:ring-primary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={resetMutation.isPending} className="w-full h-11 font-medium" >
                  {resetMutation.isPending ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center">
              <Link href="/enterprise/login" className="text-sm text-muted-foreground hover:text-foreground">
                ← Back to enterprise login
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
