import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to prevent screen from dimming/sleeping during gameplay.
 * Uses the Screen Wake Lock API (modern browsers).
 * Automatically re-acquires lock when tab becomes visible again.
 */
export const useWakeLock = (enabled: boolean = true) => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const requestWakeLock = useCallback(async () => {
    if (!enabled) return;
    
    // Check if Wake Lock API is supported
    if (!('wakeLock' in navigator)) {
      console.log('[WAKE_LOCK] API not supported in this browser');
      return;
    }

    try {
      // Release existing lock before requesting new one
      if (wakeLockRef.current) {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      }

      wakeLockRef.current = await navigator.wakeLock.request('screen');
      console.log('[WAKE_LOCK] Screen wake lock acquired');

      // Handle lock release (e.g., when tab loses visibility)
      wakeLockRef.current.addEventListener('release', () => {
        console.log('[WAKE_LOCK] Screen wake lock released');
      });
    } catch (err) {
      // Wake lock request can fail if:
      // - Document is not visible
      // - Permission denied
      // - Low battery mode on some devices
      console.log('[WAKE_LOCK] Failed to acquire:', err);
    }
  }, [enabled]);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
        console.log('[WAKE_LOCK] Manually released');
      } catch (err) {
        console.log('[WAKE_LOCK] Release error:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      releaseWakeLock();
      return;
    }

    // Request wake lock immediately
    requestWakeLock();

    // Re-acquire wake lock when tab becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('[WAKE_LOCK] Tab visible, re-acquiring lock');
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Cleanup on unmount or when disabled
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock };
};
