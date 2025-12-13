import React, { useEffect, useState, useRef } from 'react';

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

  // Slot positions as percentages of container (matching AnteUpAnimation)
  const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
    if (slotIndex === -1) return { top: 92, left: 50 }; // Current player (bottom center)
    const slots: Record<number, { top: number; left: number }> = {
      0: { top: 82, left: 18 },   // Bottom-left
      1: { top: 50, left: 8 },    // Middle-left
      2: { top: 12, left: 18 },   // Top-left
      3: { top: 12, left: 82 },   // Top-right
      4: { top: 50, left: 92 },   // Middle-right
      5: { top: 82, left: 82 },   // Bottom-right
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

    // Animation ends at ~1.8s, notify parent so winner's chips increment
    setTimeout(() => {
      onAnimationEnd?.();
    }, 1800);

    // Clear animation after it completes
    setTimeout(() => {
      setAnimation(null);
    }, 2200);
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
          animation: 'potToPlayer 2s ease-in-out forwards',
        }}
      >
        <span className="text-black text-[10px] font-bold">${lockedAmountRef.current}</span>
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
