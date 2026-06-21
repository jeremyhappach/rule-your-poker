import type { CribbageCard } from '@/lib/cribbageTypes';
import { CanonicalCardBack } from '@/components/canonicalShell/CanonicalCardBack';


interface CribbagePlayingCardProps {
  card: CribbageCard;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  faceDown?: boolean;
  cardBackColors?: { color: string; darkColor: string };
  /** Optional rect-driven width override (px). Height derives from 2:3 aspect.
   *  When provided, overrides `size` token. Font sizes scale proportionally. */
  widthPx?: number;
}

export const CribbagePlayingCard = ({ 
  card, 
  size = 'md',
  faceDown = false,
  cardBackColors,
  widthPx,
}: CribbagePlayingCardProps) => {
  // Narrower cards with 2:3 aspect ratio - maximize text size for readability
  const sizeStyles: Record<string, { width: number; height: number; fontSize: string; suitSize: string }> = {
    xs: { width: 24, height: 36, fontSize: 'text-base font-black', suitSize: 'text-lg' },
    sm: { width: 32, height: 48, fontSize: 'text-xl font-black', suitSize: 'text-2xl' },
    md: { width: 40, height: 60, fontSize: 'text-2xl font-black', suitSize: 'text-3xl' },
    lg: { width: 48, height: 72, fontSize: 'text-3xl font-black', suitSize: 'text-4xl' },
  };

  const tokenStyles = sizeStyles[size];
  const useOverride = typeof widthPx === 'number' && Number.isFinite(widthPx) && widthPx > 0;
  const width = useOverride ? widthPx! : tokenStyles.width;
  const height = useOverride ? widthPx! * 1.5 : tokenStyles.height;
  // Rect-driven font sizing: rank ≈ 60% of width, suit ≈ 75% of width.
  const fontStyle = useOverride
    ? { fontSize: `${width * 0.6}px`, fontWeight: 900 as const, lineHeight: 1 }
    : undefined;
  const suitStyle = useOverride
    ? { fontSize: `${width * 0.75}px`, lineHeight: 1 }
    : undefined;
  const fontSize = useOverride ? '' : tokenStyles.fontSize;
  const suitSize = useOverride ? '' : tokenStyles.suitSize;

  const getSuitSymbol = (suit: CribbageCard['suit']) => {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
    }
  };

  const getSuitColor = (suit: CribbageCard['suit']) => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-900';
  };

  if (faceDown) {
    // Canonical card back — colors, border, accent all owned by shell.
    // `cardBackColors` prop retained for backwards-compat but ignored;
    // CanonicalCardBack reads useVisualPreferences directly.
    return (
      <CanonicalCardBack
        widthPx={width}
        heightPx={height}
        variant="flat"
        radiusPx={2}
      />
    );
  }

  return (
    <div 
      style={{ width, height }}
      className="rounded-sm bg-white border border-gray-300 shadow-sm flex flex-col items-center justify-between py-0.5 overflow-hidden"
    >
      <span className={`leading-none ${fontSize} ${getSuitColor(card.suit)}`} style={fontStyle}>
        {card.rank}
      </span>
      <span className={`leading-none ${suitSize} ${getSuitColor(card.suit)}`} style={suitStyle}>
        {getSuitSymbol(card.suit)}
      </span>
    </div>
  );
};
