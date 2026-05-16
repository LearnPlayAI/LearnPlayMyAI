import { useQuery } from '@tanstack/react-query';
import { Download, Loader2, Key, Shield, Info, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';

function StatusBadge({ isActive }: { isActive: boolean }) {
  const status = isActive ? 'Active' : 'Retired';
  const className = isActive ? 'bg-success/20 text-success' : 'bg-muted/40 text-muted-foreground';
  return <Badge className={className}>{status}</Badge>;
}

function KeysContent() {
  const { isSuperAdmin, hasCustomerSelected } = useEnterpriseAuth();
  const { toast } = useToast();

  const { data: keysData, isLoading } = useQuery({
    queryKey: ['/api/enterprise/keys'],
  });

  const keys = (keysData as any)?.keys || [];

  if (isSuperAdmin && !hasCustomerSelected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Encryption Keys</h1>
          <p className="text-muted-foreground text-sm">Manage your encryption keys and download provision bundles</p>
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

  const handleDownloadBundle = async () => {
    try {
      const res = await fetch('/api/enterprise/keys/download', { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Download failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'key-provision-bundle.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Downloaded', description: 'Key provision bundle downloaded successfully.' });
    } catch (error: any) {
      toast({ title: 'Download Failed', description: error.message, variant: 'destructive' });
    }
  };

  const truncateKeyId = (id: string) => {
    if (!id) return '—';
    return id.length > 16 ? id.substring(0, 16) + '...' : id;
  };

  const formatDate = (date: string) => {
    if (!date) return '—';
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Encryption Keys</h1>
          <p className="text-muted-foreground text-sm">Manage your encryption keys and download provision bundles</p>
        </div>
        <Button onClick={handleDownloadBundle} >
          <Download className="w-4 h-4 mr-2" />
          Download Key Bundle
        </Button>
      </div>

      <Card className="border-border bg-primary/10">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-sm text-primary">
              <p className="font-medium mb-1">Disaster Recovery Key Bundle</p>
              <p>These encryption keys are required for disaster recovery (DR) restore operations. Download and store the key provision bundle in a secure offline location. Without these keys, encrypted backups cannot be restored.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            Provisioned Keys
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : keys.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Key className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
              <p>No encryption keys provisioned yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Key ID</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key: any) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium capitalize">{key.purpose}</TableCell>
                    <TableCell className="font-mono text-sm">{truncateKeyId(key.keyId)}</TableCell>
                    <TableCell>{key.keyVersion || 1}</TableCell>
                    <TableCell>
                      <StatusBadge isActive={key.isActive} />
                    </TableCell>
                    <TableCell>{formatDate(key.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function EnterpriseKeys() {
  return (
    <EnterprisePortalLayout>
      <KeysContent />
    </EnterprisePortalLayout>
  );
}
