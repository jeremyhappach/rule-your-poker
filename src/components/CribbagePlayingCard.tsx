import type { CribbageCard } from '@/lib/cribbageTypes';

interface CribbagePlayingCardProps {
  card: CribbageCard;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  faceDown?: boolean;
}

export const CribbagePlayingCard = ({ 
  card, 
  size = 'md',
  faceDown = false 
}: CribbagePlayingCardProps) => {
  // Narrower cards with 2:3 aspect ratio (width:height) - larger text for readability
  const sizeStyles: Record<string, { width: number; height: number; fontSize: string; suitSize: string }> = {
    xs: { width: 24, height: 36, fontSize: 'text-sm font-bold', suitSize: 'text-base' },
    sm: { width: 32, height: 48, fontSize: 'text-lg font-bold', suitSize: 'text-xl' },
    md: { width: 40, height: 60, fontSize: 'text-xl font-bold', suitSize: 'text-2xl' },
    lg: { width: 48, height: 72, fontSize: 'text-2xl font-bold', suitSize: 'text-3xl' },
  };

  const { width, height, fontSize, suitSize } = sizeStyles[size];

  const getSuitSymbol = (suit: CribbageCard['suit']) => {
    switch (suit) {
      case 'hearts': return '♥';
      case 'diamonds': return '♦';
      case 'clubs': return '♣';
      case 'spades': return '♠';
    }
  };

  const getSuitColor = (suit: CribbageCard['suit']) => {
    return suit === 'hearts' || suit === 'diamonds' ? 'text-red-500' : 'text-gray-900';
  };

  if (faceDown) {
    return (
      <div 
        style={{ width, height }}
        className="rounded-sm bg-gradient-to-br from-blue-800 to-blue-950 border border-blue-600 shadow-sm flex items-center justify-center"
      >
        <div className="w-3/4 h-3/4 border border-blue-400/30 rounded-sm bg-blue-700/30" />
      </div>
    );
  }

  return (
    <div 
      style={{ width, height }}
      className="rounded-sm bg-white border border-gray-300 shadow-sm flex flex-col items-center justify-center gap-0"
    >
      <span className={`font-bold leading-none ${fontSize} ${getSuitColor(card.suit)}`}>
        {card.rank}
      </span>
      <span className={`leading-none ${suitSize} ${getSuitColor(card.suit)}`}>
        {getSuitSymbol(card.suit)}
      </span>
    </div>
  );
};
