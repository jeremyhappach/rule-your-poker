/**
 * Cribbage Task C1 — discard-to-crib transport animation (visual overlay only).
 *
 * Mirrors the pattern used by GinRummyDiscardAnimation but with two
 * cardback flights (cribbage discards 2 cards in a heads-up game, 1 in
 * a 3+ player game) staggered by ~120ms.
 *
 * - Source (self):     per-card rect captured by CribbageMobileCardsTab
 *                      from [data-cribbage-hand-card-key]. If a rect is
 *                      missing/invalid, that card falls back to the
 *                      active-hand stage centroid.
 * - Source (opponent): [data-card-anchor="opp-stack-${position}"].
 * - Destination:       center of [data-card-anchor="crib"] (mounted by
 *                      Wave4CribCutGroupSlot inside CribbageAnchoredCribCutMount).
 *
 * All in-flight cards render face-down (CanonicalCardBack) — the crib
 * is a hidden pile, so no card identity is ever revealed by the overlay.
 *
 * The overlay is strictly additive:
 *   - Authoritative state (playerStates[pid].discardedToCrib, phase,
 *     crib pile length) is not mutated or delayed.
 *   - If either source or destination cannot be resolved, the affected
 *     flight is skipped and onSettled() still fires so no gating gets
 *     stuck.
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CanonicalCardBack } from './canonicalShell/CanonicalCardBack';
import { emitCribLabelWartimeEvent } from '@/lib/cribbage/cribLabelWartimeLedger';

export type CribbageDiscardSourceMode = 'self' | 'opponent';

export interface CribbageDiscardIntent {
  /** Unique id per emission. */
  id: string;
  mode: CribbageDiscardSourceMode;
  /** Required when mode === 'opponent'. Seat position (1..7). */
  opponentPosition?: number | null;
  /** How many cards to fly (1 or 2). */
  cardCount: number;
  /**
   * Optional per-card viewport-space rects captured synchronously by
   * the caller BEFORE authoritative state mutates. Length should equal
   * cardCount when provided.
   */
  sourceRects?: Array<{ x: number; y: number; width: number; height: number } | null>;
  /**
   * Number of crib cards already visually admitted at intent-start.
   * Card i (0-indexed) targets `[data-card-anchor="crib-slot-${startingOrdinal + i + 1}"]`.
   * If undefined, falls back to legacy slot-centroid destination.
   */
  startingOrdinal?: number;
}

interface Props {
  intent: CribbageDiscardIntent | null;
  onSettled: (id: string) => void;
}

interface Flight {
  key: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  delayMs: number;
}

const STAGGER_MS = 120;
const TRANSPORT_MS = 550;
const SETTLE_MS = 700;
const CARD_WIDTH_PX = 40;

