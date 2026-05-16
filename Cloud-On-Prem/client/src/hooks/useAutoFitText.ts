import { useEffect, useRef } from 'react';

interface AutoFitTextOptions {
  min: number;
  max: number;
  step?: number;
  lines?: number;
}

export function useAutoFitText(
  elementRef: React.RefObject<HTMLElement>,
  options: AutoFitTextOptions
) {
  const { min, max, step = 1, lines = 1 } = options;
  const observerRef = useRef<ResizeObserver | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const fitText = () => {
      let fontSize = max;
      element.style.fontSize = `${fontSize}px`;

      const isOverflowing = () => {
        if (lines === 1) {
          return element.scrollWidth > element.clientWidth;
        } else {
          let lineHeight = parseFloat(getComputedStyle(element).lineHeight);
          if (isNaN(lineHeight)) {
            lineHeight = fontSize * 1.2;
          }
          const maxHeight = lineHeight * lines;
          return element.scrollHeight > maxHeight + 1;
        }
      };

      while (isOverflowing() && fontSize > min) {
        fontSize -= step;
        element.style.fontSize = `${fontSize}px`;
      }
    };

    const debouncedFitText = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        fitText();
      }, 50);
    };

    fitText();

    observerRef.current = new ResizeObserver(() => {
      debouncedFitText();
    });

    observerRef.current.observe(element);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [elementRef, min, max, step, lines]);
}
