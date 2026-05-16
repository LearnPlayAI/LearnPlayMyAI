import { useState } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/queryClient';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function EnterpriseBuildUpload() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [buildMajor, setBuildMajor] = useState('1');
  const [buildMinor, setBuildMinor] = useState('00');
  const [buildSupportPack, setBuildSupportPack] = useState('00');
  const [buildPatchSet, setBuildPatchSet] = useState('01');
  const [buildDate, setBuildDate] = useState('');
  const [buildNotes, setBuildNotes] = useState('');
  const [buildFile, setBuildFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleUploadBuild = async () => {
    if (!buildFile) {
      toast({ title: 'Please select a build file', variant: 'destructive' });
      return;
    }
    if (!buildDate) {
      toast({ title: 'Please set the build date', variant: 'destructive' });
      return;
    }

    const major = buildMajor.replace(/\D/g, '') || '1';
    const minor = buildMinor.replace(/\D/g, '').padStart(2, '0');
    const sp = buildSupportPack.replace(/\D/g, '').padStart(2, '0');
    const ps = buildPatchSet.replace(/\D/g, '').padStart(2, '0');
    const versionNumber = `LearnPlay ${major}.${minor}.${sp}.${ps}`;

    const formData = new FormData();
    formData.append('versionNumber', versionNumber);
    formData.append('releaseNotes', buildNotes);
    formData.append('buildDate', buildDate);
    formData.append('file', buildFile);

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/enterprise/builds/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: errData.error || 'Failed to upload build', variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/builds'] });
      toast({ title: 'Build uploaded successfully' });
      setLocation('/superadmin/enterprise');
    } catch {
      toast({ title: 'Failed to upload build', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <QuizAdminLayout title="Upload Build" description="Upload a new enterprise build version">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setLocation('/superadmin/enterprise')}>Back</Button>
          <Button onClick={handleUploadBuild} disabled={submitting}>
            {submitting ? 'Uploading...' : 'Upload'}
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Build Package</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">Version Number</Label>
              <p className="text-xs text-muted-foreground mb-2">Format: LearnPlay Major.Minor.SupportPack.PatchSet</p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-foreground whitespace-nowrap">LearnPlay</span>
                <Input
                  value={buildMajor}
                  onChange={(e) => setBuildMajor(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="1"
                  className="w-16 text-center"
                />
                <span className="text-lg font-bold">.</span>
                <Input
                  value={buildMinor}
                  onChange={(e) => setBuildMinor(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="00"
                  className="w-16 text-center"
                />
                <span className="text-lg font-bold">.</span>
                <Input
                  value={buildSupportPack}
                  onChange={(e) => setBuildSupportPack(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="00"
                  className="w-16 text-center"
                />
                <span className="text-lg font-bold">.</span>
                <Input
                  value={buildPatchSet}
                  onChange={(e) => setBuildPatchSet(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="01"
                  className="w-16 text-center"
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Preview: LearnPlay {buildMajor || '1'}.{(buildMinor || '00').padStart(2, '0')}.{(buildSupportPack || '00').padStart(2, '0')}.{(buildPatchSet || '01').padStart(2, '0')}
              </p>
            </div>

            <div>
              <Label className="text-sm font-medium">Build Date & Time</Label>
              <Input
                type="datetime-local"
                value={buildDate}
                onChange={(e) => setBuildDate(e.target.value)}
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Release Notes</Label>
              <Textarea
                value={buildNotes}
                onChange={(e) => setBuildNotes(e.target.value)}
                placeholder="Describe what's new in this version..."
                rows={4}
              />
            </div>

            <div>
              <Label className="text-sm font-medium">Build File (.zip)</Label>
              <Input type="file" accept=".zip" onChange={(e) => setBuildFile(e.target.files?.[0] || null)} />
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
