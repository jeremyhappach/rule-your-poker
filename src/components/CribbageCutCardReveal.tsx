import { useState, useEffect, useRef } from 'react';
import type { CribbageCard } from '@/lib/cribbageTypes';
import { CribbagePlayingCard } from './CribbagePlayingCard';

interface CribbageCutCardRevealProps {
  card: CribbageCard | null;
  cardBackColors: { color: string; darkColor: string };
}

/**
 * A cut card display with flip animation when revealed
 */
export const CribbageCutCardReveal = ({
  card,
  cardBackColors,
}: CribbageCutCardRevealProps) => {
  const [isFlipping, setIsFlipping] = useState(false);
  const [showFace, setShowFace] = useState(false);
  const prevCardRef = useRef<CribbageCard | null>(null);

  useEffect(() => {
    // Detect when cut card is newly revealed
    if (card && !prevCardRef.current) {
      // New card revealed - trigger flip animation
      setIsFlipping(true);
      setShowFace(false);
      
      // Flip to face at midpoint
      const flipTimer = setTimeout(() => {
        setShowFace(true);
      }, 300);
      
      // End animation
      const endTimer = setTimeout(() => {
        setIsFlipping(false);
      }, 600);
      
      prevCardRef.current = card;
      
      return () => {
        clearTimeout(flipTimer);
        clearTimeout(endTimer);
      };
    } else if (!card) {
      // Card removed - reset state
      prevCardRef.current = null;
      setShowFace(false);
      setIsFlipping(false);
    }
  }, [card]);

  if (!card) return null;

  return (
    <div className="absolute top-[24%] left-1/2 -translate-x-1/2 translate-x-12 z-20 flex flex-col items-center">
      <span className="text-[9px] text-white/60 mb-0.5">Cut</span>
      <div
        className="transition-transform duration-600 ease-out"
        style={{
          perspective: '400px',
        }}
      >
        <div
          className="relative transition-transform duration-300 ease-out"
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipping 
              ? showFace 
                ? 'rotateY(0deg) scale(1.1)' 
                : 'rotateY(90deg) scale(1.1)'
              : 'rotateY(0deg) scale(1)',
          }}
        >
          {showFace || !isFlipping ? (
            <CribbagePlayingCard card={card} size="sm" />
          ) : (
            <div 
              className="w-6 h-9 rounded-sm border border-white/20"
              style={{
                background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
