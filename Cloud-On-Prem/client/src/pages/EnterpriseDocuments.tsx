import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Upload, Download, Trash2, Loader2, FileText, Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';

const documentTypes = [
  { value: 'business_registration', label: 'Business Registration' },
  { value: 'banking_proof', label: 'Banking Proof' },
  { value: 'address_proof', label: 'Address Proof' },
  { value: 'signed_sla', label: 'Signed SLA' },
  { value: 'signed_license_agreement', label: 'Signed License Agreement' },
  { value: 'other', label: 'Other' },
];

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    uploaded: 'bg-primary text-primary-foreground',
    verified: 'bg-success/20 text-success',
    rejected: 'bg-destructive/20 text-destructive',
  };
  return <Badge className={variants[status] || 'bg-muted/40 text-foreground'}>{status}</Badge>;
}

function DocumentsContent() {
  const { isSuperAdmin, hasCustomerSelected } = useEnterpriseAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedType, setSelectedType] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data: documents, isLoading } = useQuery({
    queryKey: ['/api/enterprise/documents'],
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedType) {
      toast({ title: 'Error', description: 'Please select a document type first.', variant: 'destructive' });
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', selectedType);

    try {
      const res = await fetch('/api/enterprise/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Upload failed');
      }
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/documents'] });
      toast({ title: 'Uploaded', description: 'Document uploaded successfully.' });
      setSelectedType('');
    } catch (error: any) {
      toast({ title: 'Upload Failed', description: error.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/enterprise/documents/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/documents'] });
      toast({ title: 'Deleted', description: 'Document removed.' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const items = (documents as any)?.documents || [];

  if (isSuperAdmin && !hasCustomerSelected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Documents</h1>
          <p className="text-muted-foreground text-sm">Upload and manage your company documents</p>
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
        <h1 className="text-2xl font-bold text-foreground">Documents</h1>
        <p className="text-muted-foreground text-sm">Upload and manage your company documents</p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Upload Document</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-full sm:w-64 border-border">
                <SelectValue placeholder="Select document type" />
              </SelectTrigger>
              <SelectContent>
                {documentTypes.map((dt) => (
                  <SelectItem key={dt.value} value={dt.value}>{dt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                className="hidden"
                accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
              />
              <Button onClick={() => fileInputRef.current?.click()}
                disabled={!selectedType || uploading}
                className="bg-primary hover:bg-primary/90"
              >
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? 'Uploading...' : 'Choose File & Upload'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Uploaded Documents</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
              <p>No documents uploaded yet.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((doc: any) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">{doc.fileName || doc.name}</TableCell>
                    <TableCell className="capitalize">{(doc.type || '').replace(/_/g, ' ')}</TableCell>
                    <TableCell><StatusBadge status={doc.status || 'uploaded'} /></TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {doc.createdAt ? new Date(doc.createdAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => window.open(`/api/enterprise/documents/${doc.id}/download`, '_blank')}>
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(doc.id)} className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
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

export default function EnterpriseDocuments() {
  return (
    <EnterprisePortalLayout>
      <DocumentsContent />
    </EnterprisePortalLayout>
  );
}
