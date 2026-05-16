import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { Loader2, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';

const profileSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  contactPersonName: z.string().min(2, 'Contact person name is required'),
  contactEmail: z.string().email('Please enter a valid email'),
  contactMobile: z.string().optional(),
  companyAddress: z.string().optional(),
  country: z.string().optional(),
});

type ProfileForm = z.infer<typeof profileSchema>;

function ProfileContent() {
  const { isSuperAdmin, hasCustomerSelected } = useEnterpriseAuth();
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['/api/enterprise/profile'],
  });

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      companyName: '',
      contactPersonName: '',
      contactEmail: '',
      contactMobile: '',
      companyAddress: '',
      country: '',
    },
  });

  const profileData = (profile as any)?.customer;

  useEffect(() => {
    if (profileData) {
      form.reset({
        companyName: profileData.companyName || '',
        contactPersonName: profileData.contactPersonName || '',
        contactEmail: profileData.contactEmail || '',
        contactMobile: profileData.contactMobile || '',
        companyAddress: profileData.companyAddress || '',
        country: profileData.country || '',
      });
    }
  }, [profileData, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: ProfileForm) => {
      return await apiRequest('/api/enterprise/profile', {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/profile'] });
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/auth/me'] });
      toast({ title: 'Profile Updated', description: 'Your company profile has been saved.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message || 'Failed to update profile.', variant: 'destructive' });
    },
  });

  if (isSuperAdmin && !hasCustomerSelected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company Profile</h1>
          <p className="text-muted-foreground text-sm">Manage your company information</p>
        </div>
        <Card className="border-border">
          <CardContent className="text-center py-12 text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
            <p className="font-medium text-foreground mb-1">No customer selected</p>
            <p className="text-sm">Please select an enterprise customer from the dropdown above to view this page.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Company Profile</h1>
        <p className="text-muted-foreground text-sm">Manage your company information</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Company Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => saveMutation.mutate(data))} className="space-y-4">
              <FormField control={form.control} name="companyName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Company Name</FormLabel>
                  <FormControl><Input {...field} className="h-11 border-border focus:border-primary" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="contactPersonName" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Contact Person</FormLabel>
                  <FormControl><Input {...field} className="h-11 border-border focus:border-primary" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <FormField control={form.control} name="contactEmail" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Contact Email</FormLabel>
                  <FormControl><Input {...field} type="email" className="h-11 border-border focus:border-primary" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="contactMobile" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Mobile</FormLabel>
                    <FormControl><Input {...field} className="h-11 border-border focus:border-primary" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="country" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-foreground">Country</FormLabel>
                    <FormControl><Input {...field} className="h-11 border-border focus:border-primary" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>

              <FormField control={form.control} name="companyAddress" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-foreground">Company Address</FormLabel>
                  <FormControl><Input {...field} className="h-11 border-border focus:border-primary" /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />

              <Button type="submit" disabled={saveMutation.isPending} >
                {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EnterpriseProfile() {
  return (
    <EnterprisePortalLayout>
      <ProfileContent />
    </EnterprisePortalLayout>
  );
}
