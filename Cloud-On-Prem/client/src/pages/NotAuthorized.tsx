import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldX, Home, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { PremiumHeader } from '@/pages/landing';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/hooks/use-user';
import { useBranding, useBrandingLinks } from '@/contexts/BrandingContext';

export default function NotAuthorized() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isSuperAdmin } = useAuth();
  const { user } = useUser();
  const { branding } = useBranding();
  const { supportEmail } = useBrandingLinks();
  const orgName = branding?.orgName || 'LearnPlay';

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{ isAdmin: boolean; isSuperAdmin: boolean }>({
    queryKey: ['/api/admin/check'],
    retry: false,
    enabled: !!user,
  });

  const isAdmin = adminCheck?.isAdmin || false;

  return (
    <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
      <PremiumHeader 
        isAuthenticated={isAuthenticated} 
        isAdmin={isAdmin} 
        isSuperAdmin={isSuperAdmin} 
        user={user} 
        isAdminLoading={adminLoading} 
      />
      
      <div className="container mx-auto px-4 py-8 pt-32 max-w-2xl relative z-10 flex items-center justify-center min-h-[calc(100vh-8rem)]">
        <Card className="bg-card border-border w-full" data-testid="card-not-authorized">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 w-20 h-20 rounded-full bg-destructive/20 flex items-center justify-center">
              <ShieldX className="h-10 w-10 text-destructive/80" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground" data-testid="text-title">
              Access Denied
            </CardTitle>
            <CardDescription className="text-muted-foreground text-base" data-testid="text-description">
              You don't have permission to access this page. This area is restricted to authorized users only.
            </CardDescription>
          </CardHeader>
          
          <CardContent className="space-y-4 pt-4">
            <div className="bg-muted rounded-lg p-4 border border-border">
              <p className="text-sm text-muted-foreground text-center">
                If you believe you should have access to this page, please contact your organization administrator
                {supportEmail ? (
                  <> or email <a href={`mailto:${supportEmail}`} className="text-primary/80 hover:text-primary underline">{supportEmail}</a></>
                ) : (
                  <> or the {orgName} support team</>
                )}.
              </p>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button className="flex-1" onClick={() => setLocation('/')}
                data-testid="button-home"
              >
                <Home className="h-4 w-4 mr-2" />
                Go Home
              </Button>
            </div>
            
            {!isAuthenticated && (
              <Button variant="ghost" className="w-full" onClick={() => setLocation('/login')}
                data-testid="button-login"
              >
                <LogIn className="h-4 w-4 mr-2" />
                Sign in with a different account
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
