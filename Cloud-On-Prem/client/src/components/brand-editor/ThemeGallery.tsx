import { useState, useMemo } from 'react';
import { themePresets, themeCategories, themeTags, type ThemePreset } from '@/config/themePresets';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { getContrastWarnings } from '@/utils/contrast';
import { Search, Eye, Check, Pencil, Plus, X, Sparkles, Palette, ShieldCheck } from 'lucide-react';

interface ThemeGalleryProps {
  activeThemeId?: string;
  customThemeName?: string;
  onPreview: (preset: ThemePreset) => void;
  onActivate: (preset: ThemePreset) => void;
  onEdit: (preset: ThemePreset) => void;
  onEditCustomTheme?: () => void;
  onCreateNew?: () => void;
}

const categories = [
  { id: 'all', label: 'All Themes' },
  ...themeCategories.map(cat => ({ id: cat.id, label: cat.name }))
];

const colorKeywordHues: Record<string, number> = {
  red: 0,
  orange: 28,
  amber: 38,
  yellow: 52,
  lime: 80,
  green: 130,
  emerald: 152,
  teal: 174,
  cyan: 190,
  blue: 215,
  navy: 225,
  indigo: 240,
  violet: 270,
  purple: 285,
  magenta: 315,
  pink: 338,
  rose: 350,
  brown: 25,
  beige: 42,
  gold: 45,
  gray: 0,
  grey: 0,
  black: 0,
  white: 0,
};

function hueDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360;
  return Math.min(diff, 360 - diff);
}

