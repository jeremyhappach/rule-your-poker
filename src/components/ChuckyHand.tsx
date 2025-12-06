import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { useState, useEffect, useRef } from "react";

interface ChuckyHandProps {
  cards: CardType[];
  show: boolean;
  revealed?: number;
  x?: number;
  y?: number;
}

export const ChuckyHand = ({ cards, show, revealed = cards.length, x, y }: ChuckyHandProps) => {
  const [flippingCards, setFlippingCards] = useState<Set<number>>(new Set());
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const prevRevealedRef = useRef(revealed);
  const flipTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  
  useEffect(() => {
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current = [];
    
    if (revealed > prevRevealedRef.current) {
      const newlyRevealed: number[] = [];
      for (let i = prevRevealedRef.current; i < revealed; i++) {
        newlyRevealed.push(i);
      }
      
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
            
            return (
              <div
                key={index}
                className="w-9 h-12 sm:w-10 sm:h-14 relative"
                style={{ 
                  transformStyle: 'preserve-3d',
                  transition: isFlipping ? 'transform 1.2s ease-in-out' : 'none',
                  transform: isFlipping ? 'rotateY(180deg)' : 'rotateY(0deg)',
                }}
              >
                <PlayingCard
                  card={card}
                  size="lg"
                  isHidden={!showFront}
                  showFront={showFront}
                  isFlipping={isFlipping}
                  borderColor="border-red-500"
                  className="absolute inset-0"
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: showFront ? 'rotateY(0deg)' : 'rotateY(-180deg)',
                    transition: 'transform 1.2s ease-in-out',
                  }}
                />
                {!showFront && (
                  <PlayingCard
                    isHidden
                    size="lg"
                    borderColor="border-red-500"
                    className="absolute inset-0"
                    style={{
                      backfaceVisibility: 'hidden',
                      transform: showFront ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
