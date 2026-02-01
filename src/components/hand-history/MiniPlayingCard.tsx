import { cn } from "@/lib/utils";

// Minimal card representation for hand history
type Suit = '♥' | '♦' | '♣' | '♠';

interface MiniCardData {
  rank: string;
  suit: Suit | string;
}

// Normalize suit from various formats
const normalizeSuit = (suit: string): Suit => {
  const map: Record<string, Suit> = {
    'hearts': '♥',
    'diamonds': '♦', 
    'clubs': '♣',
    'spades': '♠',
    '♥': '♥',
    '♦': '♦',
    '♣': '♣',
    '♠': '♠',
  };
  return map[suit?.toLowerCase?.()] || map[suit] || suit as Suit;
};

const getSuitColor = (suit: Suit): string => {
  switch (suit) {
    case '♥':
    case '♦':
      return 'text-red-500';
    case '♣':
    case '♠':
    default:
      return 'text-foreground';
  }
};

interface MiniPlayingCardProps {
  card: MiniCardData;
  className?: string;
}

export function MiniPlayingCard({ card, className }: MiniPlayingCardProps) {
  const normalizedSuit = normalizeSuit(card.suit);
  const color = getSuitColor(normalizedSuit);
  
  return (
    <div className={cn(
      "w-5 h-7 bg-white border border-border/50 rounded text-[10px] font-bold flex flex-col items-center justify-center leading-none shadow-sm",
      color,
      className
    )}>
      <span>{card.rank}</span>
      <span className="text-[8px] -mt-0.5">{normalizedSuit}</span>
    </div>
  );
}

interface MiniCardRowProps {
  cards: MiniCardData[];
  label?: string;
  className?: string;
}

export function MiniCardRow({ cards, label, className }: MiniCardRowProps) {
  if (!cards || cards.length === 0) return null;
  
  return (
    <div className={cn("flex items-center gap-1", className)}>
      {label && (
        <span className="text-[10px] text-muted-foreground mr-1">{label}</span>
      )}
      <div className="flex gap-0.5">
        {cards.map((card, i) => (
          <MiniPlayingCard key={i} card={card} />
        ))}
      </div>
    </div>
  );
}
