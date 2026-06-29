/**
 * useCanonicalFeltCoordFrameElement — shell-owned canonical felt
 * coordinate frame element for gameplay artifacts.
 *
 * Returns the DOM element marked `[data-canonical-felt-coord-frame]`,
 * a rect-equal sibling rendered inside `[data-canonical-felt-surface]`
 * by `CanonicalFeltSurface`. Every anchored gameplay slot portals its
 * absolutely-positioned wrapper into this element so that artifact
 * coordinates (resolved against the felt surface) and rendered DOM
 * coordinates share a single positioned ancestor whose viewport rect
 * exactly equals the canonical felt surface rect.
 *
 * Falls back to `[data-canonical-felt-surface]` only if the coord
 * frame hasn't mounted yet (bootstrap order safety), then rebinds via
 * MutationObserver.
 */
import { useEffect, useState } from 'react';

const COORD_FRAME_SELECTOR = '[data-canonical-felt-coord-frame]';
const SURFACE_SELECTOR = '[data-canonical-felt-surface]';

function findFrame(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(COORD_FRAME_SELECTOR) ??
    document.querySelector<HTMLElement>(SURFACE_SELECTOR)
  );
}

export function useCanonicalFeltCoordFrameElement(enabled: boolean): HTMLElement | null {
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
