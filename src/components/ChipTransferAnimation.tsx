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

  // Get the CENTER of the chip stack at each slot position
  // ChipStack is w-10 h-10 (40x40px), so we need to find the center of that circle
  // Slot positions in MobileGameTable:
  //   Slot 0: bottom-2 left-10 → bottom: 8px, left: 40px (chip center = left+20, bottom-relative)
  //   Slot 1: left-0 top-1/2 → left: 0, top: 50% (chip center = left+20, top: 50%)
  //   Slot 2: top-2 left-10 → top: 8px, left: 40px (chip center = left+20, top+20)
  //   Slot 3: top-2 right-10 → top: 8px, right: 40px (chip center = right-20, top+20)
  //   Slot 4: right-0 top-1/2 → right: 0, top: 50% (chip center = right-20, top: 50%)
  //   Slot 5: bottom-2 right-10 → bottom: 8px, right: 40px (chip center = right-20, bottom-relative)
  const getSlotCenterCoords = (slotIndex: number, rect: DOMRect): { x: number; y: number } => {
    const chipRadius = 20; // w-10 = 40px, so radius = 20px
    const tailwindBottom2 = 8; // bottom-2 = 0.5rem = 8px
    const tailwindTop2 = 8;    // top-2 = 0.5rem = 8px
    const tailwindLeft10 = 40; // left-10 = 2.5rem = 40px
    const tailwindRight10 = 40; // right-10 = 2.5rem = 40px
    
    switch (slotIndex) {
      case -1: // Current player (bottom center)
        return { x: rect.width / 2, y: rect.height - tailwindBottom2 - chipRadius };
      case 0: // Bottom-left: bottom-2 left-10
        return { x: tailwindLeft10 + chipRadius, y: rect.height - tailwindBottom2 - chipRadius };
      case 1: // Middle-left: left-0 top-1/2
        return { x: chipRadius, y: rect.height / 2 };
      case 2: // Top-left: top-2 left-10
        return { x: tailwindLeft10 + chipRadius, y: tailwindTop2 + chipRadius };
      case 3: // Top-right: top-2 right-10
        return { x: rect.width - tailwindRight10 - chipRadius, y: tailwindTop2 + chipRadius };
      case 4: // Middle-right: right-0 top-1/2
        return { x: rect.width - chipRadius, y: rect.height / 2 };
      case 5: // Bottom-right: bottom-2 right-10
        return { x: rect.width - tailwindRight10 - chipRadius, y: rect.height - tailwindBottom2 - chipRadius };
      default:
        return { x: rect.width / 2, y: rect.height / 2 };
    }
  };

  const getPositionCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
    const isCurrentPlayer = currentPlayerPosition === position;
    const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistance(position) - 1;
    return getSlotCenterCoords(slotIndex, rect);
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
                transform: translate(0px, 0px) scale(1);
                opacity: 1;
              }
              15% {
                transform: translate(0px, -8px) scale(1.1);
                opacity: 1;
              }
              85% {
                transform: translate(${anim.toX - anim.fromX}px, ${anim.toY - anim.fromY}px) scale(1);
                opacity: 1;
              }
              100% {
                transform: translate(${anim.toX - anim.fromX}px, ${anim.toY - anim.fromY}px) scale(0);
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
