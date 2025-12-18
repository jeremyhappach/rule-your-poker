import React, { useEffect, useState, useRef } from 'react';

interface ChipAnimation {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  loserId: string;
}

interface ChipTransferAnimationProps {
  triggerId: string | null;
  amount: number;
  winnerPosition: number;
  loserPositions: number[];
  loserPlayerIds: string[];
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  onAnimationStart?: (loserIds: string[]) => void;
  onAnimationEnd?: () => void;
}

export const ChipTransferAnimation: React.FC<ChipTransferAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  loserPositions,
  loserPlayerIds,
  currentPlayerPosition,
  getClockwiseDistance,
  containerRef,
  onAnimationStart,
  onAnimationEnd,
}) => {
  const [animations, setAnimations] = useState<ChipAnimation[]>([]);
  const lockedAmountRef = useRef<number>(amount);
  const lastTriggerIdRef = useRef<string | null>(null);
  const animIdRef = useRef(0);

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

  const getPositionCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
    const isCurrentPlayer = currentPlayerPosition === position;
    const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistance(position) - 1;
    const slot = getSlotPercent(slotIndex);
    return {
      x: (slot.left / 100) * rect.width,
      y: (slot.top / 100) * rect.height,
    };
  };

  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current || !containerRef.current) {
      return;
    }
    
    if (loserPositions.length === 0) {
      return;
    }

    lastTriggerIdRef.current = triggerId;
    lockedAmountRef.current = amount;

    const rect = containerRef.current.getBoundingClientRect();
    const winnerCoords = getPositionCoords(winnerPosition, rect);

    // Notify start - losers' chips should decrement now
    if (onAnimationStart) {
      onAnimationStart(loserPlayerIds);
    }

    const newAnims: ChipAnimation[] = loserPositions.map((loserPos, index) => {
      const loserCoords = getPositionCoords(loserPos, rect);
      return {
        id: `transfer-${animIdRef.current++}`,
        fromX: loserCoords.x,
        fromY: loserCoords.y,
        toX: winnerCoords.x,
        toY: winnerCoords.y,
        loserId: loserPlayerIds[index],
      };
    });

    setAnimations(newAnims);

    // Animation ends at 2s, notify parent so winner's chips increment
    setTimeout(() => {
      if (onAnimationEnd) {
        onAnimationEnd();
      }
    }, 1800);

    // Clear animations after they complete
    setTimeout(() => {
      setAnimations([]);
    }, 2200);
  }, [triggerId, amount, winnerPosition, loserPositions, loserPlayerIds, currentPlayerPosition, getClockwiseDistance, containerRef, onAnimationStart, onAnimationEnd]);

  if (animations.length === 0) return null;

  return (
    <>
      {animations.map((anim, i) => (
        <div
          key={anim.id}
          className="absolute z-[100] pointer-events-none"
          style={{
            left: anim.fromX,
            top: anim.fromY,
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div
            className="w-7 h-7 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center"
            style={{
              animation: `chipTransfer${i} 2s ease-in-out forwards`,
            }}
          >
            <span className="text-black text-[10px] font-bold">${lockedAmountRef.current}</span>
          </div>
          <style>{`
            @keyframes chipTransfer${i} {
              0% {
                transform: translate(-50%, -50%) scale(1);
                opacity: 1;
              }
              15% {
                transform: translate(-50%, calc(-50% - 8px)) scale(1.1);
                opacity: 1;
              }
              85% {
                transform: translate(calc(-50% + ${anim.toX - anim.fromX}px), calc(-50% + ${anim.toY - anim.fromY}px)) scale(1);
                opacity: 1;
              }
              100% {
                transform: translate(calc(-50% + ${anim.toX - anim.fromX}px), calc(-50% + ${anim.toY - anim.fromY}px)) scale(0);
                opacity: 0;
              }
            }
          `}</style>
        </div>
      ))}
    </>
  );
};

export default ChipTransferAnimation;
