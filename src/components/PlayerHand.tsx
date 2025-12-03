import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";

interface PlayerHandProps {
  cards: CardType[];
  isHidden?: boolean;
}

export const PlayerHand = ({ cards, isHidden = false }: PlayerHandProps) => {
  const { getCardBackColors } = useVisualPreferences();
  const cardBackColors = getCardBackColors();
  
  // Sort cards from lowest to highest
  const RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  const sortedCards = [...cards].sort((a, b) => 
    RANK_ORDER[a.rank] - RANK_ORDER[b.rank]
  );
  
  // Calculate size and spacing based on number of cards
  const getCardClasses = () => {
    if (cards.length >= 7) {
      // Round 3: 7 cards - smallest with readable overlap
      return {
        card: 'w-8 h-11 sm:w-9 sm:h-12 md:w-10 md:h-14',
        text: 'text-sm sm:text-base',
        suit: 'text-lg sm:text-xl',
        overlap: '-ml-2 sm:-ml-2 md:-ml-3 first:ml-0'
      };
    } else if (cards.length >= 5) {
      // Round 2: 5 cards - medium with readable overlap
      return {
        card: 'w-10 h-14 sm:w-11 sm:h-15 md:w-12 md:h-16',
        text: 'text-base sm:text-lg',
        suit: 'text-xl sm:text-2xl',
        overlap: '-ml-3 sm:-ml-4 md:-ml-4 first:ml-0'
      };
    }
    // Round 1: 3 cards - base size with light overlap
    return {
      card: 'w-12 h-16',
      text: 'text-lg',
      suit: 'text-2xl',
      overlap: '-ml-2 first:ml-0'
    };
  };

  const classes = getCardClasses();
  
  if (isHidden) {
    return (
      <div className="flex">
        {sortedCards.map((_, index) => (
          <div
            key={index}
            className={`${classes.card} ${classes.overlap} rounded border-2 border-amber-400 shadow-xl transform rotate-2 relative overflow-hidden animate-fade-in`}
            style={{ 
              transform: `rotate(${index * 2 - 2}deg)`,
              animationDelay: `${index * 150}ms`,
              animationFillMode: 'backwards',
              background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`
            }}
          >
            {/* Card back pattern */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-10 h-14 border-2 border-amber-400/40 rounded" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-10 border-2 border-amber-400/30 rounded" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex">
      {sortedCards.map((card, index) => (
        <Card
          key={index}
          className={`${classes.card} ${classes.overlap} flex flex-col items-center justify-center p-1 bg-white shadow-xl border-2 border-gray-300 transform transition-transform hover:scale-110 hover:-translate-y-2 hover:z-10 animate-fade-in`}
          style={{ 
            transform: `rotate(${index * 2 - (sortedCards.length - 1)}deg)`,
            animationDelay: `${index * 150}ms`,
            animationFillMode: 'backwards'
          }}
        >
          <span className={`${classes.text} font-bold leading-none ${
            card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black'
          }`}>
            {card.rank}
          </span>
          <span className={`${classes.suit} leading-none ${
            card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black'
          }`}>
            {card.suit}
          </span>
        </Card>
      ))}
    </div>
  );
};
