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

/**
 * Variants differ ONLY in geometry (border weight + shadow intensity).
 * They MUST share the same design language:
 *   • same gradient (135deg, color → darkColor)
 *   • same border color  (rgba(255,255,255,0.22))
 *   • same corner radius scaling rule (max(3, width * 0.08))
 *   • same accent (team logo OR inset frame)
 *
 * If you find yourself adding amber borders, different radii, or
 * variant-specific gradients, STOP — you are breaking the invariant.
 */
export type CanonicalCardBackVariant =
  | 'flat'        // 1px border, no shadow — opponent strips, transport, cut
  | 'raised'      // 2px border, soft shadow — primary hand surfaces, stock
  | 'flush';      // 0 border, no shadow — embedded inside existing chrome

// SHARED DESIGN LANGUAGE — do not branch these by variant.
const BORDER_COLOR = 'rgba(255,255,255,0.22)';
const ACCENT_FRAME_COLOR = 'rgba(255,255,255,0.18)';
const RAISED_SHADOW = '0 4px 12px rgba(0,0,0,0.35)';

function variantGeometry(variant: CanonicalCardBackVariant) {
  switch (variant) {
    case 'raised':
      return { borderWidth: 2, boxShadow: RAISED_SHADOW };
    case 'flush':
      return { borderWidth: 0, boxShadow: 'none' };
    case 'flat':
    default:
      return { borderWidth: 1, boxShadow: 'none' };
  }
}

export interface CanonicalCardBackProps {
  /** Width in px. Required — caller owns geometry. */
  widthPx: number;
  /** Height in px. Defaults to widthPx * 1.5 (standard 2:3 card aspect). */
  heightPx?: number;
  /** Visual chrome. Defaults to 'flat'. */
  variant?: CanonicalCardBackVariant;
  /** Corner radius in px. Defaults to the shared scaling rule. */
  radiusPx?: number;
  className?: string;
  style?: CSSProperties;
  dataAttrs?: Record<string, string>;
}

/**
 * IDENTITY IS NOT OPTIONAL.
 *
 * There is intentionally NO `showAccent` / `hideLogo` / `plain` prop.
 * Every canonical card back paints the user's accent (team logo or
 * inset frame). Variants differ in geometry only — never in identity.
 *
 * If a surface is "too small for a logo," shrink the surface, don't
 * strip the accent: a player must recognize their card back at any
 * size, anywhere on the table.
 */
export function CanonicalCardBack({
  widthPx,
  heightPx,
  variant = 'flat',
  radiusPx,
  className,
  style,
  dataAttrs,
}: CanonicalCardBackProps) {
  const { getCardBackColors, getCardBackId } = useVisualPreferences();
  const { color, darkColor } = getCardBackColors();
  const id = getCardBackId();
  const teamLogo = TEAM_LOGOS[id] || null;

  const h = heightPx ?? widthPx * 1.5;
  // Shared radius rule — identical across variants.
  const r = radiusPx ?? Math.max(3, widthPx * 0.08);
  const { borderWidth, boxShadow } = variantGeometry(variant);

  // Accent geometry scales with the surface so a 16px opponent back
  // and a 100px hand card read as the same artwork at different sizes.
  const accentInsetPct = 10;
  const accentRadius = Math.max(1, r * 0.6);

  return (
    <div
      {...(dataAttrs ?? {})}
      data-playing-card-root=""
      data-canonical-card-back={variant}
      data-cb-pref-id={id}
      data-cb-accent={teamLogo ? 'logo' : 'frame'}
      className={`relative overflow-hidden ${className ?? ''}`.trim()}
      style={{
        width: widthPx,
        height: h,
        borderRadius: r,
        borderStyle: borderWidth > 0 ? 'solid' : 'none',
        borderWidth,
        borderColor: BORDER_COLOR,
        boxShadow,
        background: `linear-gradient(135deg, ${color} 0%, ${darkColor} 100%)`,
        ...style,
      }}
    >
      {teamLogo ? (
        <div
          className="absolute inset-0 flex items-center justify-center pointer-events-none"
          style={{ padding: `${accentInsetPct}%` }}
          aria-hidden="true"
        >
          <img
            src={teamLogo}
            alt=""
            aria-hidden="true"
            className="w-full h-full object-contain select-none"
            draggable={false}
          />
        </div>
      ) : (
        <div
          className="absolute pointer-events-none"
          style={{
            inset: `${accentInsetPct}%`,
            borderRadius: accentRadius,
            border: `1px solid ${ACCENT_FRAME_COLOR}`,
          }}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
