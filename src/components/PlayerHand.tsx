import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard, getCardSize } from "@/components/PlayingCard";

interface PlayerHandProps {
  cards: CardType[];
  isHidden?: boolean;
  expectedCardCount?: number;
  highlightedIndices?: number[];  // Indices of cards that are part of winning hand
  kickerIndices?: number[];       // Indices of kicker cards
  hasHighlights?: boolean;        // Whether highlights are active (to dim non-highlighted cards)
  gameType?: string | null;       // Game type for wild card determination
  currentRound?: number;          // Current round for wild card determination
}

// Get wild rank based on round (3-5-7 game only)
const getWildRank = (round: number): string | null => {
  switch (round) {
    case 1: return '3';
    case 2: return '5';
    case 3: return '7';
    default: return null;
  }
};

export const PlayerHand = ({ 
  cards, 
  isHidden = false, 
  expectedCardCount,
  highlightedIndices = [],
  kickerIndices = [],
  hasHighlights = false,
  gameType,
  currentRound = 0
}: PlayerHandProps) => {
  const RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  // Determine wild rank for 3-5-7 games
  const is357Game = gameType === '3-5-7' || gameType === '3-5-7-game';
  const wildRank = is357Game ? getWildRank(currentRound) : null;
  
  // Create sorted cards with original indices for highlighting
  const cardsWithIndices = cards.map((card, index) => ({ 
    card, 
    originalIndex: index,
    isWild: wildRank !== null && card.rank === wildRank
  }));
  
  // Sort cards: wild cards first (descending by count), then by rank ascending
  const sortedCardsWithIndices = [...cardsWithIndices].sort((a, b) => {
    // Wild cards come first
    if (a.isWild && !b.isWild) return -1;
    if (!a.isWild && b.isWild) return 1;
    // Within same wild status, sort by rank ascending
    return RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank];
  });
  
  const displayCardCount = cards.length > 0 ? cards.length : (expectedCardCount || 0);
  const cardSize = getCardSize(displayCardCount);
  
  // Calculate overlap based on card count
  const getOverlapClass = () => {
    if (displayCardCount >= 7) return '-ml-2 sm:-ml-2 first:ml-0';
    if (displayCardCount >= 5) return '-ml-2 sm:-ml-2 first:ml-0';
    return '-ml-1 first:ml-0';
  };
  
  const overlapClass = getOverlapClass();
  
  // Render card backs for hidden cards
  if (isHidden || (cards.length === 0 && expectedCardCount && expectedCardCount > 0)) {
    const count = isHidden ? displayCardCount : expectedCardCount!;
    
    // For 3-5-7 games with multiple cards, use fanned arc layout
    const useFannedArc = is357Game && count >= 3;
    
    // Calculate arc parameters for fanned layout
    const arcSpread = count >= 7 ? 45 : count >= 5 ? 35 : 25; // Total arc angle in degrees
    const startAngle = -arcSpread / 2;
    const angleStep = count > 1 ? arcSpread / (count - 1) : 0;
    
    return (
      <div className="flex justify-center relative" style={{ minHeight: '60px' }}>
        {Array.from({ length: count }, (_, index) => {
          // Calculate rotation and vertical offset for arc effect
          const rotation = useFannedArc ? startAngle + (index * angleStep) : (index * 2 - 2);
          const verticalOffset = useFannedArc 
            ? Math.abs(index - (count - 1) / 2) * 3 // Cards at edges are slightly higher
            : 0;
          
          return (
            <PlayingCard
              key={index}
              isHidden
              size={cardSize}
              className={`${useFannedArc ? '-ml-4 first:ml-0' : overlapClass} animate-fade-in`}
              style={{ 
                transform: `rotate(${rotation}deg) translateY(${verticalOffset}px)`,
                animationDelay: `${index * 150}ms`,
                animationFillMode: 'backwards',
                transformOrigin: 'bottom center'
              }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex">
      {sortedCardsWithIndices.map(({ card, originalIndex, isWild }, displayIndex) => {
        const isHighlighted = highlightedIndices.includes(originalIndex);
        const isKicker = kickerIndices.includes(originalIndex);
        const isDimmed = hasHighlights && !isHighlighted && !isKicker;
        
        return (
          <PlayingCard
            key={`${card.rank}-${card.suit}-${originalIndex}`}
            card={card}
            size={cardSize}
            isHighlighted={isHighlighted}
            isKicker={isKicker}
            isDimmed={isDimmed}
            isWild={isWild}
            className={`${overlapClass} transform transition-transform hover:scale-110 hover:-translate-y-2 hover:z-10`}
            style={{ 
              transform: `rotate(${displayIndex * 2 - (sortedCardsWithIndices.length - 1)}deg)`,
            }}
          />
        );
      })}
    </div>
  );
};
