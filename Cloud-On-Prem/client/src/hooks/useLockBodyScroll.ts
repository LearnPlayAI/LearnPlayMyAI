import { useEffect, useRef } from 'react';

interface LockBodyScrollOptions {
  enabled?: boolean;
  reserveScrollBarGap?: boolean;
}

export function useLockBodyScroll(options: LockBodyScrollOptions = {}): void {
  const { enabled = true, reserveScrollBarGap = true } = options;
  const scrollPositionRef = useRef(0);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;

    const body = document.body;
    const html = document.documentElement;
    
    scrollPositionRef.current = window.scrollY;
    
    const scrollBarWidth = reserveScrollBarGap 
      ? window.innerWidth - html.clientWidth 
      : 0;

    const originalStyles = {
      overflow: body.style.overflow,
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      paddingRight: body.style.paddingRight,
      overscrollBehavior: body.style.overscrollBehavior,
      touchAction: body.style.touchAction,
    };

    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollPositionRef.current}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    body.style.overscrollBehavior = 'contain';
    body.style.touchAction = 'none';
    
    if (scrollBarWidth > 0) {
      body.style.paddingRight = `${scrollBarWidth}px`;
    }

    const preventTouchMove = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      
      const isScrollable = (el: HTMLElement | null): boolean => {
        if (!el) return false;
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        const isScrollableY = overflowY === 'auto' || overflowY === 'scroll';
        
        if (isScrollableY && el.scrollHeight > el.clientHeight) {
          return true;
        }
        
        if (el.parentElement && el.parentElement !== body) {
          return isScrollable(el.parentElement);
        }
        
        return false;
      };

      if (!isScrollable(target)) {
        e.preventDefault();
      }
    };

    document.addEventListener('touchmove', preventTouchMove, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventTouchMove);
      
      body.style.overflow = originalStyles.overflow;
      body.style.position = originalStyles.position;
      body.style.top = originalStyles.top;
      body.style.left = originalStyles.left;
      body.style.right = originalStyles.right;
      body.style.width = originalStyles.width;
      body.style.paddingRight = originalStyles.paddingRight;
      body.style.overscrollBehavior = originalStyles.overscrollBehavior;
      body.style.touchAction = originalStyles.touchAction;

      window.scrollTo(0, scrollPositionRef.current);
    };
  }, [enabled, reserveScrollBarGap]);
}

export function usePreventScroll(enabled: boolean = true): void {
  useLockBodyScroll({ enabled });
}
