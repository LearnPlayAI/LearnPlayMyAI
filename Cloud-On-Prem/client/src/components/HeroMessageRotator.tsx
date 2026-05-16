import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HERO_MESSAGES, type HeroMessage } from '@/config/landingPageData';

interface HeroMessageRotatorProps {
  messages?: HeroMessage[];
  intervalMs?: number;
  className?: string;
}

export function HeroMessageRotator({
  messages = HERO_MESSAGES,
  intervalMs = 5000,
  className = '',
}: HeroMessageRotatorProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const currentMessage = messages[currentIndex];

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % messages.length);
  }, [messages.length]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + messages.length) % messages.length);
  }, [messages.length]);

  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < messages.length) {
      setCurrentIndex(index);
    }
  }, [messages.length]);

  useEffect(() => {
    if (isPaused || messages.length <= 1) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    const interval = setInterval(goToNext, intervalMs);
    return () => clearInterval(interval);
  }, [isPaused, intervalMs, goToNext, messages.length]);

  const prefersReducedMotion = typeof window !== 'undefined' 
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches 
    : false;

  const animationVariants = prefersReducedMotion
    ? {
        initial: { opacity: 1 },
        animate: { opacity: 1 },
        exit: { opacity: 1 },
      }
    : {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -20 },
      };

  return (
    <div
      className={`relative ${className}`}
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
      data-testid="hero-message-rotator"
    >
      <div
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {currentMessage.headline.join(' ')} - {currentMessage.subheadline}
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentMessage.id}
            variants={animationVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.5, ease: 'easeOut' }}
            className="space-y-4"
          >
            <h1
              className="text-[clamp(1.75rem,5vw,3.75rem)] font-black tracking-tight leading-[1.1]"
              data-testid="hero-headline-rotator"
            >
              {currentMessage.headline.map((line, index) => (
                <span
                  key={index}
                  className="block bg-clip-text text-transparent drop-shadow-dialog"
                  style={{
                    backgroundImage: `linear-gradient(to right, var(--hero-headline-from), var(--hero-headline-via), var(--hero-headline-to))`,
                  }}
                >
                  {line}
                </span>
              ))}
            </h1>

            <div
              className="flex flex-col sm:flex-row items-center gap-3 justify-center lg:justify-start"
              data-testid="hero-subheadline-rotator"
            >
              <div 
                className="flex items-center gap-2 px-4 py-2 backdrop-blur-sm rounded-full"
                style={{
                  backgroundColor: 'var(--hero-badge-bg)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--hero-badge-border)',
                }}
              >
                <span 
                  className="font-bold text-[clamp(0.875rem,2vw,1.25rem)]"
                  style={{ color: 'var(--hero-badge-fg)' }}
                >
                  {currentMessage.subheadline}
                </span>
              </div>
              <span 
                className="font-medium text-[clamp(0.875rem,2vw,1.125rem)]"
                style={{ color: 'var(--hero-badge-fg)' }}
              >
                {currentMessage.emphasis}
              </span>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {messages.length > 1 && (
        <div
          className="flex items-center justify-center lg:justify-start gap-2 mt-6"
          role="tablist"
          aria-label="Hero message navigation"
          data-testid="hero-message-indicators"
        >
          {messages.map((message, index) => (
            <button
              key={message.id}
              role="tab"
              aria-selected={index === currentIndex}
              aria-label={`View message ${index + 1}: ${message.emphasis}`}
              onClick={() => goToIndex(index)}
              className={`min-w-[44px] min-h-[44px] p-2 transition-all duration-300 touch-manipulation focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent rounded-full ${
                index === currentIndex
                  ? 'scale-100'
                  : 'scale-90 opacity-60 hover:opacity-100'
              }`}
              style={{ 
                '--tw-ring-color': 'var(--hero-indicator-active-bg)' 
              } as React.CSSProperties}
              data-testid={`hero-indicator-${index}`}
            >
              <span
                className="block w-3 h-3 rounded-full transition-all duration-300"
                style={{
                  background: index === currentIndex 
                    ? `linear-gradient(to right, var(--hero-indicator-active-bg), var(--hero-headline-via))`
                    : 'var(--hero-indicator-rest-bg)',
                  boxShadow: index === currentIndex 
                    ? `0 10px 15px -3px var(--hero-glow-secondary)` 
                    : 'none',
                }}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default HeroMessageRotator;
