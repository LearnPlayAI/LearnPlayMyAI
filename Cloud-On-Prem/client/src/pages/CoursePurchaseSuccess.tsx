import { useEffect } from 'react';
import { useRoute, useLocation, Link } from 'wouter';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { usePurchaseConfirmation } from '@/hooks/usePurchaseConfirmation';
import { queryClient } from '@/lib/queryClient';

export default function CoursePurchaseSuccess() {
  const [, params] = useRoute('/courses/:id/purchase-success');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const courseId = params?.id;
  
  const urlParams = new URLSearchParams(window.location.search);
  const intentId = urlParams.get('intentId');

  const { confirmation, isLoading, isPending, error } = usePurchaseConfirmation({
    intentId,
    onFulfilled: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/my-courses'] });
      queryClient.invalidateQueries({ queryKey: ['/api/courses', courseId] });
      toast({ 
        title: 'Purchase Successful!', 
        description: 'You now have access to this course.' 
      });
      setTimeout(() => setLocation(`/courses/${courseId}`), 2000);
    },
    maxPollingAttempts: 30,
    pollingInterval: 2000,
  });

  const isFulfilled = confirmation?.fulfilled && confirmation?.status === 'succeeded';
  const hasFailed = confirmation?.status === 'failed' || (error && !isPending);
  const isVerifying = isLoading || isPending || (!isFulfilled && !hasFailed);

  useEffect(() => {
    if (!intentId && !courseId) {
      console.error('[CoursePurchaseSuccess] Missing intentId or courseId');
    }
  }, [intentId, courseId]);

  const getStatus = () => {
    if (!intentId) return 'failed';
    if (isFulfilled) return 'success';
    if (hasFailed) return 'failed';
    return 'verifying';
  };

  const status = getStatus();
  const errorMessage = error?.message || (hasFailed ? 'Payment verification failed. Please try again or contact support.' : '');

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          {status === 'verifying' && (
            <>
              <div className="flex justify-center mb-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" data-testid="icon-verifying" />
              </div>
              <CardTitle data-testid="title-verifying">Verifying Payment</CardTitle>
              <CardDescription data-testid="description-verifying">
                Please wait while we confirm your purchase...
              </CardDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-primary/10 p-3">
                  <CheckCircle className="h-12 w-12 text-primary" data-testid="icon-success" />
                </div>
              </div>
              <CardTitle className="text-2xl" data-testid="title-success">
                Purchase Successful!
              </CardTitle>
              <CardDescription data-testid="description-success">
                Your payment has been confirmed and you now have access to the course.
              </CardDescription>
            </>
          )}

          {status === 'failed' && (
            <>
              <div className="flex justify-center mb-4">
                <div className="rounded-full bg-destructive/10 p-3">
                  <XCircle className="h-12 w-12 text-destructive" data-testid="icon-failed" />
                </div>
              </div>
              <CardTitle className="text-2xl" data-testid="title-failed">
                Payment Verification Failed
              </CardTitle>
              <CardDescription data-testid="description-failed">
                We couldn't verify your payment. Please try again or contact support.
              </CardDescription>
            </>
          )}
        </CardHeader>

        {status === 'failed' && errorMessage && (
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription data-testid="error-message">
                {errorMessage}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}

        {status === 'success' && (
          <CardContent>
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription data-testid="success-message">
                Redirecting you to the course in 2 seconds...
              </AlertDescription>
            </Alert>
          </CardContent>
        )}

        <CardFooter className="flex flex-col gap-2">
          {status === 'success' && (
            <Link href={`/courses/${courseId}`} className="w-full">
              <Button className="w-full" data-testid="button-go-to-course">
                Go to Course Now
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          )}

          {status === 'failed' && (
            <>
              <Link href={`/courses/${courseId}/purchase`} className="w-full">
                <Button className="w-full" data-testid="button-try-again">
                  Try Again
                </Button>
              </Link>
              <Link href={`/courses/${courseId}`} className="w-full">
                <Button variant="outline" className="w-full" data-testid="button-back-to-course">
                  Back to Course
                </Button>
              </Link>
            </>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
