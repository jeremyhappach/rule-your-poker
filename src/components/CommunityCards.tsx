import { Card as CardType } from "@/lib/cardUtils";
import { Card } from "@/components/ui/card";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { useState, useEffect, useRef } from "react";
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
  
  // Track which cards have been "dealt" (visible on table)
  const [dealtCards, setDealtCards] = useState<Set<number>>(new Set());
  // Track which cards are currently flipping and have flipped
  const [flippingCards, setFlippingCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const flipTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const dealTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  // Track card identity to detect actual new hands (not just revealed count changes)
  const cardsIdentityRef = useRef<string>('');
  // Track max revealed internally - NEVER decrease within same hand
  const maxRevealedRef = useRef<number>(0);
  // Track if this is the very first mount (no animation on page load)
  const isFirstMountRef = useRef<boolean>(true);
  
  // Compute current card identity
  const currentCardsIdentity = cards.map(c => `${c.rank}${c.suit}`).join(',');
  
  // Detect new hand - only reset when actual cards change
  const isNewHand = currentCardsIdentity !== cardsIdentityRef.current && currentCardsIdentity.length > 0;
  const isFirstMount = isFirstMountRef.current;
  
  // Track previous effective for animation triggering
  const prevEffectiveRef = useRef<number>(revealed);
  
  if (isNewHand) {
    // Clear timeouts and reset state for new hand
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    dealTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current = [];
    dealTimeoutsRef.current = [];
    cardsIdentityRef.current = currentCardsIdentity;
    maxRevealedRef.current = revealed;
    prevEffectiveRef.current = revealed;
  } else {
    // Same hand - only increase max, never decrease
    maxRevealedRef.current = Math.max(maxRevealedRef.current, revealed);
  }
  
  // Use internal max for rendering
  const effectiveRevealed = maxRevealedRef.current;
  
  // Handle new hand - deal cards with staggered animation
  useEffect(() => {
    if (isNewHand && cards.length > 0) {
      // On first mount (page load), show all cards immediately without animation
      if (isFirstMount) {
        isFirstMountRef.current = false;
        const allIndices = new Set(cards.map((_, i) => i));
        setDealtCards(allIndices);
        setFlippingCards(new Set());
        // Pre-populate flipped state for revealed cards
        const alreadyRevealed = new Set<number>();
        for (let i = 2; i < effectiveRevealed; i++) {
          alreadyRevealed.add(i);
        }
        setFlippedCards(alreadyRevealed);
        return;
      }
      
      // During gameplay: animate the deal
      isFirstMountRef.current = false;
      setDealtCards(new Set());
      setFlippingCards(new Set());
      setFlippedCards(new Set());
      
      // Deal cards one by one with delay (player cards show first, so delay community cards)
      const initialDelay = 800; // Wait for player cards to appear
      const dealInterval = 200; // Time between each card dealing
      
      cards.forEach((_, index) => {
        const timeout = setTimeout(() => {
          setDealtCards(prev => new Set([...prev, index]));
        }, initialDelay + (index * dealInterval));
        dealTimeoutsRef.current.push(timeout);
      });
      
      // Pre-populate flippedCards for cards beyond index 2 if already revealed
      const alreadyRevealed = new Set<number>();
      for (let i = 2; i < effectiveRevealed; i++) {
        alreadyRevealed.add(i);
      }
      // Set after deal animation completes
      const flipTimeout = setTimeout(() => {
        setFlippedCards(alreadyRevealed);
      }, initialDelay + (cards.length * dealInterval) + 100);
      dealTimeoutsRef.current.push(flipTimeout);
    }
  }, [currentCardsIdentity]);
  
  // Handle revealing new cards - animation logic
  useEffect(() => {
    // Only animate when effectiveRevealed increases
    if (effectiveRevealed > prevEffectiveRef.current) {
      const newlyRevealed: number[] = [];
      for (let i = prevEffectiveRef.current; i < effectiveRevealed; i++) {
        if (!flippedCards.has(i)) {
          newlyRevealed.push(i);
        }
      }
      
      // Stagger the flip animations - last card has 1.5s delay
      newlyRevealed.forEach((cardIndex, i) => {
        const isLastCard = i === newlyRevealed.length - 1 && newlyRevealed.length > 1;
        const delay = isLastCard ? 1500 : i * 200;
        
        const startTimeout = setTimeout(() => {
          setFlippingCards(prev => new Set([...prev, cardIndex]));
          
          const endTimeout = setTimeout(() => {
            setFlippedCards(prev => new Set([...prev, cardIndex]));
            setFlippingCards(prev => {
              const next = new Set(prev);
              next.delete(cardIndex);
              return next;
            });
          }, 1200);
          
          flipTimeoutsRef.current.push(endTimeout);
        }, delay);
        
        flipTimeoutsRef.current.push(startTimeout);
      });
      
      prevEffectiveRef.current = effectiveRevealed;
    }
  }, [effectiveRevealed, flippedCards]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flipTimeoutsRef.current.forEach(t => clearTimeout(t));
      dealTimeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);
  
  if (cards.length === 0) return null;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex gap-1" style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isDealt = dealtCards.has(index);
          const isRevealed = index < effectiveRevealed;
          const isFlipping = flippingCards.has(index);
          const hasFlipped = flippedCards.has(index);
          // Show front if: card has completed flip animation, or was already revealed before this render
          const showFront = hasFlipped || (isRevealed && index < 2);
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
                  : isDealt 
                    ? 'rotateY(0deg) translateY(0)' 
                    : 'rotateY(0deg) translateY(-20px)',
                opacity: isDealt ? 1 : 0,
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
