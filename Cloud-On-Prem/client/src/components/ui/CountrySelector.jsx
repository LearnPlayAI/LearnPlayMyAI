import { useState } from 'react';
import { Check, ChevronDown, Globe, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '@/components/ui/command';

// Comprehensive list of countries with ISO codes and flags
const COUNTRIES = [
  { code: 'USA', name: 'United States', flag: '🇺🇸' },
  { code: 'GBR', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'CAN', name: 'Canada', flag: '🇨🇦' },
  { code: 'AUS', name: 'Australia', flag: '🇦🇺' },
  { code: 'DEU', name: 'Germany', flag: '🇩🇪' },
  { code: 'FRA', name: 'France', flag: '🇫🇷' },
  { code: 'JPN', name: 'Japan', flag: '🇯🇵' },
  { code: 'KOR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'BRA', name: 'Brazil', flag: '🇧🇷' },
  { code: 'MEX', name: 'Mexico', flag: '🇲🇽' },
  { code: 'ITA', name: 'Italy', flag: '🇮🇹' },
  { code: 'ESP', name: 'Spain', flag: '🇪🇸' },
  { code: 'NLD', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'SWE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'NOR', name: 'Norway', flag: '🇳🇴' },
  { code: 'DNK', name: 'Denmark', flag: '🇩🇰' },
  { code: 'FIN', name: 'Finland', flag: '🇫🇮' },
  { code: 'CHE', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'AUT', name: 'Austria', flag: '🇦🇹' },
  { code: 'BEL', name: 'Belgium', flag: '🇧🇪' },
  { code: 'IRL', name: 'Ireland', flag: '🇮🇪' },
  { code: 'NZL', name: 'New Zealand', flag: '🇳🇿' },
  { code: 'SGP', name: 'Singapore', flag: '🇸🇬' },
  { code: 'HKG', name: 'Hong Kong', flag: '🇭🇰' },
  { code: 'TWN', name: 'Taiwan', flag: '🇹🇼' },
  { code: 'IND', name: 'India', flag: '🇮🇳' },
  { code: 'CHN', name: 'China', flag: '🇨🇳' },
  { code: 'RUS', name: 'Russia', flag: '🇷🇺' },
  { code: 'ZAF', name: 'South Africa', flag: '🇿🇦' },
  { code: 'ARG', name: 'Argentina', flag: '🇦🇷' },
  { code: 'CHL', name: 'Chile', flag: '🇨🇱' },
  { code: 'COL', name: 'Colombia', flag: '🇨🇴' },
  { code: 'PER', name: 'Peru', flag: '🇵🇪' },
  { code: 'URY', name: 'Uruguay', flag: '🇺🇾' },
  { code: 'ECU', name: 'Ecuador', flag: '🇪🇨' },
  { code: 'BOL', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'PRY', name: 'Paraguay', flag: '🇵🇾' },
  { code: 'VEN', name: 'Venezuela', flag: '🇻🇪' },
  { code: 'THA', name: 'Thailand', flag: '🇹🇭' },
  { code: 'VNM', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'PHL', name: 'Philippines', flag: '🇵🇭' },
  { code: 'MYS', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'IDN', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'POL', name: 'Poland', flag: '🇵🇱' },
  { code: 'CZE', name: 'Czech Republic', flag: '🇨🇿' },
  { code: 'HUN', name: 'Hungary', flag: '🇭🇺' },
  { code: 'SVK', name: 'Slovakia', flag: '🇸🇰' },
  { code: 'SVN', name: 'Slovenia', flag: '🇸🇮' },
  { code: 'HRV', name: 'Croatia', flag: '🇭🇷' },
  { code: 'SRB', name: 'Serbia', flag: '🇷🇸' },
  { code: 'BGR', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'ROU', name: 'Romania', flag: '🇷🇴' },
  { code: 'GRC', name: 'Greece', flag: '🇬🇷' },
  { code: 'TUR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'ISR', name: 'Israel', flag: '🇮🇱' },
  { code: 'ARE', name: 'UAE', flag: '🇦🇪' },
  { code: 'SAU', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'EGY', name: 'Egypt', flag: '🇪🇬' },
  { code: 'MAR', name: 'Morocco', flag: '🇲🇦' },
  { code: 'NGA', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'KEN', name: 'Kenya', flag: '🇰🇪' },
  { code: 'GHA', name: 'Ghana', flag: '🇬🇭' },
  { code: 'UKR', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'PRT', name: 'Portugal', flag: '🇵🇹' },
].sort((a, b) => a.name.localeCompare(b.name));

/**
 * CountrySelector - Premium country selection component with flags
 * 
 * Features:
 * - Searchable dropdown
 * - Flag emojis for visual appeal
 * - Consistent with gaming theme
 * - Keyboard navigation
 * - Clear selection option
 * 
 * @param {Object} props
 * @param {string} props.value - Selected country code
 * @param {Function} props.onValueChange - Callback when selection changes
 * @param {string} props.placeholder - Placeholder text
 * @param {boolean} props.disabled - Whether the selector is disabled
 * @param {string} props.className - Additional CSS classes
 */
export function CountrySelector({ 
  value, 
  onValueChange, 
  placeholder = "Select country", 
  disabled = false,
  className = "" 
}) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedCountry = COUNTRIES.find(country => country.code === value);

  const filteredCountries = COUNTRIES.filter(country =>
    country.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    country.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (countryCode) => {
    onValueChange?.(countryCode === value ? null : countryCode);
    setOpen(false);
    setSearchQuery("");
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onValueChange?.(null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={`w-full justify-between h-10 px-3 bg-background border-2 border-border hover:border-accent/50 transition-all duration-300 ${
            selectedCountry ? 'text-foreground' : 'text-muted-foreground'
          } ${className}`}
          data-testid="country-selector-trigger"
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {selectedCountry ? (
              <>
                <span className="text-base" data-testid={`country-flag-${selectedCountry.code}`}>
                  {selectedCountry.flag}
                </span>
                <span className="truncate font-medium" data-testid={`country-name-${selectedCountry.code}`}>
                  {selectedCountry.name}
                </span>
              </>
            ) : (
              <>
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="truncate">{placeholder}</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-1 ml-2">
            {selectedCountry && !disabled && (
              <button
                onClick={clearSelection}
                className="hover:bg-muted rounded p-1 transition-colors"
                data-testid="clear-country-selection"
              >
                <span className="w-3 h-3 text-muted-foreground">×</span>
              </button>
            )}
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`} />
          </div>
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0 border-2 border-accent/30 shadow-dialog bg-card backdrop-blur-none">
        <Command className="bg-transparent">
          <div className="px-3 py-2 border-b border-border bg-muted/20">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search countries..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 bg-background/80 border border-border/50 focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent/70"
                data-testid="country-search-input"
              />
            </div>
          </div>
          
          <CommandGroup className="max-h-60 overflow-auto">
            {filteredCountries.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                No countries found
              </div>
            ) : (
              filteredCountries.map((country) => (
                <CommandItem
                  key={country.code}
                  value={country.code}
                  onSelect={() => handleSelect(country.code)}
                  className="flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-accent/20 aria-selected:bg-accent/30 transition-colors border-b border-border/10 last:border-0"
                  data-testid={`country-option-${country.code}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center flex-shrink-0" data-testid={`option-flag-${country.code}`}>
                      {country.flag}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-foreground" data-testid={`option-name-${country.code}`}>
                        {country.name}
                      </span>
                      <span className="text-xs text-muted-foreground font-mono">
                        {country.code}
                      </span>
                    </div>
                  </div>
                  
                  {value === country.code && (
                    <Check className="w-4 h-4 text-accent" data-testid={`country-selected-${country.code}`} />
                  )}
                </CommandItem>
              ))
            )}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default CountrySelector;