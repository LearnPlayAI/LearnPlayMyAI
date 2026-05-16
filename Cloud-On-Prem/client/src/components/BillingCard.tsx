import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type BillingCardVariant = "default" | "trial" | "budget" | "premium" | "enterprise" | "small" | "standard" | "orange" | "featured";

const variantStyles: Record<BillingCardVariant, string> = {
  default: "bg-card border-border hover:border-primary/50 transition-colors",
  trial: "bg-surface-raised border-primary/40 hover:border-primary/60",
  budget: "bg-surface-raised border-secondary/40 hover:border-secondary/60",
  premium: "bg-surface-raised border-primary/40 hover:border-primary/60",
  enterprise: "bg-surface-raised border-border hover:border-border",
  orange: "bg-warning/30 border-[var(--warning)]/40 hover:border-[var(--warning)]/60",
  small: "bg-surface-raised border-primary/40 hover:border-primary/60",
  standard: "bg-surface-raised border-secondary/40 hover:border-secondary/60",
  featured: "bg-surface-raised border-2 border-primary hover:border-primary/80 shadow-card-hover shadow-elevated",
};

interface BillingCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  headerAction?: React.ReactNode;
  testId?: string;
  variant?: BillingCardVariant;
  badge?: string;
}

export function BillingCard({
  title,
  description,
  children,
  className,
  headerAction,
  testId,
  variant = "default",
  badge,
}: BillingCardProps) {
  return (
    <Card className={cn("w-full relative overflow-hidden transition-all duration-200", variantStyles[variant], className)} data-testid={testId}>
      {badge && (
        <div className="absolute top-4 right-4">
          <Badge variant="secondary" className="border-0">
            {badge}
          </Badge>
        </div>
      )}
      <CardHeader className={badge ? "pr-28" : ""}>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className={variant !== "default" ? "text-[var(--fg-strong)]" : "text-card-foreground"}>{title}</CardTitle>
            {description && (
              <CardDescription className={variant !== "default" ? "text-[var(--fg-muted)]" : "text-muted-foreground"}>
                {description}
              </CardDescription>
            )}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      </CardHeader>
      <CardContent className={variant !== "default" ? "text-[var(--fg-default)]" : "text-card-foreground"}>
        {children}
      </CardContent>
    </Card>
  );
}

interface BillingCardGridProps {
  children: React.ReactNode;
  className?: string;
  columns?: 1 | 2 | 3;
}

export function BillingCardGrid({
  children,
  className,
  columns = 2,
}: BillingCardGridProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  };

  return (
    <div className={cn("grid gap-6", gridCols[columns], className)}>
      {children}
    </div>
  );
}

interface BillingPageHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function BillingPageHeader({
  title,
  description,
  action,
}: BillingPageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2">{description}</p>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
