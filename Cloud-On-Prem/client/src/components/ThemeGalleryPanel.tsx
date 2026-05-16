import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ThemeCard } from "./ThemeCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronDown } from "lucide-react";

interface ThemeGalleryPanelProps {
  value?: string;
  onChange: (themeId: string) => void;
}

const categories = ["All", "Dark", "Light", "Professional", "Colorful"];
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export function ThemeGalleryPanel({ value, onChange }: ThemeGalleryPanelProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [pageSize, setPageSize] = useState(10);
  const [displayLimit, setDisplayLimit] = useState(10);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setDisplayLimit(pageSize);
  }, [debouncedSearch, selectedCategory, pageSize]);

  const { data: themesData, isLoading } = useQuery<{
    themes: Array<{
      id: string;
      name: string;
      description?: string;
      thumbnailUrl?: string;
      categories?: string[];
    }>;
    total: number;
  }>({
    queryKey: [
      "/api/gamma/themes",
      debouncedSearch,
      selectedCategory,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (selectedCategory !== "All") params.append("category", selectedCategory);
      
      const url = `/api/gamma/themes${params.toString() ? `?${params.toString()}` : ""}`;
      const response = await fetch(url, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch themes");
      return response.json();
    },
  });

  const allThemes = themesData?.themes || [];
  const total = themesData?.total || 0;
  const displayedThemes = allThemes.slice(0, displayLimit);
  const hasMore = displayedThemes.length < allThemes.length;

  return (
    <div className="space-y-4" data-testid="theme-gallery-panel">
      <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
        <TabsList className="w-full">
          {categories.map((category) => (
            <TabsTrigger
              key={category}
              value={category}
              className="flex-1"
              data-testid={`category-tab-${category.toLowerCase()}`}
            >
              {category}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Search themes..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 bg-muted/50 border-border text-foreground"
          data-testid="input-search-themes"
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          Showing {displayedThemes.length} of {total} themes
        </span>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-xs">Show:</span>
          <Select 
            value={String(pageSize)} 
            onValueChange={(val) => setPageSize(Number(val))}
          >
            <SelectTrigger 
              className="w-[70px] h-8 bg-muted/50 border-border text-foreground text-xs"
              data-testid="select-page-size"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map(size => (
                <SelectItem 
                  key={size} 
                  value={String(size)}
                  className="text-xs"
                >
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(6)].map((_, idx) => (
            <Skeleton key={idx} className="aspect-video rounded-lg" />
          ))}
        </div>
      ) : displayedThemes.length > 0 ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {displayedThemes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                selected={value === theme.id}
                onClick={() => onChange(theme.id)}
              />
            ))}
          </div>
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button type="button" variant="outline" onClick={() => setDisplayLimit((prev) => prev + pageSize)}
                className="border-border hover:border-primary"
                data-testid="button-load-more-themes"
              >
                <ChevronDown className="mr-2 h-4 w-4" />
                Load More ({allThemes.length - displayedThemes.length} remaining)
              </Button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No themes found</p>
          {debouncedSearch && (
            <p className="text-sm text-muted-foreground mt-1">
              Try adjusting your search or filters
            </p>
          )}
        </div>
      )}
    </div>
  );
}
