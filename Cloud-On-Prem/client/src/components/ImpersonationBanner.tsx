import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Building2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, invalidateOrgContextCaches } from '@/lib/queryClient';

export function ImpersonationBanner() {
  const { isImpersonating, impersonatedOrganization, isSuperAdmin, isCustSuper } = useAuth();
  const queryClient = useQueryClient();

  const exitImpersonation = useMutation({
    mutationFn: async () => {
      return apiRequest('/api/superadmin/impersonation', {
        method: 'DELETE',
      });
    },
    onSuccess: async () => {
      // Refresh server-side session context and invalidate all org-scoped caches
      try {
        await apiRequest('/api/auth/refresh-context', { method: 'POST' });
      } catch (error) {
        console.warn('[ImpersonationBanner] Failed to refresh context:', error);
      }
      
      // Invalidate all org-scoped client-side caches
      invalidateOrgContextCaches();
    },
  });

  if (!(isSuperAdmin || isCustSuper) || !isImpersonating || !impersonatedOrganization) {
    return null;
  }

  const orgTypeLabel = impersonatedOrganization.type === 'education' 
    ? 'School' 
    : impersonatedOrganization.type === 'business' 
    ? 'Business' 
    : 'E-Learning';

  return (
    <div 
      className="impersonation-banner sticky top-0 z-50 border-b border-border/70 bg-background/95 px-3 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:px-4"
      data-testid="impersonation-banner"
    >
      <div className="mx-auto flex w-full max-w-[calc(100vw-1.5rem)] justify-end sm:max-w-[calc(100vw-2rem)]">
        <div className="ml-auto flex h-10 min-w-0 items-center gap-2 rounded-full border border-[var(--warning)]/40 bg-warning/10 px-2.5 shadow-elevated sm:max-w-[32rem] sm:px-3">
          <Building2 className="h-4 w-4 shrink-0 text-warning" />
          <span className="min-w-0 truncate text-sm font-medium text-foreground">
            <span className="hidden sm:inline">Impersonating: </span>
            <strong>{impersonatedOrganization.name}</strong>
            <span className="hidden sm:inline"> ({orgTypeLabel})</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => exitImpersonation.mutate()}
            disabled={exitImpersonation.isPending}
            className="h-8 shrink-0 rounded-full border-[var(--warning)]/45 bg-background text-foreground hover:bg-warning/15"
            data-testid="exit-impersonation-button"
          >
            <X className="mr-1 h-3.5 w-3.5" />
            {exitImpersonation.isPending ? 'Exiting...' : 'Exit'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default ImpersonationBanner;
