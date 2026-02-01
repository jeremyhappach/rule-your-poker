import type { CribbageCard } from '@/lib/cribbageTypes';

interface CribbagePlayingCardProps {
  card: CribbageCard;
  size?: 'sm' | 'md' | 'lg';
  faceDown?: boolean;
}

export const CribbagePlayingCard = ({ 
  card, 
  size = 'md',
  faceDown = false 
}: CribbagePlayingCardProps) => {
  const sizeClasses = {
    sm: 'w-8 h-12 text-xs',
    md: 'w-12 h-18 text-sm',
    lg: 'w-16 h-24 text-base',
  };

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
        className={`${sizeClasses[size]} rounded-md bg-gradient-to-br from-blue-800 to-blue-950 border-2 border-blue-600 shadow-md flex items-center justify-center`}
      >
        <div className="w-3/4 h-3/4 border border-blue-400/30 rounded-sm bg-blue-700/30" />
      </div>
    );
  }

  return (
    <div 
      className={`${sizeClasses[size]} rounded-md bg-white border border-gray-300 shadow-md flex flex-col items-center justify-center p-0.5`}
    >
      <span className={`font-bold ${getSuitColor(card.suit)}`}>
        {card.rank}
      </span>
      <span className={`text-lg leading-none ${getSuitColor(card.suit)}`}>
        {getSuitSymbol(card.suit)}
      </span>
    </div>
  );
};
