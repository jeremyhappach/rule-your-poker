/**
 * Convenience wrapper around <ActiveHandFan/> that measures its own
 * host div (or an authored ancestor selector) with ResizeObserver and
 * passes the measured rect as `paneRect` — the shared resolver then
 * subtracts the resolved lower-zone reservation to derive the card
 * stage.
 *
 * Containment contract (v3):
 *   - Also measures any `[data-active-hand-lower-zone]` descendant of
 *     the measured pane and forwards its rendered height as
 *     `lowerZoneMinPx`. The resolver uses
 *     `max(authored reservation, measured + safeArea)` so the sibling
 *     instruction / action / identity zone cannot be pushed below the
 *     mobile viewport.
 *   - Resolves `env(safe-area-inset-bottom)` once via a CSS probe and
 *     forwards it as `safeAreaBottomPx`.
 *
 * Used at the Holm / 3-5-7 active-self mount inside MobileGameTable
 * where the pane is not owned by this component but by the surrounding
 * active pane container. The card stage still remains a sibling of the
 * lower action / instruction / identity zone owned by the pane.
 */

import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import {
  ActiveHandFan,
  type ActiveHandFanRenderContext,
} from './ActiveHandFan';
import type { Card as CardType } from '@/lib/cardUtils';
import type { GameKey } from '@/lib/geometryLab/descriptorIndex';
import type { ActiveHandStageRect } from '@/lib/activeHand/activeHandLayoutSettings';

type PaneRect = ActiveHandStageRect;

const LOWER_ZONE_SELECTOR = '[data-active-hand-lower-zone]';

let cachedSafeAreaBottomPx: number | null = null;
function readSafeAreaBottomPx(): number {
  if (typeof window === 'undefined' || typeof document === 'undefined') return 0;
  if (cachedSafeAreaBottomPx !== null) return cachedSafeAreaBottomPx;
  try {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.pointerEvents = 'none';
    probe.style.width = '0';
    probe.style.height = 'env(safe-area-inset-bottom, 0px)';
    document.body.appendChild(probe);
    const h = probe.getBoundingClientRect().height;
    document.body.removeChild(probe);
    cachedSafeAreaBottomPx = Number.isFinite(h) ? h : 0;
  } catch {
    cachedSafeAreaBottomPx = 0;
  }
  return cachedSafeAreaBottomPx;
}

export interface MeasuredActiveHandFanProps {
  game: GameKey;
  cards: CardType[];
  capacity: number;
  /**
   * Optional CSS selector — when provided, this component walks up to
   * the nearest matching ancestor and measures that element instead of
   * its own host div. Useful when the visible card region is wrapped
   * by transform:scale wrappers whose measured rect is post-transform.
   */
  measureAncestorSelector?: string;
  /** When set, overrides the ancestor measurement height. */
  overrideHeightPx?: number;
  /** When set, overrides the ancestor measurement width. */
  overrideWidthPx?: number;
  className?: string;
  style?: CSSProperties;
  applyFan?: boolean;
  renderCard?: (ctx: ActiveHandFanRenderContext) => React.ReactNode;
  dataAttribute?: string;
}

export function MeasuredActiveHandFan({
  game,
  cards,
  capacity,
  measureAncestorSelector,
  overrideHeightPx,
  overrideWidthPx,
  className,
  style,
  applyFan,
  renderCard,
  dataAttribute,
}: MeasuredActiveHandFanProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [rect, setRect] = useState<PaneRect | null>(null);
  const [lowerZoneMinPx, setLowerZoneMinPx] = useState<number>(0);
  const [safeAreaBottomPx] = useState<number>(() => readSafeAreaBottomPx());

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const target: HTMLElement =
      (measureAncestorSelector &&
        (host.closest(measureAncestorSelector) as HTMLElement | null)) ||
      host;

    const measure = () => {
      const r = target.getBoundingClientRect();
      const w = overrideWidthPx ?? r.width;
      const h = overrideHeightPx ?? r.height;
      setRect((prev) =>
        prev &&
        Math.abs(prev.width - w) < 0.5 &&
        Math.abs(prev.height - h) < 0.5
          ? prev
          : { width: w, height: h },
      );

      // Sum the rendered heights of every lower-zone marker inside the
      // measured pane. Owners stamp their action/instruction/identity
      // sibling(s) with `data-active-hand-lower-zone` so the resolver
      // can guarantee containment.
      const zones = target.querySelectorAll<HTMLElement>(LOWER_ZONE_SELECTOR);
      let total = 0;
      zones.forEach((zone) => {
        const zr = zone.getBoundingClientRect();
        if (Number.isFinite(zr.height) && zr.height > 0) total += zr.height;
      });
      setLowerZoneMinPx((prev) => (Math.abs(prev - total) < 0.5 ? prev : total));
    };

    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(target);
    target.querySelectorAll<HTMLElement>(LOWER_ZONE_SELECTOR).forEach((el) => ro.observe(el));

    // Watch for lower-zone nodes appearing / disappearing so the
    // reservation stays in sync with phase-driven action visibility.
    const mo = new MutationObserver(() => measure());
    mo.observe(target, { childList: true, subtree: true });

    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [measureAncestorSelector, overrideHeightPx, overrideWidthPx]);

  const paneRect = useMemo(() => rect, [rect]);

  return (
    <div
      ref={hostRef}
      className={className}
      style={{ width: '100%', height: '100%', ...style }}
      data-measured-active-hand-fan={game}
    >
      <ActiveHandFan
        game={game}
        cards={cards}
        capacity={capacity}
        paneRect={paneRect}
        lowerZoneMinPx={lowerZoneMinPx}
        safeAreaBottomPx={safeAreaBottomPx}
        applyFan={applyFan}
        renderCard={renderCard}
        dataAttribute={dataAttribute}
      />
    </div>
  );
}
