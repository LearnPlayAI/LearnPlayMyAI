import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, Mail, Lock, Building2, Shield, ArrowRight, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { usePlatformMode } from '@/hooks/usePlatformMode';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function EnterpriseLogin() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();
  const { onpremMode } = usePlatformMode();

  const { data: enterpriseMe, isLoading: enterpriseMeLoading } = useQuery({
    queryKey: ['/api/enterprise/auth/me'],
    queryFn: async () => {
      const res = await fetch('/api/enterprise/auth/me', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  const form = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginForm) => {
      return await apiRequest('/api/enterprise/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/auth/me'] });
      setLocation('/enterprise/dashboard');
    },
    onError: (error: any) => {
      toast({
        title: 'Login Failed',
        description: error.message || 'Invalid credentials. Please try again.',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (enterpriseMe?.isSuperAdmin || enterpriseMe?.customer) {
      setLocation('/enterprise/dashboard');
    }
  }, [enterpriseMe, setLocation]);

  const onSubmit = (data: LoginForm) => {
    loginMutation.mutate(data);
  };

  if (onpremMode) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Not Available</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-muted-foreground">
            Enterprise portal is only available in cloud mode.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (enterpriseMeLoading) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">Checking session...</p>
        </div>
      </div>
    );
  }

  if (enterpriseMe?.isSuperAdmin) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl border-border">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 mx-auto mb-4 bg-warning rounded-xl flex items-center justify-center">
              <Shield className="w-8 h-8 text-warning-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">SuperAdmin Access</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">You are logged in as a SuperAdmin</p>
          </CardHeader>
          <CardContent className="pt-4 text-center">
            <p className="text-sm text-muted-foreground mb-6">
              Redirecting you to the Enterprise Portal where you can select a customer to manage...
            </p>
            <Button onClick={() => setLocation('/enterprise/dashboard')}
              className="w-full h-11 bg-primary hover:bg-primary/90 text-primary-foreground font-medium inline-flex items-center justify-center gap-2"
            >
              <ArrowRight className="w-4 h-4" />
              Go to Enterprise Portal
            </Button>
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
              <Building2 className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Enterprise Portal</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">Sign in to your enterprise account</p>
          </CardHeader>
          <CardContent className="pt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Email</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                          <Input
                            {...field}
                            type="email"
                            placeholder="Enter your email"
                            className="pl-10 h-11 border-border focus:border-primary focus:ring-primary"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                          <Input
                            {...field}
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Enter your password"
                            className="pl-10 pr-10 h-11 border-border focus:border-primary focus:ring-primary"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-muted-foreground"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={loginMutation.isPending} className="w-full h-11 font-medium" >
                  {loginMutation.isPending ? 'Signing In...' : 'Sign In'}
                </Button>
              </form>
            </Form>

            <div className="mt-6 text-center space-y-2">
              <p className="text-sm text-muted-foreground">
                <Link href="/enterprise/forgot-password" className="text-primary hover:text-primary font-medium">
                  Forgot your password?
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                Don't have an account?{' '}
                <Link href="/enterprise/register" className="text-primary hover:text-primary font-medium">
                  Register
                </Link>
              </p>
              <p className="text-sm text-muted-foreground">
                <Link href="/login" className="text-muted-foreground hover:text-foreground">
                  ← Back to main platform
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
