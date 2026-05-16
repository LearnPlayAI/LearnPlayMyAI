import { useState, useEffect, useMemo } from 'react';

export type Breakpoint = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';

const BREAKPOINTS = {
  xs: 0,
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  '2xl': 1536,
} as const;

export interface ModalResponsiveState {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  breakpoint: Breakpoint;
  width: number;
  usesStickyFooter: boolean;
  shouldCollapsePanels: boolean;
  shouldStackButtons: boolean;
  touchTargetSize: number;
}

function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS['2xl']) return '2xl';
  if (width >= BREAKPOINTS.xl) return 'xl';
  if (width >= BREAKPOINTS.lg) return 'lg';
  if (width >= BREAKPOINTS.md) return 'md';
  if (width >= BREAKPOINTS.sm) return 'sm';
  return 'xs';
}

export function useModalResponsiveState(): ModalResponsiveState {
  const [width, setWidth] = useState(() => 
    typeof window !== 'undefined' ? window.innerWidth : 1024
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      setWidth(window.innerWidth);
    };

    window.addEventListener('resize', handleResize, { passive: true });
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return useMemo(() => {
    const breakpoint = getBreakpoint(width);
    const isMobile = width < BREAKPOINTS.md;
    const isTablet = width >= BREAKPOINTS.md && width < BREAKPOINTS.lg;
    const isDesktop = width >= BREAKPOINTS.lg;

    return {
      isMobile,
      isTablet,
      isDesktop,
      breakpoint,
      width,
      usesStickyFooter: isMobile,
      shouldCollapsePanels: width < BREAKPOINTS.sm,
      shouldStackButtons: isMobile,
      touchTargetSize: isMobile ? 48 : 44,
    };
  }, [width]);
}

export function useBreakpoint(): Breakpoint {
  const { breakpoint } = useModalResponsiveState();
  return breakpoint;
}

export function useIsMobileEnhanced(): {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  breakpoint: Breakpoint;
} {
  const state = useModalResponsiveState();
  return {
    isMobile: state.isMobile,
    isTablet: state.isTablet,
    isDesktop: state.isDesktop,
    breakpoint: state.breakpoint,
  };
}
