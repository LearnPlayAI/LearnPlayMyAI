import { useEffect, useRef, useState } from 'react';

interface WakeLockSentinel {
  release(): Promise<void>;
}

interface WakeLock {
  request(type: 'screen'): Promise<WakeLockSentinel>;
}

export const useScreenWakeLock = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isActive, setIsActive] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    // Check if Screen Wake Lock API is supported
    if ('wakeLock' in navigator && (navigator as any).wakeLock) {
      setIsSupported(true);
    }
  }, []);

  const requestWakeLock = async () => {
    if (!isSupported || isActive) return;

    try {
      const wakeLock = await (navigator as any).wakeLock.request('screen');
      wakeLockRef.current = wakeLock;
      setIsActive(true);
      
      console.log('🔒 Screen wake lock activated');

      // Listen for when the wake lock is released
      wakeLock.addEventListener('release', () => {
        console.log('🔓 Screen wake lock released');
        setIsActive(false);
        wakeLockRef.current = null;
      });

      // Re-request wake lock when the page becomes visible again
      const handleVisibilityChange = async () => {
        if (document.visibilityState === 'visible' && !wakeLockRef.current) {
          await requestWakeLock();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      };
    } catch (err) {
      console.warn('❌ Failed to request screen wake lock:', err);
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      await wakeLockRef.current.release();
      wakeLockRef.current = null;
      setIsActive(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
      }
    };
  }, []);

  return {
    isSupported,
    isActive,
    requestWakeLock,
    releaseWakeLock
  };
};