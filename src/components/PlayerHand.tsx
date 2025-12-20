import { Card as CardType, Rank, getBestFiveCardIndices } from "@/lib/cardUtils";
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
  showSeparated?: boolean;        // For round 3, show unused cards separated to left
  tightOverlap?: boolean;         // Use tighter spacing for multi-player showdown
  unusedCardsBelow?: boolean;     // For 3-5-7 showdown: render unused cards in row below used cards
  isRightSide?: boolean;          // For positioning unused cards on outer edge (right side of table)
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
  currentRound = 0,
  showSeparated = false,
  tightOverlap = false,
  unusedCardsBelow = false,
  isRightSide = false
}: PlayerHandProps) => {
  const RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  // Determine wild rank for 3-5-7 games
  const is357Game = gameType === '3-5-7' || gameType === '3-5-7-game';
  const wildRank = is357Game ? getWildRank(currentRound) : null;
  
  // For round 3 with 7 cards, separate into used and unused
  const isRound3With7Cards = is357Game && currentRound === 3 && cards.length === 7 && showSeparated && !isHidden;
  // For round 2 with 5 cards when unusedCardsBelow is requested
  const isRound2With5Cards = is357Game && currentRound === 2 && cards.length === 5 && unusedCardsBelow && !isHidden;
  // For round 3 with 7 cards when unusedCardsBelow is requested  
  const isRound3WithUnusedBelow = is357Game && currentRound === 3 && cards.length === 7 && unusedCardsBelow && !isHidden;
  const shouldSeparateCards = isRound3With7Cards || isRound2With5Cards || isRound3WithUnusedBelow;
  
  let usedCards: { card: CardType; originalIndex: number; isWild: boolean }[] = [];
  let unusedCards: { card: CardType; originalIndex: number; isWild: boolean }[] = [];
  
  if (shouldSeparateCards) {
    // For round 2: best 5 from 5 = all used (but we need to find unused from original sorting)
    // For round 3: best 5 from 7 = 5 used, 2 unused
    if (currentRound === 2 && cards.length === 5) {
      // In round 2, all 5 cards are used - no unused cards
      usedCards = cards.map((card, idx) => ({
        card,
        originalIndex: idx,
        isWild: wildRank !== null && card.rank === wildRank
      }));
      unusedCards = [];
    } else if (currentRound === 3 && cards.length === 7) {
      // Pass '7' as explicit wild rank for round 3 (important for correct 5-card subset evaluation)
      const { usedIndices, unusedIndices } = getBestFiveCardIndices(cards, true, '7' as Rank);
      
      usedCards = usedIndices.map(idx => ({
        card: cards[idx],
        originalIndex: idx,
        isWild: wildRank !== null && cards[idx].rank === wildRank
      }));
      
      unusedCards = unusedIndices.map(idx => ({
        card: cards[idx],
        originalIndex: idx,
        isWild: wildRank !== null && cards[idx].rank === wildRank
      }));
    }
    
    // Sort used cards: wild cards first, then by rank ascending
    usedCards.sort((a, b) => {
      if (a.isWild && !b.isWild) return -1;
      if (!a.isWild && b.isWild) return 1;
      return RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank];
    });
    
    // Sort unused cards by rank ascending
    unusedCards.sort((a, b) => RANK_ORDER[a.card.rank] - RANK_ORDER[b.card.rank]);
  }
  
  // Create sorted cards with original indices for highlighting (normal display)
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
  
  // Calculate overlap based on card count and tightOverlap flag
  const getOverlapClass = () => {
    if (tightOverlap) {
      // Tighter overlap for multi-player showdown
      if (displayCardCount >= 7) return '-ml-4 sm:-ml-4 first:ml-0';
      if (displayCardCount >= 5) return '-ml-3 sm:-ml-3 first:ml-0';
      return '-ml-2 first:ml-0';
    }
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

  // 3-5-7 showdown display with unused cards in row below used cards (on outer edge)
  if ((isRound2With5Cards || isRound3WithUnusedBelow) && unusedCardsBelow) {
    const usedCardSize = getCardSize(5); // Size for 5 used cards
    const unusedCardSize = getCardSize(7); // Smaller size for unused cards
    
    return (
      <div className="flex flex-col items-center gap-0.5">
        {/* Used cards row */}
        <div className="flex items-end">
          {usedCards.map(({ card, originalIndex, isWild }, displayIndex) => {
            const isHighlighted = highlightedIndices.includes(originalIndex);
            const isKicker = kickerIndices.includes(originalIndex);
            const isDimmed = hasHighlights && !isHighlighted && !isKicker;
            
            return (
              <PlayingCard
                key={`used-${card.rank}-${card.suit}-${originalIndex}`}
                card={card}
                size={usedCardSize}
                isHighlighted={isHighlighted}
                isKicker={isKicker}
                isDimmed={isDimmed}
                isWild={isWild}
                className="-ml-3 first:ml-0"
                style={{ 
                  transform: `rotate(${displayIndex * 2 - (usedCards.length - 1)}deg)`,
                }}
              />
            );
          })}
        </div>
        {/* Unused cards row - positioned on outer edge */}
        {unusedCards.length > 0 && (
          <div className={`flex items-center ${isRightSide ? 'justify-end' : 'justify-start'}`}>
            {unusedCards.map(({ card, originalIndex, isWild }, displayIndex) => (
              <PlayingCard
                key={`unused-${card.rank}-${card.suit}-${originalIndex}`}
                card={card}
                size={unusedCardSize}
                isDimmed={true}
                isWild={false}
                className="-ml-4 first:ml-0"
                style={{ 
                  opacity: 0.4,
                  transform: 'scale(0.85)',
                }}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Special round 3 display with unused cards dimmed but all together (old inline style)
  if (isRound3With7Cards && !unusedCardsBelow) {
    // Combine all cards: unused (dimmed) first, then used cards
    const allCardsOrdered = [...unusedCards, ...usedCards];
    
    return (
      <div className="flex items-end">
        {allCardsOrdered.map(({ card, originalIndex, isWild }, displayIndex) => {
          const isUnused = displayIndex < unusedCards.length;
          const usedDisplayIndex = isUnused ? 0 : displayIndex - unusedCards.length;
          const isHighlighted = !isUnused && highlightedIndices.includes(originalIndex);
          const isKicker = !isUnused && kickerIndices.includes(originalIndex);
          const isDimmed = isUnused || (hasHighlights && !isHighlighted && !isKicker);
          
          return (
            <PlayingCard
              key={`r3-${card.rank}-${card.suit}-${originalIndex}`}
              card={card}
              size={cardSize}
              isHighlighted={isHighlighted}
              isKicker={isKicker}
              isDimmed={isDimmed}
              isWild={!isUnused && isWild}
              className={overlapClass}
              style={{ 
                transform: `rotate(${displayIndex * 2 - (allCardsOrdered.length - 1)}deg)`,
                opacity: isUnused ? 0.4 : 1,
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
            className={overlapClass}
            style={{ 
              transform: `rotate(${displayIndex * 2 - (sortedCardsWithIndices.length - 1)}deg)`,
            }}
          />
        );
      })}
    </div>
  );
};
