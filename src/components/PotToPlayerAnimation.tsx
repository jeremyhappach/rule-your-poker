import React, { useEffect, useState, useRef } from 'react';
import { formatChipValue } from '@/lib/utils';

interface PotToPlayerAnimationProps {
  triggerId: string | null;
  amount: number;
  winnerPosition: number;
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  gameType?: string | null; // For position adjustment
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
}

export const PotToPlayerAnimation: React.FC<PotToPlayerAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  currentPlayerPosition,
  getClockwiseDistance,
  containerRef,
  gameType,
  onAnimationStart,
  onAnimationEnd,
}) => {
  const [animation, setAnimation] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const lockedAmountRef = useRef<number>(amount);
  const lastTriggerIdRef = useRef<string | null>(null);

  // Pot center position - different for Holm vs 3-5-7
  const getPotCenter = (rect: DOMRect): { x: number; y: number } => {
    // 3-5-7: pot is centered vertically (50%), Holm: pot is higher (38%)
    const yPercent = gameType === 'holm-game' ? 0.38 : 0.5;
    return {
      x: rect.width * 0.5,
      y: rect.height * yPercent,
    };
  };

  // Slot positions as percentages of container - MUST MATCH actual player chip positions in MobileGameTable
  // Tailwind classes: bottom-2 (0.5rem≈8px≈2%), left-10 (2.5rem≈40px≈10%), top-1/2 (50%), left-0/right-0 (edge)
  const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
    if (slotIndex === -1) return { top: 92, left: 50 }; // Current player (bottom center)
    const slots: Record<number, { top: number; left: number }> = {
      0: { top: 92, left: 10 },   // Bottom-left: bottom-2 left-10
      1: { top: 50, left: 2 },    // Middle-left: left-0 top-1/2
      2: { top: 2, left: 10 },    // Top-left: top-2 left-10
      3: { top: 2, left: 90 },    // Top-right: top-2 right-10
      4: { top: 50, left: 98 },   // Middle-right: right-0 top-1/2
      5: { top: 92, left: 90 },   // Bottom-right: bottom-2 right-10
    };
    return slots[slotIndex] || { top: 50, left: 50 };
  };

  // Absolute position mapping for observers (positions 1-7 around the table)
  // CRITICAL: Must match MobileGameTable.tsx observer rendering layout:
  // Position 1: Top-left, Position 2: Left, Position 3: Bottom-left
  // Position 4: Bottom-center, Position 5: Bottom-right, Position 6: Right, Position 7: Top-right
  const getAbsolutePositionPercent = (position: number): { top: number; left: number } => {
    const positions: Record<number, { top: number; left: number }> = {
      1: { top: 2, left: 10 },    // Top-left (matches top-4 left-10)
      2: { top: 50, left: 2 },    // Left (matches left-0 top-1/2)
      3: { top: 92, left: 10 },   // Bottom-left (matches bottom-2 left-10)
      4: { top: 92, left: 50 },   // Bottom-center (matches bottom-2 left-1/2)
      5: { top: 92, left: 90 },   // Bottom-right (matches bottom-2 right-10)
      6: { top: 50, left: 98 },   // Right (matches right-0 top-1/2)
      7: { top: 2, left: 90 },    // Top-right (matches right-10 top-4)
    };
    return positions[position] || { top: 50, left: 50 };
  };

  const getPositionCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
    const isObserver = currentPlayerPosition === null;
    
    let slot: { top: number; left: number };
    if (isObserver) {
      // Observer: use absolute positions
      slot = getAbsolutePositionPercent(position);
    } else {
      // Seated player: use relative slot positions
      const isCurrentPlayer = currentPlayerPosition === position;
      const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistance(position) - 1;
      slot = getSlotPercent(slotIndex);
    }
    
    return {
      x: (slot.left / 100) * rect.width,
      y: (slot.top / 100) * rect.height,
    };
  };

  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current || !containerRef.current) {
      return;
    }

    lastTriggerIdRef.current = triggerId;
    lockedAmountRef.current = amount;

    const rect = containerRef.current.getBoundingClientRect();
    const potCoords = getPotCenter(rect);
    const winnerCoords = getPositionCoords(winnerPosition, rect);

    // Notify start - pot should show 0 now
    onAnimationStart?.();

    setAnimation({
      fromX: potCoords.x,
      fromY: potCoords.y,
      toX: winnerCoords.x,
      toY: winnerCoords.y,
    });

    // Notify parent AFTER the visual animation fully finishes so the component isn't unmounted mid-flight.
    // (MobileGameTable switches phase immediately on onAnimationEnd.)
    setTimeout(() => {
      onAnimationEnd?.();
    }, 3300);

    // Clear animation after it completes
    setTimeout(() => {
      setAnimation(null);
    }, 3700);
  }, [triggerId, amount, winnerPosition, currentPlayerPosition, getClockwiseDistance, containerRef, onAnimationStart, onAnimationEnd]);

  if (!animation) return null;

  return (
    <div
      className="absolute z-[100] pointer-events-none"
      style={{
        left: animation.fromX,
        top: animation.fromY,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <div
        className="w-8 h-8 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center"
        style={{
          animation: 'potToPlayer 3.2s ease-in-out forwards',
        }}
      >
        <span className="text-black text-[10px] font-bold">${formatChipValue(lockedAmountRef.current)}</span>
      </div>
      <style>{`
        @keyframes potToPlayer {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          15% {
            transform: translate(0, -8px) scale(1.1);
            opacity: 1;
          }
          85% {
            transform: translate(${animation.toX - animation.fromX}px, ${animation.toY - animation.fromY}px) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(${animation.toX - animation.fromX}px, ${animation.toY - animation.fromY}px) scale(0);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default PotToPlayerAnimation;
