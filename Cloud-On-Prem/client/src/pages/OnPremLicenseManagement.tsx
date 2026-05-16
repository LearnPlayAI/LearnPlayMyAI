import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Key, Shield, Server, HardDrive, Copy, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

interface SystemInfo {
  hardwareKey: string;
  hostname: string;
  baseUrl: string;
  systemType: string;
  envSystemType: string | null;
  currentLicense: {
    status: 'active' | 'expired' | 'invalid' | 'none';
    systemType?: string;
    hardwareKey?: string;
    hostname?: string;
    installedDate?: string;
    expiryDate?: string;
    monthlyFee?: string | null;
    feeCurrency?: string | null;
    companyName?: string | null;
    nextRenewalDueAt?: string | null;
  } | null;
  policy?: {
    maxOrganizations: number | null;
    maxPlatformSuperAdmins: number | null;
    maxCustSuperAdmins: number | null;
    maxOrgAdminsPerOrg: number | null;
    maxInstructorsPerOrg: number | null;
    maxLearnersPerOrg: number | null;
  };
  organizationMetrics?: Array<{
    organizationId: string;
    organizationName: string;
    totalUsers: number;
    totalCourses: number;
    totalEnrollments: number;
    totalAssignments: number;
  }>;
  businessProfile?: {
    businessName?: string;
    businessRegistrationNumber?: string;
    businessAddress?: string;
    billingContactName?: string;
    billingContactEmail?: string;
    billingContactPhone?: string;
    countryCode?: string;
    vatNumber?: string;
    notes?: string;
  } | null;
  businessProfileCompleteness?: {
    isComplete: boolean;
    missingFields: string[];
  };
  licenseReissueStatus?: {
    required?: boolean;
    changedFields?: string[];
    message?: string;
    requestId?: string | null;
    requestedAt?: string | null;
  };
  businessProfileLock?: {
    readOnly?: boolean;
    authoritativeSystemType?: string;
    reason?: string;
  };
  enterpriseCustomerId?: string | null;
  remoteLicenseStatus?: {
    status?: string | null;
    reason?: string | null;
    updatedAt?: string | null;
  };
}

