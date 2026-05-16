import { useEffect, useRef } from "react";

export function useTimeTracker(enabled: boolean, initialSeconds: number = 0, intervalMs: number = 30000) {
  const enabledRef = useRef(enabled);
  const startTimeRef = useRef<number>(0);
  const totalSecondsRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isVisibleRef = useRef(false);

  // Sync totalSecondsRef when initialSeconds changes (use max to prevent regression and double-counting)
  useEffect(() => {
    // Take the higher value: either persisted time from server or current session total
    // This handles both reload (server > local) and autosave refetch (local >= server) cases
    totalSecondsRef.current = Math.max(totalSecondsRef.current, initialSeconds);
  }, [initialSeconds]);

  // Compute real-time seconds (including current pending delta)
  const getCurrentSeconds = () => {
    if (!enabledRef.current || !isVisibleRef.current) return totalSecondsRef.current;
    const pendingDelta = Math.floor((Date.now() - startTimeRef.current) / 1000);
    return totalSecondsRef.current + pendingDelta;
  };

  useEffect(() => {
    enabledRef.current = enabled;

    // Helper to save pending delta
    const flushPendingTime = () => {
      if (startTimeRef.current > 0 && isVisibleRef.current) {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        if (elapsed > 0) {
          totalSecondsRef.current += elapsed;
        }
      }
    };

    if (!enabled) {
      // Flush pending time before disabling
      flushPendingTime();
      isVisibleRef.current = false;
      startTimeRef.current = 0;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Initialize tracking when enabled (only if document is visible)
    const isDocumentVisible = !document.hidden;
    isVisibleRef.current = isDocumentVisible;
    if (isDocumentVisible) {
      startTimeRef.current = Date.now();
    }

    const handleVisibilityChange = () => {
      if (document.hidden) {
        // Save pending delta before pausing
        flushPendingTime();
        isVisibleRef.current = false;
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        startTimeRef.current = 0;
      } else {
        isVisibleRef.current = true;
        startTimeRef.current = Date.now();
        startTracking();
      }
    };

    const startTracking = () => {
      intervalRef.current = setInterval(() => {
        if (isVisibleRef.current && startTimeRef.current > 0) {
          flushPendingTime();
          startTimeRef.current = Date.now();
        }
      }, intervalMs);
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    startTracking();

    return () => {
      // Flush pending time before cleanup
      flushPendingTime();
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      isVisibleRef.current = false;
      startTimeRef.current = 0;
    };
  }, [enabled, intervalMs]);

  const resetTimer = () => {
    totalSecondsRef.current = 0;
    startTimeRef.current = Date.now();
  };

  return { getCurrentSeconds, resetTimer };
}
