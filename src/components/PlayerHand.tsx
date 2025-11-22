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
            className="w-12 h-16 bg-primary rounded border-2 border-primary-foreground"
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
          className="w-12 h-16 flex flex-col items-center justify-center p-1 bg-background"
        >
          <span className={`text-lg font-bold ${
            card.suit === '♥' || card.suit === '♦' ? 'text-red-500' : 'text-foreground'
          }`}>
            {card.rank}
          </span>
          <span className={`text-xl ${
            card.suit === '♥' || card.suit === '♦' ? 'text-red-500' : 'text-foreground'
          }`}>
            {card.suit}
          </span>
        </Card>
      ))}
    </div>
  );
};
