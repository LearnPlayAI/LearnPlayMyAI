import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Package, Calendar, Upload, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';

function formatFileSize(bytes: number) {
  if (!bytes) return '-';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString();
}

function BuildsContent() {
  const { isSuperAdmin } = useEnterpriseAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const canUpload = isSuperAdmin;

  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);
  const [buildMajor, setBuildMajor] = useState('1');
  const [buildMinor, setBuildMinor] = useState('00');
  const [buildSupportPack, setBuildSupportPack] = useState('00');
  const [buildPatchSet, setBuildPatchSet] = useState('01');
  const [buildDate, setBuildDate] = useState('');
  const [buildNotes, setBuildNotes] = useState('');
  const [buildFile, setBuildFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: builds, isLoading } = useQuery({
    queryKey: ['/api/enterprise/builds'],
  });

  const items = (builds as any)?.builds || [];

  const handleDeleteBuild = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/enterprise/builds/${deleteTarget.id}?hardDelete=true`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast({ title: errData.error || 'Failed to delete build', variant: 'destructive' });
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/builds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/builds'] });
      toast({ title: 'Build deleted successfully' });
      setDeleteTarget(null);
    } catch {
      toast({ title: 'Failed to delete build', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

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
    setUploading(true);
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
      queryClient.invalidateQueries({ queryKey: ['/api/enterprise/builds'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/enterprise/builds'] });
      toast({ title: 'Build uploaded successfully' });
      setUploadOpen(false);
      setBuildMajor('1');
      setBuildMinor('00');
      setBuildSupportPack('00');
      setBuildPatchSet('01');
      setBuildDate('');
      setBuildNotes('');
      setBuildFile(null);
    } catch {
      toast({ title: 'Failed to upload build', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Downloads</h1>
          <p className="text-muted-foreground text-sm">Download the latest build versions</p>
        </div>
        {canUpload && (
          <Button onClick={() => setUploadOpen(true)} className="bg-primary hover:bg-primary/90">
            <Plus className="w-4 h-4 mr-2" /> Upload Build
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
            <Package className="w-10 h-10 mx-auto mb-2 text-muted-foreground" />
            <p>No builds available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {items.map((build: any) => (
            <Card key={build.id} className="border-border">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <Package className="w-5 h-5 text-primary" />
                      <h3 className="font-semibold text-foreground text-lg">{build.versionNumber}</h3>
                    </div>
                    {build.releaseNotes && (
                      <p className="text-muted-foreground text-sm mb-3 whitespace-pre-wrap">{build.releaseNotes}</p>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                      {build.buildDate && (
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Built: {formatDate(build.buildDate)}
                        </span>
                      )}
                      {build.createdAt && (
                        <span className="flex items-center gap-1">
                          <Upload className="w-3 h-3" />
                          Uploaded: {formatDate(build.createdAt)}
                        </span>
                      )}
                      {build.fileSize && (
                        <Badge variant="outline" className="text-xs">
                          {formatFileSize(build.fileSize)}
                        </Badge>
                      )}
                      {build.fileName && (
                        <span className="text-muted-foreground">{build.fileName}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button onClick={() => window.open(`/api/enterprise/builds/${build.id}/download`, '_blank')}
                      className="bg-primary hover:bg-primary/90"
                    >
                      <Download className="w-4 h-4 mr-2" /> Download
                    </Button>
                    {isSuperAdmin && (
                      <Button variant="outline" size="icon" onClick={() => setDeleteTarget(build)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {canUpload && (
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Upload New Build</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
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
                <p className="text-xs text-muted-foreground mt-1">Preview: LearnPlay {buildMajor || '1'}.{(buildMinor || '00').padStart(2, '0')}.{(buildSupportPack || '00').padStart(2, '0')}.{(buildPatchSet || '01').padStart(2, '0')}</p>
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
                <Input
                  type="file"
                  accept=".zip"
                  onChange={(e) => setBuildFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
              <Button onClick={handleUploadBuild} disabled={uploading}>
                {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                {uploading ? 'Uploading...' : 'Upload'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {isSuperAdmin && (
        <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete Build</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Are you sure you want to permanently delete <strong>{deleteTarget?.versionNumber}</strong>? This action cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteBuild} disabled={deleting}>
                {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default function EnterpriseBuilds() {
  return (
    <EnterprisePortalLayout>
      <BuildsContent />
    </EnterprisePortalLayout>
  );
}
