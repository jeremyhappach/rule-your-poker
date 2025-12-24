import { PlayingCard, getCardSize } from "@/components/PlayingCard";
import { Card as CardType } from "@/lib/cardUtils";

interface HandHistoryCardsProps {
  cards: CardType[];
  label?: string;
  size?: 'sm' | 'md';
}

export const HandHistoryCards = ({ cards, label, size = 'sm' }: HandHistoryCardsProps) => {
  if (!cards || cards.length === 0) return null;
  
  return (
    <div className="flex flex-col gap-1">
      {label && <span className="text-xs text-muted-foreground">{label}</span>}
      <div className="flex gap-0.5">
        {cards.map((card, idx) => (
          <PlayingCard 
            key={idx} 
            card={card} 
            size={size}
            className="shadow-sm"
          />
        ))}
      </div>
    </div>
  );
};
