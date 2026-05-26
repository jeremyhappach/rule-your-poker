/**
 * useShellFeltFrameElement — shell-aware geometry anchor for overlays.
 *
 * Returns the DOM element representing the canonical shell-owned felt
 * SURFACE (`[data-canonical-felt-surface]`). That node is the actual
 * elliptical felt with `overflow: hidden` and `rounded-[50%/45%]`, so
 * overlay components portaled into it (spotlights, dimmers, focus
 * cones) inherit the exact canonical ellipse via overflow-clip — no
 * approximated `ellipse(50% 50%)` clip-path against a larger parent
 * box (which produced the visibly-offset second-ellipse artifact under
 * the poker shell cutover).
 *
 * Falls back to the wider `[data-canonical-shell-felt-frame]` wrapper
 * only if the surface node hasn't mounted yet, then rebinds via the
 * MutationObserver as soon as the surface appears.
 */
import { useEffect, useState } from 'react';

const SURFACE_SELECTOR = '[data-canonical-felt-surface]';
const FRAME_SELECTOR = '[data-canonical-shell-felt-frame]';

function findFrame(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>(SURFACE_SELECTOR) ??
    document.querySelector<HTMLElement>(FRAME_SELECTOR)
  );
}

export function useShellFeltFrameElement(enabled: boolean): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setEl(null);
      return;
    }

    let cancelled = false;
    let raf = 0;
    let attempts = 0;
    const MAX_ATTEMPTS = 30; // ~500ms at 60fps

    const tick = () => {
      if (cancelled) return;
      const next = findFrame();
      if (next) {
        setEl(prev => (prev === next ? prev : next));
        if (attempts > 0) return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        raf = requestAnimationFrame(tick);
      }
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
