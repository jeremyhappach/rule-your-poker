/**
 * Cribbage Task C2 — hand → pegging-row transport (visual overlay only).
 *
 * Fires a single face-up card flight from either the self hand card rect
 * or an opponent's seat cardback stack into the current pegging row.
 *
 * - Source (self):     rect captured synchronously by
 *                      CribbageMobileCardsTab before the RPC (via
 *                      [data-cribbage-hand-card-key]). Falls back to the
 *                      active-hand stage centroid if unavailable.
 * - Source (opponent): [data-card-anchor="opp-stack-${position}"].
 * - Destination:       center of the current pegging row element
 *                      ([data-wave4-pegging-row-slot="resolved"]).
 *
 * The overlay is strictly additive. Withhold coordination — hiding the
 * newly-played card in the authoritative pegging row until the flight
 * lands — is done by the parent (CribbageMobileGameTable) via a filter
 * passed to CribbageAnchoredPeggingRowMount. If either source or
 * destination cannot be resolved, the flight is skipped and onSettled()
 * still fires so the withhold releases immediately.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import type { CribbageCard } from '@/lib/cribbageTypes';

export type CribbagePlayCardSourceMode = 'self' | 'opponent';

export interface CribbagePlayCardIntent {
  id: string;
  mode: CribbagePlayCardSourceMode;
  card: CribbageCard;
  /** Required when mode === 'opponent'. Seat position (0..3). */
  opponentPosition?: number | null;
  /** Optional viewport-space source rect (self flight). */
  sourceRect?: { x: number; y: number; width: number; height: number } | null;
}

interface Props {
  intent: CribbagePlayCardIntent | null;
  onSettled: (id: string) => void;
}

interface Flight {
  key: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

const TRANSPORT_MS = 500;
const SETTLE_MS = 620;
const CARD_WIDTH_PX = 40;

function resolvePegRowRect(): DOMRect | null {
  const el = document.querySelector(
    '[data-wave4-pegging-row-slot="resolved"]',
  ) as HTMLElement | null;
  return el ? el.getBoundingClientRect() : null;
}

function resolveOpponentStackRect(position: number | null | undefined): DOMRect | null {
  if (position == null) return null;
  const el = document.querySelector(
    `[data-card-anchor="opp-stack-${position}"]`,
  ) as HTMLElement | null;
  return el ? el.getBoundingClientRect() : null;
}

function resolveSelfHandStageRect(): DOMRect | null {
  const el = document.querySelector('[data-crib-active-hand-stage]') as HTMLElement | null;
  return el ? el.getBoundingClientRect() : null;
}

export const CribbagePlayCardAnimation = ({ intent, onSettled }: Props) => {
  const [flight, setFlight] = useState<Flight | null>(null);
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(false);

  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);

  useEffect(() => {
    if (!intent) return;

    const dst = resolvePegRowRect();
    if (!dst || dst.width <= 0 || dst.height <= 0) {
      onSettledRef.current(intent.id);
      return;
    }
    const endX = dst.left + dst.width / 2;
    const endY = dst.top + dst.height / 2;

    let src: { left: number; top: number; width: number; height: number } | null = null;
    const perCard = intent.sourceRect;
    if (perCard && perCard.width > 0 && perCard.height > 0) {
      src = { left: perCard.x, top: perCard.y, width: perCard.width, height: perCard.height };
    } else {
      const fb =
        intent.mode === 'self'
          ? resolveSelfHandStageRect()
          : resolveOpponentStackRect(intent.opponentPosition);
      if (fb && fb.width > 0 && fb.height > 0) {
        src = { left: fb.left, top: fb.top, width: fb.width, height: fb.height };
      }
    }

    if (!src) {
      onSettledRef.current(intent.id);
      return;
    }

    const built: Flight = {
      key: intent.id,
      startX: src.left + src.width / 2,
      startY: src.top + src.height / 2,
      endX,
      endY,
    };

    setFlight(built);
    setAnimating(false);
    setVisible(true);

    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => setAnimating(true));
    });

    const settleTimer = window.setTimeout(() => {
      setVisible(false);
      setFlight(null);
      setAnimating(false);
      onSettledRef.current(intent.id);
    }, SETTLE_MS);

    return () => {
      cancelAnimationFrame(raf1);
      window.clearTimeout(settleTimer);
    };
  }, [intent]);

  if (!visible || !flight || !intent) return null;

  const x = animating ? flight.endX : flight.startX;
  const y = animating ? flight.endY : flight.startY;

  const node = (
    <div className="pointer-events-none" data-cribbage-play-card-animation="">
      <div
        style={{
          position: 'fixed',
          left: x,
          top: y,
          zIndex: 80,
          transform: `translate(-50%, -50%) scale(${animating ? 0.95 : 1})`,
          opacity: 1,
          transitionProperty: 'left, top, transform, opacity',
          transitionDuration: `${TRANSPORT_MS}ms`,
          transitionTimingFunction: 'ease-in-out',
          pointerEvents: 'none',
        }}
      >
        <CribbagePlayingCard card={intent.card} widthPx={CARD_WIDTH_PX} />
      </div>
    </div>
  );

  return createPortal(node, document.body);
};

export default CribbagePlayCardAnimation;
