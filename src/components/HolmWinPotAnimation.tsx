import React, { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';
import { formatChipValue } from '@/lib/utils';

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
    const clockwiseDist = getClockwiseDistance(position);
    const slotIndex = isCurrentPlayer ? -1 : clockwiseDist - 1;
    
    console.log('[HOLM WIN ANIM] getPositionCoords:', {
      winnerPosition: position,
      currentPlayerPosition,
      isCurrentPlayer,
      clockwiseDist,
      slotIndex,
    });
    
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

    // Animation complete after 5.5 seconds (1.75s travel + 3.75s dramatic bounce)
    setTimeout(() => {
      setAnimation(null);
      onAnimationComplete?.();
    }, 5500);
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
          animation: `holmWinPot-${triggerId} 5.5s ease-out forwards`,
        }}
      >
        <span className="text-black text-xs font-black drop-shadow-sm">${formatChipValue(lockedAmountRef.current)}</span>
      </div>
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes holmWinPot-${triggerId} {
          /* Travel phase: 0-32% (~1.75s) */
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          32% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1);
            opacity: 1;
          }
          /* Dramatic bounce phase: 32-100% (~3.75s) */
          /* Big initial pop */
          38% {
            transform: translate(${deltaX}px, ${deltaY - 25}px) scale(2.2);
            opacity: 1;
          }
          /* Drop down */
          48% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1.8);
            opacity: 1;
          }
          /* Second bounce */
          58% {
            transform: translate(${deltaX}px, ${deltaY - 15}px) scale(2.0);
            opacity: 1;
          }
          /* Settle */
          70% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1.6);
            opacity: 1;
          }
          /* Small bounce */
          80% {
            transform: translate(${deltaX}px, ${deltaY - 8}px) scale(1.8);
            opacity: 1;
          }
          /* Final settle */
          90% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1.5);
            opacity: 1;
          }
          /* Fade out */
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
