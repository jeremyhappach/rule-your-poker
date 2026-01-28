import React, { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import { formatChipValue } from '@/lib/utils';

interface HolmWinPotAnimationProps {
  triggerId: string | null;
  amount: number;
  winnerPosition: number;
  winnerPositions?: number[]; // For multi-player wins
  currentPlayerPosition: number | null;
  isCurrentPlayerWinner: boolean; // Only show confetti for the winner
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  onAnimationStart?: () => void;
  onAnimationComplete?: () => void;
}

export const HolmWinPotAnimation: React.FC<HolmWinPotAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  winnerPositions = [],
  currentPlayerPosition,
  isCurrentPlayerWinner,
  getClockwiseDistance,
  containerRef,
  onAnimationStart,
  onAnimationComplete,
}) => {
  const [animations, setAnimations] = useState<{ position: number; fromX: number; fromY: number; toX: number; toY: number; amount: number }[]>([]);
  const lockedAmountRef = useRef<number>(amount);
  const lastTriggerIdRef = useRef<string | null>(null);
  const chipCenterCacheRef = useRef<Record<number, { xPct: number; yPct: number }>>({});

  // Pot center position
  const getPotCenter = (rect: DOMRect): { x: number; y: number } => {
    return {
      x: rect.width * 0.5,
      y: rect.height * 0.38,
    };
  };

  // Get the CENTER of the chip stack at each slot position
  const getSlotCenterCoords = (slotIndex: number, rect: DOMRect): { x: number; y: number } => {
    const chipRadius = 20;
    const tailwindBottom2 = 8;
    const tailwindTop2 = 8;
    const tailwindLeft10 = 40;
    const tailwindRight10 = 40;
    
    switch (slotIndex) {
      case -1: // Current player (bottom center)
        return { x: rect.width / 2, y: rect.height - tailwindBottom2 - chipRadius };
      case 0: // Bottom-left
        return { x: tailwindLeft10 + chipRadius, y: rect.height - tailwindBottom2 - chipRadius };
      case 1: // Middle-left
        return { x: chipRadius, y: rect.height / 2 };
      case 2: // Top-left
        return { x: tailwindLeft10 + chipRadius, y: tailwindTop2 + chipRadius };
      case 3: // Top-right
        return { x: rect.width - tailwindRight10 - chipRadius, y: tailwindTop2 + chipRadius };
      case 4: // Middle-right
        return { x: rect.width - chipRadius, y: rect.height / 2 };
      case 5: // Bottom-right
        return { x: rect.width - tailwindRight10 - chipRadius, y: rect.height - tailwindBottom2 - chipRadius };
      default:
        return { x: rect.width / 2, y: rect.height / 2 };
    }
  };

  // Absolute position coords for observers
  const getAbsolutePositionCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
    const chipRadius = 20;
    const tailwindBottom2 = 8;
    const tailwindTop2 = 8;
    const tailwindLeft10 = 40;
    const tailwindRight10 = 40;
    
    switch (position) {
      case 1:
        return { x: tailwindLeft10 + chipRadius, y: tailwindTop2 + chipRadius };
      case 2:
        return { x: chipRadius, y: rect.height / 2 };
      case 3:
        return { x: tailwindLeft10 + chipRadius, y: rect.height - tailwindBottom2 - chipRadius };
      case 4:
        return { x: rect.width / 2, y: rect.height - tailwindBottom2 - chipRadius };
      case 5:
        return { x: rect.width - tailwindRight10 - chipRadius, y: rect.height - tailwindBottom2 - chipRadius };
      case 6:
        return { x: rect.width - chipRadius, y: rect.height / 2 };
      case 7:
        return { x: rect.width - tailwindRight10 - chipRadius, y: tailwindTop2 + chipRadius };
      default:
        return { x: rect.width / 2, y: rect.height / 2 };
    }
  };

  const getCachedChipCenter = (position: number, rect: DOMRect): { x: number; y: number } | null => {
    const cached = chipCenterCacheRef.current[position];
    if (!cached) return null;
    return {
      x: cached.xPct * rect.width,
      y: cached.yPct * rect.height,
    };
  };

  const getChipCenterFromDom = (position: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;

    let el = container.querySelector(`[data-chip-center="${position}"]`) as HTMLElement | null;
    if (!el) {
      el = container.querySelector(`[data-seat-chip-position="${position}"]`) as HTMLElement | null;
    }
    if (!el) return null;

    const containerRect = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();

    const coords = {
      x: r.left - containerRect.left + r.width / 2,
      y: r.top - containerRect.top + r.height / 2,
    };

    if (containerRect.width > 0 && containerRect.height > 0) {
      chipCenterCacheRef.current[position] = {
        xPct: coords.x / containerRect.width,
        yPct: coords.y / containerRect.height,
      };
    }

    return coords;
  };

  const getPositionCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
    const dom = getChipCenterFromDom(position);
    if (dom) return dom;

    const cached = getCachedChipCenter(position, rect);
    if (cached) return cached;

    const isObserver = currentPlayerPosition === null;

    if (isObserver) {
      return getAbsolutePositionCoords(position, rect);
    }

    const isCurrentPlayer = currentPlayerPosition === position;
    const clockwiseDist = getClockwiseDistance(position);
    const slotIndex = isCurrentPlayer ? -1 : clockwiseDist - 1;

    return getSlotCenterCoords(slotIndex, rect);
  };

  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current || !containerRef.current) {
      return;
    }

    lastTriggerIdRef.current = triggerId;
    lockedAmountRef.current = amount;

    const rect = containerRef.current.getBoundingClientRect();
    const potCoords = getPotCenter(rect);
    
    // Use winnerPositions if provided, otherwise fall back to single winnerPosition
    const positions = winnerPositions.length > 0 ? winnerPositions : [winnerPosition];
    const isMultiWin = positions.length > 1;
    const splitAmount = isMultiWin ? Math.floor(amount / positions.length) : amount;
    
    // Create animations for each winner
    const newAnimations = positions.map((pos) => {
      const winnerCoords = getPositionCoords(pos, rect);
      return {
        position: pos,
        fromX: potCoords.x,
        fromY: potCoords.y,
        toX: winnerCoords.x,
        toY: winnerCoords.y,
        amount: splitAmount,
      };
    });

    // Call onAnimationStart when POT-OUT animation begins
    onAnimationStart?.();

    setAnimations(newAnimations);

    // Fire confetti only for the winner's client
    if (isCurrentPlayerWinner) {
      const duration = 4000;
      const end = Date.now() + duration;
      
      const frame = () => {
        confetti({
          particleCount: 2,
          angle: 60,
          spread: 55,
          origin: { x: 0, y: 0.7 },
          colors: ['#FFD700', '#FFA500', '#FFEC8B', '#DAA520']
        });
        confetti({
          particleCount: 2,
          angle: 120,
          spread: 55,
          origin: { x: 1, y: 0.7 },
          colors: ['#FFD700', '#FFA500', '#FFEC8B', '#DAA520']
        });
        
        if (Date.now() < end) {
          requestAnimationFrame(frame);
        }
      };
      frame();
    }

    // Animation complete after 5.5 seconds
    setTimeout(() => {
      setAnimations([]);
      onAnimationComplete?.();
    }, 5500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerId]);

  if (animations.length === 0) return null;

  return (
    <>
      {animations.map((anim) => {
        const deltaX = anim.toX - anim.fromX;
        const deltaY = anim.toY - anim.fromY;
        const animKey = `${triggerId}-${anim.position}`;

        return (
          <div
            key={animKey}
            className="absolute z-[100] pointer-events-none"
            style={{
              left: anim.fromX,
              top: anim.fromY,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div
              className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-2 border-white shadow-lg flex items-center justify-center"
              style={{
                animation: `holmWinPot-${animKey.replace(/[^a-zA-Z0-9]/g, '_')} 5.5s ease-out forwards`,
              }}
            >
              <span className="text-black text-xs font-black drop-shadow-sm">${formatChipValue(anim.amount)}</span>
            </div>
            
            <style dangerouslySetInnerHTML={{ __html: `
              @keyframes holmWinPot-${animKey.replace(/[^a-zA-Z0-9]/g, '_')} {
                0% {
                  transform: translate(0, 0) scale(1);
                  opacity: 1;
                }
                32% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(1);
                  opacity: 1;
                }
                38% {
                  transform: translate(${deltaX}px, ${deltaY - 25}px) scale(2.2);
                  opacity: 1;
                }
                48% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(1.8);
                  opacity: 1;
                }
                58% {
                  transform: translate(${deltaX}px, ${deltaY - 15}px) scale(2.0);
                  opacity: 1;
                }
                70% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(1.6);
                  opacity: 1;
                }
                80% {
                  transform: translate(${deltaX}px, ${deltaY - 8}px) scale(1.8);
                  opacity: 1;
                }
                90% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(1.5);
                  opacity: 1;
                }
                100% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(0);
                  opacity: 0;
                }
              }
            `}} />
          </div>
        );
      })}
    </>
  );
};

export default HolmWinPotAnimation;
