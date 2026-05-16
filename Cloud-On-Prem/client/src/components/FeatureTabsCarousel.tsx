import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import type { FeatureStep } from '@/config/landingPageData';

interface FeatureTabsCarouselProps {
  features: FeatureStep[];
  className?: string;
  autoPlay?: boolean;
  autoPlayInterval?: number;
  isLoading?: boolean;
}

function FeatureTabsSkeleton({ className = '' }: { className?: string }) {
  return (
    <div 
      className={`relative ${className}`}
      data-testid="feature-tabs-skeleton"
      aria-busy="true"
      aria-label="Loading feature tabs"
    >
      {/* Tab Navigation Skeleton */}
      <div className="relative">
        <div className="flex justify-center gap-2 py-2 mx-12">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton 
              key={i}
              className="h-[44px] w-[120px] rounded-xl bg-muted/10"
            />
          ))}
        </div>
      </div>

      {/* Progress Indicators Skeleton */}
      <div className="flex justify-center gap-2 mt-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton 
            key={i}
            className="h-3 w-3 rounded-full bg-muted/10"
          />
        ))}
      </div>

      {/* Content Panel Skeleton */}
      <div className="mt-8 text-center">
        <Skeleton className="h-10 w-64 mx-auto mb-4 bg-muted/10" />
        <Skeleton className="h-6 w-96 mx-auto bg-muted/10" />
      </div>
    </div>
  );
}

function FeatureTabsEmpty({ className = '' }: { className?: string }) {
  return (
    <div 
      className={`relative text-center py-12 ${className}`}
      data-testid="feature-tabs-empty"
      role="alert"
    >
      <AlertCircle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--fg-muted)' }} aria-hidden="true" />
      <p className="text-lg" style={{ color: 'var(--fg-muted)' }}>No features available</p>
    </div>
  );
}

