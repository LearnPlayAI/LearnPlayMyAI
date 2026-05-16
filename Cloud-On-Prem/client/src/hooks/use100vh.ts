import { useState, useEffect, useCallback } from 'react';

export function use100vh(): number | null {
  const [height, setHeight] = useState<number | null>(() => 
    typeof window !== 'undefined' ? window.innerHeight : null
  );

  const updateHeight = useCallback(() => {
    if (typeof window === 'undefined') return;
    
    if (window.visualViewport) {
      setHeight(window.visualViewport.height);
    } else {
      setHeight(window.innerHeight);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    updateHeight();

    const visualViewport = window.visualViewport;
    
    if (visualViewport) {
      visualViewport.addEventListener('resize', updateHeight);
      visualViewport.addEventListener('scroll', updateHeight);
    }
    
    window.addEventListener('resize', updateHeight, { passive: true });
    window.addEventListener('orientationchange', updateHeight, { passive: true });

    return () => {
      if (visualViewport) {
        visualViewport.removeEventListener('resize', updateHeight);
        visualViewport.removeEventListener('scroll', updateHeight);
      }
      window.removeEventListener('resize', updateHeight);
      window.removeEventListener('orientationchange', updateHeight);
    };
  }, [updateHeight]);

  return height;
}

export function useModalMaxHeight(headerHeight: number = 120): string {
  const vh = use100vh();
  
  if (vh === null) {
    return `calc(100vh - ${headerHeight}px)`;
  }
  
  return `${vh - headerHeight}px`;
}

export function useSafeAreaInsets(): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  const [insets, setInsets] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.CSS?.supports) return;

    const computeInsets = () => {
      const style = getComputedStyle(document.documentElement);
      setInsets({
        top: parseInt(style.getPropertyValue('--sat') || '0', 10) || 0,
        bottom: parseInt(style.getPropertyValue('--sab') || '0', 10) || 0,
        left: parseInt(style.getPropertyValue('--sal') || '0', 10) || 0,
        right: parseInt(style.getPropertyValue('--sar') || '0', 10) || 0,
      });
    };

    const style = document.createElement('style');
    style.innerHTML = `
      :root {
        --sat: env(safe-area-inset-top, 0px);
        --sab: env(safe-area-inset-bottom, 0px);
        --sal: env(safe-area-inset-left, 0px);
        --sar: env(safe-area-inset-right, 0px);
      }
    `;
    document.head.appendChild(style);

    setTimeout(computeInsets, 100);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return insets;
}
