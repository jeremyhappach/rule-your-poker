import { Card as CardType, Suit } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";
import { useVisualPreferences, FOUR_COLOR_SUITS } from "@/hooks/useVisualPreferences";
import { useDeviceSize } from "@/hooks/useDeviceSize";
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
}

// Card sizing: proper playing card aspect ratio (~2.5:3.5 or ~0.71)
// Taller/narrower cards with larger face content
// TABLET: Tighter padding between rank/suit, slightly bigger text
const SIZE_CLASSES: Record<CardSize, { container: string; rank: string; suit: string }> = {
  sm: {
    container: 'w-6 h-9 sm:w-7 sm:h-10',
    rank: 'text-base sm:text-lg font-black',
    suit: 'text-base sm:text-lg', // Bigger suit for mobile visibility
  },
  md: {
    container: 'w-7 h-10 sm:w-8 sm:h-12',
    rank: 'text-lg sm:text-xl font-black',
    suit: 'text-base sm:text-lg',
  },
  lg: {
    container: 'w-8 h-12 sm:w-9 sm:h-14',
    rank: 'text-xl sm:text-2xl font-black',
    suit: 'text-lg sm:text-xl',
  },
  xl: {
    container: 'w-9 h-14 sm:w-10 sm:h-16',
    rank: 'text-2xl sm:text-3xl font-black',
    suit: 'text-xl sm:text-2xl',
  },
};

// TABLET: Enhanced sizes with tighter spacing
const TABLET_SIZE_CLASSES: Record<CardSize, { container: string; rank: string; suit: string }> = {
  sm: {
    container: 'w-7 h-10',
    rank: 'text-lg font-black leading-none',
    suit: 'text-lg leading-none -mt-0.5',
  },
  md: {
    container: 'w-9 h-13',
    rank: 'text-xl font-black leading-none',
    suit: 'text-lg leading-none -mt-0.5',
  },
  lg: {
    container: 'w-10 h-15',
    rank: 'text-2xl font-black leading-none',
    suit: 'text-xl leading-none -mt-0.5',
  },
  xl: {
    container: 'w-11 h-17',
    rank: 'text-3xl font-black leading-none',
    suit: 'text-2xl leading-none -mt-0.5',
  },
};

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
}: PlayingCardProps) => {
  const { getCardBackColors, getCardBackId, getEffectiveDeckColorMode } = useVisualPreferences();
  const { isTablet } = useDeviceSize();
  const cardBackColors = getCardBackColors();
  const cardBackId = getCardBackId();
  const teamLogo = TEAM_LOGOS[cardBackId] || null;
  
  // TABLET: Use enhanced size classes with tighter padding
  const sizeClasses = isTablet ? TABLET_SIZE_CLASSES[size] : SIZE_CLASSES[size];
  
  // Normalize suit to handle corrupted data with text suit names
  const normalizedSuit = card ? normalizeSuit(card.suit) : null;
  
  // Determine card styling based on effective deck color mode (considers session override)
  const effectiveDeckColorMode = getEffectiveDeckColorMode();
  const isFourColor = effectiveDeckColorMode === 'four_color';
  const fourColorConfig = normalizedSuit ? FOUR_COLOR_SUITS[normalizedSuit] : null;
  
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
  
  // If hidden or no card, show card back
  if (isHidden || !card) {
    return (
      <div
        className={`${sizeClasses.container} rounded border-2 border-amber-400 shadow-xl relative overflow-hidden ${className}`}
        style={{ 
          background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
          ...style,
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center p-1">
          {teamLogo ? (
            <img src={teamLogo} alt="Team logo" className="w-full h-full object-contain" />
          ) : (
            <div className="w-6 h-10 border-2 border-amber-400/30 rounded" />
          )}
        </div>
      </div>
    );
  }
  
  // For flip animation support
  if (isFlipping !== undefined && !showFront) {
    return (
      <div
        className={`${sizeClasses.container} relative ${className}`}
        style={{ 
          transformStyle: 'preserve-3d',
          transition: isFlipping ? 'transform 1.2s ease-in-out' : 'none',
          transform: isFlipping ? 'rotateY(180deg)' : 'rotateY(0deg)',
          ...style,
        }}
      >
        {/* Card Back */}
        <Card 
          className={`absolute inset-0 w-full h-full flex items-center justify-center ${borderColor} shadow-lg`}
          style={{
            background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
            backfaceVisibility: 'hidden',
            transform: showFront ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          <div className="w-full h-full flex items-center justify-center p-0.5">
            {teamLogo ? (
              <img src={teamLogo} alt="Team logo" className="w-full h-full object-contain" />
            ) : (
              <div className="text-poker-gold text-2xl font-bold opacity-30">?</div>
            )}
          </div>
        </Card>
        
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
          <span className={`${sizeClasses.rank} leading-none ${isFourColor ? cardFaceStyle.textColor : ''}`}>
            {card.rank}
          </span>
          {!isFourColor && (
            <span className={`${sizeClasses.suit} leading-none mt-0`}>
              {normalizedSuit}
            </span>
          )}
        </Card>
      </div>
    );
  }
  
  // Standard face-up card
  // For 2-color mode, we need to explicitly set text color inline to override dark mode's text-card-foreground
  const textColorStyle = !isFourColor 
    ? { color: normalizedSuit && (normalizedSuit === '♥' || normalizedSuit === '♦') ? '#dc2626' : '#000000' }
    : {};
  
  // No ring/glow highlighting - just use lift effect for winning cards
  
  // Dimming style for cards not part of winning hand
  const dimStyle = isDimmed ? { opacity: 0.4, filter: 'grayscale(30%)' } : {};
  
  // Lift effect for highlighted/kicker cards (move up by ~25% of card height)
  const liftTransform = (isHighlighted || isKicker) ? 'translateY(-25%)' : '';
  
  // Combine transforms - lift goes first, then any transform from style prop
  const combinedTransform = [liftTransform, style?.transform].filter(Boolean).join(' ') || undefined;
  
  // Wild card styling - golden border and subtle glow that works in both 2-color and 4-color modes
  const wildCardStyles = isWild ? {
    border: '3px solid #fbbf24',
    boxShadow: '0 0 8px 2px rgba(251, 191, 36, 0.6), inset 0 0 4px rgba(251, 191, 36, 0.3)',
  } : {};
    
  return (
    <Card
      className={`${sizeClasses.container} flex flex-col items-center justify-center p-0 shadow-xl ${isWild ? '' : borderColor} ${className} transition-transform duration-200`}
      style={{ backgroundColor: cardFaceStyle.backgroundColor, ...textColorStyle, ...dimStyle, ...wildCardStyles, ...style, transform: combinedTransform }}
    >
      <span className={`${sizeClasses.rank} leading-none ${isFourColor ? cardFaceStyle.textColor : ''}`}>
        {card.rank}
      </span>
      {!isFourColor && (
        <span className={`${sizeClasses.suit} leading-none mt-0`}>
          {normalizedSuit}
        </span>
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
