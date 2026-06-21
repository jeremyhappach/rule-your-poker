/**
 * CanonicalCardBack
 * -----------------
 * The single source of truth for hidden-card rendering across every
 * table, every game, every device. Reads exclusively from
 * useVisualPreferences() so a player's card-back preference is
 * immediately reflected everywhere hidden cards exist.
 *
 * Invariant:
 *   ONE TABLE · ONE DEAL · ONE CARD BACK
 *
 * No game (Cribbage, Gin Rummy, Holm, Horses, SCC, 3-5-7, Yahtzee,
 * Trivia, future showdowns) may render its own hidden-card artwork.
 * They MUST mount <CanonicalCardBack /> with width/height sizing only.
 *
 * Owns:
 *   • gradient (color + darkColor)
 *   • border + radius
 *   • team-logo accent (when the player picked a sports card-back)
 *   • aspect-ratio fallback when only width is given
 *
 * Consumers (foundation pass):
 *   • CardTransportRuntime           (flying hidden cards)
 *   • ShellOpponentCardBacks         (opponent strips, cribbage + gin)
 *   • PlayingCard isHidden branch    (generic hidden cards)
 *   • CribbagePlayingCard faceDown   (cribbage hand backs)
 *   • CribbageCutCardReveal back     (pre-flip cut card)
 *   • CribbageAnchoredCribCutMount   (crib stack)
 *   • GinRummyOpponentDrawAnimation  (draw-from-stock back)
 *
 * Future hidden-card surfaces (showdowns, Gin stock/discard, Holm
 * community) MUST be wired through this component — never via a
 * bespoke gradient div.
 */
import { CSSProperties } from 'react';
import { useVisualPreferences } from '@/hooks/useVisualPreferences';
import bullsLogo from '@/assets/bulls-logo.png';
import bearsLogo from '@/assets/bears-logo.png';
import cubsLogo from '@/assets/cubs-logo.png';
import hawksLogo from '@/assets/hawks-logo.png';

const TEAM_LOGOS: Record<string, string> = {
  bulls: bullsLogo,
  bears: bearsLogo,
  cubs: cubsLogo,
  hawks: hawksLogo,
};

export type CanonicalCardBackVariant =
  | 'flat'        // crisp 1px border, slight radius — opponent strips, transport
  | 'raised'      // shadow + 2px border — primary hand surfaces
  | 'flush';      // no border — embedded inside a parent that already has chrome

export interface CanonicalCardBackProps {
  /** Width in px. Required — caller owns geometry. */
  widthPx: number;
  /** Height in px. Defaults to widthPx * 1.5 (standard 2:3 card aspect). */
  heightPx?: number;
  /** Visual chrome. Defaults to 'flat'. */
  variant?: CanonicalCardBackVariant;
  /** Corner radius in px. Defaults derived from variant. */
  radiusPx?: number;
  /** Show the team-logo accent when the user picked a sports card-back. Default true. */
  showAccent?: boolean;
  className?: string;
  style?: CSSProperties;
  /**
   * Optional data attribute pass-through (e.g. data-card-anchor) — kept
   * loose so callers that need to mark anchors don't have to wrap in
   * another div.
   */
  dataAttrs?: Record<string, string>;
}

export function CanonicalCardBack({
  widthPx,
  heightPx,
  variant = 'flat',
  radiusPx,
  showAccent = true,
  className,
  style,
  dataAttrs,
}: CanonicalCardBackProps) {
  const { getCardBackColors, getCardBackId } = useVisualPreferences();
  const { color, darkColor } = getCardBackColors();
  const id = getCardBackId();
  const teamLogo = TEAM_LOGOS[id] || null;

  const h = heightPx ?? widthPx * 1.5;
  const r = radiusPx ?? (variant === 'raised' ? Math.max(2, widthPx * 0.08) : 2);

  const borderClass =
    variant === 'raised'
      ? 'border-2 border-amber-400 shadow-xl'
      : variant === 'flush'
        ? ''
        : 'border border-white/20';

  return (
    <div
      {...(dataAttrs ?? {})}
      data-canonical-card-back={variant}
      className={`relative overflow-hidden ${borderClass} ${className ?? ''}`.trim()}
      style={{
        width: widthPx,
        height: h,
        borderRadius: r,
        background: `linear-gradient(135deg, ${color} 0%, ${darkColor} 100%)`,
        ...style,
      }}
    >
      {showAccent && teamLogo ? (
        <div className="absolute inset-0 flex items-center justify-center p-[6%]">
          <img
            src={teamLogo}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-contain pointer-events-none select-none"
            draggable={false}
          />
        </div>
      ) : showAccent && !teamLogo ? (
        // Subtle inset frame for non-team backs so the gradient reads as
        // a card rather than a colored rectangle.
        <div
          className="absolute pointer-events-none rounded-[2px] border border-white/15"
          style={{ inset: '12%' }}
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}
