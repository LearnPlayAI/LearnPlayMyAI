import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({ 
  icon: Icon, 
  title, 
  description, 
  action, 
  className 
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        "py-12 px-6 sm:py-16 sm:px-8",
        "rounded-xl border border-border/50",
        "bg-card",
        "relative overflow-hidden",
        className
      )}
      data-testid="empty-state-container"
    >
      <div 
        className="absolute inset-0 bg-primary/5 pointer-events-none"
        aria-hidden="true"
      />
      
      <div className="relative z-10 flex flex-col items-center max-w-sm">
        {Icon && (
          <div 
            className={cn(
              "mb-4 p-4 rounded-full",
              "bg-primary/10",
              "border border-border"
            )}
            data-testid="empty-state-icon"
          >
            <Icon 
              className="h-8 w-8 sm:h-10 sm:w-10 text-primary" 
              strokeWidth={1.5}
            />
          </div>
        )}
        
        <h3 
          className="text-lg sm:text-xl font-semibold text-foreground mb-2"
          data-testid="empty-state-title"
        >
          {title}
        </h3>
        
        {description && (
          <p 
            className="text-sm sm:text-base text-muted-foreground mb-6 leading-relaxed"
            data-testid="empty-state-description"
          >
            {description}
          </p>
        )}
        
        {action && (
          <Button
            onClick={action.onClick}
            className={cn(
              "bg-primary text-primary-foreground hover:bg-primary/90",
              "hover:from-primary/90",
              "text-primary-foreground font-medium",
              "shadow-elevated shadow-primary/20",
              "transition-all duration-200"
            )}
            data-testid="empty-state-action"
          >
            {action.label}
          </Button>
        )}
      </div>
    </div>
  );
}
