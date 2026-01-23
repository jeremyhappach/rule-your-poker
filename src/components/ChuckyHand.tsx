import { Card as CardType } from "@/lib/cardUtils";
import { PlayingCard } from "@/components/PlayingCard";
import { useState, useEffect, useRef } from "react";

interface ChuckyHandProps {
  cards: CardType[];
  show: boolean;
  revealed?: number;
  x?: number;
  y?: number;
  /** Optional extra scale applied to the hand container. */
  scale?: number;
  /** Negative overlap between cards (more negative = tighter overlap). */
  overlapPx?: number;
  /** Optional style overrides for the outer container. */
  containerStyle?: React.CSSProperties;
  /** Optional className for the outer container. */
  containerClassName?: string;
}

export const ChuckyHand = ({
  cards,
  show,
  revealed = cards.length,
  x,
  y,
  scale = 1,
  overlapPx = -22,
  containerStyle,
  containerClassName,
}: ChuckyHandProps) => {
  const [flippedCards, setFlippedCards] = useState<Set<number>>(new Set());
  const prevRevealedRef = useRef(revealed);
  const flipTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const cardsKeyRef = useRef(0);
  
  // Reset when cards change (new hand)
  useEffect(() => {
    flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    flipTimeoutsRef.current = [];
    setFlippedCards(new Set());
    prevRevealedRef.current = 0;
    cardsKeyRef.current += 1;
  }, [cards.length]);
  
  // Handle reveal progression
  useEffect(() => {
    if (revealed > prevRevealedRef.current) {
      const newlyRevealed: number[] = [];
      for (let i = prevRevealedRef.current; i < revealed; i++) {
        newlyRevealed.push(i);
      }
      
      newlyRevealed.forEach((cardIndex, i) => {
        const isLastCard = i === newlyRevealed.length - 1 && newlyRevealed.length > 1;
        const delay = isLastCard ? 1500 : i * 200;
        
        const timeout = setTimeout(() => {
          setFlippedCards(prev => new Set([...prev, cardIndex]));
        }, delay);
        
        flipTimeoutsRef.current.push(timeout);
      });
      
      prevRevealedRef.current = revealed;
    } else if (revealed < prevRevealedRef.current) {
      setFlippedCards(new Set());
      prevRevealedRef.current = revealed;
    }
  }, [revealed]);
  
  useEffect(() => {
    return () => {
      flipTimeoutsRef.current.forEach(t => clearTimeout(t));
    };
  }, []);

  if (!show || cards.length === 0) return null;

  const positionStyle =
    x !== undefined && y !== undefined
      ? {
          left: `${x}%`,
          top: `${y}%`,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }
      : {
          top: "2%",
          left: "50%",
          transform: `translateX(-50%) scale(${scale})`,
        };

  // Calculate container width: first card full width + (remaining cards * overlap amount)
  const cardWidth = 40; // approximate card width in px
  const overlapOffset = 18; // how much of each subsequent card shows
  const totalWidth = cardWidth + (cards.length - 1) * overlapOffset;

  return (
    <div
      className={"absolute z-30 animate-scale-in" + (containerClassName ? ` ${containerClassName}` : "")}
      style={{ ...positionStyle, ...containerStyle }}
    >
      <div className="bg-gradient-to-br from-red-900/90 to-red-950/90 rounded-lg p-1.5 sm:p-2 backdrop-blur-sm border border-red-500 shadow-xl">
        <div className="text-center mb-1">
          <span className="text-red-400 font-bold text-[10px] sm:text-xs flex items-center justify-center gap-1">
            <span className="text-sm">👿</span>
            Chucky {revealed < cards.length && `(${revealed}/${cards.length})`}
          </span>
        </div>
        {/* Cards with tight overlap using negative margin on each card */}
        <div style={{ display: 'flex', perspective: '1000px' }}>
          {cards.map((card, index) => {
            const isFlipped = flippedCards.has(index);
            
            return (
              <div
                key={`${cardsKeyRef.current}-${index}`}
                style={{ 
                  marginLeft: index === 0 ? 0 : overlapPx,
                  transformStyle: 'preserve-3d',
                  transition: 'transform 1s ease-in-out',
                  transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  zIndex: index,
                }}
              >
                {/* Card Back - visible when not flipped */}
                <div
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(0deg)',
                    position: isFlipped ? 'absolute' : 'relative',
                    top: 0,
                    left: 0,
                  }}
                >
                  <PlayingCard
                    isHidden
                    size="lg"
                    borderColor="border-red-500"
                  />
                </div>
                {/* Card Front - visible when flipped */}
                <div
                  style={{
                    backfaceVisibility: 'hidden',
                    transform: 'rotateY(180deg)',
                    position: isFlipped ? 'relative' : 'absolute',
                    top: 0,
                    left: 0,
                  }}
                >
                  <PlayingCard
                    card={card}
                    size="lg"
                    isHidden={false}
                    borderColor="border-red-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
