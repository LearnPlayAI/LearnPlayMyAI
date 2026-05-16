import { Link } from 'wouter';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  buildReturnParams,
  getCourseReturnParams,
  resolveCourseBackTarget,
  sanitizeInternalReturnPath,
} from '@/lib/courseBackNavigation';

interface CourseBackLinkProps {
  className?: string;
  showBreadcrumb?: boolean;
  courseTitle?: string;
}

export function CourseBackLink({ className = '', showBreadcrumb = false, courseTitle }: CourseBackLinkProps) {
  const { backUrl, courseName } = resolveCourseBackTarget(window.location.search, courseTitle);
  if (!backUrl) {
    return null;
  }

  if (showBreadcrumb && courseName) {
    return (
      <nav className={`flex items-center gap-2 text-sm text-muted-foreground ${className}`}>
        <Link href={backUrl} className="hover:text-foreground cursor-pointer transition-colors">
          <span className="hover:text-foreground cursor-pointer transition-colors">
            Course Lessons
          </span>
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-foreground font-medium truncate max-w-[200px]" title={courseName}>
          {courseName}
        </span>
      </nav>
    );
  }

  return (
    <Button asChild variant="ghost" size="sm" className={`gap-2 ${className}`}>
      <Link href={backUrl}>
        <ArrowLeft className="h-4 w-4" />
        Back to Course
      </Link>
    </Button>
  );
}

export function useCourseReturnParams() {
  return getCourseReturnParams(typeof window !== 'undefined' ? window.location.search : '');
}
export { sanitizeInternalReturnPath, resolveCourseBackTarget, buildReturnParams };
