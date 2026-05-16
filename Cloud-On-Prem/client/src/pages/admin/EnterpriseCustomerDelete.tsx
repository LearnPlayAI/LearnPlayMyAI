import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function EnterpriseCustomerDelete() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/superadmin/enterprise/customer/:id/delete');
  const customerId = params?.id;

  const { data: customer, isLoading } = useQuery<any>({
    queryKey: ['/api/admin/enterprise/customers', customerId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/enterprise/customers/${customerId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load customer details');
      return res.json();
    },
    enabled: !!customerId,
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      if (!customerId) throw new Error('Missing customer id');
      return apiRequest(`/api/admin/enterprise/customers/${customerId}?force=true`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/customers'] });
      toast({ title: 'Customer removed successfully' });
      setLocation('/superadmin/enterprise');
    },
    onError: () => {
      toast({ title: 'Failed to remove customer', variant: 'destructive' });
    },
  });

  return (
    <QuizAdminLayout title="Delete Customer" description="Permanently remove enterprise customer">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => customerId ? setLocation(`/superadmin/enterprise/customer/${customerId}`) : setLocation('/superadmin/enterprise')}>
            Back
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Delete Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <p className="text-muted-foreground">Loading customer details...</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                This will permanently remove <strong>{customer?.companyName || 'this customer'}</strong> and linked enterprise records.
              </p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setLocation('/superadmin/enterprise')}>Cancel</Button>
              <Button variant="destructive" onClick={() => deleteCustomerMutation.mutate()}
                disabled={deleteCustomerMutation.isPending || !customerId}
              >
                {deleteCustomerMutation.isPending ? 'Deleting...' : 'Delete'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
