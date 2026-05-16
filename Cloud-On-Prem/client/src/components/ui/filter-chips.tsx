import { useRef, useCallback, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export interface FilterChipOption {
  value: string;
  label: string;
  icon?: LucideIcon;
}

export interface FilterChipsProps {
  options: FilterChipOption[];
  selected: string | string[];
  onChange: (value: string | string[]) => void;
  multiSelect?: boolean;
  showAll?: boolean;
  allLabel?: string;
  className?: string;
}

export function FilterChips({
  options,
  selected,
  onChange,
  multiSelect = false,
  showAll = false,
  allLabel = "All",
  className,
}: FilterChipsProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chipRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const selectedArray = Array.isArray(selected) ? selected : selected ? [selected] : [];
  const isAllSelected = selectedArray.length === 0;

  const handleChipClick = useCallback(
    (value: string) => {
      if (multiSelect) {
        const newSelected = selectedArray.includes(value)
          ? selectedArray.filter((v) => v !== value)
          : [...selectedArray, value];
        onChange(newSelected);
      } else {
        onChange(value === (Array.isArray(selected) ? "" : selected) ? "" : value);
      }
    },
    [multiSelect, selected, selectedArray, onChange]
  );

  const handleAllClick = useCallback(() => {
    onChange(multiSelect ? [] : "");
  }, [multiSelect, onChange]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const totalChips = showAll ? options.length + 1 : options.length;
      let newIndex: number | null = null;

      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          newIndex = (index + 1) % totalChips;
          break;
        case "ArrowLeft":
          e.preventDefault();
          newIndex = (index - 1 + totalChips) % totalChips;
          break;
        case "Home":
          e.preventDefault();
          newIndex = 0;
          break;
        case "End":
          e.preventDefault();
          newIndex = totalChips - 1;
          break;
      }

      if (newIndex !== null && chipRefs.current[newIndex]) {
        chipRefs.current[newIndex]?.focus();
      }
    },
    [options.length, showAll]
  );

  const setChipRef = useCallback(
    (el: HTMLButtonElement | null, index: number) => {
      chipRefs.current[index] = el;
    },
    []
  );

  const allChipsCount = showAll ? options.length + 1 : options.length;

  return (
    <div
      ref={containerRef}
      role="group"
      aria-label="Filter options"
      className={cn(
        "flex overflow-x-auto gap-2 pb-1",
        "scrollbar-none [-ms-overflow-style:none] [scrollbar-width:none]",
        "[&::-webkit-scrollbar]:hidden",
        "scroll-snap-type-x-mandatory",
        className
      )}
      data-testid="filter-chips-container"
    >
      {showAll && (
        <button
          ref={(el) => setChipRef(el, 0)}
          type="button"
          role="option"
          aria-selected={isAllSelected}
          aria-label={`${allLabel} filter - ${isAllSelected ? "selected" : "not selected"}`}
          onClick={handleAllClick}
          onKeyDown={(e) => handleKeyDown(e, 0)}
          className={cn(
            "inline-flex items-center justify-center gap-2",
            "min-h-[44px] min-w-[44px] px-4",
            "rounded-full text-sm font-medium",
            "whitespace-nowrap flex-shrink-0",
            "scroll-snap-align-start",
            "transition-all duration-200",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            isAllSelected
              ? "shadow-md"
              : "border border-border"
          )}
          style={
            isAllSelected
              ? {
                  backgroundColor: "var(--filter-pill-active-bg)",
                  color: "var(--filter-pill-active-fg)",
                }
              : {
                  backgroundColor: "var(--filter-pill-bg)",
                  color: "var(--filter-pill-fg)",
                }
          }
          data-testid="filter-chip-all"
        >
          {allLabel}
        </button>
      )}

      {options.map((option, idx) => {
        const chipIndex = showAll ? idx + 1 : idx;
        const isSelected = selectedArray.includes(option.value);
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            ref={(el) => setChipRef(el, chipIndex)}
            type="button"
            role="option"
            aria-selected={isSelected}
            aria-label={`${option.label} filter - ${isSelected ? "selected" : "not selected"}`}
            aria-posinset={chipIndex + 1}
            aria-setsize={allChipsCount}
            onClick={() => handleChipClick(option.value)}
            onKeyDown={(e) => handleKeyDown(e, chipIndex)}
            className={cn(
              "inline-flex items-center justify-center gap-2",
              "min-h-[44px] min-w-[44px] px-4",
              "rounded-full text-sm font-medium",
              "whitespace-nowrap flex-shrink-0",
              "scroll-snap-align-start",
              "transition-all duration-200",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isSelected
                ? "shadow-md"
                : "border border-border"
            )}
            style={
              isSelected
                ? {
                    backgroundColor: "var(--filter-pill-active-bg)",
                    color: "var(--filter-pill-active-fg)",
                  }
                : {
                    backgroundColor: "var(--filter-pill-bg)",
                    color: "var(--filter-pill-fg)",
                  }
            }
            data-testid={`filter-chip-${option.value}`}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
