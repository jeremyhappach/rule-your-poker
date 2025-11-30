import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";

interface ChuckyHandProps {
  cards: CardType[];
  show: boolean;
  revealed?: number;
}

export const ChuckyHand = ({ cards, show, revealed = cards.length }: ChuckyHandProps) => {
  if (!show || cards.length === 0) return null;

  // Only show the revealed cards
  const visibleCards = cards.slice(0, revealed);

  return (
    <div className="absolute top-[5%] left-[5%] transform z-30 animate-scale-in">
      <div className="bg-gradient-to-br from-red-900/90 to-red-950/90 rounded-xl p-3 sm:p-4 backdrop-blur-sm border-2 border-red-500 shadow-2xl">
        <div className="text-center mb-2">
          <span className="text-red-400 font-bold text-sm sm:text-base flex items-center justify-center gap-2">
            <span className="text-2xl">👻</span>
            Chucky&apos;s Hand {revealed < cards.length && `(${revealed}/${cards.length})`}
          </span>
        </div>
        <div className="flex gap-1 sm:gap-2">
          {visibleCards.map((card, index) => {
            const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900';
            
            return (
              <Card 
                key={index}
                className="w-12 h-18 sm:w-14 sm:h-20 md:w-16 md:h-24 flex items-center justify-center bg-white border-2 border-red-500 shadow-lg animate-scale-in"
              >
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-xl sm:text-2xl md:text-3xl font-bold ${suitColor}`}>
                    {card.rank}
                  </div>
                  <div className={`text-lg sm:text-xl md:text-2xl ${suitColor}`}>
                    {card.suit}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};
