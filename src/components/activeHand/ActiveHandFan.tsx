/**
 * Shared Active Player Hand fan renderer.
 *
 * Owned by the pane / shell (which measures the full active pane and
 * renders the lower action/instruction/identity zone as its sibling).
 * This component owns ONLY the resolved card stage and card presentation.
 *
 * Contract:
 *   - Owner passes `paneRect` (measured full active pane) OR an explicit
 *     `stageRect` (bypass pane-based reservation math).
 *   - This component reads the per-game `ActiveHandLayoutPolicy` from
 *     the reactive committed-settings store, resolves card width / height
 *     / overlap / arch, and lays out the cards.
 *   - Cards render through the canonical `<PlayingCard/>` primitive with
 *     `activeHandShell` enabled — a single Holm-parity physical
 *     treatment (corner radius, border, highlight, drop shadow, material
 *     surface, resting lift). Face content sizing (`small`/`medium`/
 *     `large`) is preserved and picked from the resolved card width via
 *     `getCardSize`.
 *   - The component does not render any HUD, action button, or identity
 *     content — those remain owned by the calling pane.
 */

import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { PlayingCard, getCardSize } from '@/components/PlayingCard';
import type { Card as CardType } from '@/lib/cardUtils';
import type { CardFrontTierKey } from '@/lib/cardFrontDesign/config';
import type { GameKey } from '@/lib/geometryLab/descriptorIndex';
import {
  computeStageRectFromPane,
  resolveActiveHandLayout,
  useActiveHandLayoutPolicy,
  type ActiveHandStageRect,
  type ResolvedActiveHandRow,
} from '@/lib/activeHand/activeHandLayoutSettings';
import { useActiveHandCardRectPublisher } from '@/lib/activeHand/activeHandCardRectStore';
import {
  record357DealLandingTrace,
  rectFromDomRect,
} from '@/lib/canonicalShell/cardTransport/threeFiveSevenDealLandingTrace';

const DEFAULT_ASPECT = 2 / 3;

export interface ActiveHandFanRenderContext {
  card: CardType;
  index: number;
  cardWidthPx: number;
  cardHeightPx: number;
  /** Signed rotation deg from arch center. */
  rotationDeg: number;
  /** Overlap px applied as marginLeft on cards after the first. */
  overlapPx: number;
  /** Face-density tier resolved from card width. */
  tier: CardFrontTierKey;
  /** Convenience: `PlayingCard` node with the shared physical shell applied. */
  card_node: ReactNode;
}

export interface ActiveHandFanProps {
  game: GameKey;
  cards: CardType[];
  /**
   * Explicit visual capacity for the phase (e.g. 6 for Crib pre-discard,
   * 10 for Gin, 3/5/7 for 3-5-7 rounds). Sizing is locked against this
   * capacity, not `cards.length`, so cards don't re-grow as they are
   * played out of the hand.
   */
  capacity: number;
  /**
   * Measured full active pane rect. When provided, the resolver
   * subtracts the authored reserved lower-zone % + inter-zone clearance
   * % to derive the internal card stage rect. Owners render the lower
   * zone as a sibling of this component.
   */
  paneRect?: ActiveHandStageRect | null;
  /**
   * Explicit card-stage rect. Bypasses pane-based reservation math when
   * an owner has already sized the stage (e.g. legacy Cribbage stage).
   */
  stageRect?: ActiveHandStageRect | null;
  aspect?: number;
  /** Optional custom card renderer (selection state, click handling, etc.). */
  renderCard?: (ctx: ActiveHandFanRenderContext) => ReactNode;
  /**
   * When true, the fan container aligns cards to a horizontal centerline
   * with a subtle arch/rotation per card. Default: true.
   */
  applyFan?: boolean;
  /**
   * Runtime-measured minimum rendered height of the sibling lower zone
   * (action / instruction / identity). When provided together with
   * `paneRect`, the resolver escalates its reservation to
   * `max(authored, measured + safeArea)` so the sibling zone is never
   * pushed below the mobile viewport. Ignored when `stageRect` is
   * provided directly (stage already excludes the lower zone).
   */
  lowerZoneMinPx?: number;
  /**
   * Extra bottom safe-area allowance in px. Added to `lowerZoneMinPx`
   * when the resolver reserves the lower zone. Typically the resolved
   * value of `env(safe-area-inset-bottom)`.
   */
  safeAreaBottomPx?: number;
  className?: string;
  style?: CSSProperties;

  /**
   * Optional data attribute for outer-container introspection. Defaults
   * to `data-active-hand-fan="{game}"`.
   */
  dataAttribute?: string;
  /** Trace-only owner key for the committed ActiveHandFan layout. */
  activeHandFanRenderKey?: string | null;
  /** Trace-only card ids matching `cards` order after transport ownership claim. */
  cardIds?: string[];
}

