import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";
import { useBranding } from "@/contexts/BrandingContext";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { branding } = useBranding();
  const orgName = branding?.orgName || 'LearnPlay';

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-surface-base">
      <Card className="w-full max-w-md mx-4 bg-card border-border" data-testid="card-not-found">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive/80" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="text-title">
              404 - Page Not Found
            </h1>
            <p className="text-muted-foreground text-sm mb-6" data-testid="text-description">
              The page you're looking for doesn't exist or has been moved.
            </p>
            <Button onClick={() => setLocation('/')}
              data-testid="button-home"
            >
              <Home className="h-4 w-4 mr-2" />
              Back to {orgName}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
