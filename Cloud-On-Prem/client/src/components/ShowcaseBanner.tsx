import { Link } from 'wouter';
import { UserPlus, LogIn, Sparkles } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

interface ShowcaseBannerProps {
  currentPath: string;
}

export function ShowcaseBanner({ currentPath }: ShowcaseBannerProps) {
  const returnTo = encodeURIComponent(currentPath);

  return (
    <Alert variant="warning" className="mb-4 shadow-lg" >
      <Sparkles className="h-5 w-5 text-alert-warning-icon" />
      <AlertDescription className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 w-full">
        <span className="text-sm text-alert-warning-foreground font-semibold">
          Create an account to save your progress and unlock all courses
        </span>
        <div className="flex gap-2">
          <Link href={`/register?returnTo=${returnTo}`}>
            <Button size="sm" className="font-bold shadow-md" >
              <UserPlus className="w-4 h-4 mr-1" />
              Register
            </Button>
          </Link>
          <Link href={`/login?returnTo=${returnTo}`}>
            <Button size="sm" className="font-bold border-2" >
              <LogIn className="w-4 h-4 mr-1" />
              Login
            </Button>
          </Link>
        </div>
      </AlertDescription>
    </Alert>
  );
}
