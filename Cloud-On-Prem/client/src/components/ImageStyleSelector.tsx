import { useQuery } from "@tanstack/react-query";
import { ImageStyleCard } from "./ImageStyleCard";
import { Skeleton } from "@/components/ui/skeleton";

interface ImageStyleSelectorProps {
  value?: string;
  onChange: (styleKey: string) => void;
}

export function ImageStyleSelector({ value, onChange }: ImageStyleSelectorProps) {
  const { data: imageStylesData, isLoading } = useQuery<{
    styles: Array<{
      id: string;
      styleKey: string;
      displayName: string;
      description?: string;
      thumbnailUrl?: string;
      recommendedUseCases?: string[];
    }>;
  }>({
    queryKey: ["/api/gamma/image-styles"],
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {[...Array(5)].map((_, idx) => (
          <Skeleton key={idx} className="aspect-[4/3] rounded-lg" />
        ))}
      </div>
    );
  }

  const styles = imageStylesData?.styles || [];

  return (
    <div 
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4"
      data-testid="image-style-selector"
    >
      {styles.map((style) => (
        <ImageStyleCard
          key={style.id}
          style={style}
          selected={value === style.styleKey}
          onClick={() => onChange(style.styleKey)}
        />
      ))}
    </div>
  );
}
