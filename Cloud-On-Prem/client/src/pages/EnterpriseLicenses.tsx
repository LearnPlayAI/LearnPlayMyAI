import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Upload, Download, Loader2, Key, AlertCircle, Building2, CheckCircle, XCircle, DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';
import { sortEnterpriseLicenseRecords } from '@shared/enterpriseLicenseOrdering';

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    pending: 'bg-warning/20 text-warning',
    approved: 'bg-success/20 text-success',
    denied: 'bg-destructive/20 text-destructive',
  };
  return <Badge className={variants[status] || 'bg-muted/40 text-foreground'}>{status}</Badge>;
}

function LicensesContent() {
  const { isSuperAdmin, hasCustomerSelected } = useEnterpriseAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [systemType, setSystemType] = useState('');
  const [uploading, setUploading] = useState(false);

  const [approveTarget, setApproveTarget] = useState<any>(null);
  const [approveMonthlyFee, setApproveMonthlyFee] = useState('');
  const [approveFeeCurrency, setApproveFeeCurrency] = useState('USD');
  const [approving, setApproving] = useState(false);

  const [denyTarget, setDenyTarget] = useState<any>(null);
  const [denyReason, setDenyReason] = useState('');
  const [denying, setDenying] = useState(false);

  const { data: licenses, isLoading } = useQuery({
    queryKey: ['/api/enterprise/licenses'],
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !systemType) {
      toast({ title: 'Error', description: 'Please select a system type first.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('systemType', systemType);

    try {
      const res = await fetch('/api/enterprise/licenses/upload-request', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || err.message || 'Upload failed');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/licenses'] });
      toast({
        title: 'Uploaded',
        description: systemType === 'development'
          ? 'Development license auto-approved. You can download the key now.'
          : 'License request submitted successfully.',
      });
      setSystemType('');
    } catch (error: any) {
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApprove = async () => {
    if (!approveTarget) return;
    if (!approveMonthlyFee || !approveFeeCurrency) {
      toast({ title: 'Please set monthly fee and currency', variant: 'destructive' });
      return;
    }
    setApproving(true);
    try {
      const res = await fetch(`/api/admin/enterprise/license-requests/${approveTarget.id}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ monthlyFee: approveMonthlyFee, feeCurrency: approveFeeCurrency }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to approve', variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/licenses'] });
      toast({ title: 'License request approved successfully' });
      setApproveTarget(null);
      setApproveMonthlyFee('');
      setApproveFeeCurrency('USD');
    } catch {
      toast({ title: 'Failed to approve license request', variant: 'destructive' });
    } finally {
      setApproving(false);
    }
  };

  const handleDeny = async () => {
    if (!denyTarget) return;
    setDenying(true);
    try {
      const res = await fetch(`/api/admin/enterprise/license-requests/${denyTarget.id}/deny`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: denyReason }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to deny', variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/licenses'] });
      toast({ title: 'License request denied' });
      setDenyTarget(null);
      setDenyReason('');
    } catch {
      toast({ title: 'Failed to deny license request', variant: 'destructive' });
    } finally {
      setDenying(false);
    }
  };

  const licensesData = (licenses as any) || {};
  const requests = sortEnterpriseLicenseRecords(licensesData.licenseRequests || []);
  const licenseKeyMap = new Map((licensesData.licenseKeys || []).map((k: any) => [k.licenseRequestId, k]));

  if (isSuperAdmin && !hasCustomerSelected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">License Management</h1>
          <p className="text-muted-foreground text-sm">Upload license requests and manage your licenses</p>
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">License Management</h1>
        <p className="text-muted-foreground text-sm">Upload license requests and manage your licenses</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Upload License Request</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={systemType} onValueChange={setSystemType}>
              <SelectTrigger className="w-full sm:w-48 border-border">
                <SelectValue placeholder="System type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="development">Development</SelectItem>
                <SelectItem value="qa">QA/Testing</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                className="hidden"
                accept=".lic,.txt,.key,.req,.lreq"
              />
              <Button onClick={() => fileInputRef.current?.click()}
                disabled={!systemType || uploading}
                className="bg-primary hover:bg-primary/90"
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? 'Uploading...' : 'Upload Request File'}
              </Button>
            </div>
          </div>
          {systemType === 'development' && (
            <p className="text-xs text-success mt-2">Development licenses are auto-approved instantly.</p>
          )}
          {systemType === 'qa' && (
            <p className="text-xs text-warning mt-2">QA/Testing licenses require approval before key download.</p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">License Requests</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Key className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
              <p>No license requests yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>System Type</TableHead>
                  <TableHead>Hostname</TableHead>
                  <TableHead>Hardware Key</TableHead>
                  <TableHead>Monthly Fee</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>License Start</TableHead>
                  <TableHead>License Expiry</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req: any) => (
                  <TableRow key={req.id}>
                    <TableCell className="capitalize">{req.systemType}</TableCell>
                    <TableCell className="font-mono text-sm">{req.hostname || '-'}</TableCell>
                    <TableCell className="font-mono text-sm truncate max-w-[120px]">{req.hardwareKey || '-'}</TableCell>
                    <TableCell>{req.monthlyFee ? `${req.feeCurrency || '$'} ${req.monthlyFee}` : '-'}</TableCell>
                    <TableCell>
                      <StatusBadge status={req.status} />
                      {req.status === 'denied' && req.denialReason && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                          <AlertCircle className="w-3 h-3" />
                          {req.denialReason}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const key = licenseKeyMap.get(req.id) as any;
                        return req.status === 'approved' && key?.issuedAt
                          ? new Date(key.issuedAt).toLocaleDateString()
                          : '-';
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const key = licenseKeyMap.get(req.id) as any;
                        return req.status === 'approved' && key?.expiresAt
                          ? new Date(key.expiresAt).toLocaleDateString()
                          : '-';
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {req.status === 'approved' && req.licenseKeyId && (
                          <Button variant="outline" size="sm" onClick={() => window.open(`/api/enterprise/licenses/keys/${req.licenseKeyId}/download`, '_blank')}
                          >
                            <Download className="w-4 h-4 mr-1" /> Key
                          </Button>
                        )}
                        {isSuperAdmin && req.status === 'pending' && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => {
                                setApproveTarget(req);
                                setApproveMonthlyFee(req.monthlyFee || '');
                                setApproveFeeCurrency(req.feeCurrency || 'USD');
                              }}
                              className="text-success hover:text-success hover:bg-success/10 border-success/20"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" /> Approve
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => setDenyTarget(req)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                            >
                              <XCircle className="w-4 h-4 mr-1" /> Deny
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!approveTarget} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve License Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Approve the <strong>{approveTarget?.systemType}</strong> license for <strong>{approveTarget?.hostname || 'unknown host'}</strong>.
            </p>
            <div>
              <Label className="text-sm font-medium">Monthly Fee</Label>
              <div className="flex gap-2 mt-1">
                <Select value={approveFeeCurrency} onValueChange={setApproveFeeCurrency}>
                  <SelectTrigger className="w-24 border-border">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="GBP">GBP</SelectItem>
                    <SelectItem value="ZAR">ZAR</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={approveMonthlyFee}
                  onChange={(e) => setApproveMonthlyFee(e.target.value)}
                  placeholder="0.00"
                  className="flex-1"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveTarget(null)}>Cancel</Button>
            <Button onClick={handleApprove} disabled={approving} >
              {approving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
              {approving ? 'Approving...' : 'Approve'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!denyTarget} onOpenChange={(open) => !open && setDenyTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Deny License Request</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Deny the <strong>{denyTarget?.systemType}</strong> license for <strong>{denyTarget?.hostname || 'unknown host'}</strong>.
            </p>
            <div>
              <Label className="text-sm font-medium">Reason (optional)</Label>
              <Textarea
                value={denyReason}
                onChange={(e) => setDenyReason(e.target.value)}
                placeholder="Explain why this request is being denied..."
                rows={3}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDenyTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeny} disabled={denying}>
              {denying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <XCircle className="w-4 h-4 mr-2" />}
              {denying ? 'Denying...' : 'Deny'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function EnterpriseLicenses() {
  return (
    <EnterprisePortalLayout>
      <LicensesContent />
    </EnterprisePortalLayout>
  );
}
