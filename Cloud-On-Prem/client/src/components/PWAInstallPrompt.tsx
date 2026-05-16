import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Download, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useBranding } from '@/contexts/BrandingContext';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const { branding, isResolved: brandingResolved } = useBranding();
  
  const orgName = branding?.orgName || 'LearnPlay';
  const logoUrl = branding?.logoUrl;
  const faviconUrl = branding?.faviconUrl;

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
      
      // Show our custom install prompt after a brief delay
      setTimeout(() => {
        setShowInstallPrompt(true);
      }, 3000);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setShowInstallPrompt(false);
      console.log('PWA was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // Check if already in standalone mode (already installed)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    } catch (error) {
      console.error('Install prompt error:', error);
    }
  };

  const handleDismiss = () => {
    setShowInstallPrompt(false);
    // Don't show again for this session
    sessionStorage.setItem('pwa-prompt-dismissed', 'true');
  };

  // Don't show if user already dismissed in this session
  useEffect(() => {
    const dismissed = sessionStorage.getItem('pwa-prompt-dismissed');
    if (dismissed) {
      setShowInstallPrompt(false);
    }
  }, []);

  // Show only after branding resolves so anonymous installs use the correct app name and icon.
  if (!isInstallable || !showInstallPrompt || !brandingResolved) {
    return null;
  }
  
  // Get the icon to display (prefer favicon, fallback to logo)
  const displayIcon = faviconUrl || logoUrl;

  return (
    <div 
      className={cn(
        "fixed z-50",
        "left-4 right-4 sm:left-auto sm:right-4 sm:right-6",
        "bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:bottom-4",
        "sm:w-80"
      )} 
      data-testid="pwa-install-prompt"
    >
      <Card className="bg-primary hover:bg-primary/90 border-2 border-primary backdrop-blur-md shadow-dialog">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3 gap-2">
            <div className="flex items-center gap-3 min-w-0">
              {displayIcon ? (
                <img 
                  src={displayIcon} 
                  alt={orgName}
                  className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg object-contain flex-shrink-0 bg-background/50"
                />
              ) : (
                <div className="h-10 w-10 sm:h-8 sm:w-8 rounded-lg bg-surface-base flex items-center justify-center flex-shrink-0">
                  <span className="text-primary-foreground font-bold text-sm">{orgName.charAt(0)}</span>
                </div>
              )}
              <h3 className="text-foreground font-bold text-sm sm:text-sm truncate">Install {orgName}</h3>
            </div>
            <Button variant="ghost" size="sm" onClick={handleDismiss} className={cn( "min-h-[44px] min-w-[44px] sm:h-8 sm:w-8 p-0 flex-shrink-0", "text-muted-foreground hover:text-foreground hover:bg-foreground/10", "flex items-center justify-center" )} data-testid="button-dismiss-install" >
              <X className="h-5 w-5 sm:h-4 sm:w-4" />
            </Button>
          </div>
          
          <p className="text-foreground/90 text-xs sm:text-xs mb-4">
            Get the full {orgName} experience! Install on your device for faster access, offline learning, and push notifications.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={handleInstallClick} className={cn( "flex-1 bg-primary text-primary-foreground hover:bg-primary/90 text-primary-foreground font-bold", "min-h-[48px] sm:min-h-[44px] h-auto sm:h-10", "text-sm" )} data-testid="button-install-app" >
              <Download className="h-4 w-4 sm:h-3 sm:w-3 mr-2 sm:mr-1" />
              Install {orgName}
            </Button>
            <Button variant="outline" onClick={handleDismiss} className={cn( "border-border text-foreground/80 hover:bg-foreground/10", "min-h-[48px] sm:min-h-[44px] h-auto sm:h-10", "text-sm" )} data-testid="button-maybe-later" >
              Maybe Later
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