export default function OnPremLicenseManagement() {
  const { toast } = useToast();

  const [copied, setCopied] = useState(false);
  const [lastCheckIn, setLastCheckIn] = useState<any>(null);
  const [businessProfile, setBusinessProfile] = useState({
    businessName: '',
    businessRegistrationNumber: '',
    businessAddress: '',
    billingContactName: '',
    billingContactEmail: '',
    billingContactPhone: '',
    countryCode: '',
    vatNumber: '',
    notes: '',
  });
  const [businessProfileSaveStatus, setBusinessProfileSaveStatus] = useState<{
    timestamp: string;
    attempted: boolean;
    success: boolean;
    message: string;
  } | null>(null);

  const { data: systemInfo, isLoading } = useQuery<SystemInfo>({
    queryKey: ['/api/onprem/license/system-info'],
  });

  const isSystemTypeEnforced = !!(systemInfo?.envSystemType && ['development', 'qa', 'production'].includes(systemInfo.envSystemType));

  useEffect(() => {
    if (systemInfo) {
      setBusinessProfile({
        businessName: systemInfo.businessProfile?.businessName || '',
        businessRegistrationNumber: systemInfo.businessProfile?.businessRegistrationNumber || '',
        businessAddress: systemInfo.businessProfile?.businessAddress || '',
        billingContactName: systemInfo.businessProfile?.billingContactName || '',
        billingContactEmail: systemInfo.businessProfile?.billingContactEmail || '',
        billingContactPhone: systemInfo.businessProfile?.billingContactPhone || '',
        countryCode: systemInfo.businessProfile?.countryCode || '',
        vatNumber: systemInfo.businessProfile?.vatNumber || '',
        notes: systemInfo.businessProfile?.notes || '',
      });
    }
  }, [systemInfo]);

  const saveBusinessProfileMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/onprem/license/business-profile', {
        method: 'PUT',
        body: JSON.stringify(businessProfile),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onprem/license/system-info'] });
      const syncMessage = data?.cloudSync?.message || 'Profile saved.';
      const attempted = data?.cloudSync?.attempted === true;
      const success = data?.cloudSync?.success === true;
      setBusinessProfileSaveStatus({
        timestamp: new Date().toISOString(),
        attempted,
        success,
        message: syncMessage,
      });
      toast({
        title: 'Business profile saved',
        description: attempted
          ? (success ? `Cloud PRD sync succeeded. ${syncMessage}` : `Cloud PRD sync failed. ${syncMessage}`)
          : `Cloud PRD sync skipped. ${syncMessage}`,
        variant: attempted && !success ? 'destructive' : 'default',
      });
      if (!data?.reissueRequired && data?.completeness?.isComplete) {
        checkInMutation.mutate();
      }
    },
    onError: (error: any) => {
      toast({ title: 'Failed to save business profile', description: error?.message || 'An error occurred', variant: 'destructive' });
    },
  });

  const checkInMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<any>('/api/onprem/license/check-in', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: (data) => {
      setLastCheckIn(data);
      queryClient.invalidateQueries({ queryKey: ['/api/onprem/license/system-info'] });
      queryClient.refetchQueries({ queryKey: ['/api/auth/user'], type: 'active' });
      const renewed = data?.importedRenewal === true;
      toast({
        title: renewed ? 'Cloud check-in complete (renewal installed)' : 'Cloud check-in complete',
        description: renewed
          ? 'A new monthly license was issued by cloud control plane and auto-installed.'
          : 'License status and telemetry were synced to cloud control plane.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Cloud check-in failed',
        description: error?.message || 'Could not sync with cloud enterprise portal',
        variant: 'destructive',
      });
    },
  });

  const requestReissueMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest<any>('/api/onprem/license/request-reissue', {
        method: 'POST',
        body: JSON.stringify({}),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/onprem/license/system-info'] });
      toast({
        title: 'Reissue request submitted',
        description: data?.message || 'Cloud PRD received the replacement request. SuperAdmin approval is required.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Failed to submit reissue request',
        description: error?.message || 'Could not send replacement request to cloud PRD.',
        variant: 'destructive',
      });
    },
  });

  const handleCopyHardwareKey = async () => {
    if (!systemInfo?.hardwareKey) return;
    try {
      await navigator.clipboard.writeText(systemInfo.hardwareKey);
      setCopied(true);
      toast({ title: 'Copied to clipboard' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: 'Failed to copy', variant: 'destructive' });
    }
  };

  const license = systemInfo?.currentLicense;
  const licenseStatus = license?.status || 'none';
  const profileCompleteness = systemInfo?.businessProfileCompleteness;
  const reissueRequired = !!systemInfo?.licenseReissueStatus?.required;
  const profileLocked = !!systemInfo?.businessProfileLock?.readOnly;
  const remoteStatus = systemInfo?.remoteLicenseStatus?.status || null;
  const remoteReason = systemInfo?.remoteLicenseStatus?.reason || null;

  const getLicenseStatusBadge = () => {
    switch (licenseStatus) {
      case 'active':
        return <Badge className="gap-1"><CheckCircle className="h-3 w-3" /> Active</Badge>;
      case 'expired':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Expired</Badge>;
      case 'invalid':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Invalid</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" /> No License</Badge>;
    }
  };

  const getLicenseMessage = () => {
    const effectiveType = license?.systemType || systemInfo?.envSystemType || systemInfo?.systemType || 'unknown';
    const isNonProd = effectiveType === 'development' || effectiveType === 'qa';
    const typeLabel = effectiveType === 'qa'
      ? 'QA/Testing'
      : effectiveType === 'development'
        ? 'Development'
        : effectiveType === 'production'
          ? 'Production'
          : 'Unknown';

    switch (licenseStatus) {
      case 'active':
        return (
          <div className="flex items-center gap-2 text-success">
            <CheckCircle className="h-4 w-4" />
            <span>
              License active until {license?.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'N/A'}.
              {isNonProd
                ? ` ${typeLabel} policy applies: learner users are disabled.`
                : ' Production-mode policy applies: learner registration is enabled.'}
            </span>
          </div>
        );
      case 'expired':
        return (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <span>
              License expired on {license?.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'N/A'}.
              {' System limited to: 1 org, unlimited platform SuperAdmins, 1 customer Super Admin, 5 Org Admins, 5 Instructors, and 0 learners.'}
            </span>
          </div>
        );
      case 'invalid':
        return (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-4 w-4" />
            <span>
              Installed license is invalid (signature, tamper, or lifetime validation failed).
              {' System limited to: 1 org, unlimited platform SuperAdmins, 1 customer Super Admin, 5 Org Admins, 5 Instructors, and 0 learners.'}
            </span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4" />
            <span>
              {isNonProd
                ? 'No license installed. Limits apply: 1 organization, unlimited platform SuperAdmins, 1 customer Super Admin, 5 Org Admins, 5 Instructors, 0 learners.'
                : effectiveType === 'unknown'
                  ? 'No license installed and system type is unresolved. Configure SYSTEM_TYPE and re-run check-in.'
                  : 'No license installed. Limits apply: 1 organization, unlimited platform SuperAdmins, 1 customer Super Admin, 5 Org Admins, 5 Instructors, 0 learners.'}
            </span>
          </div>
        );
    }
  };

  if (isLoading) {
    return (
      <QuizAdminLayout title="License Management" description="Manage on-premises license" activeSection="license-management">
        <div className="space-y-[var(--space-lg)] max-w-4xl">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="bg-card/50 border-border">
              <CardHeader className="p-[var(--card-padding)]">
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-64 mt-2" />
              </CardHeader>
              <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="License Management" description="Manage on-premises license" activeSection="license-management">
      <div className="space-y-[var(--space-lg)] max-w-4xl">

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-sm)]">
              <div className="p-2 bg-primary/20 rounded-lg">
                <HardDrive className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-foreground text-[length:var(--text-lg)]">System Information & Hardware Key</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">Your system's unique hardware identifier</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/30 p-3">
              <div>
                <p className="text-sm font-medium">Monthly Cloud Check-In</p>
                <p className="text-xs text-muted-foreground">
                  Sync this on-prem system with cloud PRD, upload daily telemetry, and auto-install renewal keys when available.
                </p>
              </div>
              <Button onClick={() => checkInMutation.mutate()}
                disabled={checkInMutation.isPending || reissueRequired}
                className="gap-2"
              >
                {checkInMutation.isPending ? (
                  <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                ) : (
                  <Server className="h-4 w-4" />
                )}
                Check In Now
              </Button>
            </div>

            {!!profileCompleteness && !profileCompleteness.isComplete && (
              <div className="rounded-lg border border-[var(--warning)]/30 bg-warning/10 p-3 text-xs text-warning">
                <p className="font-semibold">Business profile is incomplete</p>
                <p>
                  Complete and save all required fields before cloud license check-in:
                  {' '}
                  {profileCompleteness.missingFields.join(', ')}.
                </p>
              </div>
            )}

            {reissueRequired && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <p className="font-semibold">License reissue required</p>
                <p>
                  Business identity fields changed ({(systemInfo?.licenseReissueStatus?.changedFields || []).join(', ')}).
                  A newly approved license must be issued by cloud SuperAdmin before the next check-in.
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Button variant="destructive" size="sm" onClick={() => requestReissueMutation.mutate()}
                    disabled={requestReissueMutation.isPending}
                  >
                    {requestReissueMutation.isPending ? 'Submitting...' : 'Request New License'}
                  </Button>
                  {systemInfo?.licenseReissueStatus && (
                    <span className="text-xs">
                      {systemInfo.licenseReissueStatus.requestId
                        ? `Request ID: ${systemInfo.licenseReissueStatus.requestId}`
                        : 'No request submitted yet.'}
                    </span>
                  )}
                </div>
              </div>
            )}

            {remoteStatus && remoteStatus !== 'active' && remoteReason && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <p className="font-semibold">Cloud License Status: {String(remoteStatus).toUpperCase()}</p>
                <p>{remoteReason}</p>
              </div>
            )}

            {lastCheckIn && (
              <div className="rounded-lg border border-border bg-background/40 p-3 text-xs space-y-1">
                <p><span className="font-medium">Last check-in:</span> {new Date(lastCheckIn.checkedInAt).toLocaleString()}</p>
                <p><span className="font-medium">Cloud status:</span> {lastCheckIn.controlPlane?.status || 'unknown'}</p>
                <p><span className="font-medium">Days until expiry:</span> {lastCheckIn.localLicense?.daysUntilExpiry ?? 'N/A'}</p>
                {lastCheckIn.importedRenewal && (
                  <p className="text-success font-medium">New monthly renewal license was installed automatically.</p>
                )}
                {lastCheckIn.renewalError && (
                  <p className="text-destructive font-medium">Renewal install warning: {lastCheckIn.renewalError}</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">Hostname</Label>
                <p className="text-foreground font-medium">{systemInfo?.hostname || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">Base URL</Label>
                <p className="text-foreground font-medium">{systemInfo?.baseUrl || 'N/A'}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">System Type</Label>
                <p className="text-foreground font-medium capitalize">{license?.systemType || systemInfo?.envSystemType || systemInfo?.systemType || 'N/A'}</p>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label className="text-[length:var(--text-sm)] text-muted-foreground flex items-center gap-1">
                <Key className="h-3 w-3" /> Hardware Key
              </Label>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-sm font-mono text-foreground break-all select-all">
                  {systemInfo?.hardwareKey || 'Generating...'}
                </code>
                <Button variant="outline" size="sm" onClick={handleCopyHardwareKey} className="min-h-[44px] min-w-[44px] shrink-0" >
                  {copied ? <CheckCircle className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-sm)]">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Server className="w-5 h-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-foreground text-[length:var(--text-lg)]">Automated Renewal Overview</CardTitle>
                <CardDescription className="text-[length:var(--text-sm)]">License requests/imports are automated through monthly cloud check-in</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">License Status</Label>
                <p className="text-foreground font-medium capitalize">{licenseStatus}</p>
              </div>
              <div>
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">Auto-Renew Date</Label>
                <p className="text-foreground font-medium">{license?.nextRenewalDueAt ? new Date(license.nextRenewalDueAt).toLocaleDateString() : (license?.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'N/A')}</p>
              </div>
              <div>
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">Monthly Cost</Label>
                <p className="text-foreground font-medium">{license?.monthlyFee ? `${license.feeCurrency || 'USD'} ${Number(license.monthlyFee).toFixed(2)}` : 'N/A'}</p>
              </div>
              <div>
                <Label className="text-[length:var(--text-sm)] text-muted-foreground">Licensed Business</Label>
                <p className="text-foreground font-medium">{license?.companyName || 'N/A'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <CardTitle className="text-foreground text-[length:var(--text-lg)]">Business Information (Cloud Sync)</CardTitle>
            <CardDescription className="text-[length:var(--text-sm)]">
              This information is sent to cloud PRD enterprise portal during monthly check-ins.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0 space-y-3">
            <div className="rounded-lg border border-border bg-primary/10 p-3 text-xs text-primary">
              <p className="font-semibold">Required before licensing / cloud sync</p>
              <p>
                Complete all business fields and click Save. The system will show whether cloud PRD sync was attempted and whether it succeeded.
              </p>
            </div>
            {profileLocked && (
              <div className="rounded-lg border border-[var(--warning)]/30 bg-warning/10 p-3 text-xs text-warning">
                <p className="font-semibold">Business profile is locked on this track</p>
                <p>
                  This on-prem track is read-only for business information. Maintain updates on the authoritative {String(systemInfo?.businessProfileLock?.authoritativeSystemType || '').toUpperCase()} system.
                </p>
              </div>
            )}

            {businessProfileSaveStatus && (
              <div
                className={`rounded-lg border p-3 text-xs ${businessProfileSaveStatus.attempted
                  ? (businessProfileSaveStatus.success ? 'border-success bg-success/10 text-success' : 'border-destructive/30 bg-destructive/10 text-destructive')
                  : 'border-[var(--warning)]/30 bg-warning/10 text-warning'
                }`}
              >
                <p className="font-semibold">
                  Cloud sync status: {businessProfileSaveStatus.attempted
                    ? (businessProfileSaveStatus.success ? 'Success' : 'Failed')
                    : 'Skipped'}
                </p>
                <p>{businessProfileSaveStatus.message}</p>
                <p className="mt-1 opacity-80">Updated: {new Date(businessProfileSaveStatus.timestamp).toLocaleString()}</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1">
                  Business Name
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>Required. Changing this may require a new approved license.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input disabled={profileLocked} value={businessProfile.businessName} onChange={(e) => setBusinessProfile((p) => ({ ...p, businessName: e.target.value }))} />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  Registration Number
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>Required. Changing this may require a new approved license.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input disabled={profileLocked} value={businessProfile.businessRegistrationNumber} onChange={(e) => setBusinessProfile((p) => ({ ...p, businessRegistrationNumber: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Business Address</Label>
                <Input disabled={profileLocked} value={businessProfile.businessAddress} onChange={(e) => setBusinessProfile((p) => ({ ...p, businessAddress: e.target.value }))} />
              </div>
              <div>
                <Label>Main Contact Person</Label>
                <Input disabled={profileLocked} value={businessProfile.billingContactName} onChange={(e) => setBusinessProfile((p) => ({ ...p, billingContactName: e.target.value }))} />
              </div>
              <div>
                <Label>Main Contact Email</Label>
                <Input disabled={profileLocked} value={businessProfile.billingContactEmail} onChange={(e) => setBusinessProfile((p) => ({ ...p, billingContactEmail: e.target.value }))} />
              </div>
              <div>
                <Label>Country Code</Label>
                <Input disabled={profileLocked} value={businessProfile.countryCode} onChange={(e) => setBusinessProfile((p) => ({ ...p, countryCode: e.target.value }))} placeholder="+27" />
              </div>
              <div>
                <Label>Main Contact Phone</Label>
                <Input disabled={profileLocked} value={businessProfile.billingContactPhone} onChange={(e) => setBusinessProfile((p) => ({ ...p, billingContactPhone: e.target.value }))} />
              </div>
              <div>
                <Label className="flex items-center gap-1">
                  VAT Number
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent>Required. Changing this may require a new approved license.</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <Input disabled={profileLocked} value={businessProfile.vatNumber} onChange={(e) => setBusinessProfile((p) => ({ ...p, vatNumber: e.target.value }))} />
              </div>
              <div className="sm:col-span-2">
                <Label>Additional Notes</Label>
                <Input disabled={profileLocked} value={businessProfile.notes} onChange={(e) => setBusinessProfile((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <Button onClick={() => saveBusinessProfileMutation.mutate()} disabled={saveBusinessProfileMutation.isPending || profileLocked}>
              Save Business Profile
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border">
          <CardHeader className="p-[var(--card-padding)]">
            <div className="flex items-center gap-[var(--space-sm)]">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Shield className="w-5 h-5 text-primary" />
              </div>
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="text-foreground text-[length:var(--text-lg)]">Current License Status</CardTitle>
                  <CardDescription className="text-[length:var(--text-sm)]">Details of your installed license</CardDescription>
                </div>
                {getLicenseStatusBadge()}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-[var(--card-padding)] pt-0 space-y-4">
            {licenseStatus === 'none' ? (
              <div className="space-y-3">
                {getLicenseMessage()}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-[length:var(--text-sm)] text-muted-foreground flex items-center gap-1">
                      <Server className="h-3 w-3" /> System Type
                    </Label>
                    <p className="text-foreground font-medium capitalize">{license?.systemType || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[length:var(--text-sm)] text-muted-foreground flex items-center gap-1">
                      <Key className="h-3 w-3" /> Hardware Key
                    </Label>
                    <p className="text-foreground font-medium font-mono text-sm break-all">{license?.hardwareKey || systemInfo?.hardwareKey || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[length:var(--text-sm)] text-muted-foreground">Hostname</Label>
                    <p className="text-foreground font-medium">{license?.hostname || systemInfo?.hostname || 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[length:var(--text-sm)] text-muted-foreground">Installed Date</Label>
                    <p className="text-foreground font-medium">{license?.installedDate ? new Date(license.installedDate).toLocaleDateString() : 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[length:var(--text-sm)] text-muted-foreground">Expiry Date</Label>
                    <p className="text-foreground font-medium">{license?.expiryDate ? new Date(license.expiryDate).toLocaleDateString() : 'N/A'}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[length:var(--text-sm)] text-muted-foreground">Monthly License Cost</Label>
                    <p className="text-foreground font-medium">{license?.monthlyFee ? `${license.feeCurrency || 'USD'} ${Number(license.monthlyFee).toFixed(2)}` : 'N/A'}</p>
                  </div>
                </div>

                <div className="pt-2 border-t border-border">
                  {getLicenseMessage()}
                </div>

                <div className="pt-2 border-t border-border space-y-2">
                  <Label className="text-[length:var(--text-sm)] text-muted-foreground">Active Limits</Label>
                  <p className="text-sm text-foreground">
                    Organizations: {systemInfo?.policy?.maxOrganizations ?? 'Unlimited'} | Platform SuperAdmins: {systemInfo?.policy?.maxPlatformSuperAdmins ?? 'Unlimited'} | CustSupers: {systemInfo?.policy?.maxCustSuperAdmins ?? 'Unlimited'}
                  </p>
                  <p className="text-sm text-foreground">
                    Org Admins/Org: {systemInfo?.policy?.maxOrgAdminsPerOrg ?? 'Unlimited'} | Instructors/Org: {systemInfo?.policy?.maxInstructorsPerOrg ?? 'Unlimited'} | Learners/Org: {systemInfo?.policy?.maxLearnersPerOrg ?? 'Unlimited'}
                  </p>
                </div>

                <div className="pt-2 border-t border-border space-y-2">
                  <Label className="text-[length:var(--text-sm)] text-muted-foreground">Registered Organization Metrics</Label>
                  {(systemInfo?.organizationMetrics || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No organizations found.</p>
                  ) : (
                    <div className="space-y-2">
                      {(systemInfo?.organizationMetrics || []).map((org) => (
                        <div key={org.organizationId} className="rounded border border-border p-2 text-sm">
                          <p className="font-medium">{org.organizationName}</p>
                          <p>Users: {org.totalUsers} | Courses: {org.totalCourses} | Enrollments: {org.totalEnrollments} | Assignments: {org.totalAssignments}</p>
                        </div>
                      ))}
                      <p className="text-sm font-medium">
                        Totals: Users {(systemInfo?.organizationMetrics || []).reduce((sum, o) => sum + o.totalUsers, 0)} | Courses {(systemInfo?.organizationMetrics || []).reduce((sum, o) => sum + o.totalCourses, 0)} | Enrollments {(systemInfo?.organizationMetrics || []).reduce((sum, o) => sum + o.totalEnrollments, 0)} | Assignments {(systemInfo?.organizationMetrics || []).reduce((sum, o) => sum + o.totalAssignments, 0)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </QuizAdminLayout>
  );
}
