import { Card as CardType, Suit } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";
import { useVisualPreferences, FOUR_COLOR_SUITS } from "@/hooks/useVisualPreferences";
import { useDeviceSize } from "@/hooks/useDeviceSize";
import { CanonicalCardBack } from "@/components/canonicalShell/CanonicalCardBack";
import {
  useCardFrontDesign,
  resolveCardFrontStyle,
  type CardFrontTierKey,
  type DeckFaceMode,
} from "@/lib/cardFrontDesign/config";
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

// Normalize text suit names to symbols (fixes corrupted data from DB)
const SUIT_NAME_TO_SYMBOL: Record<string, Suit> = {
  'hearts': '♥',
  'diamonds': '♦',
  'clubs': '♣',
  'spades': '♠',
  '♥': '♥',
  '♦': '♦',
  '♣': '♣',
  '♠': '♠',
};

const normalizeSuit = (suit: string): Suit => {
  const lower = suit?.toLowerCase?.() || '';
  return SUIT_NAME_TO_SYMBOL[lower] || SUIT_NAME_TO_SYMBOL[suit] || suit as Suit;
};

export type CardSize = 'sm' | 'md' | 'lg' | 'xl';

interface PlayingCardProps {
  card?: CardType;
  isHidden?: boolean;
  size?: CardSize;
  showFront?: boolean;
  isFlipping?: boolean;
  className?: string;
  style?: React.CSSProperties;
  borderColor?: string;
  isHighlighted?: boolean;  // Card is part of winning hand
  isKicker?: boolean;       // Card is a kicker
  isDimmed?: boolean;       // Card is not part of winning hand (dim it)
  isWild?: boolean;         // Card is a wild card (3-5-7 games)
  /**
   * Face-density tier (Card Front Design domain). Defaults to 'medium'
   * for ordinary inline/tabled cards. Callers select explicitly:
   *   - small  → opponent seat-cluster exposed cards, 3-5-7 opponent showdown
   *   - large  → active-player hand, community cards, primary-focus cards
   *   - medium → everything else
   * The tier is a visual face-density policy ONLY. It does not change
   * card width, height, aspect, overlap, fan, or placement.
   */
  tier?: CardFrontTierKey;
  /**
   * When the caller drives the card container dimensions dynamically
   * (e.g. opponent-showdown v4 paths), it MUST also pass the resolved
   * card width here so the Card Front Design resolver receives the
   * true face area. The legacy 0.62/0.70 face-art constants are gone —
   * face typography always flows through the tier/deck-mode resolver.
   */
  faceFillPx?: number;
  /**
   * Canonical Active Player Hand physical shell (Holm parity):
   * shared corner radius, border, inner highlight, drop shadow, and
   * material surface. Applied whenever the card is rendered inside a
   * shared `<ActiveHandFan/>` regardless of game. Face-content sizing
   * (`small`/`medium`/`large`) is unaffected.
   */
  activeHandShell?: boolean;
}

/** Extra classes applied when `activeHandShell` is true. */
const ACTIVE_HAND_SHELL_CLASS =
  'rounded-[10%] border border-white/70 ring-1 ring-black/10 shadow-[0_2px_6px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.55)] bg-gradient-to-b from-white to-slate-100';


// Card sizing: proper playing card aspect ratio (~2.5:3.5 or ~0.71)
// Taller/narrower cards with larger face content
// TABLET: Tighter padding between rank/suit, slightly bigger text
const SIZE_CLASSES: Record<CardSize, { container: string }> = {
  sm: { container: 'w-6 h-9 sm:w-7 sm:h-10' },
  md: { container: 'w-7 h-10 sm:w-8 sm:h-12' },
  lg: { container: 'w-8 h-12 sm:w-9 sm:h-14' },
  xl: { container: 'w-9 h-14 sm:w-10 sm:h-16' },
};

const TABLET_SIZE_CLASSES: Record<CardSize, { container: string }> = {
  sm: { container: 'w-8 h-12' },
  md: { container: 'w-10 h-14' },
  lg: { container: 'w-12 h-16' },
  xl: { container: 'w-14 h-20' },
};

