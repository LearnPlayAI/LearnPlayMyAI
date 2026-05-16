import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface LoadingSkeletonProps {
  variant: 'card' | 'table-row' | 'stat' | 'list-item' | 'text' | 'avatar';
  count?: number;
  className?: string;
}

function CardSkeleton({ className }: { className?: string }) {
  return (
    <div 
      className={cn("rounded-lg border bg-card p-4 space-y-3", className)}
      data-testid="skeleton-card"
    >
      <Skeleton className="h-32 w-full rounded-md" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <div className="flex gap-2 pt-2">
        <Skeleton className="h-8 w-20 rounded-md" />
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}

function TableRowSkeleton({ className }: { className?: string }) {
  return (
    <div 
      className={cn("flex items-center gap-4 py-3 px-4 border-b border-border", className)}
      data-testid="skeleton-table-row"
    >
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-3 w-1/4" />
      </div>
      <Skeleton className="h-4 w-16 hidden sm:block" />
      <Skeleton className="h-4 w-20 hidden md:block" />
      <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
    </div>
  );
}

function StatSkeleton({ className }: { className?: string }) {
  return (
    <div 
      className={cn("rounded-lg border bg-card p-4 space-y-2", className)}
      data-testid="skeleton-stat"
    >
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-8 w-24" />
      <Skeleton className="h-3 w-16" />
    </div>
  );
}

function ListItemSkeleton({ className }: { className?: string }) {
  return (
    <div 
      className={cn("flex items-center gap-3 py-2 px-3", className)}
      data-testid="skeleton-list-item"
    >
      <Skeleton className="h-8 w-8 rounded-md flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/2" />
      </div>
      <Skeleton className="h-6 w-6 rounded flex-shrink-0" />
    </div>
  );
}

function TextSkeleton({ className }: { className?: string }) {
  return (
    <div 
      className={cn("space-y-2", className)}
      data-testid="skeleton-text"
    >
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-4/6" />
    </div>
  );
}

function AvatarSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton 
      className={cn("h-10 w-10 rounded-full", className)}
      data-testid="skeleton-avatar"
    />
  );
}

export function LoadingSkeleton({ variant, count = 1, className }: LoadingSkeletonProps) {
  const skeletons = Array.from({ length: count }, (_, index) => {
    const key = `skeleton-${variant}-${index}`;
    
    switch (variant) {
      case 'card':
        return <CardSkeleton key={key} className={className} />;
      case 'table-row':
        return <TableRowSkeleton key={key} className={className} />;
      case 'stat':
        return <StatSkeleton key={key} className={className} />;
      case 'list-item':
        return <ListItemSkeleton key={key} className={className} />;
      case 'text':
        return <TextSkeleton key={key} className={className} />;
      case 'avatar':
        return <AvatarSkeleton key={key} className={className} />;
      default:
        return null;
    }
  });

  if (count === 1) {
    return skeletons[0];
  }

  return (
    <div 
      className={cn(
        "space-y-3",
        variant === 'stat' && "grid grid-cols-2 md:grid-cols-4 gap-4 space-y-0",
        variant === 'card' && "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 space-y-0",
        variant === 'avatar' && "flex gap-2 space-y-0"
      )}
      data-testid="skeleton-container"
    >
      {skeletons}
    </div>
  );
}
