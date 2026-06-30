/**
 * useCanonicalFeltInteractionLayerElement — shell-owned hit-test layer
 * for interactive felt artifacts.
 *
 * This is intentionally separate from `[data-canonical-felt-coord-frame]`:
 * normal visual artifacts keep their existing felt stacking, while controls
 * that must beat gameplay slot-content can portal into the shell interaction
 * layer. No fallback to the visual coord frame — if the shell layer is not
 * mounted, consumers render no interaction portal rather than silently
 * regressing to the z-index-blocked layer.
 */
import { useEffect, useState } from 'react';

const INTERACTION_LAYER_SELECTOR = '[data-canonical-felt-interaction-layer]';

function findLayer(): HTMLElement | null {
  return document.querySelector<HTMLElement>(INTERACTION_LAYER_SELECTOR);
}

export function useCanonicalFeltInteractionLayerElement(enabled: boolean): HTMLElement | null {
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
      const next = findLayer();
      if (next) {
        setEl(prev => (prev === next ? prev : next));
        if (attempts > 0) return;
      }
      attempts += 1;
      if (attempts < MAX) raf = requestAnimationFrame(tick);
    };
    tick();

    const observer = new MutationObserver(() => {
      const next = findLayer();
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