function resolveCribRect(): DOMRect | null {
  const el = document.querySelector('[data-card-anchor="crib"]') as HTMLElement | null;
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

export const CribbageDiscardToCribAnimation = ({ intent, onSettled }: Props) => {
  const [flights, setFlights] = useState<Flight[] | null>(null);
  const [animating, setAnimating] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState(false);

  const onSettledRef = useRef(onSettled);
  useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);

  useEffect(() => {
    if (!intent) return;

    const dst = resolveCribRect();
    const dstAnchorEl = document.querySelector<HTMLElement>('[data-card-anchor="crib"]');
    const dstAnchorMode = dstAnchorEl?.getAttribute('data-wave4-cribcut-slot') ?? null;
    const dstArtifactId = dstAnchorEl?.getAttribute('data-artifact-id') ?? null;
    emitCribLabelWartimeEvent('crib_discard_destination_resolved', {
      intentId: intent.id,
      mode: intent.mode,
      opponentPosition: intent.opponentPosition ?? null,
      cardCount: intent.cardCount,
      destRect: dst
        ? {
            x: Math.round(dst.left),
            y: Math.round(dst.top),
            width: Math.round(dst.width),
            height: Math.round(dst.height),
            centerX: Math.round(dst.left + dst.width / 2),
            centerY: Math.round(dst.top + dst.height / 2),
          }
        : null,
      dstAnchorFound: !!dstAnchorEl,
      dstAnchorMode,
      dstArtifactId,
    });
    if (!dst || dst.width <= 0 || dst.height <= 0) {
      onSettledRef.current(intent.id);
      return;
    }
    const endX = dst.left + dst.width / 2;
    const endY = dst.top + dst.height / 2;

    // Fallback source rect used when a per-card rect is unavailable.
    const fallback: DOMRect | null =
      intent.mode === 'self'
        ? resolveSelfHandStageRect()
        : resolveOpponentStackRect(intent.opponentPosition);

    // ── Parked crib-group / cut card rect at destination computation ─
    const parkedGroupEl = document.querySelector<HTMLElement>('[data-parked-crib-group]');
    const cutEl = document.querySelector<HTMLElement>('[data-cribbage-cut-card]')
      ?? dstAnchorEl?.querySelector<HTMLElement>('[data-cribbage-cut-card]')
      ?? null;
    const rectOf = (el: HTMLElement | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
        centerX: Math.round(r.left + r.width / 2),
        centerY: Math.round(r.top + r.height / 2),
      };
    };
    const parkedGroupRect = rectOf(parkedGroupEl);
    const cutCardRect = rectOf(cutEl);
    const slotRect = rectOf(dstAnchorEl);
    const cribToCutGapPx =
      parkedGroupRect && cutCardRect
        ? Math.round(cutCardRect.x - (parkedGroupRect.x + parkedGroupRect.width))
        : null;
    const currentCribCount = parkedGroupEl
      ? parkedGroupEl.querySelectorAll('[data-canonical-card-back], img, svg').length
      : 0;
    // Geometry policy label — the current destination anchor is the crib
    // slot centroid; the transport does not currently adapt per resulting
    // crib count. Recorded so contradiction analysis can prove whether
    // 0-, 2-, or 4-card geometry was used.
    const geometryPolicy = 'slot-centroid';

    const built: Flight[] = [];
    for (let i = 0; i < intent.cardCount; i += 1) {
      const perCard = intent.sourceRects?.[i];
      let src: { left: number; top: number; width: number; height: number } | null = null;
      let srcOrigin: 'perCard' | 'fallback' | 'none' = 'none';
      if (perCard && perCard.width > 0 && perCard.height > 0) {
        src = { left: perCard.x, top: perCard.y, width: perCard.width, height: perCard.height };
        srcOrigin = 'perCard';
      } else if (fallback && fallback.width > 0 && fallback.height > 0) {
        src = { left: fallback.left, top: fallback.top, width: fallback.width, height: fallback.height };
        srcOrigin = 'fallback';
      }
      emitCribLabelWartimeEvent('crib_discard_source_resolved', {
        intentId: intent.id,
        cardIndex: i,
        srcOrigin,
        srcRect: src
          ? {
              x: Math.round(src.left),
              y: Math.round(src.top),
              width: Math.round(src.width),
              height: Math.round(src.height),
              centerX: Math.round(src.left + src.width / 2),
              centerY: Math.round(src.top + src.height / 2),
            }
          : null,
        endX: Math.round(endX),
        endY: Math.round(endY),
      });

      const expectedCribCountAfterLanding = currentCribCount + (i + 1);
      const expectedParkedCenter = parkedGroupRect
        ? { x: parkedGroupRect.centerX, y: parkedGroupRect.centerY }
        : slotRect
          ? { x: slotRect.centerX, y: slotRect.centerY }
          : null;
      emitCribLabelWartimeEvent('crib_discard_destination_computed', {
        transportIntentId: intent.id,
        cardIndex: i,
        discardOrdinal: i + 1,
        discardingPlayerId:
          intent.mode === 'self' ? 'self' : `opp-${intent.opponentPosition ?? 'null'}`,
        currentAuthoritativeCribCount: currentCribCount,
        expectedCribCountAfterLanding,
        cribGeometryUsed:
          currentCribCount === 0
            ? '0-card'
            : currentCribCount <= 2
              ? '2-card'
              : '4-card',
        geometryPolicy,
        destinationAnchor: 'data-card-anchor="crib"',
        destinationComponent: 'CribbageAnchoredCribCutMount/Wave4CribCutGroupSlot',
        sourceRect: src
          ? {
              x: Math.round(src.left),
              y: Math.round(src.top),
              width: Math.round(src.width),
              height: Math.round(src.height),
              centerX: Math.round(src.left + src.width / 2),
              centerY: Math.round(src.top + src.height / 2),
            }
          : null,
        computedDestinationRect: dst
          ? {
              x: Math.round(dst.left),
              y: Math.round(dst.top),
              width: Math.round(dst.width),
              height: Math.round(dst.height),
            }
          : null,
        computedDestinationCenter: { x: Math.round(endX), y: Math.round(endY) },
        cribCutSlotRect: slotRect,
        currentCribGroupCenter: parkedGroupRect
          ? { x: parkedGroupRect.centerX, y: parkedGroupRect.centerY }
          : null,
        expectedParkedCribGroupCenter: expectedParkedCenter,
        cutCardRect,
        cutCardCenter: cutCardRect ? { x: cutCardRect.centerX, y: cutCardRect.centerY } : null,
        cribToCutGapPx,
      });

      // Contradiction: destination center materially differs from where
      // the parked crib group will actually sit after landing. Threshold
      // is 4px in either axis (below sub-pixel jitter noise).
      if (expectedParkedCenter) {
        const dx = Math.abs(Math.round(endX) - expectedParkedCenter.x);
        const dy = Math.abs(Math.round(endY) - expectedParkedCenter.y);
        if (dx > 4 || dy > 4) {
          emitCribLabelWartimeEvent('crib_transport_destination_mismatch', {
            transportIntentId: intent.id,
            cardIndex: i,
            discardOrdinal: i + 1,
            currentCribCount,
            expectedCribCountAfterLanding,
            computedDestinationCenter: { x: Math.round(endX), y: Math.round(endY) },
            expectedParkedCribGroupCenter: expectedParkedCenter,
            deltaX: dx,
            deltaY: dy,
            cribGeometryUsed:
              currentCribCount === 0
                ? '0-card'
                : currentCribCount <= 2
                  ? '2-card'
                  : '4-card',
            slotRect,
            cutCardRect,
          });
        }
      }

      if (!src) continue;
      built.push({
        key: `${intent.id}-${i}`,
        startX: src.left + src.width / 2,
        startY: src.top + src.height / 2,
        endX,
        endY,
        delayMs: i * STAGGER_MS,
      });
    }

    if (built.length === 0) {
      onSettledRef.current(intent.id);
      return;
    }

    setFlights(built);
    setVisible(true);
    setAnimating({});

    // Kick off animation per flight after its stagger delay.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        built.forEach((f) => {
          window.setTimeout(() => {
            setAnimating((prev) => ({ ...prev, [f.key]: true }));
          }, f.delayMs);
        });
      });
    });

    const totalMs = SETTLE_MS + (built.length - 1) * STAGGER_MS;
    const settleTimer = window.setTimeout(() => {
      setVisible(false);
      setFlights(null);
      setAnimating({});
      onSettledRef.current(intent.id);
    }, totalMs);

    return () => {
      cancelAnimationFrame(raf1);
      window.clearTimeout(settleTimer);
    };
  }, [intent]);

  if (!visible || !flights || flights.length === 0) return null;

  const node = (
    <div className="pointer-events-none" data-cribbage-discard-animation="">
      {flights.map((f) => {
        const on = animating[f.key] === true;
        const x = on ? f.endX : f.startX;
        const y = on ? f.endY : f.startY;
        return (
          <div
            key={f.key}
            style={{
              position: 'fixed',
              left: x,
              top: y,
              zIndex: 80,
              transform: `translate(-50%, -50%) scale(${on ? 0.9 : 1})`,
              opacity: 1,
              transitionProperty: 'left, top, transform, opacity',
              transitionDuration: `${TRANSPORT_MS}ms`,
              transitionTimingFunction: 'ease-in-out',
              pointerEvents: 'none',
            }}
          >
            <CanonicalCardBack widthPx={CARD_WIDTH_PX} variant="flat" radiusPx={3} />
          </div>
        );
      })}
    </div>
  );

  return createPortal(node, document.body);
};

export default CribbageDiscardToCribAnimation;
