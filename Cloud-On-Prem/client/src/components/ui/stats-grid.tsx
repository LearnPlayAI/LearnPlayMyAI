import { type LucideIcon, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatItem {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  change?: { value: number; type: 'increase' | 'decrease' | 'neutral' };
  href?: string;
}

interface StatsGridProps {
  stats: StatItem[];
  isLoading?: boolean;
  columns?: 2 | 3 | 4 | 'auto';
  className?: string;
}

function StatCardSkeleton() {
  return (
    <Card 
      className="glass-effect p-4 min-w-[140px]"
      data-testid="stat-card-skeleton"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
        <Skeleton className="h-10 w-10 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-24 mt-3" />
    </Card>
  );
}

function ChangeIndicator({ change }: { change: StatItem['change'] }) {
  if (!change) return null;

  const { value, type } = change;
  
  const Icon = type === 'increase' ? TrendingUp : type === 'decrease' ? TrendingDown : Minus;
  
  const colorClasses = {
    increase: 'text-success',
    decrease: 'text-destructive',
    neutral: 'text-muted-foreground'
  };

  const bgClasses = {
    increase: 'bg-success/10',
    decrease: 'bg-destructive/10',
    neutral: 'bg-muted/50'
  };

  return (
    <div 
      className={cn(
        "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full w-fit",
        colorClasses[type],
        bgClasses[type]
      )}
      data-testid="stat-change-indicator"
    >
      <Icon className="h-3 w-3" />
      <span>{type === 'neutral' ? '—' : `${value > 0 ? '+' : ''}${value}%`}</span>
    </div>
  );
}

function StatCard({ stat, index }: { stat: StatItem; index: number }) {
  const IconComponent = stat.icon;
  
  const content = (
    <Card 
      className={cn(
        "bg-surface-raised shadow-card p-4 min-w-[140px] transition-all duration-300",
        "hover:border-border hover:shadow-card-hover",
        stat.href && "cursor-pointer hover:scale-[1.02]"
      )}
      data-testid={`stat-card-${index}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p 
            className="text-sm text-stats-label truncate"
            data-testid={`stat-label-${index}`}
          >
            {stat.label}
          </p>
          <p 
            className="text-2xl font-bold text-stats-number mt-1 truncate"
            data-testid={`stat-value-${index}`}
          >
            {stat.value}
          </p>
        </div>
        
        {IconComponent && (
          <div 
            className="flex-shrink-0 p-2.5 rounded-lg bg-primary/20 border border-border"
            data-testid={`stat-icon-${index}`}
          >
            <IconComponent className="h-5 w-5 text-primary" />
          </div>
        )}
      </div>
      
      {stat.change && (
        <div className="mt-3">
          <ChangeIndicator change={stat.change} />
        </div>
      )}
    </Card>
  );

  if (stat.href) {
    return (
      <Link href={stat.href} data-testid={`stat-link-${index}`}>
        {content}
      </Link>
    );
  }

  return content;
}

export function StatsGrid({ 
  stats, 
  isLoading = false, 
  columns = 'auto',
  className 
}: StatsGridProps) {
  const gridClasses = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    'auto': 'grid-cols-[repeat(auto-fit,minmax(min(100%,160px),1fr))]'
  };

  if (isLoading) {
    return (
      <div 
        className={cn(
          "grid gap-4",
          gridClasses[columns],
          "overflow-x-auto scrollbar-hide",
          className
        )}
        data-testid="stats-grid-loading"
      >
        {Array.from({ length: columns === 'auto' ? 4 : columns }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "grid gap-4",
        gridClasses[columns],
        "overflow-x-auto scrollbar-hide pb-1",
        className
      )}
      data-testid="stats-grid"
    >
      {stats.map((stat, index) => (
        <StatCard key={index} stat={stat} index={index} />
      ))}
    </div>
  );
}

export type { StatItem, StatsGridProps };
