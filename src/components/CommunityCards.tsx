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
  
  // Track which cards are currently flipping and have flipped
  const [flippingCards, setFlippingCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const prevRevealedRef = useRef(revealed);
  const flipTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  // Track the max revealed count - NEVER decrease during a hand
  const maxRevealedRef = useRef(revealed);
  // Track the cards identity to know when it's a NEW hand
  const cardsIdentityRef = useRef<string>('');
  
  // Compute cards identity to detect new hands
  const currentCardsIdentity = cards.map(c => `${c.rank}${c.suit}`).join(',');
  
  // Detect new hand (cards changed completely) - reset everything
  if (currentCardsIdentity !== cardsIdentityRef.current && currentCardsIdentity.length > 0) {
    cardsIdentityRef.current = currentCardsIdentity;
    maxRevealedRef.current = revealed;
    prevRevealedRef.current = revealed;
  }
  
  // Update max revealed (only increase, never decrease within same hand)
  if (revealed > maxRevealedRef.current) {
    maxRevealedRef.current = revealed;
  }
  
  // Use the max revealed count for rendering
  const effectiveRevealed = maxRevealedRef.current;
  
  useEffect(() => {
    // Clear any pending timeouts
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current = [];
    
    // Check if revealed count increased (new cards being revealed)
    if (effectiveRevealed > prevRevealedRef.current) {
      const newlyRevealed: number[] = [];
      for (let i = prevRevealedRef.current; i < effectiveRevealed; i++) {
        newlyRevealed.push(i);
      }
      
      // Stagger the flip animations - last card has 1.5s delay
      newlyRevealed.forEach((cardIndex, i) => {
        const isLastCard = i === newlyRevealed.length - 1 && newlyRevealed.length > 1;
        const delay = isLastCard ? 1500 : i * 200; // 1.5s delay for last card, small stagger for others
        
        // Start flipping animation after delay
        const startTimeout = setTimeout(() => {
          setFlippingCards(prev => new Set([...prev, cardIndex]));
          
          // After animation completes, mark as flipped
          const endTimeout = setTimeout(() => {
            setFlippedCards(prev => new Set([...prev, cardIndex]));
            setFlippingCards(prev => {
              const next = new Set(prev);
              next.delete(cardIndex);
              return next;
            });
          }, 1200); // Match animation duration
          
          flipTimeoutsRef.current.push(endTimeout);
        }, delay);
        
        flipTimeoutsRef.current.push(startTimeout);
      });
      
      prevRevealedRef.current = effectiveRevealed;
    }
  }, [effectiveRevealed]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);
  
  if (cards.length === 0) return null;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex gap-1" style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
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
                transition: isFlipping ? 'transform 1.2s ease-in-out' : 'none',
                transform: isFlipping ? 'rotateY(180deg)' : 'rotateY(0deg)',
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
