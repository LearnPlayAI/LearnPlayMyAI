import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';
import { useBranding } from '@/contexts/BrandingContext';
import { Card, CardContent } from '@/components/ui/card';

export function AuthenticatedHome() {
  const [, setLocation] = useLocation();
  const { runtimeContext, isLoading, isAdminLoading } = useAuth();
  const { branding } = useBranding();
  const orgName = branding?.orgName || 'LearnPlay';

  useEffect(() => {
    if (isLoading || isAdminLoading) return;
    setLocation(runtimeContext.landingPath);
  }, [runtimeContext.landingPath, isLoading, isAdminLoading, setLocation]);

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center">
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-center gap-4 pt-6">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-primary/70 text-lg">Loading {orgName}...</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default AuthenticatedHome;
