/**
 * useCanonicalFeltOverflowFrameElement — sibling of the felt coord
 * frame that is NOT clipped by the felt-surface ellipse. Consumers
 * that render card-hand overhang past the felt rim portal into this
 * frame. Same coordinate origin as the coord frame (both are absolute
 * inset:0 inside the shell felt frame). See CanonicalFeltSurface.
 */
import { useEffect, useState } from 'react';

const OVERFLOW_FRAME_SELECTOR = '[data-canonical-felt-overflow-frame]';
const COORD_FRAME_SELECTOR = '[data-canonical-felt-coord-frame]';
const SURFACE_SELECTOR = '[data-canonical-felt-surface]';

function findFrame(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(OVERFLOW_FRAME_SELECTOR) ??
    document.querySelector<HTMLElement>(COORD_FRAME_SELECTOR) ??
    document.querySelector<HTMLElement>(SURFACE_SELECTOR)
  );
}

export function useCanonicalFeltOverflowFrameElement(enabled: boolean): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEl(null);
      return;
    }
    let cancelled = false;
    let raf = 0;
    let attempts = 0;
    const MAX = 30;
    const tick = () => {
      if (cancelled) return;
      const next = findFrame();
      if (next) {
        setEl(prev => (prev === next ? prev : next));
        if (attempts > 0) return;
      }
      attempts += 1;
      if (attempts < MAX) raf = requestAnimationFrame(tick);
    };
    tick();

    const observer = new MutationObserver(() => {
      const next = findFrame();
      setEl(prev => (prev === next ? prev : next));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [enabled]);

  return el;
}
