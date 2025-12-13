import React, { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';

interface HolmWinPotAnimationProps {
  triggerId: string | null;
  amount: number;
  winnerPosition: number;
  currentPlayerPosition: number | null;
  isCurrentPlayerWinner: boolean; // Only show confetti for the winner
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  onAnimationComplete?: () => void;
}

export const HolmWinPotAnimation: React.FC<HolmWinPotAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  currentPlayerPosition,
  isCurrentPlayerWinner,
  getClockwiseDistance,
  containerRef,
  onAnimationComplete,
}) => {
  const [animation, setAnimation] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const lockedAmountRef = useRef<number>(amount);
  const lastTriggerIdRef = useRef<string | null>(null);

  // Pot center position
  const getPotCenter = (rect: DOMRect): { x: number; y: number } => {
    return {
      x: rect.width * 0.5,
      y: rect.height * 0.38,
    };
  };

  // Slot positions as percentages of container
  const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
    if (slotIndex === -1) return { top: 92, left: 50 }; // Current player (bottom center)
    const slots: Record<number, { top: number; left: number }> = {
      0: { top: 82, left: 18 },
      1: { top: 50, left: 8 },
      2: { top: 12, left: 18 },
      3: { top: 12, left: 82 },
      4: { top: 50, left: 92 },
      5: { top: 82, left: 82 },
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

    setAnimation({
      fromX: potCoords.x,
      fromY: potCoords.y,
      toX: winnerCoords.x,
      toY: winnerCoords.y,
    });

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

    // Animation complete after 2.5 seconds (matching ante animation speed)
    setTimeout(() => {
      setAnimation(null);
      onAnimationComplete?.();
    }, 2500);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerId]); // Only re-run when triggerId changes - other values are captured at trigger time

  if (!animation) return null;

  const deltaX = animation.toX - animation.fromX;
  const deltaY = animation.toY - animation.fromY;

  return (
    <div
      className="absolute z-[100] pointer-events-none"
      style={{
        left: animation.fromX,
        top: animation.fromY,
        transform: 'translate(-50%, -50%)',
      }}
    >
      {/* Main chip - regular size like ante animation, enlarges only at destination */}
      <div
        className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-2 border-white shadow-lg flex items-center justify-center"
        style={{
          animation: `holmWinPot-${triggerId} 2.5s ease-out forwards`,
        }}
      >
        <span className="text-black text-xs font-black drop-shadow-sm">${lockedAmountRef.current}</span>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes holmWinPot-${triggerId} {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          70% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1);
            opacity: 1;
          }
          78% {
            transform: translate(${deltaX}px, ${deltaY - 8}px) scale(1.6);
            opacity: 1;
          }
          86% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1.4);
            opacity: 1;
          }
          92% {
            transform: translate(${deltaX}px, ${deltaY - 4}px) scale(1.5);
            opacity: 1;
          }
          96% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1.3);
            opacity: 0.8;
          }
          100% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(0);
            opacity: 0;
          }
        }
      `}} />
    </div>
  );
};

export default HolmWinPotAnimation;
