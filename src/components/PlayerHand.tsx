import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
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

interface PlayerHandProps {
  cards: CardType[];
  isHidden?: boolean;
  expectedCardCount?: number; // For observers who can't see actual cards
}

export const PlayerHand = ({ cards, isHidden = false, expectedCardCount }: PlayerHandProps) => {
  const { getCardBackColors, getCardBackId } = useVisualPreferences();
  const cardBackColors = getCardBackColors();
  const cardBackId = getCardBackId();
  
  const teamLogo = TEAM_LOGOS[cardBackId] || null;
  
  // Sort cards from lowest to highest
  const RANK_ORDER: Record<string, number> = {
    '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
  };
  
  const sortedCards = [...cards].sort((a, b) => 
    RANK_ORDER[a.rank] - RANK_ORDER[b.rank]
  );
  
  // For observers who can't see actual cards, use expectedCardCount to render hidden backs
  const displayCardCount = cards.length > 0 ? cards.length : (expectedCardCount || 0);
  
  // Calculate size and spacing based on number of cards
  // COMPACT: Minimal whitespace, big values, big suits
  const getCardClasses = () => {
    if (displayCardCount >= 7) {
      // Round 3: 7 cards - tight spacing
      return {
        card: 'w-7 h-10 sm:w-8 sm:h-11',
        text: 'text-base sm:text-lg font-black',
        suit: 'text-lg sm:text-xl',
        overlap: '-ml-2 sm:-ml-2 first:ml-0'
      };
    } else if (displayCardCount >= 5) {
      // Round 2: 5 cards
      return {
        card: 'w-8 h-11 sm:w-9 sm:h-12',
        text: 'text-lg sm:text-xl font-black',
        suit: 'text-xl sm:text-2xl',
        overlap: '-ml-2 sm:-ml-2 first:ml-0'
      };
    } else if (displayCardCount >= 4) {
      // Holm: 4 cards
      return {
        card: 'w-9 h-12 sm:w-10 sm:h-14',
        text: 'text-xl sm:text-2xl font-black',
        suit: 'text-2xl sm:text-3xl',
        overlap: '-ml-1 first:ml-0'
      };
    }
    // Round 1: 3 cards
    return {
      card: 'w-10 h-14 sm:w-11 sm:h-15',
      text: 'text-2xl sm:text-3xl font-black',
      suit: 'text-3xl sm:text-4xl',
      overlap: '-ml-1 first:ml-0'
    };
  };

  const classes = getCardClasses();
  
  // Render card backs (for hidden cards or observers without card data)
  const renderCardBacks = (count: number) => {
    const cardArray = Array.from({ length: count }, (_, i) => i);
    return (
      <div className="flex">
        {cardArray.map((_, index) => (
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
            <div className="absolute inset-0 flex items-center justify-center p-1">
              {teamLogo ? (
                <img src={teamLogo} alt="Team logo" className="w-full h-full object-contain" />
              ) : (
                <>
                  <div className="w-10 h-14 border-2 border-amber-400/40 rounded" />
                </>
              )}
            </div>
            {!teamLogo && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-6 h-10 border-2 border-amber-400/30 rounded" />
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // If cards should be hidden, render card backs
  if (isHidden) {
    return renderCardBacks(displayCardCount);
  }
  
  // If we have no actual card data but have expectedCardCount (observer case), show card backs
  if (cards.length === 0 && expectedCardCount && expectedCardCount > 0) {
    return renderCardBacks(expectedCardCount);
  }

  return (
    <div className="flex">
      {sortedCards.map((card, index) => (
        <Card
          key={index}
          className={`${classes.card} ${classes.overlap} flex flex-col items-center justify-center p-0 bg-white shadow-xl border border-gray-300 transform transition-transform hover:scale-110 hover:-translate-y-2 hover:z-10 animate-fade-in`}
          style={{ 
            transform: `rotate(${index * 2 - (sortedCards.length - 1)}deg)`,
            animationDelay: `${index * 150}ms`,
            animationFillMode: 'backwards'
          }}
        >
          <span className={`${classes.text} leading-none -mb-1 ${
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
