import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";

interface PlayerHandProps {
  cards: CardType[];
  isHidden?: boolean;
}

export const PlayerHand = ({ cards, isHidden = false }: PlayerHandProps) => {
  if (isHidden) {
    return (
      <div className="flex gap-1">
        {cards.map((_, index) => (
          <div
            key={index}
            className="w-12 h-16 bg-gradient-to-br from-blue-900 to-blue-950 rounded border-2 border-white shadow-lg transform rotate-2"
            style={{ transform: `rotate(${index * 2 - 2}deg)` }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      {cards.map((card, index) => (
        <Card
          key={index}
          className="w-12 h-16 flex flex-col items-center justify-center p-1 bg-white shadow-xl border-2 border-gray-300 transform transition-transform hover:scale-110 hover:-translate-y-2"
          style={{ transform: `rotate(${index * 2 - (cards.length - 1)}deg)` }}
        >
          <span className={`text-lg font-bold leading-none ${
            card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black'
          }`}>
            {card.rank}
          </span>
          <span className={`text-2xl leading-none ${
            card.suit === '♥' || card.suit === '♦' ? 'text-red-600' : 'text-black'
          }`}>
            {card.suit}
          </span>
        </Card>
      ))}
    </div>
  );
};
