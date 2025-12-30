import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { useState, useEffect, useRef, useMemo } from "react";

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
  highlightedIndices?: number[];  // Indices of cards that are part of winning hand
  kickerIndices?: number[];       // Indices of kicker cards
  hasHighlights?: boolean;        // Whether highlights are active (to dim non-highlighted cards)
  tightOverlap?: boolean;         // Use tighter spacing for multi-player showdown
}

export const CommunityCards = ({ cards, revealed, highlightedIndices = [], kickerIndices = [], hasHighlights = false, tightOverlap = false }: CommunityCardsProps) => {
  const handId = useMemo(() => cards.map(c => `${c.rank}${c.suit}`).join(','), [cards]);
  
  // Use refs to track state synchronously to prevent flashing during hand transitions
  const animatedHandIdRef = useRef<string>('');
  const dealtCardsRef = useRef<Set<number>>(new Set());
  const flippedCardsRef = useRef<Set<number>>(new Set());
  
  const [renderTrigger, setRenderTrigger] = useState(0);
  
  const lastRevealedRef = useRef<number>(0);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const isFirstMountRef = useRef<boolean>(true);
  
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  };
  
  // Synchronously update refs when handId changes to prevent flash
  // This runs during render, before paint, so cards never disappear
  if (cards.length > 0 && handId !== animatedHandIdRef.current) {
    console.log('[COMMUNITY_CARDS] Sync update - handId changed from', animatedHandIdRef.current, 'to', handId);
    clearTimeouts();
    
    // For subsequent hands (not first), show cards immediately with no animation
    const shouldSkipAnimation = isFirstMountRef.current || animatedHandIdRef.current !== '';
    
    if (shouldSkipAnimation) {
      const allDealt = new Set<number>();
      for (let i = 0; i < cards.length; i++) allDealt.add(i);
      
      const preFlipped = new Set<number>();
      for (let i = 2; i < revealed; i++) preFlipped.add(i);
      
      console.log('[COMMUNITY_CARDS] Setting dealtCards to all', cards.length, 'cards, flipped up to', revealed);
      dealtCardsRef.current = allDealt;
      flippedCardsRef.current = preFlipped;
      animatedHandIdRef.current = handId;
      lastRevealedRef.current = revealed;
      isFirstMountRef.current = false;
    } else {
      // First hand animation (rare - only on very first game load)
      dealtCardsRef.current = new Set();
      flippedCardsRef.current = new Set();
      lastRevealedRef.current = revealed;
      animatedHandIdRef.current = handId;
      isFirstMountRef.current = false;
    }
  }
  
  // Handle first hand dealing animation with timeouts
  useEffect(() => {
    if (cards.length === 0) return;
    
    // Only animate if this is the very first hand and we haven't dealt cards yet
    if (dealtCardsRef.current.size === 0 && cards.length > 0 && !isFirstMountRef.current) {
      const INITIAL_DELAY = 400;
      const CARD_INTERVAL = 200;
      
      cards.forEach((_, index) => {
        const timeout = setTimeout(() => {
          dealtCardsRef.current = new Set([...dealtCardsRef.current, index]);
          setRenderTrigger(n => n + 1);
        }, INITIAL_DELAY + index * CARD_INTERVAL);
        timeoutsRef.current.push(timeout);
      });
    }
  }, [cards.length]);
  
  // Handle card flipping when revealed count increases
  useEffect(() => {
    if (cards.length === 0) return;
    if (handId !== animatedHandIdRef.current) return;
    if (revealed <= lastRevealedRef.current) return;
    
    const previousRevealed = lastRevealedRef.current;
    lastRevealedRef.current = revealed;
    
    const toFlip: number[] = [];
    for (let i = Math.max(2, previousRevealed); i < revealed; i++) {
      if (!flippedCardsRef.current.has(i)) {
        toFlip.push(i);
      }
    }
    
    if (toFlip.length === 0) return;
    
    toFlip.forEach((cardIndex, arrayIndex) => {
      const isLastCard = arrayIndex === toFlip.length - 1 && toFlip.length > 1;
      const delay = isLastCard ? 1500 : arrayIndex * 200;
      
      const timeout = setTimeout(() => {
        flippedCardsRef.current = new Set([...flippedCardsRef.current, cardIndex]);
        setRenderTrigger(n => n + 1);
      }, delay);
      timeoutsRef.current.push(timeout);
    });
  }, [revealed, handId, cards.length]);
  
  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => clearTimeouts();
  }, []);
  
  if (cards.length === 0) return null;

  // Read from refs for render (they're always in sync)
  const dealtCards = dealtCardsRef.current;
  const flippedCards = flippedCardsRef.current;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className={`flex ${tightOverlap ? '-space-x-3' : '-space-x-1'}`} style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isVisible = dealtCards.has(index);
          const hasFlipped = flippedCards.has(index);
          const showFront = index < 2 || hasFlipped;
          
          return (
            <div
              key={index}
              className="w-9 h-12 sm:w-10 sm:h-14 relative"
              style={{ 
                transformStyle: 'preserve-3d',
                transition: 'opacity 0.3s ease-out, transform 0.3s ease-out',
                transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
                opacity: isVisible ? 1 : 0,
              }}
            >
              {showFront ? (
              <PlayingCard
                  card={card}
                  size="lg"
                  isHighlighted={highlightedIndices.includes(index)}
                  isKicker={kickerIndices.includes(index)}
                  isDimmed={hasHighlights && !highlightedIndices.includes(index) && !kickerIndices.includes(index)}
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(0deg)',
                    transition: 'transform 1.2s ease-in-out',
                  }}
                />
              ) : (
                <>
                <PlayingCard
                    isHidden
                    size="lg"
                    className="absolute inset-0"
                    style={{
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(0deg)',
                      transition: 'transform 1.2s ease-in-out',
                    }}
                  />
                <PlayingCard
                    card={card}
                    size="lg"
                    className="absolute inset-0"
                    style={{
                      backfaceVisibility: 'hidden',
                      transform: 'rotateY(-180deg)',
                      transition: 'transform 1.2s ease-in-out',
                    }}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
