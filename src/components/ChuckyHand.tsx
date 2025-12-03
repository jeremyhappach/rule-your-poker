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

interface ChuckyHandProps {
  cards: CardType[];
  show: boolean;
  revealed?: number;
  x?: number;
  y?: number;
}

export const ChuckyHand = ({ cards, show, revealed = cards.length, x, y }: ChuckyHandProps) => {
  const { getCardBackColors, getCardBackId } = useVisualPreferences();
  const cardBackColors = getCardBackColors();
  const cardBackId = getCardBackId();
  const teamLogo = TEAM_LOGOS[cardBackId] || null;
  
  // Track which cards are currently flipping and have flipped
  const [flippingCards, setFlippingCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const prevRevealedRef = useRef(revealed);
  const flipTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  useEffect(() => {
    // Clear any pending timeouts
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current = [];
    
    // Check if revealed count increased (new cards being revealed)
    if (revealed > prevRevealedRef.current) {
      const newlyRevealed: number[] = [];
      for (let i = prevRevealedRef.current; i < revealed; i++) {
        newlyRevealed.push(i);
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
    } else if (revealed < prevRevealedRef.current) {
      setFlippingCards(new Set());
      setFlippedCards(new Set());
    }
    
    prevRevealedRef.current = revealed;
  }, [revealed]);
  
  // Reset when cards change
  useEffect(() => {
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current = [];
    setFlippingCards(new Set());
    setFlippedCards(new Set());
    prevRevealedRef.current = revealed;
  }, [cards.length]);
  
  useEffect(() => {
    return () => {
      flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  if (!show || cards.length === 0) return null;

  const positionStyle = x !== undefined && y !== undefined
    ? { left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }
    : { top: '2%', left: '50%', transform: 'translateX(-50%)' };

  return (
    <div className="absolute z-30 animate-scale-in" style={positionStyle}>
      <div className="bg-gradient-to-br from-red-900/90 to-red-950/90 rounded-lg p-1.5 sm:p-2 backdrop-blur-sm border border-red-500 shadow-xl">
        <div className="text-center mb-1">
          <span className="text-red-400 font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1">
            <span className="text-sm">👿</span>
            Chucky {revealed < cards.length && `(${revealed}/${cards.length})`}
          </span>
        </div>
        <div className="flex gap-0.5 sm:gap-1" style={{ perspective: '1000px' }}>
          {cards.map((card, index) => {
            const isRevealed = index < revealed;
            const isFlipping = flippingCards.has(index);
            const hasFlipped = flippedCards.has(index);
            const showFront = hasFlipped || (isRevealed && !isFlipping && index < prevRevealedRef.current);
            const suitColor = (card.suit === '♥' || card.suit === '♦') ? 'text-red-600' : 'text-gray-900';
            
            return (
              <div
                key={index}
                className="w-8 h-12 sm:w-9 sm:h-13 md:w-10 md:h-14 relative"
                style={{ 
                  transformStyle: 'preserve-3d',
                  transition: isFlipping ? 'transform 1.2s ease-in-out' : 'none',
                  transform: isFlipping ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                {/* Card Back */}
                <Card 
                  className="absolute inset-0 w-full h-full flex items-center justify-center border border-red-500 shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${cardBackColors.color} 0%, ${cardBackColors.darkColor} 100%)`,
                    backfaceVisibility: 'hidden',
                    transform: showFront ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                >
                  <div className="w-full h-full flex items-center justify-center p-0.5">
                    {teamLogo ? (
                      <img src={teamLogo} alt="Team logo" className="w-full h-full object-contain" />
                    ) : (
                      <div className="text-poker-gold text-lg font-bold opacity-30">
                        ?
                      </div>
                    )}
                  </div>
                </Card>
                
                {/* Card Front */}
                <Card 
                  className="absolute inset-0 w-full h-full flex items-center justify-center border border-red-500 shadow-md"
                  style={{
                    backgroundColor: 'white',
                    backfaceVisibility: 'hidden',
                    transform: showFront ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                  }}
                >
                  <div className="flex flex-col items-center justify-center">
                    <div className={`text-sm sm:text-base md:text-lg font-bold ${suitColor}`}>
                      {card.rank}
                    </div>
                    <div className={`text-xs sm:text-sm md:text-base ${suitColor}`}>
                      {card.suit}
                    </div>
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
