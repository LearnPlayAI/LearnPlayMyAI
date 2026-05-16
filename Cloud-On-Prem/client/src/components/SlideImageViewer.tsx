import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface SlideImageViewerProps {
  slideUrls: string[];
  title: string;
  className?: string;
  fillMode?: boolean;
}

export function SlideImageViewer({
  slideUrls,
  title,
  className,
  fillMode = false,
}: SlideImageViewerProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [imageLoaded, setImageLoaded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalSlides = slideUrls.length;

  const goNext = useCallback(() => {
    setCurrentSlide((prev) => {
      if (prev >= totalSlides - 1) return prev;
      setImageLoaded(false);
      return prev + 1;
    });
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setCurrentSlide((prev) => {
      if (prev <= 0) return prev;
      setImageLoaded(false);
      return prev - 1;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [goNext, goPrev]);

  useEffect(() => {
    const nextIndex = currentSlide + 1;
    if (nextIndex < totalSlides) {
      const img = new Image();
      img.src = slideUrls[nextIndex];
    }
  }, [currentSlide, totalSlides, slideUrls]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const midpoint = rect.width / 2;

      if ((e.target as HTMLElement).closest("button")) return;

      if (clickX < midpoint) {
        goPrev();
      } else {
        goNext();
      }
    },
    [goNext, goPrev]
  );

  if (totalSlides === 0) {
    return (
      <div
        className={`flex items-center justify-center bg-[var(--surface-overlay)] rounded-lg ${className || ""}`}
        style={{ aspectRatio: "16/9" }}
      >
        <p className="text-foreground/60 text-sm">No slides available</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative w-full select-none ${fillMode ? "h-full" : ""} ${className || ""}`}
      aria-label={title || "Slide viewer"}
      onClick={handleContainerClick}
    >
      <div
        className={`relative w-full overflow-hidden bg-[var(--surface-overlay)] ${fillMode ? "h-full rounded-none" : "rounded-lg"}`}
        style={fillMode ? undefined : { aspectRatio: "16/9" }}
      >
        {!imageLoaded && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-foreground/70" />
            <p className="text-sm text-foreground/50">Loading slide…</p>
          </div>
        )}

        <img
          src={slideUrls[currentSlide]}
          alt={`${title} — Slide ${currentSlide + 1} of ${totalSlides}`}
          className={`w-full h-full object-contain transition-opacity duration-300 ${imageLoaded ? "opacity-100" : "opacity-0"}`}
          onLoad={() => setImageLoaded(true)}
          draggable={false}
        />

        {totalSlides > 1 && (
          <>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                goPrev();
              }}
              disabled={currentSlide <= 0}
              className="absolute left-3 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-fg)] border-[var(--btn-secondary-bg)] hover:bg-[var(--btn-secondary-hover)] hover:text-[var(--btn-secondary-hover-fg)] shadow-lg"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={(e) => {
                e.stopPropagation();
                goNext();
              }}
              disabled={currentSlide >= totalSlides - 1}
              className="absolute right-3 top-1/2 z-20 h-12 w-12 -translate-y-1/2 rounded-full bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-fg)] border-[var(--btn-secondary-bg)] hover:bg-[var(--btn-secondary-hover)] hover:text-[var(--btn-secondary-hover-fg)] shadow-lg"
              aria-label="Next slide"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        {totalSlides > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20">
            <Badge
              variant="outline"
              className="bg-[var(--badge-outline-bg)] px-3 py-1 text-[length:var(--text-xs)] font-semibold text-[var(--badge-outline-fg)] border-[var(--badge-outline-border)] shadow-md"
            >
              Slide {currentSlide + 1} of {totalSlides}
            </Badge>
          </div>
        )}
      </div>
    </div>
  );
}
