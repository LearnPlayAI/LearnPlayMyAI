import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useBranding } from '@/contexts/BrandingContext';
import { checkRouteAccess, type UserRole } from '@/lib/protectedRouteAccess';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  redirectTo?: string;
}

export function ProtectedRoute({ 
  children, 
  allowedRoles,
  redirectTo = '/not-authorized'
}: ProtectedRouteProps) {
  const [, setLocation] = useLocation();
  const { 
    isLoading, 
    isAdminLoading,
    isSuperAdmin,
    isCustSuper,
    isOrgAdmin,
    isTeacher,
    isAuthenticated,
    adminCheckFailed,
    runtimeContext,
  } = useAuth();
  const { branding } = useBranding();
  const orgName = branding?.orgName || 'LearnPlay';

  const isFullyLoaded = !isLoading && !isAdminLoading;
  const hasAccess = checkRouteAccess(allowedRoles, {
    runtimeContext,
    isSuperAdmin,
    isCustSuper,
    isOrgAdmin,
    isTeacher,
    isAuthenticated,
  });

  useEffect(() => {
    if (!isFullyLoaded) return;

    if (!isAuthenticated) {
      setLocation('/login');
      return;
    }

    if (adminCheckFailed) {
      setLocation('/login');
      return;
    }

    if (!hasAccess) {
      setLocation(redirectTo);
    }
  }, [isFullyLoaded, isAuthenticated, hasAccess, adminCheckFailed, setLocation, redirectTo]);

  if (!isFullyLoaded) {
    return (
      <div className="min-h-screen bg-surface-base flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-primary/70 text-lg">Loading {orgName}...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || adminCheckFailed || !hasAccess) {
    return null;
  }

  return <>{children}</>;
}

export default ProtectedRoute;
