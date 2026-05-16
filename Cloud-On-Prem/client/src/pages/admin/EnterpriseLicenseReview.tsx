import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocation, useRoute } from 'wouter';
import { CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

function statusBadge(status?: string) {
  switch (status) {
    case 'active':
      return <Badge >Active</Badge>;
    case 'pending':
      return <Badge >Pending</Badge>;
    case 'suspended':
      return <Badge >Suspended</Badge>;
    default:
      return <Badge variant="secondary">{status || 'unknown'}</Badge>;
  }
}

export default function EnterpriseLicenseReview() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [, params] = useRoute('/superadmin/enterprise/license-requests/:id/review');
  const licenseRequestId = params?.id;

  const { data: request, isLoading, isError, error } = useQuery<any>({
    queryKey: ['/api/admin/enterprise/license-requests', licenseRequestId],
    queryFn: async () => {
      if (!licenseRequestId) return null;
      const res = await fetch(`/api/admin/enterprise/license-requests/${licenseRequestId}`, { credentials: 'include' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload?.error || 'Failed to load license request');
      }
      return res.json();
    },
    enabled: !!licenseRequestId,
  });

  const [monthlyFee, setMonthlyFee] = useState('');
  const [feeCurrency, setFeeCurrency] = useState('USD');
  const [denyReason, setDenyReason] = useState('');

  const setFeeMutation = useMutation({
    mutationFn: async () => {
      if (!licenseRequestId || !monthlyFee) throw new Error('Missing fee details');
      return apiRequest(`/api/admin/enterprise/license-requests/${licenseRequestId}/set-fee`, {
        method: 'PUT',
        body: JSON.stringify({ monthlyFee: parseFloat(monthlyFee), feeCurrency }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/license-requests'] });
      toast({ title: 'Fee updated successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to update fee', variant: 'destructive' });
    },
  });

  const approveLicenseMutation = useMutation({
    mutationFn: async () => {
      if (!licenseRequestId) throw new Error('Missing license request id');
      return apiRequest(`/api/admin/enterprise/license-requests/${licenseRequestId}/approve`, {
        method: 'PUT',
        body: JSON.stringify({
          monthlyFee: monthlyFee ? parseFloat(monthlyFee) : undefined,
          feeCurrency,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/license-requests'] });
      toast({ title: 'License request approved' });
      setLocation('/superadmin/enterprise');
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to approve license request',
        description: error?.message || 'Unexpected error while approving request',
        variant: 'destructive',
      });
    },
  });

  const denyLicenseMutation = useMutation({
    mutationFn: async () => {
      if (!licenseRequestId || !denyReason) throw new Error('Missing deny reason');
      return apiRequest(`/api/admin/enterprise/license-requests/${licenseRequestId}/deny`, {
        method: 'PUT',
        body: JSON.stringify({ reason: denyReason }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/license-requests'] });
      toast({ title: 'License request denied' });
      setLocation('/superadmin/enterprise');
    },
    onError: () => {
      toast({ title: 'Failed to deny license request', variant: 'destructive' });
    },
  });

  useEffect(() => {
    if (!request) return;
    setMonthlyFee(request.monthlyFee?.toString() || '');
    setFeeCurrency(request.feeCurrency || 'USD');
  }, [request]);

  return (
    <QuizAdminLayout title="Review License Request" description="Review and approve or deny enterprise license request">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation('/superadmin/enterprise')}>Back</Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>License Request</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="text-muted-foreground">Loading license request...</div>
            ) : isError ? (
              <div className="text-destructive">{(error as Error)?.message || 'Failed to load license request.'}</div>
            ) : !request ? (
              <div className="text-muted-foreground">License request not found.</div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Company</Label>
                    <p className="font-medium">{request.customerCompanyName || request.companyName || '—'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">System Type</Label>
                    <p className="font-medium">{request.systemType}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Request Type</Label>
                    <p className="font-medium capitalize">{request.requestType || 'new'}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Hostname</Label>
                    <p className="font-medium">{request.hostname}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Status</Label>
                    <div>{statusBadge(request.status)}</div>
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-muted-foreground text-xs">Hardware Key</Label>
                    <p className="font-mono text-xs break-all">{request.hardwareKey}</p>
                  </div>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <h4 className="font-semibold">Set Fee</h4>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <Label>Monthly Fee</Label>
                      <Input
                        type="number"
                        value={monthlyFee}
                        onChange={(e) => setMonthlyFee(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="w-32">
                      <Label>Currency</Label>
                      <Select value={feeCurrency} onValueChange={setFeeCurrency}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="EUR">EUR</SelectItem>
                          <SelectItem value="USD">USD</SelectItem>
                          <SelectItem value="ZAR">ZAR</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => {
                      if (!monthlyFee) {
                        toast({ title: 'Please enter a monthly fee', variant: 'destructive' });
                        return;
                      }
                      setFeeMutation.mutate();
                    }}
                    disabled={setFeeMutation.isPending}
                  >
                    Save Fee
                  </Button>
                </div>

                <div className="border-t pt-4 space-y-3">
                  <div className="flex gap-2">
                    <Button onClick={() => approveLicenseMutation.mutate()}
                      disabled={approveLicenseMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label>Deny Reason</Label>
                    <Textarea
                      value={denyReason}
                      onChange={(e) => setDenyReason(e.target.value)}
                      placeholder="Reason for denial..."
                      rows={2}
                    />
                    <Button variant="destructive" onClick={() => {
                        if (!denyReason) {
                          toast({ title: 'Please provide a reason for denial', variant: 'destructive' });
                          return;
                        }
                        denyLicenseMutation.mutate();
                      }}
                      disabled={denyLicenseMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Deny
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
