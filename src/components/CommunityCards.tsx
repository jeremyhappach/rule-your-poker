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
  // Track the card identity we last processed
  const [processedIdentity, setProcessedIdentity] = useState<string>('');
  
  const flipTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const dealTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  // Track max revealed internally - NEVER decrease within same hand
  const maxRevealedRef = useRef<number>(0);
  // Track if this is the very first mount (no animation on page load)
  const isFirstMountRef = useRef<boolean>(true);
  // Track what revealed value we last animated flips for
  const lastFlippedRevealedRef = useRef<number>(0);
  
  // Compute current card identity
  const currentCardsIdentity = cards.map(c => `${c.rank}${c.suit}`).join(',');
  
  // Detect new hand - only when identity changes AND we've already processed previous identity
  const isNewHand = currentCardsIdentity !== processedIdentity && currentCardsIdentity.length > 0;
  const isFirstMount = isFirstMountRef.current;
  
  // Handle new hand detection
  useEffect(() => {
    if (!isNewHand || cards.length === 0) return;
    
    // Clear all pending timeouts
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    dealTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current = [];
    dealTimeoutsRef.current = [];
    
    // Update tracking refs
    maxRevealedRef.current = revealed;
    lastFlippedRevealedRef.current = revealed;
    
    // Mark this identity as processed immediately
    setProcessedIdentity(currentCardsIdentity);
    
    // On first mount (page load), show all cards immediately without animation
    if (isFirstMount) {
      isFirstMountRef.current = false;
      const allIndices = new Set(cards.map((_, i) => i));
      setDealtCards(allIndices);
      setFlippingCards(new Set());
      // Pre-populate flipped state for revealed cards beyond first 2
      const alreadyRevealed = new Set<number>();
      for (let i = 2; i < revealed; i++) {
        alreadyRevealed.add(i);
      }
      setFlippedCards(alreadyRevealed);
      return;
    }
    
    // During gameplay: clear everything and animate the deal
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
  }, [currentCardsIdentity, cards.length, revealed, isNewHand, isFirstMount]);
  
  // Track max revealed - only increase, never decrease (same hand)
  useEffect(() => {
    if (!isNewHand && revealed > maxRevealedRef.current) {
      maxRevealedRef.current = revealed;
    }
  }, [revealed, isNewHand]);
  
  // Use internal max for rendering
  const effectiveRevealed = maxRevealedRef.current;
  
  // Handle revealing new cards - animation logic (separate from new hand logic)
  useEffect(() => {
    // Skip if new hand just started or if we haven't processed cards yet
    if (isNewHand || !processedIdentity) return;
    
    // Only animate when revealed increases beyond what we last animated
    if (revealed > lastFlippedRevealedRef.current) {
      const newlyRevealed: number[] = [];
      for (let i = lastFlippedRevealedRef.current; i < revealed; i++) {
        // Only flip cards at index 2+ (first 2 are always face-up)
        if (i >= 2) {
          newlyRevealed.push(i);
        }
      }
      
      // Update ref immediately to prevent re-triggering
      lastFlippedRevealedRef.current = revealed;
      maxRevealedRef.current = Math.max(maxRevealedRef.current, revealed);
      
      if (newlyRevealed.length === 0) return;
      
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
    }
  }, [revealed, isNewHand, processedIdentity]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flipTimeoutsRef.current.forEach(t => clearTimeout(t));
      dealTimeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);
  
  // Don't render anything if we haven't processed cards yet (prevents flash of old cards)
  if (cards.length === 0 || (isNewHand && !isFirstMount)) return null;

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
