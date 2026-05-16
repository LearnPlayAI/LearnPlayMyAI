import { useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function EnterpriseAgreementUpload() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [templateName, setTemplateName] = useState('');
  const [templateType, setTemplateType] = useState('sla');
  const [templateVersion, setTemplateVersion] = useState('');
  const [agreementFile, setAgreementFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleUploadAgreement = async () => {
    if (!templateName || !templateVersion || !agreementFile) {
      toast({ title: 'Please fill all fields and select a file', variant: 'destructive' });
      return;
    }

    const formData = new FormData();
    formData.append('templateName', templateName);
    formData.append('templateType', templateType);
    formData.append('version', templateVersion);
    formData.append('file', agreementFile);

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/enterprise/agreements/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        toast({ title: 'Failed to upload agreement template', variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/agreements'] });
      toast({ title: 'Agreement template uploaded successfully' });
      setLocation('/superadmin/enterprise');
    } catch {
      toast({ title: 'Failed to upload agreement template', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuizAdminLayout title="Upload Agreement Template" description="Add a new agreement template">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation('/superadmin/enterprise')}>Back</Button>
          <Button onClick={handleUploadAgreement} disabled={submitting}>
            {submitting ? 'Uploading...' : 'Upload'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Template Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Template Name</Label>
              <Input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Enterprise SLA v2"
              />
            </div>
            <div>
              <Label>Template Type</Label>
              <Select value={templateType} onValueChange={setTemplateType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sla">SLA</SelectItem>
                  <SelectItem value="license_agreement">License Agreement</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Version</Label>
              <Input
                value={templateVersion}
                onChange={(e) => setTemplateVersion(e.target.value)}
                placeholder="e.g. 1.0"
              />
            </div>
            <div>
              <Label>Template File</Label>
              <Input type="file" onChange={(e) => setAgreementFile(e.target.files?.[0] || null)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
