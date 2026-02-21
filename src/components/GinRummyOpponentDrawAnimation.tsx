// Animation showing a card moving from stock/discard pile to opponent's hand area
// Face-down for stock draws, face-up for discard draws

import { useEffect, useState } from 'react';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import type { GinRummyCard } from '@/lib/ginRummyTypes';

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

interface GinRummyOpponentDrawAnimationProps {
  triggerId: string | null;
  drawSource: 'stock' | 'discard';
  card: GinRummyCard | null;
  cardBackColors: { color: string; darkColor: string };
}

export const GinRummyOpponentDrawAnimation = ({
  triggerId,
  drawSource,
  card,
  cardBackColors,
}: GinRummyOpponentDrawAnimationProps) => {
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(!!triggerId);

  useEffect(() => {
    if (!triggerId) return;
    setVisible(true);
    setAnimating(false);

    // Start animation on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimating(true);
      });
    });

    // Hide after animation completes
    const timer = setTimeout(() => {
      setVisible(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [triggerId]);

  if (!visible) return null;

  // Start position: stock is left, discard is right (matching felt layout)
  // These are relative to the circular felt container
  // Stock: roughly left-center, Discard: roughly right-center
  const startX = drawSource === 'stock' ? 'calc(50% - 44px)' : 'calc(50% + 12px)';
  const startY = '46%';

  // End position: opponent's card area (top-left of felt)
  const endX = '24px';
  const endY = '72px';

  const isFaceUp = drawSource === 'discard' && card;

  return (
    <div
      className="absolute z-[60] pointer-events-none transition-all"
      style={{
        left: animating ? endX : startX,
        top: animating ? endY : startY,
        transform: `translate(-50%, -50%) scale(${animating ? 0.6 : 1})`,
        opacity: animating ? 0 : 1,
        transitionProperty: 'left, top, transform, opacity',
        transitionDuration: '550ms',
        transitionTimingFunction: 'ease-in-out',
      }}
    >
      {isFaceUp ? (
        <CribbagePlayingCard
          card={{
            suit: (SYMBOL_TO_WORD[card.suit] || card.suit) as any,
            rank: card.rank,
            value: card.value,
          }}
          size="lg"
        />
      ) : (
        <div
          className="w-12 h-[68px] rounded-md border border-white/30 shadow-lg"
          style={{
            background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
          }}
        />
      )}
    </div>
  );
};
