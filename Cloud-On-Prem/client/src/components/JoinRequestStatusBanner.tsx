import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, XCircle, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface UserWithJoinRequest {
  joinRequestStatus?: string;
  joinRequestMessage?: string;
}

export function JoinRequestStatusBanner() {
  const [dismissed, setDismissed] = useState(false);

  // Fetch user data which includes join request status
  const { data: user } = useQuery<UserWithJoinRequest>({
    queryKey: ['/api/auth/user'],
    retry: false,
    refetchInterval: 30000, // Refetch every 30 seconds to catch status changes
  });

  const status = user?.joinRequestStatus;
  const message = user?.joinRequestMessage;

  // Don't show banner if dismissed or no status
  if (dismissed || !status || status === 'approved') {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
  };

  // Determine styles and icon based on status
  const isPending = status === 'pending';
  const isDenied = status === 'denied';

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-3xl px-4" data-testid="banner-join-request-status">
      <Alert className={` relative shadow-elevated border-2 ${isPending ? 'bg-warning/10 border-[var(--warning)]/50' : ''} ${isDenied ? 'bg-destructive/10 border-[var(--destructive)]/50' : ''} `} >
        <div className="flex items-start gap-3">
          {isPending && <Clock className="h-5 w-5 text-warning mt-0.5" />}
          {isDenied && <XCircle className="h-5 w-5 text-destructive mt-0.5" />}
          
          <div className="flex-1">
            <div className="font-semibold mb-1 text-foreground">
              {isPending && '⏳ Join Request Pending'}
              {isDenied && '❌ Join Request Denied'}
            </div>
            <AlertDescription className={`text-sm ${isPending ? 'text-warning' : 'text-destructive'}`}>
              {message || (isPending 
                ? 'Your join request is under review. You can access public quizzes while waiting for approval.' 
                : 'Your join request was denied. You can only access public quizzes.')}
            </AlertDescription>
          </div>
          
          <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-6 w-6 p-0" data-testid="button-dismiss-banner" >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </Alert>
    </div>
  );
}
