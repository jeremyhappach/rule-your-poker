import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
}

export const CommunityCards = ({ cards, revealed }: CommunityCardsProps) => {
  if (cards.length === 0) return null;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex gap-1">
        {cards.map((card, index) => {
          const isRevealed = index < revealed;
          const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900';
          
          return (
            <Card 
              key={index}
              className={`
                w-10 h-14 sm:w-12 sm:h-16 flex items-center justify-center bg-white
                border border-poker-gold shadow-lg
                ${!isRevealed ? 'bg-gradient-to-br from-blue-900 to-blue-700' : ''}
              `}
            >
              {isRevealed ? (
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-lg sm:text-xl font-bold ${suitColor}`}>
                    {card.rank}
                  </div>
                  <div className={`text-base sm:text-lg ${suitColor}`}>
                    {card.suit}
                  </div>
                </div>
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-poker-gold text-2xl font-bold opacity-30">
                    ?
                  </div>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
};
