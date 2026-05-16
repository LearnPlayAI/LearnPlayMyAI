import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { XCircle, AlertCircle } from 'lucide-react';

interface UserWithJoinRequest {
  joinRequestStatus?: string;
  joinRequestMessage?: string;
}

export function JoinRequestDeniedModal() {
  const [open, setOpen] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  // Fetch user data which includes join request status
  const { data: user } = useQuery<UserWithJoinRequest>({
    queryKey: ['/api/auth/user'],
    retry: false,
  });

  const status = user?.joinRequestStatus;
  const message = user?.joinRequestMessage;

  useEffect(() => {
    // Show modal only once per session when user has a denied request
    if (status === 'denied' && !hasShown && user) {
      setOpen(true);
      setHasShown(true);
    }
  }, [status, hasShown, user]);

  const handleClose = () => {
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md" data-testid="modal-join-request-denied">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-destructive/10 rounded-full">
              <XCircle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-xl">Join Request Denied</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Your request to join the organization has been denied by an administrator.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {message && (
            <Alert >
              <AlertCircle className="h-4 w-4 text-warning" />
              <AlertDescription className="ml-2 text-warning">
                <div className="font-semibold mb-1">Reason from Administrator:</div>
                <div className="text-sm italic">"{message}"</div>
              </AlertDescription>
            </Alert>
          )}

          <div className="bg-muted p-4 rounded-lg">
            <h4 className="font-semibold mb-2 text-sm">What You Can Do:</h4>
            <ul className="text-sm space-y-1 text-muted-foreground">
              <li>• You can still access and play public quizzes</li>
              <li>• Contact your organization administrator if you believe this was a mistake</li>
              <li>• You may submit a new join request if circumstances change</li>
            </ul>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button onClick={handleClose} data-testid="button-close-denied-modal">
              I Understand
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
