import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";

interface ChuckyHandProps {
  cards: CardType[];
  show: boolean;
  revealed?: number;
  x?: number;
  y?: number;
}

export const ChuckyHand = ({ cards, show, revealed = cards.length, x, y }: ChuckyHandProps) => {
  if (!show || cards.length === 0) return null;

  // Only show the revealed cards
  const visibleCards = cards.slice(0, revealed);

  // Use provided position or default to top-center
  const positionStyle = x !== undefined && y !== undefined
    ? { left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }
    : { top: '2%', left: '50%', transform: 'translateX(-50%)' };

  return (
    <div className="absolute z-30 animate-scale-in" style={positionStyle}>
      <div className="bg-gradient-to-br from-red-900/90 to-red-950/90 rounded-lg p-1.5 sm:p-2 backdrop-blur-sm border border-red-500 shadow-xl">
        <div className="text-center mb-1">
          <span className="text-red-400 font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1">
            <span className="text-sm">😈</span>
            Chucky {revealed < cards.length && `(${revealed}/${cards.length})`}
          </span>
        </div>
        <div className="flex gap-0.5 sm:gap-1">
          {visibleCards.map((card, index) => {
            const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900';
            
            return (
              <Card 
                key={index}
                className="w-8 h-12 sm:w-9 sm:h-13 md:w-10 md:h-14 flex items-center justify-center bg-white border border-red-500 shadow-md animate-scale-in"
              >
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-sm sm:text-base md:text-lg font-bold ${suitColor}`}>
                    {card.rank}
                  </div>
                  <div className={`text-xs sm:text-sm md:text-base ${suitColor}`}>
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