function parseHueFromHsl(value: string | undefined): number | null {
  const text = String(value || '').trim();
  const match = text.match(/hsl[a]?\(\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return Number(match[1]) % 360;
}

function parseHueFromHex(value: string): number | null {
  const hex = value.trim().replace('#', '');
  if (![3, 6].includes(hex.length) || !/^[0-9a-f]+$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.split('').map((ch) => ch + ch).join('') : hex;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let hue = 0;
  if (max === r) hue = ((g - b) / delta) % 6;
  if (max === g) hue = (b - r) / delta + 2;
  if (max === b) hue = (r - g) / delta + 4;
  return Math.round((hue * 60 + 360) % 360);
}

function extractSearchHue(query: string): number | null {
  const normalized = query.toLowerCase().trim();
  const hexMatch = normalized.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
  if (hexMatch) {
    return parseHueFromHex(hexMatch[0]);
  }
  for (const [keyword, hue] of Object.entries(colorKeywordHues)) {
    if (normalized.includes(keyword)) return hue;
  }
  return null;
}

/**
 * Renders a mini visual preview of a theme preset.
 * 
 * BRANDING CONTRACT: The HSL fallback values here are INTENTIONAL defaults used when
 * tokens are missing from the preset data. These neutral gray fallbacks ensure the 
 * preview renders correctly even for incomplete token sets. They do NOT leak into
 * production themes - production themes use buildFullTokens() from themePresets.ts.
 */
function ThemePreviewThumbnail({ tokens }: { tokens: Record<string, string> }) {
  const primary = tokens['--primary'] || 'hsl(0, 0%, 50%)';
  const secondary = tokens['--surface-raised'] || tokens['--card'] || tokens['--secondary'] || 'hsl(0, 0%, 40%)';
  const accent = tokens['--accent'] || 'hsl(0, 0%, 60%)';
  const background = tokens['--background'] || 'hsl(0, 0%, 100%)';
  const card = tokens['--surface-overlay'] || tokens['--card'] || 'hsl(0, 0%, 98%)';
  const foreground = tokens['--foreground'] || 'hsl(0, 0%, 10%)';

  return (
    <div 
      className="w-full aspect-video rounded-t-lg overflow-hidden"
      style={{ backgroundColor: background }}
    >
      <div className="h-full flex flex-col p-2 gap-1">
        <div 
          className="h-3 rounded-sm flex items-center px-1 gap-1"
          style={{ backgroundColor: primary }}
        >
          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: card }} />
          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: card }} />
          <div className="w-1 h-1 rounded-full" style={{ backgroundColor: card }} />
        </div>
        
        <div className="flex-1 flex gap-1">
          <div 
            className="w-1/4 rounded-sm"
            style={{ backgroundColor: secondary }}
          />
          
          <div className="flex-1 flex flex-col gap-1">
            <div 
              className="flex-1 rounded-sm p-1"
              style={{ backgroundColor: card }}
            >
              <div 
                className="w-3/4 h-1 rounded-full mb-1"
                style={{ backgroundColor: foreground, opacity: 0.3 }}
              />
              <div 
                className="w-1/2 h-1 rounded-full"
                style={{ backgroundColor: foreground, opacity: 0.2 }}
              />
            </div>
            
            <div className="flex gap-1">
              <div 
                className="flex-1 h-3 rounded-sm"
                style={{ backgroundColor: accent }}
              />
              <div 
                className="flex-1 h-3 rounded-sm"
                style={{ backgroundColor: primary }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThemeCard({ 
  preset, 
  isActive, 
  hasCriticalContrastIssue,
  onPreview, 
  onActivate, 
  onEdit 
}: { 
  preset: ThemePreset;
  isActive: boolean;
  hasCriticalContrastIssue: boolean;
  onPreview: () => void;
  onActivate: () => void;
  onEdit: () => void;
}) {
  const categoryLabel = themeCategories.find(c => c.id === preset.category)?.name || preset.category;
  
  return (
    <div 
      className={cn(
        "group rounded-lg border-2 bg-card overflow-hidden transition-all hover:shadow-elevated",
        isActive ? "border-primary ring-2 ring-primary/20" : "border-border hover:border-border"
      )}
      data-testid={`theme-card-${preset.id}`}
    >
      <ThemePreviewThumbnail tokens={preset.tokens} />
      
      <div className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-medium text-sm">{preset.name}</h3>
            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
              <Badge variant="secondary" className="text-xs">
                {categoryLabel}
              </Badge>
              {hasCriticalContrastIssue ? (
                <Badge variant="destructive" className="text-xs">Needs review</Badge>
              ) : (
                <Badge className="text-xs">Accessibility ready</Badge>
              )}
            </div>
          </div>
          {isActive && (
            <Badge className="text-xs">
              Active
            </Badge>
          )}
        </div>

        {preset.tags && preset.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary border border-border"
            >
              {preset.paletteFamily}
            </span>
            {preset.tags.slice(0, 3).map(tag => (
              <span 
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
        
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 text-xs min-h-[44px] h-11 sm:h-8 touch-manipulation" onClick={onPreview} data-testid={`button-preview-${preset.id}`} >
            <Eye className="h-3 w-3 mr-1" />
            Preview
          </Button>
          
          {!isActive && (
            <Button variant="outline" size="sm" className="flex-1 text-xs min-h-[44px] h-11 sm:h-8 touch-manipulation" onClick={onActivate} disabled={hasCriticalContrastIssue} data-testid={`button-activate-${preset.id}`} >
              <Check className="h-3 w-3 mr-1" />
              Activate
            </Button>
          )}
          
          <Button variant="default" size="sm" className="flex-1 text-xs min-h-[44px] h-11 sm:h-8 touch-manipulation" onClick={onEdit} data-testid={`button-edit-${preset.id}`} >
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ThemeGallery({
  activeThemeId,
  customThemeName,
  onPreview,
  onActivate,
  onEdit,
  onEditCustomTheme,
  onCreateNew,
}: ThemeGalleryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedTone, setSelectedTone] = useState<'all' | 'light' | 'dark'>('all');
  const [selectedPaletteFamily, setSelectedPaletteFamily] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'recommended' | 'name-asc' | 'name-desc'>('recommended');

  const presetAccessibilityState = useMemo(() => {
    const result = new Map<string, { hasCriticalContrastIssue: boolean }>();
    for (const preset of themePresets) {
      const warnings = getContrastWarnings(preset.tokens);
      result.set(preset.id, {
        hasCriticalContrastIssue: warnings.some((warning) => warning.level === 'error'),
      });
    }
    return result;
  }, []);

  const availableTags = useMemo(() => {
    if (selectedCategory === 'all') {
      return Array.from(new Set(Object.values(themeTags).flat()));
    }
    return themeTags[selectedCategory as keyof typeof themeTags] || [];
  }, [selectedCategory]);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategory('all');
    setSelectedTags([]);
    setSelectedTone('all');
    setSelectedPaletteFamily('all');
  };

  const paletteFamilyOptions = useMemo(() => {
    const filteredByCategory = selectedCategory === 'all'
      ? themePresets
      : themePresets.filter((preset) => preset.category === selectedCategory);
    return Array.from(new Set(filteredByCategory.map((preset) => preset.paletteFamily))).sort((a, b) => a.localeCompare(b));
  }, [selectedCategory]);
  const hasDarkTones = useMemo(
    () => themePresets.some((preset) => preset.tone === 'dark'),
    []
  );

  const filteredPresets = useMemo(() => {
    const searchHue = extractSearchHue(searchQuery);
    const query = searchQuery.toLowerCase().trim();
    const filtered = themePresets
      .filter((preset) => {
        const primaryHue = parseHueFromHsl(preset.tokens['--primary']);
        const secondaryHue = parseHueFromHsl(preset.tokens['--secondary']);
        const accentHue = parseHueFromHsl(preset.tokens['--accent']);
        const colorMatch = searchHue === null
          ? false
          : [primaryHue, secondaryHue, accentHue]
              .filter((value): value is number => value !== null)
              .some((hue) => hueDistance(hue, searchHue) <= 20);
        const textMatch =
          !query ||
          preset.name.toLowerCase().includes(query) ||
          preset.paletteFamily.toLowerCase().includes(query) ||
          preset.category.toLowerCase().includes(query) ||
          preset.tags.some((tag) => tag.toLowerCase().includes(query));
        const matchesSearch = textMatch || colorMatch;
        const matchesCategory = selectedCategory === 'all' || preset.category === selectedCategory;
        const matchesTone = selectedTone === 'all' || preset.tone === selectedTone;
        const matchesPaletteFamily =
          selectedPaletteFamily === 'all' || preset.paletteFamily === selectedPaletteFamily;
        const matchesTags = selectedTags.length === 0 || 
          selectedTags.some(tag => preset.tags?.includes(tag));
        return matchesSearch && matchesCategory && matchesTags && matchesTone && matchesPaletteFamily;
      })
      .sort((a, b) => {
        if (a.id === activeThemeId) return -1;
        if (b.id === activeThemeId) return 1;
        if (sortBy === 'name-asc') return a.name.localeCompare(b.name);
        if (sortBy === 'name-desc') return b.name.localeCompare(a.name);
        const aHasIssues = presetAccessibilityState.get(a.id)?.hasCriticalContrastIssue;
        const bHasIssues = presetAccessibilityState.get(b.id)?.hasCriticalContrastIssue;
        if (aHasIssues && !bHasIssues) return 1;
        if (!aHasIssues && bHasIssues) return -1;
        return a.name.localeCompare(b.name);
      });
    return filtered;
  }, [searchQuery, selectedCategory, selectedTags, selectedTone, selectedPaletteFamily, activeThemeId, sortBy, presetAccessibilityState]);

  const hasActiveFilters =
    !!searchQuery ||
    selectedCategory !== 'all' ||
    selectedTags.length > 0 ||
    selectedTone !== 'all' ||
    selectedPaletteFamily !== 'all';
  const accessibilityReadyCount = useMemo(
    () => themePresets.filter((preset) => !presetAccessibilityState.get(preset.id)?.hasCriticalContrastIssue).length,
    [presetAccessibilityState]
  );

  return (
    <div className="space-y-6" data-testid="brand-theme-gallery">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Palette className="h-4 w-4" />
            Theme Library
          </div>
          <p className="mt-2 text-2xl font-semibold">{themePresets.length}</p>
          <p className="text-xs text-muted-foreground">Preset themes available</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Accessibility Ready
          </div>
          <p className="mt-2 text-2xl font-semibold">{accessibilityReadyCount}</p>
          <p className="text-xs text-muted-foreground">Presets with no critical contrast issues</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" />
            Current Status
          </div>
          <p className="mt-2 text-base font-semibold truncate">{activeThemeId === 'custom' ? 'Custom Theme Active' : 'Preset Theme Active'}</p>
          <p className="text-xs text-muted-foreground">Switch, preview, then fine-tune in editor</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold">Brand Themes</h2>
          <p className="text-sm text-muted-foreground">
            Choose a preset theme, then refine it in the editor with live previews
          </p>
        </div>
        {onCreateNew && (
          <Button onClick={onCreateNew} data-testid="button-create-theme">
            <Plus className="h-4 w-4 mr-2" />
            Create Theme
          </Button>
        )}
      </div>

      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search themes or colors (e.g. #0a66c2, navy, emerald)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
              data-testid="input-search-brand-themes"
            />
          </div>
          <Select value={selectedTone} onValueChange={(value: 'all' | 'light' | 'dark') => setSelectedTone(value)}>
            <SelectTrigger className="w-full lg:w-[160px] min-h-[44px] touch-manipulation" data-testid="select-theme-tone">
              <SelectValue placeholder="Tone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tones</SelectItem>
              <SelectItem value="light">Light</SelectItem>
              {hasDarkTones && <SelectItem value="dark">Dark</SelectItem>}
            </SelectContent>
          </Select>
          <Select value={selectedPaletteFamily} onValueChange={setSelectedPaletteFamily}>
            <SelectTrigger className="w-full lg:w-[220px] min-h-[44px] touch-manipulation" data-testid="select-theme-family">
              <SelectValue placeholder="Palette family" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All families</SelectItem>
              {paletteFamilyOptions.map((family) => (
                <SelectItem key={family} value={family}>{family}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sortBy} onValueChange={(value: 'recommended' | 'name-asc' | 'name-desc') => setSortBy(value)}>
            <SelectTrigger className="w-full lg:w-[220px] min-h-[44px] touch-manipulation" data-testid="select-theme-sort">
              <SelectValue placeholder="Sort themes" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recommended">Recommended</SelectItem>
              <SelectItem value="name-asc">Name (A-Z)</SelectItem>
              <SelectItem value="name-desc">Name (Z-A)</SelectItem>
            </SelectContent>
          </Select>
          
          <Tabs value={selectedCategory} onValueChange={(val) => {
            setSelectedCategory(val);
            setSelectedTags([]);
          }}>
            <TabsList className="h-11 sm:h-10 overflow-x-auto whitespace-nowrap touch-pan-x">
              {categories.map((cat) => (
                <TabsTrigger 
                  key={cat.id} 
                  value={cat.id}
                  className="text-xs min-h-[44px] h-11 sm:h-10 touch-manipulation"
                  data-testid={`tab-category-${cat.id}`}
                >
                  {cat.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        {availableTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {availableTags.map(tag => (
              <button
                key={tag}
                onClick={() => toggleTag(tag)}
                aria-pressed={selectedTags.includes(tag)}
                className={cn(
                  "text-xs px-3 py-1.5 min-h-[44px] touch-manipulation rounded-full border transition-colors",
                  selectedTags.includes(tag)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted text-muted-foreground border-border hover:border-border"
                )}
                data-testid={`tag-filter-${tag}`}
              >
                {tag}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs px-3 py-1.5 min-h-[44px] touch-manipulation rounded-full border border-destructive/50 text-destructive hover:bg-destructive/10 flex items-center gap-1"
                data-testid="button-clear-filters"
              >
                <X className="h-3 w-3" />
                Clear all
              </button>
            )}
          </div>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        Showing {filteredPresets.length} of {themePresets.length} themes
      </div>

      {activeThemeId === 'custom' && (
        <div 
          className="rounded-lg border-2 border-primary ring-2 ring-primary/20 bg-card p-4 mb-4"
          data-testid="custom-theme-active-indicator"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-base flex items-center justify-center">
                <Check className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h3 className="font-semibold">
                  Custom Theme{customThemeName ? ` (based on ${customThemeName})` : ''}
                </h3>
                <p className="text-sm text-muted-foreground">Your customized theme is currently applied</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge >Active</Badge>
              {onEditCustomTheme && (
                <Button variant="outline" size="sm" onClick={onEditCustomTheme} data-testid="button-edit-custom-theme" >
                  <Pencil className="h-4 w-4 mr-1" />
                  Edit
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {filteredPresets.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPresets.map((preset) => (
            <ThemeCard
              key={preset.id}
              preset={preset}
              isActive={activeThemeId === preset.id}
              hasCriticalContrastIssue={presetAccessibilityState.get(preset.id)?.hasCriticalContrastIssue || false}
              onPreview={() => onPreview(preset)}
              onActivate={() => onActivate(preset)}
              onEdit={() => onEdit(preset)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <p>No themes found matching your criteria</p>
          <Button variant="link" onClick={clearFilters} className="mt-2" >
            Clear filters
          </Button>
        </div>
      )}
    </div>
  );
}

export default ThemeGallery;
