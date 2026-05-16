import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

export default function EnterpriseCustomerEdit() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/superadmin/enterprise/customer/:id/edit');
  const customerId = params?.id;

  const [form, setForm] = useState({
    companyName: '',
    contactPersonName: '',
    contactEmail: '',
    contactMobile: '',
    companyAddress: '',
    country: '',
    businessRegistrationNumber: '',
    countryCode: '',
    vatNumber: '',
    billingNotes: '',
  });

  const { data: customer, isLoading, isError, error } = useQuery<any>({
    queryKey: ['/api/admin/enterprise/customers', customerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/enterprise/customers/${customerId}`, { credentials: 'include' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load customer details');
      }
      return res.json();
    },
    enabled: !!customerId,
  });

  useEffect(() => {
    if (!customer) return;
    setForm({
      companyName: customer.companyName || '',
      contactPersonName: customer.contactPersonName || customer.contactName || '',
      contactEmail: customer.contactEmail || customer.email || '',
      contactMobile: customer.contactMobile || customer.contactPhone || '',
      companyAddress: customer.companyAddress || '',
      country: customer.country || '',
      businessRegistrationNumber: customer.businessRegistrationNumber || customer.businessProfile?.businessRegistrationNumber || '',
      countryCode: customer.countryCode || customer.businessProfile?.countryCode || '',
      vatNumber: customer.vatNumber || customer.businessProfile?.vatNumber || '',
      billingNotes: customer.billingNotes || customer.businessProfile?.notes || '',
    });
  }, [customer]);

  const updateCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error('Missing customer id');
      return apiRequest(`/api/admin/enterprise/customers/${customerId}`, {
        method: 'PUT',
        body: JSON.stringify(form),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers'] });
      if (customerId) {
        queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers', customerId] });
      }
      toast({ title: 'Customer updated successfully' });
      if (customerId) {
        setLocation(`/superadmin/enterprise/customer/${customerId}`);
      }
    },
    onError: () => {
      toast({ title: 'Failed to update customer', variant: 'destructive' });
    },
  });

  return (
    <QuizAdminLayout
      title={`Edit Customer${customer?.companyName ? `: ${customer.companyName}` : ''}`}
      description="Update enterprise customer information"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {customerId && (
            <Button variant="outline" onClick={() => setLocation(`/superadmin/enterprise/customer/${customerId}`)}>
              Back
            </Button>
          )}
          <Button onClick={() => updateCustomerMutation.mutate()}
            disabled={updateCustomerMutation.isPending || !customerId}
          >
            Save
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-muted-foreground">Loading customer details...</div>
            ) : isError ? (
              <div className="text-destructive">{(error as Error)?.message || 'Failed to load customer details.'}</div>
            ) : !customer ? (
              <div className="text-muted-foreground">Customer not found.</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Company Name</Label>
                  <Input value={form.companyName} onChange={(e) => setForm((p) => ({ ...p, companyName: e.target.value }))} />
                </div>
                <div>
                  <Label>Contact Person</Label>
                  <Input value={form.contactPersonName} onChange={(e) => setForm((p) => ({ ...p, contactPersonName: e.target.value }))} />
                </div>
                <div>
                  <Label>Contact Email</Label>
                  <Input value={form.contactEmail} onChange={(e) => setForm((p) => ({ ...p, contactEmail: e.target.value }))} />
                </div>
                <div>
                  <Label>Contact Mobile</Label>
                  <Input value={form.contactMobile} onChange={(e) => setForm((p) => ({ ...p, contactMobile: e.target.value }))} />
                </div>
                <div>
                  <Label>Company Address</Label>
                  <Textarea value={form.companyAddress} onChange={(e) => setForm((p) => ({ ...p, companyAddress: e.target.value }))} />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input value={form.country} onChange={(e) => setForm((p) => ({ ...p, country: e.target.value }))} />
                </div>
                <div>
                  <Label>Business Registration Number</Label>
                  <Input
                    value={form.businessRegistrationNumber}
                    onChange={(e) => setForm((p) => ({ ...p, businessRegistrationNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Country Code</Label>
                  <Input value={form.countryCode} onChange={(e) => setForm((p) => ({ ...p, countryCode: e.target.value }))} />
                </div>
                <div>
                  <Label>VAT Number</Label>
                  <Input value={form.vatNumber} onChange={(e) => setForm((p) => ({ ...p, vatNumber: e.target.value }))} />
                </div>
                <div>
                  <Label>Additional Notes</Label>
                  <Textarea value={form.billingNotes} onChange={(e) => setForm((p) => ({ ...p, billingNotes: e.target.value }))} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
