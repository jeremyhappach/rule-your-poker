// Animation showing a card moving from stock/discard pile to opponent's hand area
// Face-down for stock draws, face-up for discard draws

import { useEffect, useState } from 'react';
import { CribbagePlayingCard } from './CribbagePlayingCard';
import type { GinRummyCard } from '@/lib/ginRummyTypes';
import type { CanonicalSlot } from '@/lib/canonicalShell/seatAnchors';

const SYMBOL_TO_WORD: Record<string, string> = {
  '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs',
};

interface GinRummyOpponentDrawAnimationProps {
  triggerId: string | null;
  drawSource: 'stock' | 'discard';
  card: GinRummyCard | null;
  cardBackColors: { color: string; darkColor: string };
  targetSlot?: CanonicalSlot | null;
}

export const GinRummyOpponentDrawAnimation = ({
  triggerId,
  drawSource,
  card,
  cardBackColors,
  targetSlot,
}: GinRummyOpponentDrawAnimationProps) => {
  const [animating, setAnimating] = useState(false);
  const [visible, setVisible] = useState(!!triggerId);

  useEffect(() => {
    if (!triggerId) return;
    setVisible(true);
    setAnimating(false);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setAnimating(true);
      });
    });

    const timer = setTimeout(() => {
      setVisible(false);
    }, 700);

    return () => clearTimeout(timer);
  }, [triggerId]);

  if (!visible) return null;

  // Start position relative to the circular felt container.
  const startX = drawSource === 'stock' ? 'calc(50% - 44px)' : 'calc(50% + 12px)';
  const startY = '46%';

  // End position keyed off the canonical slot identity supplied by the
  // shell's SeatAnchorLayer. No parallel coordinate registry.
  const slotEndpoints: Record<CanonicalSlot, { x: string; y: string }> = {
    [-3]: { x: '50%', y: '92%' }, // BOTTOM_RAIL (observer-only)
    [-1]: { x: '50%', y: '82%' },
    0: { x: '22%', y: '78%' },
    1: { x: '16%', y: '50%' },
    2: { x: '22%', y: '22%' },
    3: { x: '78%', y: '22%' },
    4: { x: '84%', y: '50%' },
    5: { x: '78%', y: '78%' },
  };

  if (targetSlot === null || targetSlot === undefined) return null;
  const endpoint = slotEndpoints[targetSlot];
  if (!endpoint) return null;
  const endX = endpoint.x;
  const endY = endpoint.y;

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
