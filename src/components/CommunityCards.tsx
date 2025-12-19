import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
  highlightedIndices?: number[];  // Indices of cards that are part of winning hand
  kickerIndices?: number[];       // Indices of kicker cards
  hasHighlights?: boolean;        // Whether highlights are active (to dim non-highlighted cards)
}

export const CommunityCards = ({ cards, revealed, highlightedIndices = [], kickerIndices = [], hasHighlights = false }: CommunityCardsProps) => {
  // Stable identity for the current hand - memoized to prevent unnecessary recalculations
  const handId = useMemo(() => {
    if (!cards || cards.length === 0) return '';
    return cards.map(c => `${c.rank}${c.suit}`).join(',');
  }, [cards]);
  
  // Track processed hand and counter with refs to avoid render loops
  const processedHandIdRef = useRef<string>('');
  const handCounterRef = useRef(0);
  const lastRevealedRef = useRef<number>(0);
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  // State for animation control
  const [renderKey, setRenderKey] = useState(0);
  const [dealtCards, setDealtCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  
  const clearTimeouts = useCallback(() => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  }, []);
  
  // Process new hands - use functional updates to batch state changes
  useEffect(() => {
    // No cards - reset everything
    if (!handId || cards.length === 0) {
      if (processedHandIdRef.current !== '') {
        processedHandIdRef.current = '';
        lastRevealedRef.current = 0;
        clearTimeouts();
        setDealtCards(new Set());
        setFlippedCards(new Set());
      }
      return;
    }
    
    // Same hand, already processed - skip
    if (handId === processedHandIdRef.current && dealtCards.size > 0) {
      return;
    }
    
    // New hand detected!
    if (handId !== processedHandIdRef.current) {
      handCounterRef.current += 1;
      processedHandIdRef.current = handId;
      clearTimeouts();
      
      // Build all state in one go to prevent flashing
      const allDealt = new Set<number>();
      for (let i = 0; i < cards.length; i++) allDealt.add(i);
      
      const preFlipped = new Set<number>();
      for (let i = 2; i < revealed; i++) preFlipped.add(i);
      
      lastRevealedRef.current = revealed;
      
      // Batch updates - React 18 will batch these automatically
      setRenderKey(prev => prev + 1);
      setDealtCards(allDealt);
      setFlippedCards(preFlipped);
    }
  }, [handId, cards, revealed, clearTimeouts, dealtCards.size]);
  
  // Handle reveal progression (cards flipping face up)
  useEffect(() => {
    if (cards.length === 0 || !handId) return;
    if (handId !== processedHandIdRef.current) return;
    if (revealed <= lastRevealedRef.current) return;
    
    const previousRevealed = lastRevealedRef.current;
    lastRevealedRef.current = revealed;
    
    const toFlip: number[] = [];
    for (let i = Math.max(2, previousRevealed); i < revealed; i++) {
      if (!flippedCards.has(i)) {
        toFlip.push(i);
      }
    }
    
    if (toFlip.length === 0) return;
    
    toFlip.forEach((cardIndex, arrayIndex) => {
      const isLastCard = arrayIndex === toFlip.length - 1 && toFlip.length > 1;
      const delay = isLastCard ? 1500 : arrayIndex * 200;
      
      const timeout = setTimeout(() => {
        setFlippedCards(prev => new Set([...prev, cardIndex]));
      }, delay);
      timeoutsRef.current.push(timeout);
    });
  }, [revealed, handId, cards.length, flippedCards]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => clearTimeouts();
  }, [clearTimeouts]);
  
  // Don't render if no cards
  if (!cards || cards.length === 0) return null;

  // Use stable key based on handCounter ref (not state) to avoid re-triggering
  const stableHandKey = handCounterRef.current;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex -space-x-1" style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isVisible = dealtCards.has(index);
          const hasFlipped = flippedCards.has(index);
          const showFront = index < 2 || hasFlipped;
          
          return (
            <div
              key={`${stableHandKey}-${index}-${card.rank}${card.suit}`}
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
                  borderColor="border-poker-gold"
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
                    borderColor="border-poker-gold"
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
                    borderColor="border-poker-gold"
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
