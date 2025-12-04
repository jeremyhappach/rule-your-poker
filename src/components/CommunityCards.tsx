import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { useState, useEffect, useRef, useMemo } from "react";
import bullsLogo from '@/assets/bulls-logo.png';
import bearsLogo from '@/assets/bears-logo.png';
import cubsLogo from '@/assets/cubs-logo.png';
import hawksLogo from '@/assets/hawks-logo.png';

const TEAM_LOGOS: Record<string, string> = {
  bulls: bullsLogo,
  bears: bearsLogo,
  cubs: cubsLogo,
  hawks: hawksLogo,
};

interface CommunityCardsProps {
  cards: CardType[];
  revealed: number;
}

export const CommunityCards = ({ cards, revealed }: CommunityCardsProps) => {
  const { getCardBackColors, getCardBackId } = useVisualPreferences();
  const cardBackColors = getCardBackColors();
  const cardBackId = getCardBackId();
  const teamLogo = TEAM_LOGOS[cardBackId] || null;
  
  // Generate a stable hand signature from card data
  const handSignature = useMemo(() => 
    cards.map(c => `${c.rank}${c.suit}`).join(','), 
    [cards]
  );
  
  // Track which hand we've initialized for
  const initializedHandRef = useRef<string>('');
  // Track which cards have completed their deal animation
  const [visibleCards, setVisibleCards] = useState<boolean[]>([]);
  // Track which cards (index 2+) have been flipped
  const [flippedIndices, setFlippedIndices] = useState<Set<number>>(new Set());
  // Track which cards are currently in flip animation
  const [flippingIndices, setFlippingIndices] = useState<Set<number>>(new Set());
  // Track the last revealed count we processed for flip animation
  const lastProcessedRevealedRef = useRef<number>(0);
  // Track if this is initial page load (show all immediately)
  const isInitialLoadRef = useRef<boolean>(true);
  
  // Timeouts for cleanup
  const dealTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const flipTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  // Cleanup function
  const clearAllTimeouts = () => {
    dealTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    dealTimeoutsRef.current = [];
    flipTimeoutsRef.current = [];
  };
  
  // Detect if this is a new hand (cards changed but we haven't processed yet)
  const isNewHandTransition = handSignature !== initializedHandRef.current && handSignature.length > 0;
  
  // Handle new hand detection and deal animation
  useEffect(() => {
    if (cards.length === 0) return;
    
    // Check if this is a new hand
    if (handSignature !== initializedHandRef.current) {
      clearAllTimeouts();
      initializedHandRef.current = handSignature;
      lastProcessedRevealedRef.current = revealed;
      
      // On initial page load, show everything immediately
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
        setVisibleCards(cards.map(() => true));
        // Pre-flip any cards beyond index 1 that are already revealed
        const preFlipped = new Set<number>();
        for (let i = 2; i < revealed; i++) {
          preFlipped.add(i);
        }
        setFlippedIndices(preFlipped);
        setFlippingIndices(new Set());
        return;
      }
      
      // New hand during gameplay - reset everything
      setVisibleCards(cards.map(() => false));
      setFlippedIndices(new Set());
      setFlippingIndices(new Set());
      
      // Deal cards one-by-one with initial delay (player cards first)
      const INITIAL_DELAY = 800;
      const CARD_INTERVAL = 200;
      
      cards.forEach((_, index) => {
        const timeout = setTimeout(() => {
          setVisibleCards(prev => {
            const next = [...prev];
            next[index] = true;
            return next;
          });
        }, INITIAL_DELAY + index * CARD_INTERVAL);
        dealTimeoutsRef.current.push(timeout);
      });
    }
  }, [handSignature, cards, revealed]);
  
  // Handle flip animation when revealed increases (separate from deal animation)
  useEffect(() => {
    // Skip if no cards or hand not initialized yet
    if (cards.length === 0 || initializedHandRef.current !== handSignature) return;
    
    // Only process if revealed increased beyond what we last processed
    if (revealed <= lastProcessedRevealedRef.current) return;
    
    const previousRevealed = lastProcessedRevealedRef.current;
    lastProcessedRevealedRef.current = revealed;
    
    // Find cards that need to flip (index 2+ that weren't revealed before)
    const toFlip: number[] = [];
    for (let i = Math.max(2, previousRevealed); i < revealed; i++) {
      if (!flippedIndices.has(i) && !flippingIndices.has(i)) {
        toFlip.push(i);
      }
    }
    
    if (toFlip.length === 0) return;
    
    // Animate flips with stagger
    toFlip.forEach((cardIndex, arrayIndex) => {
      const isLastCard = arrayIndex === toFlip.length - 1 && toFlip.length > 1;
      const delay = isLastCard ? 1500 : arrayIndex * 200;
      
      // Start flip
      const startTimeout = setTimeout(() => {
        setFlippingIndices(prev => new Set([...prev, cardIndex]));
        
        // End flip after animation duration
        const endTimeout = setTimeout(() => {
          setFlippedIndices(prev => new Set([...prev, cardIndex]));
          setFlippingIndices(prev => {
            const next = new Set(prev);
            next.delete(cardIndex);
            return next;
          });
        }, 1200);
        flipTimeoutsRef.current.push(endTimeout);
      }, delay);
      flipTimeoutsRef.current.push(startTimeout);
    });
  }, [revealed, handSignature, cards.length, flippedIndices, flippingIndices]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimeouts();
  }, []);
  
  // Don't render if no cards or during new hand transition (prevents flash of old cards)
  if (cards.length === 0) return null;
  if (isNewHandTransition && !isInitialLoadRef.current) return null;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex gap-1" style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isVisible = visibleCards[index] ?? false;
          const isFlipping = flippingIndices.has(index);
          const hasFlipped = flippedIndices.has(index);
          // Show front: first 2 cards always face-up, others only after flip completes
          const showFront = index < 2 || hasFlipped;
          const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900';
          
          return (
            <div
              key={index}
              className="w-10 h-14 sm:w-12 sm:h-16 relative"
              style={{ 
                transformStyle: 'preserve-3d',
                transition: isFlipping 
                  ? 'transform 1.2s ease-in-out' 
                  : 'opacity 0.3s ease-out, transform 0.3s ease-out',
                transform: isFlipping 
                  ? 'rotateY(180deg)' 
                  : isVisible 
                    ? 'rotateY(0deg) translateY(0)' 
                    : 'rotateY(0deg) translateY(-20px)',
                opacity: isVisible ? 1 : 0,
              }}
            >
              {/* Card Back */}
              <Card 
                className="absolute inset-0 w-full h-full flex items-center justify-center border border-poker-gold shadow-lg"
                style={{
                  background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                  backfaceVisibility: 'hidden',
                  transform: showFront ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                <div className="w-full h-full flex items-center justify-center p-1">
                  {teamLogo ? (
                    <img src={teamLogo} alt="Team logo" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-poker-gold text-2xl font-bold opacity-30">
                      ?
                    </div>
                  )}
                </div>
              </Card>
              
              {/* Card Front */}
              <Card 
                className="absolute inset-0 w-full h-full flex items-center justify-center border border-poker-gold shadow-lg"
                style={{
                  backgroundColor: 'white',
                  backfaceVisibility: 'hidden',
                  transform: showFront ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                }}
              >
                <div className="flex flex-col items-center justify-center">
                  <div className={`text-lg sm:text-xl font-bold ${suitColor}`}>
                    {card.rank}
                  </div>
                  <div className={`text-base sm:text-lg ${suitColor}`}>
                    {card.suit}
                  </div>
                </div>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
};