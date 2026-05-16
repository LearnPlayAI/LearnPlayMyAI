import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { z } from 'zod';
import { Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

const forgotSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotForm = z.infer<typeof forgotSchema>;

export default function EnterpriseForgotPassword() {
  const { toast } = useToast();

  const form = useForm<ForgotForm>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const forgotMutation = useMutation({
    mutationFn: async (data: ForgotForm) =>
      apiRequest('/api/enterprise/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: (res: any) => {
      toast({
        title: 'Check your email',
        description: res?.message || 'If an account exists, a reset link was sent.',
      });
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: 'Request failed',
        description: error.message || 'Please try again.',
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-border">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary rounded-xl flex items-center justify-center">
              <Mail className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Reset Enterprise Password</CardTitle>
            <p className="text-muted-foreground text-sm mt-1">Enter your enterprise account email</p>
          </CardHeader>
          <CardContent className="pt-4">
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => forgotMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-foreground">Email</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="email"
                          placeholder="you@company.com"
                          className="h-11 border-border focus:border-primary focus:ring-primary"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button type="submit" disabled={forgotMutation.isPending} className="w-full h-11 font-medium" >
                  {forgotMutation.isPending ? 'Sending...' : 'Send Reset Link'}
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
