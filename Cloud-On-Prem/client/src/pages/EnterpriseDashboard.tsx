import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, Key, Users, Loader2, Server } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import EnterprisePortalLayout from '@/components/EnterprisePortalLayout';
import { useEnterpriseAuth } from '@/hooks/useEnterpriseAuth';

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, string> = {
    active: 'bg-success/20 text-success border-success/20',
    pending: 'bg-warning/20 text-warning border-[var(--warning)]/20',
    suspended: 'bg-destructive/20 text-destructive border-destructive/20',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${variants[status] || variants.pending}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
}

function DashboardContent() {
  const { isSuperAdmin, hasCustomerSelected } = useEnterpriseAuth();

  const { data: profile, isLoading: profileLoading } = useQuery({
    queryKey: ['/api/enterprise/profile'],
  });

  const { data: licenses, isLoading: licensesLoading } = useQuery({
    queryKey: ['/api/enterprise/licenses'],
  });

  const isLoading = profileLoading || licensesLoading;

  if (isSuperAdmin && !hasCustomerSelected) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Welcome to your enterprise portal</p>
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const profileData = (profile as any)?.customer;
  const licensesData = (licenses as any) || {};
  const licenseRequests = licensesData.licenseRequests || [];
  const activeLicenses = licenseRequests.filter((r: any) => r.status === 'approved').length;
  const subCompanyCount = (profile as any)?.subCompanyCount || 0;
  const documentCount = (profile as any)?.documentCount || 0;
  const systemsCount = (profile as any)?.systemsCount || 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Welcome to your enterprise portal</p>
        </div>
        {profileData?.status && <StatusBadge status={profileData.status} />}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{subCompanyCount}</p>
                <p className="text-xs text-muted-foreground">Sub-Companies</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{documentCount}</p>
                <p className="text-xs text-muted-foreground">Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{licenseRequests.length}</p>
                <p className="text-xs text-muted-foreground">License Requests</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                <Key className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{activeLicenses}</p>
                <p className="text-xs text-muted-foreground">Active Licenses</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{systemsCount}</p>
                <p className="text-xs text-muted-foreground">Systems</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Company Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Company Name</span>
              <p className="font-medium text-foreground">{profileData?.companyName || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Contact Person</span>
              <p className="font-medium text-foreground">{profileData?.contactPersonName || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Contact Email</span>
              <p className="font-medium text-foreground">{profileData?.contactEmail || '-'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Country</span>
              <p className="font-medium text-foreground">{profileData?.country || '-'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-lg text-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No recent activity to display.</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function EnterpriseDashboard() {
  return (
    <EnterprisePortalLayout>
      <DashboardContent />
    </EnterprisePortalLayout>
  );
}
