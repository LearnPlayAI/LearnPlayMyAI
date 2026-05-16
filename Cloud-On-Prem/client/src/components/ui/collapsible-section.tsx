import { type ReactNode, useState } from "react";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface CollapsibleSectionProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  badgeCount?: number;
  badgeLabel?: string;
  testId?: string;
}

export function CollapsibleSection({
  title,
  description,
  icon: Icon,
  defaultOpen = false,
  children,
  className,
  badgeCount,
  badgeLabel,
  testId,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const showBadge = badgeCount !== undefined && badgeCount > 0;

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className={cn(
        "rounded-lg border border-border/50 bg-card/80 backdrop-blur-sm",
        "transition-all duration-200",
        className
      )}
      data-testid={testId || "collapsible-section"}
    >
      <CollapsibleTrigger
        className={cn(
          "flex w-full items-center justify-between gap-4 px-4 py-3",
          "min-h-[44px]",
          "rounded-lg",
          "hover:bg-muted/50 transition-colors duration-200",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
        data-testid={testId ? `${testId}-trigger` : "collapsible-trigger"}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {Icon && (
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
              data-testid={testId ? `${testId}-icon-wrapper` : "collapsible-icon-wrapper"}
            >
              <Icon className="h-4 w-4" data-testid={testId ? `${testId}-icon` : "collapsible-icon"} />
            </div>
          )}
          <div className="text-left min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 
                className="text-sm font-medium text-foreground" 
                data-testid={testId ? `${testId}-title` : "collapsible-title"}
              >
                {title}
              </h3>
              {showBadge && (
                <Badge 
                  className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs px-2 py-0.5 animate-pulse"
                  data-testid={testId ? `${testId}-badge` : "collapsible-badge"}
                >
                  {badgeLabel || `${badgeCount} new`}
                </Badge>
              )}
            </div>
            {description && (
              <p 
                className="text-xs text-muted-foreground mt-0.5" 
                data-testid={testId ? `${testId}-description` : "collapsible-description"}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        <div
          className={cn(
            "flex h-[44px] w-[44px] shrink-0 items-center justify-center",
            "rounded-md transition-colors duration-200",
            "hover:bg-muted/70"
          )}
          data-testid={testId ? `${testId}-toggle-button` : "collapsible-toggle-button"}
        >
          <ChevronDown
            className={cn(
              "h-5 w-5 text-muted-foreground transition-transform duration-200 ease-out",
              isOpen && "rotate-180"
            )}
            data-testid={testId ? `${testId}-chevron` : "collapsible-chevron"}
          />
        </div>
      </CollapsibleTrigger>
      <div
        className={cn(
          "grid transition-all duration-200 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        )}
      >
        <CollapsibleContent
          forceMount
          className="overflow-hidden"
          data-testid={testId ? `${testId}-content` : "collapsible-content"}
        >
          <div className="border-t border-border/50 px-4 py-4">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
