import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook to prevent screen from dimming/sleeping during gameplay.
 * Uses the Screen Wake Lock API (modern browsers).
 * Automatically re-acquires lock when tab becomes visible again.
 */
export const useWakeLock = (enabled: boolean = true) => {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const enabledRef = useRef(enabled);
  const mountedRef = useRef(false);
  const requestInFlightRef = useRef(false);
  enabledRef.current = enabled;

  const requestWakeLock = useCallback(async () => {
    if (!enabledRef.current || !mountedRef.current || document.visibilityState !== 'visible') return;
    
    // Check if Wake Lock API is supported
    if (!('wakeLock' in navigator)) {
      console.log('[WAKE_LOCK] API not supported in this browser');
      return;
    }

    if (wakeLockRef.current && !wakeLockRef.current.released) return;
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;

    try {
      const sentinel = await navigator.wakeLock.request('screen');
      if (!enabledRef.current || !mountedRef.current || document.visibilityState !== 'visible') {
        await sentinel.release();
        return;
      }
      wakeLockRef.current = sentinel;
      console.log('[WAKE_LOCK] Screen wake lock acquired');

      // A browser may revoke a screen lock without a route transition. Keep
      // the one route owner alive and re-request when the visible page permits.
      sentinel.addEventListener('release', () => {
        if (wakeLockRef.current === sentinel) wakeLockRef.current = null;
        console.log('[WAKE_LOCK] Screen wake lock released');
        if (enabledRef.current && mountedRef.current && document.visibilityState === 'visible') {
          window.setTimeout(() => void requestWakeLock(), 0);
        }
      });
    } catch (err) {
      // Wake lock request can fail if:
      // - Document is not visible
      // - Permission denied
      // - Low battery mode on some devices
      console.log('[WAKE_LOCK] Failed to acquire:', err);
    } finally {
      requestInFlightRef.current = false;
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    const sentinel = wakeLockRef.current;
    wakeLockRef.current = null;
    if (sentinel && !sentinel.released) {
      try {
        await sentinel.release();
        console.log('[WAKE_LOCK] Manually released');
      } catch (err) {
        console.log('[WAKE_LOCK] Release error:', err);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      mountedRef.current = false;
      void releaseWakeLock();
      return () => {
        mountedRef.current = false;
        void releaseWakeLock();
      };
    }

    mountedRef.current = true;

    // The Game route is the sole gameplay owner. Reacquire after every
    // browser visibility/focus return; individual game tables must not race
    // by independently acquiring and releasing the same device resource.
    void requestWakeLock();

    const resumeWakeLock = () => {
      if (document.visibilityState === 'visible') {
        console.log('[WAKE_LOCK] Tab visible, re-acquiring lock');
        void requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', resumeWakeLock);
    window.addEventListener('focus', resumeWakeLock);
    window.addEventListener('pageshow', resumeWakeLock);

    // Cleanup on unmount or when disabled
    return () => {
      document.removeEventListener('visibilitychange', resumeWakeLock);
      window.removeEventListener('focus', resumeWakeLock);
      window.removeEventListener('pageshow', resumeWakeLock);
      mountedRef.current = false;
      void releaseWakeLock();
    };
  }, [enabled, requestWakeLock, releaseWakeLock]);

  return { requestWakeLock, releaseWakeLock };
};
