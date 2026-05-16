import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { Building2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePlatformMode } from '@/hooks/usePlatformMode';

export default function EnterpriseVerifyEmail() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const { onpremMode } = usePlatformMode();

  useEffect(() => {
    if (onpremMode) {
      setStatus('error');
      setMessage('Enterprise portal is only available in cloud mode.');
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');

    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    fetch(`/api/enterprise/auth/verify-email?token=${encodeURIComponent(token)}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus('success');
          setMessage(data.message || 'Your email has been verified successfully.');
        } else {
          setStatus('error');
          setMessage(data.message || 'Verification failed. The token may be invalid or expired.');
        }
      })
      .catch(() => {
        setStatus('error');
        setMessage('An error occurred during verification. Please try again.');
      });
  }, []);

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="shadow-xl border-border">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 mx-auto mb-4 bg-primary rounded-xl flex items-center justify-center">
              <Building2 className="w-8 h-8 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground">Email Verification</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {status === 'loading' && (
              <div className="py-8 flex flex-col items-center gap-3">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">Verifying your email...</p>
              </div>
            )}

            {status === 'success' && (
              <div className="py-6 flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-success/20 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-success" />
                </div>
                <p className="text-success font-medium">{message}</p>
                <Link href="/enterprise/login">
                  <Button className="mt-4">Go to Login</Button>
                </Link>
              </div>
            )}

            {status === 'error' && (
              <div className="py-6 flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-full bg-destructive/20 flex items-center justify-center">
                  <XCircle className="w-8 h-8 text-destructive" />
                </div>
                <p className="text-destructive font-medium">{message}</p>
                <Link href="/enterprise/login">
                  <Button variant="outline" className="mt-4">Back to Login</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
