import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { useState } from 'react';

export function UnlicensedSystemBanner() {
  const [dismissed, setDismissed] = useState(false);

  const { data: user } = useQuery<any>({
    queryKey: ['/api/auth/user'],
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  if (!user?.onpremMode || user?.onpremLicensed || dismissed) {
    return null;
  }

  const systemType = String(user.onpremSystemType || '').trim().toLowerCase();
  const systemTypeLabel =
    systemType === 'qa'
      ? 'QA/Testing'
      : systemType === 'development'
        ? 'Development'
        : systemType === 'production'
          ? 'Production'
          : 'On-prem';
  const isExpired = user.onpremLicenseExpired;
  const statusReason = typeof user.onpremLicenseStatusReason === 'string' ? user.onpremLicenseStatusReason.trim() : '';

  return (
    <div className="bg-warning/10 border-b border-[var(--warning)]/30 px-4 py-2.5">
      <div className="max-w-7xl mx-auto flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-warning dark:text-warning">
            {isExpired ? 'License Expired' : 'Unlicensed System'}
          </p>
          <p className="text-xs text-warning/80 dark:text-warning/80 mt-0.5">
            This {systemTypeLabel} system {isExpired ? 'has an expired license' : 'does not have a valid license'}.
            Limitations: 1 organization, unlimited platform SuperAdmins, 1 customer Super Admin, 5 Org Admins, 5 Instructors, 0 learner users.
            White-labeling is disabled while unlicensed (Brand Editor cannot be maintained).
            {user.isCustSuper && ' Go to License Management to install a license key.'}
          </p>
          {statusReason && (
            <p className="text-xs text-warning dark:text-warning mt-1 font-medium">
              Reason: {statusReason}
            </p>
          )}
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="shrink-0 p-1 text-warning hover:text-warning rounded"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