// Representative pixel widths used by the face resolver when the caller
// did not supply explicit card dimensions via faceFillPx or style.width.
// These mirror the Tailwind container widths above (mobile breakpoint).
// Tier still drives proportions — these only set the absolute base.
const SIZE_CLASS_PX_FALLBACK: Record<CardSize, { w: number; h: number }> = {
  sm: { w: 24, h: 36 },
  md: { w: 28, h: 40 },
  lg: { w: 32, h: 48 },
  xl: { w: 36, h: 56 },
};
const TABLET_SIZE_CLASS_PX_FALLBACK: Record<CardSize, { w: number; h: number }> = {
  sm: { w: 32, h: 48 },
  md: { w: 40, h: 56 },
  lg: { w: 48, h: 64 },
  xl: { w: 56, h: 80 },
};

function parsePxLike(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return v;
  if (typeof v === 'string') {
    const m = v.match(/^(-?\d+(?:\.\d+)?)\s*px$/i) || v.match(/^(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const n = parseFloat(m[1]);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return null;
}

const CARD_ASPECT_FALLBACK = 1.4; // height = width * aspect

export const PlayingCard = ({
  card,
  isHidden = false,
  size = 'lg',
  showFront = true,
  isFlipping = false,
  className = '',
  style = {},
  borderColor = 'border-gray-300',
  isHighlighted = false,
  isKicker = false,
  isDimmed = false,
  isWild = false,
  tier = 'medium',
  faceFillPx,
}: PlayingCardProps) => {
  const { getCardBackColors, getCardBackId, getEffectiveDeckColorMode } = useVisualPreferences();
  const { isTablet } = useDeviceSize();
  const cardBackColors = getCardBackColors();
  const cardBackId = getCardBackId();
  const teamLogo = TEAM_LOGOS[cardBackId] || null;
  const cardFrontDesign = useCardFrontDesign();

  // TABLET: Use enhanced size classes with tighter padding
  const sizeClasses = isTablet ? TABLET_SIZE_CLASSES[size] : SIZE_CLASSES[size];
  const sizePxFallback = (isTablet ? TABLET_SIZE_CLASS_PX_FALLBACK : SIZE_CLASS_PX_FALLBACK)[size];

  // Resolve effective card dimensions used by the face resolver.
  // Precedence: faceFillPx → style.width → tier-class fallback.
  const styleWidthPx = parsePxLike((style as { width?: unknown })?.width);
  const styleHeightPx = parsePxLike((style as { height?: unknown })?.height);
  const effectiveCardWidthPx =
    (typeof faceFillPx === 'number' && faceFillPx > 0 ? faceFillPx : null) ??
    styleWidthPx ??
    sizePxFallback.w;
  const effectiveCardHeightPx =
    styleHeightPx ??
    (typeof faceFillPx === 'number' && faceFillPx > 0
      ? Math.round(faceFillPx * CARD_ASPECT_FALLBACK)
      : sizePxFallback.h);

  // Normalize suit to handle corrupted data with text suit names
  const normalizedSuit = card ? normalizeSuit(card.suit) : null;

  // Determine card styling based on effective deck color mode
  const effectiveDeckColorMode = getEffectiveDeckColorMode();
  const isFourColor = effectiveDeckColorMode === 'four_color';
  const deckFaceMode: DeckFaceMode = isFourColor ? 'four-color' : 'two-color';
  const fourColorConfig = normalizedSuit ? FOUR_COLOR_SUITS[normalizedSuit] : null;

  // Face-density resolved styles (Card Front Design domain).
  const face = resolveCardFrontStyle(
    cardFrontDesign,
    tier,
    deckFaceMode,
    effectiveCardWidthPx,
    effectiveCardHeightPx,
  );

  // For 4-color deck: colored background with white text, no suit symbol
  // For 2-color deck: white background with red/black text and suit symbol
  const getCardFaceStyle = () => {
    if (isFourColor && fourColorConfig) {
      return {
        backgroundColor: fourColorConfig.bg,
        textColor: 'text-white',
      };
    }
    return {
      backgroundColor: 'white',
      textColor: normalizedSuit && (normalizedSuit === '♥' || normalizedSuit === '♦') ? 'text-red-600' : 'text-black',
    };
  };

  const cardFaceStyle = getCardFaceStyle();

  // If hidden or no card, show CANONICAL card back.
  if (isHidden || !card) {
    return (
      <div className={`${sizeClasses.container} ${className}`} style={style} data-playing-card-hidden="1">
        <CanonicalCardBack
          widthPx={40}
          heightPx={60}
          variant="raised"
          radiusPx={4}
          style={{ width: '100%', height: '100%' }}
        />

      </div>
    );
  }

  // For flip animation support
  if (isFlipping !== undefined && !showFront) {
    return (
      <div
        data-playing-card-root=""
        data-playing-card-flip=""
        data-card-id={card ? `${card.rank}-${card.suit}` : undefined}
        className={`${sizeClasses.container} relative ${className}`}
        style={{
          transformStyle: 'preserve-3d',
          transition: isFlipping ? 'transform 1.2s ease-in-out' : 'none',
          transform: isFlipping ? 'rotateY(180deg)' : 'rotateY(0deg)',
          ...style,
        }}
      >
        {/* Card Back — CANONICAL renderer */}
        <div
          className="absolute inset-0 w-full h-full"
          style={{
            backfaceVisibility: 'hidden',
            transform: showFront ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          <CanonicalCardBack
            widthPx={40}
            heightPx={60}
            variant="raised"
            radiusPx={4}
            style={{ width: '100%', height: '100%' }}
          />
        </div>

        {/* Card Front */}
        <Card
          className={`absolute inset-0 w-full h-full flex flex-col items-center justify-center p-0 ${borderColor} shadow-lg`}
          style={{
            backgroundColor: cardFaceStyle.backgroundColor,
            backfaceVisibility: 'hidden',
            transform: showFront ? 'rotateY(0deg)' : 'rotateY(-180deg)',
            ...(!isFourColor ? { color: normalizedSuit && (normalizedSuit === '♥' || normalizedSuit === '♦') ? '#dc2626' : '#000000' } : {}),
          }}
        >
          <span
            className={isFourColor ? cardFaceStyle.textColor : ''}
            style={face.rankStyle}
          >
            {card.rank}
          </span>
          {face.renderSuit && !isFourColor && face.suitStyle && (
            <span style={face.suitStyle}>{normalizedSuit}</span>
          )}
        </Card>
      </div>
    );
  }

  // Standard face-up card
  const textColorStyle = !isFourColor
    ? { color: normalizedSuit && (normalizedSuit === '♥' || normalizedSuit === '♦') ? '#dc2626' : '#000000' }
    : {};

  const dimStyle = isDimmed ? { opacity: 0.4, filter: 'grayscale(30%)' } : {};
  const liftTransform = (isHighlighted || isKicker) ? 'translateY(-25%)' : '';
  const combinedTransform = [liftTransform, style?.transform].filter(Boolean).join(' ') || undefined;

  const wildCardStyles = isWild ? {
    border: '3px solid #fbbf24',
    boxShadow: '0 0 8px 2px rgba(251, 191, 36, 0.6), inset 0 0 4px rgba(251, 191, 36, 0.3)',
  } : {};

  // Face typography is resolved exclusively by the Card Front Design
  // tier. The container always uses justify-center with no padding so
  // the configured rank↔suit gap (marginTop on the suit span) is the
  // SOLE spacing between rank and suit. Any fixed py-* / justify-between
  // would re-introduce a hidden minimum gap.

  return (
    <Card
      data-playing-card-root=""
      data-playing-card-face=""
      data-card-id={`${card.rank}-${card.suit}`}
      className={`${sizeClasses.container} flex flex-col items-center justify-center p-0 shadow-xl ${isWild ? '' : borderColor} ${className} transition-transform duration-200 overflow-hidden`}
      style={{ backgroundColor: cardFaceStyle.backgroundColor, ...textColorStyle, ...dimStyle, ...wildCardStyles, ...style, transform: combinedTransform }}
    >

      <span
        className={isFourColor ? cardFaceStyle.textColor : ''}
        style={face.rankStyle}
      >
        {card.rank}
      </span>
      {face.renderSuit && !isFourColor && face.suitStyle && (
        <span style={face.suitStyle}>{normalizedSuit}</span>
      )}
    </Card>
  );
};

// Helper to determine size based on card count
export const getCardSize = (cardCount: number): CardSize => {
  if (cardCount >= 7) return 'sm';
  if (cardCount >= 5) return 'md';
  if (cardCount >= 4) return 'lg';
  return 'xl';
};
