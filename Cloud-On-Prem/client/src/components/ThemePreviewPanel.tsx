import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Palette } from "lucide-react";

interface ThemePreviewPanelProps {
  theme?: {
    id: string;
    name: string;
    description?: string;
    thumbnailUrl?: string;
    categories?: string[];
  } | null;
}

export function ThemePreviewPanel({ theme }: ThemePreviewPanelProps) {
  if (!theme) {
    return (
      <Card className="bg-card border-border lg:sticky lg:top-6 h-fit">
        <CardContent className="p-8">
          <div className="flex flex-col items-center justify-center text-center space-y-3">
            <div className="p-4 bg-muted/50 rounded-full">
              <Palette className="w-8 h-8 text-muted-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground mb-1">No Theme Selected</h3>
              <p className="text-sm text-muted-foreground">
                Select a theme to preview its details
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <Card className="bg-card border-border lg:sticky lg:top-6 h-fit">
      <CardHeader>
        <CardTitle className="text-foreground">Theme Preview</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {theme.thumbnailUrl ? (
          <div className="relative bg-card/50 rounded-lg overflow-hidden">
            <img
              src={theme.thumbnailUrl}
              alt={theme.name}
              className="w-full max-h-[420px] object-contain"
            />
          </div>
        ) : (
          <div className="relative aspect-video bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            <span className="text-5xl font-bold text-muted-foreground">
              {getInitials(theme.name)}
            </span>
          </div>
        )}

        <div className="space-y-3">
          <div>
            <h3 className="font-semibold text-foreground text-lg">
              {theme.name}
            </h3>
            {theme.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {theme.description}
              </p>
            )}
          </div>

          {theme.categories && theme.categories.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">Categories</p>
              <div className="flex flex-wrap gap-2">
                {theme.categories.map((category, idx) => (
                  <Badge key={idx} variant="secondary" className="text-sm" >
                    {category}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
