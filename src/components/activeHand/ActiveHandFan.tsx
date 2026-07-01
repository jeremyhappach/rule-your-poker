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

import { useMemo, type CSSProperties, type ReactNode } from 'react';
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
}: ActiveHandFanProps) {
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

  if (!layout || cards.length === 0) {
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

  const tier = tierFromCardWidth(layout.cardWidth);
  const N = cards.length;
  const archDeg = applyFan ? layout.fanArchDeg : 0;
  const perCardDeg = N > 1 ? archDeg / (N - 1) : 0;

  return (
    <div
      {...{ [dataAttribute ?? `data-active-hand-fan`]: game }}
      className={className}
      style={{
        width: resolvedStageRect?.width,
        height: resolvedStageRect?.height,
        display: 'flex',
        // Composition contract: cards hug the bottom of the resolved
        // stage so the visible gap between the fan and the sibling
        // action zone equals the authored `interZoneClearancePctOfPane`
        // alone (not ½·stageHeight + clearance). The stage rect already
        // excludes the reserved lower zone + inter-zone clearance, so
        // aligning cards to flex-end lands them one clearance above the
        // action strip.
        alignItems: 'flex-end',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        style={{
          width: layout.totalWidth,
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
          const cardNode = (
            <PlayingCard
              card={card}
              tier={tier}
              activeHandShell
              faceFillPx={layout.cardWidth}
              style={{
                width: layout.cardWidth,
                height: layout.cardHeight,
                transform: applyFan ? `rotate(${rotationDeg.toFixed(3)}deg)` : undefined,
                transformOrigin: 'center bottom',
              }}
            />
          );
          if (renderCard) {
            return (
              <div
                key={`${card.rank}-${card.suit}-${index}`}
                style={{ marginLeft, zIndex: index }}
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
              style={{ marginLeft, zIndex: index }}
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