/**
 * Resolve the face-density tier from the resolved card width. The
 * classic thresholds (>=64 → large, >=44 → medium, else small) mirror
 * `getCardSize` intent while flowing through the Card Front Design tier
 * naming used by `<PlayingCard tier=…/>`.
 */
function tierFromCardWidth(cardWidthPx: number): CardFrontTierKey {
  if (cardWidthPx >= 64) return 'large';
  if (cardWidthPx >= 44) return 'medium';
  return 'small';
}

export function ActiveHandFan({
  game,
  cards,
  capacity,
  paneRect,
  stageRect,
  aspect = DEFAULT_ASPECT,
  renderCard,
  applyFan = true,
  lowerZoneMinPx,
  safeAreaBottomPx,
  className,
  style,
  dataAttribute,
  activeHandFanRenderKey,
  cardIds,
}: ActiveHandFanProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firstSettledRecordedRef = useRef<Set<string>>(new Set());
  const resizeLoggedRef = useRef<Set<string>>(new Set());
  const firstRectRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  const policy = useActiveHandLayoutPolicy(game);

  const resolvedStageRect: ActiveHandStageRect | null = useMemo(() => {
    if (stageRect) return stageRect;
    if (paneRect)
      return computeStageRectFromPane(paneRect, policy, {
        measuredLowerZoneMinPx: lowerZoneMinPx,
        safeAreaBottomPx,
      }).stageRect;
    return null;
  }, [stageRect, paneRect, policy, lowerZoneMinPx, safeAreaBottomPx]);


  const layout: ResolvedActiveHandRow | null = useMemo(
    () => resolveActiveHandLayout(resolvedStageRect, Math.max(1, capacity), policy, aspect),
    [resolvedStageRect, capacity, policy, aspect],
  );

  // Publish the resolved final card geometry so deal-transport destination
  // anchors (e.g. ThreeFiveSevenDealOrchestrator) can size their landing
  // anchors to the exact final card rect — cards fly directly into their
  // final size, with no post-settle snap.
  const publishRect = useMemo(
    () =>
      layout && layout.cardWidth > 0 && layout.cardHeight > 0
        ? {
            cardWidthPx: layout.cardWidth,
            cardHeightPx: layout.cardHeight,
            publishedAt: performance.now(),
            activeHandFanRenderKey: activeHandFanRenderKey ?? null,
          }
        : null,
    [layout?.cardWidth, layout?.cardHeight, activeHandFanRenderKey],
  );
  useActiveHandCardRectPublisher(game, publishRect);

  useLayoutEffect(() => {
    if (game !== 'threeFiveSeven') return;
    const root = rootRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-357-deal-card-id]'));
    const observers: ResizeObserver[] = [];
    nodes.forEach((wrapper) => {
      const cardId = wrapper.getAttribute('data-357-deal-card-id');
      if (!cardId) return;
      const target = wrapper.querySelector<HTMLElement>('[data-playing-card-root]') ?? wrapper;
      const renderKey = wrapper.getAttribute('data-357-rendered-active-card-render-key') ?? null;
      const r = target.getBoundingClientRect();
      const rect = rectFromDomRect(r);
      if (!firstSettledRecordedRef.current.has(cardId)) {
        firstSettledRecordedRef.current.add(cardId);
        firstRectRef.current.set(cardId, { w: rect.w, h: rect.h });
        record357DealLandingTrace(cardId, {
          renderedCardRectOnFirstSettledFrame: rect,
          renderedActiveCardRenderKey: renderKey,
          activeHandFanRenderKey: activeHandFanRenderKey ?? null,
        });
      }
      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          if (resizeLoggedRef.current.has(cardId)) return;
          const next = rectFromDomRect(target.getBoundingClientRect());
          const first = firstRectRef.current.get(cardId);
          if (!first) return;
          if (Math.abs(next.w - first.w) < 0.5 && Math.abs(next.h - first.h) < 0.5) return;
          resizeLoggedRef.current.add(cardId);
          record357DealLandingTrace(cardId, {
            firstPostSettleResizeRect: next,
            renderedActiveCardRenderKey: renderKey,
            activeHandFanRenderKey: activeHandFanRenderKey ?? null,
          });
        });
        ro.observe(target);
        observers.push(ro);
      }
    });
    return () => observers.forEach((ro) => ro.disconnect());
  }, [game, cards.length, activeHandFanRenderKey, cardIds?.join('|')]);

  if (cards.length === 0) {
    return (
      <div
        {...{ [dataAttribute ?? `data-active-hand-fan`]: game }}
        className={className}
        style={{
          width: resolvedStageRect?.width,
          height: resolvedStageRect?.height,
          ...style,
        }}
      />
    );
  }

  // Fallback path: cards are present but the layout resolver returned
  // null (stage rect unmeasured or zero-sized). Instead of rendering an
  // empty container — which hides authoritative cards until the stage
  // measures — synthesize a minimal fixed-size row so renderCard still
  // fires once per card and the cards remain visible. When the stage
  // measures, the resolver produces a proper `layout` and the normal
  // path takes over on the next render.
  const effectiveLayout: ResolvedActiveHandRow = layout ?? (() => {
    const fallbackCardWidth = 44;
    const fallbackCardHeight = Math.round(fallbackCardWidth / aspect);
    const N0 = cards.length;
    const fallbackOverlap = N0 > 4 ? Math.round(fallbackCardWidth * 0.4) : Math.round(fallbackCardWidth * 0.15);
    const totalWidth = N0 * fallbackCardWidth - (N0 - 1) * fallbackOverlap;
    return {
      cardWidth: fallbackCardWidth,
      cardHeight: fallbackCardHeight,
      overlapPx: fallbackOverlap,
      totalWidth,
      appliedOverlap: fallbackOverlap / fallbackCardWidth,
      fanArchDeg: 0,
      visualBounds: { width: totalWidth, height: fallbackCardHeight, minX: 0, maxX: totalWidth, minY: 0, maxY: fallbackCardHeight },
      rowOffsetX: 0,
      rowOffsetY: 0,
      stageRect: resolvedStageRect ?? { width: totalWidth, height: fallbackCardHeight },
      stageTopInsetPx: 0,
      stageBottomInsetPx: 0,
    } as ResolvedActiveHandRow;
  })();

  const tier = tierFromCardWidth(layout.cardWidth);
  const N = cards.length;
  const archDeg = applyFan ? layout.fanArchDeg : 0;
  const perCardDeg = N > 1 ? archDeg / (N - 1) : 0;

  return (
    <div
      ref={rootRef}
      {...{ [dataAttribute ?? `data-active-hand-fan`]: game }}
      className={className}
      style={{
        width: resolvedStageRect?.width,
        height: resolvedStageRect?.height,
        // The resolver already validates the transformed fan bounds
        // (rotated cards + overlap + shell shadow allowance) against this
        // stage. Position the raw row from the resolver offsets instead
        // of centering unrotated row math, otherwise a later visually
        // larger fan can clip despite the nominal row fitting.
        position: 'relative',
        overflow: 'visible',
        ...style,
      }}
    >
      <div
        style={{
          width: layout.totalWidth,
          position: 'absolute',
          left: 0,
          top: 0,
          transform: `translate(${layout.rowOffsetX.toFixed(3)}px, ${layout.rowOffsetY.toFixed(3)}px)`,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
        }}
      >
        {cards.map((card, index) => {
          const rotationDeg = applyFan
            ? -archDeg / 2 + perCardDeg * index
            : 0;
          const marginLeft = index === 0 ? 0 : -layout.overlapPx;
          // Rotation is applied to the wrapper so that any selection /
          // interaction outline rendered by `renderCard` (rings,
          // highlights, lifts) inherits the exact same transform frame
          // as the card face — the outline follows fan rotation, scale,
          // and translation instead of being an axis-aligned overlay
          // around a rotated card.
          const wrapperTransform = applyFan
            ? `rotate(${rotationDeg.toFixed(3)}deg)`
            : undefined;
          const cardNode = (
            <PlayingCard
              card={card}
              tier={tier}
              activeHandShell
              faceFillPx={layout.cardWidth}
              style={{
                width: layout.cardWidth,
                height: layout.cardHeight,
              }}
            />
          );
          const traceCardId = cardIds?.[index] ?? null;
          const renderedActiveCardRenderKey = traceCardId
            ? `${activeHandFanRenderKey ?? 'ActiveHandFan'}|card:${traceCardId}|idx:${index}`
            : null;
          if (renderCard) {
            return (
              <div
                key={`${card.rank}-${card.suit}-${index}`}
                data-357-deal-card-id={traceCardId ?? undefined}
                data-357-rendered-active-card-render-key={renderedActiveCardRenderKey ?? undefined}
                style={{
                  marginLeft,
                  zIndex: index,
                  transform: wrapperTransform,
                  transformOrigin: 'center bottom',
                }}
              >
                {renderCard({
                  card,
                  index,
                  cardWidthPx: layout.cardWidth,
                  cardHeightPx: layout.cardHeight,
                  rotationDeg,
                  overlapPx: layout.overlapPx,
                  tier,
                  card_node: cardNode,
                })}
              </div>
            );
          }
          return (
            <div
              key={`${card.rank}-${card.suit}-${index}`}
              data-357-deal-card-id={traceCardId ?? undefined}
              data-357-rendered-active-card-render-key={renderedActiveCardRenderKey ?? undefined}
              style={{
                marginLeft,
                zIndex: index,
                transform: wrapperTransform,
                transformOrigin: 'center bottom',
              }}
            >
              {cardNode}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Re-export helpers for callers that also want to size the lower zone. */
export { computeStageRectFromPane, getCardSize };
export type { ActiveHandStageRect, ResolvedActiveHandRow };
