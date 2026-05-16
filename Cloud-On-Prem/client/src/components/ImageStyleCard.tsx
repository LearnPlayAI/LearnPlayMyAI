import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Camera, 
  Palette, 
  Sparkles, 
  Building2, 
  Smile,
  Check
} from "lucide-react";

interface ImageStyleCardProps {
  style: {
    styleKey: string;
    displayName: string;
    description?: string;
    thumbnailUrl?: string;
    recommendedUseCases?: string[];
  };
  selected: boolean;
  onClick: () => void;
}

const styleIcons: Record<string, any> = {
  photorealistic: Camera,
  illustrated: Palette,
  minimal: Sparkles,
  corporate: Building2,
  playful: Smile,
};

export function ImageStyleCard({ style, selected, onClick }: ImageStyleCardProps) {
  const Icon = styleIcons[style.styleKey] || Camera;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-card-hover overflow-hidden group border-2",
        selected
          ? "border-primary ring-4 ring-primary/30 shadow-card-hover shadow-elevated"
          : "border-transparent hover:border-border"
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      data-testid={`image-style-card-${style.styleKey}`}
    >
      <CardContent className="p-0">
        <div className="relative aspect-[4/3] bg-muted/50">
          {style.thumbnailUrl ? (
            <img
              src={style.thumbnailUrl}
              alt={style.displayName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Icon className="w-12 h-12 text-muted-foreground" />
            </div>
          )}
          
          {selected && (
            <div className="absolute top-2 right-2 z-10 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-lg ring-1 ring-[var(--action-primary-fg)]/35">
              <Check className="h-3.5 w-3.5" />
              <span>Selected</span>
            </div>
          )}
        </div>
        
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Icon className="w-4 h-4 text-muted-foreground" />
            <h3 className="font-semibold text-foreground text-sm">
              {style.displayName}
            </h3>
          </div>
          
          {style.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {style.description}
            </p>
          )}
          
          {style.recommendedUseCases && style.recommendedUseCases.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {style.recommendedUseCases.slice(0, 3).map((useCase, idx) => (
                <Badge key={idx} variant="outline" className="text-xs px-1.5 py-0 h-5" >
                  {useCase}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
