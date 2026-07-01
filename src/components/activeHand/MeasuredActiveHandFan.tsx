/**
 * Convenience wrapper around <ActiveHandFan/> that measures its own
 * host div (or an authored ancestor selector) with ResizeObserver and
 * passes the measured rect as `paneRect` — the shared resolver then
 * subtracts the authored reserved-lower-zone % + inter-zone clearance %
 * to derive the card stage.
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
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(target);
    return () => ro.disconnect();
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
        applyFan={applyFan}
        renderCard={renderCard}
        dataAttribute={dataAttribute}
      />
    </div>
  );
}