export function FeatureTabsCarousel({
  features,
  className = '',
  autoPlay = true,
  autoPlayInterval = 5000,
  isLoading = false,
}: FeatureTabsCarouselProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: false,
    align: 'center',
    containScroll: 'trimSnaps',
    skipSnaps: false,
  });

  const safeFeatures = features && features.length > 0 ? features : [];
  const featuresLength = safeFeatures.length;

  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback((index: number) => {
    if (emblaApi) emblaApi.scrollTo(index);
  }, [emblaApi]);

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
    setCanScrollPrev(emblaApi.canScrollPrev());
    setCanScrollNext(emblaApi.canScrollNext());
  }, [emblaApi]);

  const handleTabChange = useCallback((value: string) => {
    const index = safeFeatures.findIndex((f) => f.id === value);
    if (index >= 0) {
      setSelectedIndex(index);
      scrollTo(index);
    }
  }, [safeFeatures, scrollTo]);

  const startAutoPlay = useCallback(() => {
    if (!autoPlay || isPaused || featuresLength === 0 || prefersReducedMotion) return;
    
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
    }
    
    autoPlayTimerRef.current = setTimeout(() => {
      const nextIndex = (selectedIndex + 1) % featuresLength;
      setSelectedIndex(nextIndex);
      scrollTo(nextIndex);
    }, autoPlayInterval);
  }, [autoPlay, isPaused, selectedIndex, featuresLength, autoPlayInterval, scrollTo, prefersReducedMotion]);

  const stopAutoPlay = useCallback(() => {
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!emblaApi) return;
    
    onSelect();
    emblaApi.on('select', onSelect);
    emblaApi.on('reInit', onSelect);
    
    return () => {
      emblaApi.off('select', onSelect);
      emblaApi.off('reInit', onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    startAutoPlay();
    return stopAutoPlay;
  }, [startAutoPlay, stopAutoPlay]);

  useEffect(() => {
    if (featuresLength > 0 && selectedIndex >= featuresLength) {
      setSelectedIndex(Math.max(0, featuresLength - 1));
    }
  }, [featuresLength, selectedIndex]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        scrollPrev();
        break;
      case 'ArrowRight':
        e.preventDefault();
        scrollNext();
        break;
      case 'Home':
        e.preventDefault();
        scrollTo(0);
        break;
      case 'End':
        e.preventDefault();
        scrollTo(featuresLength - 1);
        break;
    }
  }, [scrollPrev, scrollNext, scrollTo, featuresLength]);

  if (isLoading) {
    return <FeatureTabsSkeleton className={className} />;
  }

  if (!features || features.length === 0) {
    return <FeatureTabsEmpty className={className} />;
  }

  const selectedFeature = features[selectedIndex];

  return (
    <div 
      className={`relative ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      data-testid="feature-tabs-carousel"
    >
      <Tabs 
        value={selectedFeature?.id} 
        onValueChange={handleTabChange}
        className="w-full"
      >
        {/* Tab Navigation with Carousel */}
        <div className="relative">
          {/* Previous Button */}
          <button
            onClick={scrollPrev}
            disabled={!canScrollPrev}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-muted/10 backdrop-blur-sm border border-border text-muted-foreground hover:bg-muted/20 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all touch-manipulation"
            aria-label="Previous feature"
            data-testid="carousel-prev-button"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Carousel Container */}
          <div 
            className="overflow-hidden mx-12"
            ref={emblaRef}
            role="tablist"
            aria-label="Feature tabs"
            onKeyDown={handleKeyDown}
          >
            <TabsList className="flex gap-2 bg-transparent h-auto p-2">
              {features.map((feature, index) => (
                <TabsTrigger
                  key={feature.id}
                  value={feature.id}
                  id={`tab-${feature.id}`}
                  className={`flex-shrink-0 min-h-[44px] min-w-[120px] px-4 py-3 rounded-xl font-semibold text-sm transition-all duration-300 touch-manipulation ${
                    selectedIndex === index
                      ? 'bg-primary hover:bg-primary/90 text-foreground shadow-elevated'
                      : 'bg-muted/10 text-muted-foreground hover:bg-muted/20 hover:text-foreground'
                  }`}
                  data-testid={`tab-${feature.id}`}
                  aria-selected={selectedIndex === index}
                  aria-controls={`panel-${feature.id}`}
                  tabIndex={selectedIndex === index ? 0 : -1}
                >
                  {feature.step}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Next Button */}
          <button
            onClick={scrollNext}
            disabled={!canScrollNext}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-muted/10 backdrop-blur-sm border border-border text-muted-foreground hover:bg-muted/20 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-all touch-manipulation"
            aria-label="Next feature"
            data-testid="carousel-next-button"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Indicators */}
        <div 
          className="flex justify-center gap-2 mt-4"
          role="tablist"
          aria-label="Feature progress"
          data-testid="carousel-progress-indicators"
        >
          {features.map((feature, index) => (
            <button
              key={`indicator-${feature.id}`}
              onClick={() => {
                setSelectedIndex(index);
                scrollTo(index);
              }}
              className={`min-h-[44px] min-w-[44px] flex items-center justify-center touch-manipulation`}
              aria-label={`Go to ${feature.step}`}
              aria-selected={selectedIndex === index}
              data-testid={`indicator-${feature.id}`}
            >
              <span 
                className={`w-3 h-3 rounded-full transition-all duration-300 ${
                  selectedIndex === index
                    ? 'bg-primary scale-125'
                    : 'bg-muted/30 hover:bg-muted/50'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Tab Content Panel - Single active panel with animation */}
        <div 
          className="mt-8 focus:outline-none" 
          role="tabpanel"
          id={`panel-${selectedFeature?.id}`}
          aria-labelledby={`tab-${selectedFeature?.id}`}
          data-testid={`panel-${selectedFeature?.id}`}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedFeature?.id}
              initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, y: -20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="text-center"
            >
              <h3 
                className={`text-2xl sm:text-3xl md:text-4xl font-black mb-4  ${selectedFeature?.gradient} bg-clip-text text-transparent`}
                data-testid={`feature-title-${selectedFeature?.id}`}
              >
                {selectedFeature?.title}
              </h3>
              <p 
                className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto text-balance"
                data-testid={`feature-subtitle-${selectedFeature?.id}`}
              >
                {selectedFeature?.subtitle}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>
      </Tabs>

      {/* Screen reader live region for announcing changes */}
      <div 
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        Currently showing: {selectedFeature?.step} - {selectedFeature?.title}
      </div>
    </div>
  );
}
