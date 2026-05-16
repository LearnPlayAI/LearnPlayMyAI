import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, ScrollText, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';

function AgreementsContent() {
  const { isSuperAdmin } = useEnterpriseAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateType, setTemplateType] = useState('sla');
  const [templateVersion, setTemplateVersion] = useState('1.0');
  const [templateFile, setTemplateFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: agreements, isLoading } = useQuery({
    queryKey: ['/api/enterprise/agreements'],
  });

  const items = (agreements as any)?.agreements || [];

  const handleUpload = async () => {
    if (!templateName || !templateFile) {
      toast({ title: 'Please fill all fields and select a file', variant: 'destructive' });
      return;
    }
    setUploading(true);
    const formData = new FormData();
    formData.append('templateName', templateName);
    formData.append('templateType', templateType);
    formData.append('version', templateVersion);
    formData.append('file', templateFile);
    try {
      const res = await fetch('/api/admin/enterprise/agreements/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast({ title: err.error || 'Failed to upload agreement', variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/agreements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/agreements'] });
      toast({ title: 'Agreement template uploaded successfully' });
      setUploadOpen(false);
      setTemplateName('');
      setTemplateType('sla');
      setTemplateVersion('1.0');
      setTemplateFile(null);
    } catch {
      toast({ title: 'Failed to upload agreement template', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Agreements</h1>
          <p className="text-muted-foreground text-sm">View and download agreement templates</p>
        </div>
        {isSuperAdmin && (
          <Button onClick={() => setUploadOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> Upload Template
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card className="border-border">
          <CardContent className="text-center py-12 text-muted-foreground">
            <ScrollText className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <p>No agreement templates available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {items.map((agreement: any) => (
            <Card key={agreement.id} className="border-border">
              <CardContent className="p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <ScrollText className="w-5 h-5 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-medium text-foreground truncate">{agreement.name || agreement.title}</h3>
                      {agreement.description && (
                        <p className="text-sm text-muted-foreground mt-0.5">{agreement.description}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => window.open(`/api/enterprise/agreements/${agreement.id}/download`, '_blank')}
                    className="shrink-0"
                  >
                    <Download className="w-4 h-4 mr-1" /> Download
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {isSuperAdmin && (
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Upload Agreement Template</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Template Name</Label>
                <Input
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Service Level Agreement"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Template Type</Label>
                <Input
                  value={templateType}
                  onChange={(e) => setTemplateType(e.target.value)}
                  placeholder="e.g., sla, license, nda"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">Version</Label>
                <Input
                  value={templateVersion}
                  onChange={(e) => setTemplateVersion(e.target.value)}
                  placeholder="e.g., 1.0"
                />
              </div>
              <div>
                <Label className="text-sm font-medium">File</Label>
                <Input
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={(e) => setTemplateFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function EnterpriseAgreements() {
  return (
    <EnterprisePortalLayout>
      <AgreementsContent />
    </EnterprisePortalLayout>
  );
}
