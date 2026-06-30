/**
 * CribbagePlayingCard — thin wrapper around the canonical PlayingCard
 * primitive (the single source of card-face rendering).
 *
 * This component intentionally OWNS NO face CSS. Rank/suit/pip layout
 * and proportions are resolved by `PlayingCard` via the Card Front
 * Design policy (`resolveCardFrontStyle` → small/medium/large tiers).
 *
 * Responsibilities retained here (preserve callsite contracts):
 *   - Accept CribbageCard suit-name shape and forward to PlayingCard
 *     (PlayingCard's normalizer accepts both symbol and word suits).
 *   - Accept the discrete xs/sm/md/lg size token and map it onto
 *     PlayingCard's sm/md/lg/xl container ladder + an explicit inline
 *     px width/height so legacy callsites render at parity.
 *   - Accept `widthPx` rect-driven override (used by Wave 5 resolvers
 *     and the cut-card reveal) and forward as both inline width/height
 *     and `faceFillPx` so the canonical face resolver sizes typography
 *     against the true card rect.
 *   - Face-down → CanonicalCardBack directly (already shell-owned).
 *
 * Tier defaults to 'medium' (felt gameplay cards). Active-player hand
 * callsites pass `tier="large"`.
 */

import type { CribbageCard } from '@/lib/cribbageTypes';
import type { Card as CanonicalCardType } from '@/lib/cardUtils';
import { CanonicalCardBack } from '@/components/canonicalShell/CanonicalCardBack';
import { PlayingCard, type CardSize as CanonicalCardSize } from '@/components/PlayingCard';
import type { CardFrontTierKey } from '@/lib/cardFrontDesign/config';

type CribbageSizeToken = 'xs' | 'sm' | 'md' | 'lg';

interface CribbagePlayingCardProps {
  card: CribbageCard;
  size?: CribbageSizeToken;
  faceDown?: boolean;
  /** Retained for backwards compat; CanonicalCardBack reads visual prefs. */
  cardBackColors?: { color: string; darkColor: string };
  /** Rect-driven width override (px). Height derives from 2:3 aspect. */
  widthPx?: number;
  /** Face-density tier — see Card Front Design. Defaults to 'medium'. */
  tier?: CardFrontTierKey;
}

// Discrete size → (canonical size token, baseline px). Widths match
// the previous bespoke ladder (xs 24, sm 32, md 40, lg 48) at a 2:3
// aspect so geometry is byte-identical to the prior renderer.
const SIZE_TABLE: Record<CribbageSizeToken, { canonical: CanonicalCardSize; width: number }> = {
  xs: { canonical: 'sm', width: 24 },
  sm: { canonical: 'sm', width: 32 },
  md: { canonical: 'md', width: 40 },
  lg: { canonical: 'lg', width: 48 },
};

export const CribbagePlayingCard = ({
  card,
  size = 'md',
  faceDown = false,
  widthPx,
  tier = 'medium',
}: CribbagePlayingCardProps) => {
  const entry = SIZE_TABLE[size];
  const useOverride = typeof widthPx === 'number' && Number.isFinite(widthPx) && widthPx > 0;
  const width = useOverride ? widthPx! : entry.width;
  const height = width * 1.5; // 2:3 aspect — preserved from prior renderer.

  if (faceDown) {
    // Canonical card back; identity-free, shell-owned colors.
    return (
      <CanonicalCardBack
        widthPx={width}
        heightPx={height}
        variant="flat"
        radiusPx={2}
      />
    );
  }

  // Delegate face rendering to the canonical primitive. PlayingCard
  // normalizes suit names ('hearts'…) to symbols internally, so we
  // cast the suit type only to satisfy the canonical Card shape.
  const canonicalCard: CanonicalCardType = {
    rank: card.rank as CanonicalCardType['rank'],
    suit: card.suit as unknown as CanonicalCardType['suit'],
  };

  return (
    <PlayingCard
      card={canonicalCard}
      size={entry.canonical}
      tier={tier}
      style={{ width, height }}
      faceFillPx={width}
    />
  );
};
