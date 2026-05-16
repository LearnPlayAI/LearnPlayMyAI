import { useState, useCallback, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  hexToHSL, 
  hslToHex, 
  getSuggestedHarmonies, 
  getAllPalettes,
  checkContrast,
  getContrastGrade,
  formatContrastRatio,
  type HSL 
} from '@/utils/contrast';
import { cn } from '@/lib/utils';
import { ChevronDown, Pipette, Sparkles, Palette, SlidersHorizontal, AlertTriangle, Check, ChevronUp } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label: string;
  description?: string;
  contrastWith?: string;
  className?: string;
  isHighlighted?: boolean;
}

export function ColorPicker({ 
  value, 
  onChange, 
  label, 
  description,
  contrastWith,
  className,
  isHighlighted 
}: ColorPickerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showHarmonies, setShowHarmonies] = useState(true);
  const [showPalettes, setShowPalettes] = useState(true);
  const [showHSL, setShowHSL] = useState(true);
  const [hexInput, setHexInput] = useState(value);

  const hsl = useMemo(() => hexToHSL(value) || { h: 0, s: 50, l: 50 }, [value]);
  const harmonies = useMemo(() => getSuggestedHarmonies(value), [value]);
  const palettes = useMemo(() => getAllPalettes(), []);

  const contrastInfo = useMemo(() => {
    if (!contrastWith) return null;
    const result = checkContrast(value, contrastWith);
    const grade = getContrastGrade(result.ratio);
    return { ...result, grade };
  }, [value, contrastWith]);

  const handleHexChange = useCallback((newHex: string) => {
    setHexInput(newHex);
    if (/^#[0-9A-Fa-f]{6}$/.test(newHex)) {
      onChange(newHex);
    }
  }, [onChange]);

  const handleHexBlur = useCallback(() => {
    let normalized = hexInput.trim();
    if (!normalized.startsWith('#')) {
      normalized = '#' + normalized;
    }
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      onChange(normalized);
      setHexInput(normalized);
    } else if (/^#[0-9A-Fa-f]{3}$/.test(normalized)) {
      const expanded = `#${normalized[1]}${normalized[1]}${normalized[2]}${normalized[2]}${normalized[3]}${normalized[3]}`;
      onChange(expanded);
      setHexInput(expanded);
    } else {
      setHexInput(value);
    }
  }, [hexInput, value, onChange]);

  const handleHSLChange = useCallback((component: keyof HSL, newValue: number) => {
    const newHSL = { ...hsl, [component]: newValue };
    const newHex = hslToHex(newHSL.h, newHSL.s, newHSL.l);
    onChange(newHex);
    setHexInput(newHex);
  }, [hsl, onChange]);

  const handleColorSelect = useCallback((color: string) => {
    onChange(color);
    setHexInput(color);
  }, [onChange]);

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
      <div 
        className={cn(
          "rounded-lg border bg-card transition-all duration-300 overflow-hidden",
          isHighlighted && "ring-2 ring-primary ring-offset-2 bg-primary/5",
          isExpanded && "shadow-elevated",
          className
        )}
        data-testid={`color-picker-${label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer">
            <div
              className="w-10 h-10 rounded-lg border-2 border-border shadow-sm shrink-0"
              style={{ backgroundColor: value }}
              data-testid={`color-swatch-${label.toLowerCase().replace(/\s+/g, '-')}`}
            />
            <div className="flex-1 min-w-0 text-left">
              <div className="font-medium text-sm">{label}</div>
              {description && (
                <div className="text-xs text-muted-foreground truncate">{description}</div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-muted-foreground">{value}</span>
              {isExpanded ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Pipette className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">Pick Color</span>
            </div>
            
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="shrink-0 min-h-[44px] touch-manipulation" onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'color';
                  input.value = value;
                  input.onchange = (e) => {
                    const newColor = (e.target as HTMLInputElement).value;
                    handleColorSelect(newColor);
                  };
                  input.click();
                }}
                data-testid="button-pick-color"
              >
                <Pipette className="h-4 w-4 mr-1" />
                Pick Color
              </Button>
              <Input
                value={hexInput}
                onChange={(e) => handleHexChange(e.target.value)}
                onBlur={handleHexBlur}
                className="font-mono flex-1"
                placeholder="#000000"
                data-testid="color-hex-input"
              />
              <div 
                className="w-10 h-10 rounded border shrink-0"
                style={{ backgroundColor: value }}
              />
            </div>

            {contrastInfo && (
              <div className={cn(
                "flex items-center gap-2 p-2 rounded text-sm",
                contrastInfo.grade === 'fail' && "bg-destructive/10 text-destructive",
                contrastInfo.grade === 'aa-large' && "bg-warning/10 text-warning",
                (contrastInfo.grade === 'aa' || contrastInfo.grade === 'aaa') && "bg-success/10 text-success"
              )}>
                {contrastInfo.grade === 'fail' ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                <span>
                  Contrast: {formatContrastRatio(contrastInfo.ratio)} 
                  ({contrastInfo.grade.toUpperCase()})
                </span>
              </div>
            )}

            <Collapsible open={showHarmonies} onOpenChange={setShowHarmonies}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Sparkles className="h-4 w-4" />
                <span>Suggested harmonies</span>
                <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", showHarmonies && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="flex gap-2 flex-wrap">
                  {harmonies.complementary.map((color, i) => (
                    <button
                      key={`comp-${i}`}
                      className="w-11 h-11 sm:w-8 sm:h-8 rounded border hover:scale-110 transition-transform touch-manipulation"
                      style={{ backgroundColor: color }}
                      onClick={() => handleColorSelect(color)}
                      title="Complementary"
                      aria-label={`Apply complementary color ${color}`}
                      data-testid={`harmony-complementary-${i}`}
                    />
                  ))}
                  {harmonies.analogous.map((color, i) => (
                    <button
                      key={`ana-${i}`}
                      className="w-11 h-11 sm:w-8 sm:h-8 rounded border hover:scale-110 transition-transform touch-manipulation"
                      style={{ backgroundColor: color }}
                      onClick={() => handleColorSelect(color)}
                      title="Analogous"
                      aria-label={`Apply analogous color ${color}`}
                      data-testid={`harmony-analogous-${i}`}
                    />
                  ))}
                  {harmonies.triadic.map((color, i) => (
                    <button
                      key={`tri-${i}`}
                      className="w-11 h-11 sm:w-8 sm:h-8 rounded border hover:scale-110 transition-transform touch-manipulation"
                      style={{ backgroundColor: color }}
                      onClick={() => handleColorSelect(color)}
                      title="Triadic"
                      aria-label={`Apply triadic color ${color}`}
                      data-testid={`harmony-triadic-${i}`}
                    />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={showPalettes} onOpenChange={setShowPalettes}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Palette className="h-4 w-4" />
                <span>Color palettes</span>
                <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", showPalettes && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-3">
                {palettes.map((palette) => (
                  <div key={palette.name}>
                    <span className="text-xs text-muted-foreground">{palette.name}</span>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {palette.colors.map((color, i) => (
                        <button
                          key={i}
                          className="w-11 h-11 sm:w-6 sm:h-6 rounded hover:scale-110 transition-transform touch-manipulation"
                          style={{ backgroundColor: color }}
                          onClick={() => handleColorSelect(color)}
                          aria-label={`Apply ${palette.name} palette color ${color}`}
                          data-testid={`palette-${palette.name.toLowerCase().replace(/\s+/g, '-')}-${i}`}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </CollapsibleContent>
            </Collapsible>

            <Collapsible open={showHSL} onOpenChange={setShowHSL}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <SlidersHorizontal className="h-4 w-4" />
                <span>Advanced HSL controls</span>
                <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform", showHSL && "rotate-180")} />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2 space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Hue</span>
                    <span className="text-muted-foreground">{hsl.h}</span>
                  </div>
                  <div 
                    className="h-3 rounded-full"
                    style={{
                      background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)'
                    }}
                  >
                    <Slider
                      value={[hsl.h]}
                      max={360}
                      step={1}
                      onValueChange={([v]) => handleHSLChange('h', v)}
                      className="[&_[role=slider]]:bg-background [&_[role=slider]]:border-2 [&_.bg-primary]:bg-transparent [&_.bg-secondary]:bg-transparent"
                      data-testid="hsl-hue-slider"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Saturation</span>
                    <span className="text-muted-foreground">{hsl.s}%</span>
                  </div>
                  <div 
                    className="h-3 rounded-full"
                    style={{
                      background: `linear-gradient(to right, hsl(${hsl.h}, 0%, ${hsl.l}%), hsl(${hsl.h}, 100%, ${hsl.l}%))`
                    }}
                  >
                    <Slider
                      value={[hsl.s]}
                      max={100}
                      step={1}
                      onValueChange={([v]) => handleHSLChange('s', v)}
                      className="[&_[role=slider]]:bg-background [&_[role=slider]]:border-2 [&_.bg-primary]:bg-transparent [&_.bg-secondary]:bg-transparent"
                      data-testid="hsl-saturation-slider"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs">
                    <span>Lightness</span>
                    <span className="text-muted-foreground">{hsl.l}%</span>
                  </div>
                  <div 
                    className="h-3 rounded-full"
                    style={{
                      background: `linear-gradient(to right, hsl(${hsl.h}, ${hsl.s}%, 0%), hsl(${hsl.h}, ${hsl.s}%, 50%), hsl(${hsl.h}, ${hsl.s}%, 100%))`
                    }}
                  >
                    <Slider
                      value={[hsl.l]}
                      max={100}
                      step={1}
                      onValueChange={([v]) => handleHSLChange('l', v)}
                      className="[&_[role=slider]]:bg-background [&_[role=slider]]:border-2 [&_.bg-primary]:bg-transparent [&_.bg-secondary]:bg-transparent"
                      data-testid="hsl-lightness-slider"
                    />
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default ColorPicker;
