/**
 * useShellFeltFrameElement — shell-aware geometry anchor for overlays.
 *
 * Returns the DOM element representing the canonical shell-owned felt
 * frame (`[data-canonical-shell-felt-frame]`). Overlay components
 * (spotlights, dimmers, focus cones) that previously assumed they
 * owned the table geometry can portal themselves into this element so
 * their `absolute inset-0` + `ellipse(50% 50% at 50% 50%)` clip aligns
 * with the actual canonical ellipse instead of leaking against a much
 * larger parent box (which previously produced the giant gray circular
 * backing artifact during the poker shell cutover).
 *
 * Polls briefly on first mount so callers that resolve before the
 * shell host paints still discover the frame on its first frame.
 */
import { useEffect, useState } from 'react';

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
      const next = document.querySelector<HTMLElement>(
        '[data-canonical-shell-felt-frame]',
      );
      if (next) {
        setEl(prev => (prev === next ? prev : next));
        // Keep polling lightly to handle remounts; back off after found.
        if (attempts > 0) return;
      }
      attempts += 1;
      if (attempts < MAX_ATTEMPTS) {
        raf = requestAnimationFrame(tick);
      }
    };

    tick();

    // Observe broad DOM changes to rebind across remounts.
    const observer = new MutationObserver(() => {
      const next = document.querySelector<HTMLElement>(
        '[data-canonical-shell-felt-frame]',
      );
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
