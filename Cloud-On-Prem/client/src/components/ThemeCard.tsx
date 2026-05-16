import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Check } from "lucide-react";

interface ThemeCardProps {
  theme: {
    id: string;
    name: string;
    description?: string;
    thumbnailUrl?: string;
    categories?: string[];
  };
  selected: boolean;
  onClick: () => void;
}

export function ThemeCard({ theme, selected, onClick }: ThemeCardProps) {
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-card-hover overflow-hidden group",
        selected
          ? "border-2 border-primary ring-2 ring-[var(--action-primary)] ring-offset-0 shadow-card-hover shadow-elevated"
          : "border border-border hover:border-primary/50 hover:ring-1 hover:ring-primary/30"
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      data-testid={`theme-card-${theme.id}`}
    >
      <CardContent className="p-0 flex flex-col">
        <div className="relative aspect-video bg-muted/50">
          {theme.thumbnailUrl ? (
            <img
              src={theme.thumbnailUrl}
              alt={theme.name}
              loading="lazy"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-surface-raised">
              <span className="text-5xl font-bold text-muted-foreground">
                {getInitials(theme.name)}
              </span>
            </div>
          )}
          
          {selected && (
            <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg">
              <Check className="h-4 w-4" />
            </div>
          )}
          
          <div className="pointer-events-none absolute inset-0 bg-surface-muted/20 opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        
        <div className="p-3 bg-card/50 border-t border-border/50">
          <h3 className="font-semibold text-foreground text-sm truncate mb-1.5">
            {theme.name}
          </h3>
          {theme.categories && theme.categories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {theme.categories.slice(0, 3).map((category, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs px-1.5 py-0 h-5" >
                  {category}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
