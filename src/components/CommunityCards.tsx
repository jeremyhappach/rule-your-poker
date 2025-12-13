import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { useState, useEffect, useRef, useMemo } from "react";

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
  highlightedIndices?: number[];  // Indices of cards that are part of winning hand
  kickerIndices?: number[];       // Indices of kicker cards
  hasHighlights?: boolean;        // Whether highlights are active (to dim non-highlighted cards)
}

export const CommunityCards = ({ cards, revealed, highlightedIndices = [], kickerIndices = [], hasHighlights = false }: CommunityCardsProps) => {
  const handId = useMemo(() => cards.map(c => `${c.rank}${c.suit}`).join(','), [cards]);
  
  const [animatedHandId, setAnimatedHandId] = useState<string>('');
  const [dealtCards, setDealtCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  
  const lastRevealedRef = useRef<number>(0);
  const mountTimeRef = useRef<number>(Date.now());
  const timeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  const clearTimeouts = () => {
    timeoutsRef.current.forEach(t => clearTimeout(t));
    timeoutsRef.current = [];
  };
  
  const isFirstMount = Date.now() - mountTimeRef.current < 500;
  
  useEffect(() => {
    console.log('[COMMUNITY_CARDS] useEffect - handId:', handId, 'animatedHandId:', animatedHandId, 'cardsLength:', cards.length, 'dealtCardsSize:', dealtCards.size);
    
    if (cards.length === 0) {
      console.log('[COMMUNITY_CARDS] Early return: no cards');
      return;
    }
    if (handId === animatedHandId) {
      console.log('[COMMUNITY_CARDS] Early return: handId matches animatedHandId, dealtCards size:', dealtCards.size);
      return;
    }
    
    console.log('[COMMUNITY_CARDS] Processing NEW hand - handId changed from', animatedHandId, 'to', handId);
    clearTimeouts();
    
    // For first mount OR subsequent hands (not first game load), show cards immediately
    // Only animate dealing on the very first hand of a session
    const shouldSkipAnimation = isFirstMount || animatedHandId !== '';
    
    console.log('[COMMUNITY_CARDS] shouldSkipAnimation:', shouldSkipAnimation, 'isFirstMount:', isFirstMount);
    
    if (shouldSkipAnimation) {
      const allDealt = new Set<number>();
      for (let i = 0; i < cards.length; i++) allDealt.add(i);
      
      const preFlipped = new Set<number>();
      for (let i = 2; i < revealed; i++) preFlipped.add(i);
      
      console.log('[COMMUNITY_CARDS] Setting dealtCards to all', cards.length, 'cards, flipped up to', revealed);
      setDealtCards(allDealt);
      setFlippedCards(preFlipped);
      setAnimatedHandId(handId);
      lastRevealedRef.current = revealed;
      return;
    }
    
    // First hand animation (rare - only when component mounts with no prior handId)
    setDealtCards(new Set());
    setFlippedCards(new Set());
    lastRevealedRef.current = revealed;
    
    const INITIAL_DELAY = 800;
    const CARD_INTERVAL = 200;
    
    cards.forEach((_, index) => {
      const timeout = setTimeout(() => {
        setDealtCards(prev => new Set([...prev, index]));
      }, INITIAL_DELAY + index * CARD_INTERVAL);
      timeoutsRef.current.push(timeout);
    });
    
    const idTimeout = setTimeout(() => {
      setAnimatedHandId(handId);
    }, 50);
    timeoutsRef.current.push(idTimeout);
    
  }, [handId, cards, revealed, animatedHandId, isFirstMount]);
  
  useEffect(() => {
    if (cards.length === 0) return;
    if (handId !== animatedHandId) return;
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
  }, [revealed, handId, animatedHandId, cards.length, flippedCards]);
  
  useEffect(() => {
    return () => clearTimeouts();
  }, []);
  
  // Debug pulse every 100ms to track card state
  useEffect(() => {
    const debugInterval = setInterval(() => {
      console.log('[COMMUNITY_CARDS_PULSE]', {
        timestamp: Date.now(),
        cardsLength: cards.length,
        cardsData: cards.map(c => `${c.rank}${c.suit}`),
        revealed,
        handId,
        animatedHandId,
        dealtCardsSize: dealtCards.size,
        dealtCardsArray: Array.from(dealtCards),
        flippedCardsSize: flippedCards.size,
        flippedCardsArray: Array.from(flippedCards),
        hasHighlights,
        highlightedIndices,
        kickerIndices,
      });
    }, 100);
    
    return () => clearInterval(debugInterval);
  }, [cards, revealed, handId, animatedHandId, dealtCards, flippedCards, hasHighlights, highlightedIndices, kickerIndices]);
  
  if (cards.length === 0) return null;
  
  // Don't return null during hand transitions - just render with current dealt cards state
  // The previous null return caused cards to disappear during state sync

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex -space-x-1" style={{ perspective: '1000px' }}>
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
