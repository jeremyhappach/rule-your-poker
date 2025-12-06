import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard, getCardSize } from "@/components/PlayingCard";

interface PlayerHandProps {
  cards: CardType[];
  isHidden?: boolean;
  expectedCardCount?: number;
}

export const PlayerHand = ({ cards, isHidden = false, expectedCardCount }: PlayerHandProps) => {
  // Sort cards from lowest to highest
  const RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  const sortedCards = [...cards].sort((a, b) => 
    RANK_ORDER[a.rank] - RANK_ORDER[b.rank]
  );
  
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
    return (
      <div className="flex">
        {Array.from({ length: count }, (_, index) => (
          <PlayingCard
            key={index}
            isHidden
            size={cardSize}
            className={`${overlapClass} animate-fade-in`}
            style={{ 
              transform: `rotate(${index * 2 - 2}deg)`,
              animationDelay: `${index * 150}ms`,
              animationFillMode: 'backwards'
            }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex">
      {sortedCards.map((card, index) => (
        <PlayingCard
          key={index}
          card={card}
          size={cardSize}
          className={`${overlapClass} transform transition-transform hover:scale-110 hover:-translate-y-2 hover:z-10 animate-fade-in`}
          style={{ 
            transform: `rotate(${index * 2 - (sortedCards.length - 1)}deg)`,
            animationDelay: `${index * 150}ms`,
            animationFillMode: 'backwards'
          }}
        />
      ))}
    </div>
  );
};
