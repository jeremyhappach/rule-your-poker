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
  
  // Track which cards are currently flipping
  const [flippingCards, setFlippingCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const prevRevealedRef = useRef(revealed);
  
  useEffect(() => {
    // Check if revealed count increased (new cards being revealed)
    if (revealed > prevRevealedRef.current) {
      const newlyRevealed: number[] = [];
      for (let i = prevRevealedRef.current; i < revealed; i++) {
        newlyRevealed.push(i);
      }
      
      // Start flipping animation for newly revealed cards
      if (newlyRevealed.length > 0) {
        setFlippingCards(prev => new Set([...prev, ...newlyRevealed]));
        
        // After animation completes, mark as flipped
        setTimeout(() => {
          setFlippedCards(prev => new Set([...prev, ...newlyRevealed]));
          setFlippingCards(prev => {
            const next = new Set(prev);
            newlyRevealed.forEach(i => next.delete(i));
            return next;
          });
        }, 1200); // Match animation duration
      }
    } else if (revealed < prevRevealedRef.current) {
      // Reset when revealed count decreases (new round)
      setFlippingCards(new Set());
      setFlippedCards(new Set());
    }
    
    prevRevealedRef.current = revealed;
  }, [revealed]);
  
  // Reset flipped state when cards change (new round)
  useEffect(() => {
    setFlippingCards(new Set());
    setFlippedCards(new Set());
    prevRevealedRef.current = revealed;
  }, [cards.length]);
  
  if (cards.length === 0) return null;

  return (
    <div className="absolute top-[40%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">
      <div className="flex gap-1" style={{ perspective: '1000px' }}>
        {cards.map((card, index) => {
          const isRevealed = index < revealed;
          const isFlipping = flippingCards.has(index);
          const hasFlipped = flippedCards.has(index);
          const wasAlreadyRevealed = index < prevRevealedRef.current && !isFlipping && !hasFlipped;
          const showFront = (isRevealed && hasFlipped) || (isRevealed && wasAlreadyRevealed) || (isRevealed && index < 2);
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
