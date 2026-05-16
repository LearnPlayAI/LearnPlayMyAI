import { useRef, useState, useEffect, useCallback } from "react";
import { init } from "pptx-preview";
import { ChevronLeft, ChevronRight, Download, Loader2, AlertCircle, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PptxLocalViewerProps {
  pptxUrl: string;
  title?: string;
  className?: string;
  "data-testid"?: string;
}

export function PptxLocalViewer({
  pptxUrl,
  title,
  className,
  "data-testid": testId,
}: PptxLocalViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const previewerRef = useRef<any>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [totalSlides, setTotalSlides] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const TIMEOUT_MS = 15000;

    const loadPptx = async () => {
      if (!containerRef.current || !pptxUrl) return;

      setLoading(true);
      setError(null);
      setCurrentSlide(0);
      setTotalSlides(0);

      if (previewerRef.current) {
        try {
          previewerRef.current.destroy();
        } catch {}
        previewerRef.current = null;
      }

      containerRef.current.innerHTML = "";

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        if (!cancelled) {
          setError("Unable to preview this presentation in the browser. It may contain features that are not supported. Please download and open it in PowerPoint or LibreOffice instead.");
          setLoading(false);
        }
      }, TIMEOUT_MS);

      try {
        const response = await fetch(pptxUrl, { credentials: "include" });
        if (!response.ok) {
          throw new Error(`Failed to fetch presentation (${response.status})`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        const previewer = init(containerRef.current!, {
          mode: "slide",
          width: 960,
          height: 540,
        });

        previewerRef.current = previewer;

        await previewer.preview(arrayBuffer);
        if (cancelled) return;

        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        setTotalSlides(previewer.slideCount);
        setCurrentSlide(previewer.currentIndex);
        setLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          setError(err?.message || "Unable to preview this presentation in the browser. It may contain features that are not supported. Please download and open it in PowerPoint or LibreOffice instead.");
          setLoading(false);
        }
      }
    };

    loadPptx();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (previewerRef.current) {
        try {
          previewerRef.current.destroy();
        } catch {}
        previewerRef.current = null;
      }
    };
  }, [pptxUrl]);

  const goNext = useCallback(() => {
    if (!previewerRef.current) return;
    previewerRef.current.renderNextSlide();
    setCurrentSlide(previewerRef.current.currentIndex);
  }, []);

  const goPrev = useCallback(() => {
    if (!previewerRef.current) return;
    previewerRef.current.renderPreSlide();
    setCurrentSlide(previewerRef.current.currentIndex);
  }, []);

  useEffect(() => {
    if (loading || error) return;

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
  }, [loading, error, goNext, goPrev]);

  if (error) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-4 p-8 rounded-lg bg-card border border-border ${className || ""}`}
        data-testid={testId}
        style={{ aspectRatio: "16/9" }}
      >
        <AlertCircle className="h-12 w-12 text-destructive" />
        <p className="text-muted-foreground text-center max-w-md">{error}</p>

        <div className="bg-muted/50 border border-border rounded-lg p-4 max-w-lg w-full space-y-3">
          <div className="flex items-center gap-2 text-foreground font-medium text-sm">
            <Video className="h-4 w-4 text-primary" />
            How to fix this:
          </div>
          <ol className="text-muted-foreground text-sm space-y-2 list-decimal list-inside">
            <li>Download the PPTX file below</li>
            <li>Open it on your computer and record a voiceover presentation</li>
            <li>Save the recording as an MP4 video file</li>
            <li>Use the <span className="font-medium text-foreground">Upload Video</span> action in the sidebar to upload the MP4</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Once uploaded, the video will replace this presentation view automatically.
          </p>
        </div>

        <Button variant="outline" onClick={() => {
            const a = document.createElement("a");
            a.href = pptxUrl;
            a.download = title ? `${title}.pptx` : "presentation.pptx";
            a.click();
          }}
        >
          <Download className="h-4 w-4 mr-2" />
          Download PPTX
        </Button>
      </div>
    );
  }

  return (
    <div
      className={`relative w-full ${className || ""}`}
      data-testid={testId}
      aria-label={title || "Presentation viewer"}
    >
      <style>{`
        .pptx-local-viewer-container .pptx-preview-wrapper {
          width: 100% !important;
          height: 100% !important;
        }
        .pptx-local-viewer-container canvas,
        .pptx-local-viewer-container svg {
          max-width: 100%;
          height: auto;
        }
        .pptx-local-viewer-container .pptx-preview-btn,
        .pptx-local-viewer-container [class*="pptx-preview-nav"] {
          display: none !important;
        }
      `}</style>

      <div
        className="relative w-full overflow-hidden rounded-t-lg bg-[var(--surface-overlay)]"
        style={{ aspectRatio: "16/9" }}
      >
        {loading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/80">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading presentation…</p>
          </div>
        )}
        <div
          ref={containerRef}
          className="pptx-local-viewer-container w-full h-full"
        />
      </div>

      {!loading && totalSlides > 0 && (
        <div className="flex items-center justify-between gap-2 px-4 py-2 rounded-b-lg bg-background/80 backdrop-blur-sm border border-t-0 border-border">
          <Button size="sm" variant="ghost" onClick={goPrev} disabled={currentSlide <= 0} >
            <ChevronLeft className="h-5 w-5" />
          </Button>

          <span className="text-sm text-muted-foreground select-none">
            Slide {currentSlide + 1} of {totalSlides}
          </span>

          <Button size="sm" variant="ghost" onClick={goNext} disabled={currentSlide >= totalSlides - 1}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      )}
    </div>
  );
}
