import React, { useEffect, useState, useRef } from 'react';
import confetti from 'canvas-confetti';

interface HolmWinPotAnimationProps {
  triggerId: string | null;
  amount: number;
  winnerPosition: number;
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  onAnimationComplete?: () => void;
}

export const HolmWinPotAnimation: React.FC<HolmWinPotAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  currentPlayerPosition,
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

    // Fire confetti throughout the animation
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

    // Animation complete after 5 seconds
    setTimeout(() => {
      setAnimation(null);
      onAnimationComplete?.();
    }, 5000);
  }, [triggerId, amount, winnerPosition, currentPlayerPosition, getClockwiseDistance, containerRef, onAnimationComplete]);

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
      {/* Main big chip */}
      <div
        className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-4 border-white shadow-[0_0_30px_rgba(251,191,36,0.8)] flex items-center justify-center"
        style={{
          animation: 'holmWinPotToPlayer 5s ease-in-out forwards',
        }}
      >
        <span className="text-black text-lg font-black drop-shadow-sm">${lockedAmountRef.current}</span>
      </div>
      
      {/* Trailing sparkle chips */}
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="absolute w-8 h-8 rounded-full bg-gradient-to-br from-amber-200 to-amber-500 border-2 border-white/80 shadow-lg"
          style={{
            animation: `holmWinTrail${i + 1} 5s ease-in-out forwards`,
            opacity: 0,
          }}
        />
      ))}
      
      <style>{`
        @keyframes holmWinPotToPlayer {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          5% {
            transform: translate(0, -20px) scale(1.3);
            opacity: 1;
          }
          10% {
            transform: translate(0, -30px) scale(1.5);
            opacity: 1;
          }
          20% {
            transform: translate(0, -40px) scale(1.4);
            opacity: 1;
          }
          30% {
            transform: translate(${deltaX * 0.1}px, ${-40 + deltaY * 0.1}px) scale(1.3);
            opacity: 1;
          }
          70% {
            transform: translate(${deltaX * 0.7}px, ${deltaY * 0.5}px) scale(1.2);
            opacity: 1;
          }
          90% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1.1);
            opacity: 1;
          }
          95% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(1.3);
            opacity: 1;
          }
          100% {
            transform: translate(${deltaX}px, ${deltaY}px) scale(0);
            opacity: 0;
          }
        }
        
        @keyframes holmWinTrail1 {
          0%, 15% { opacity: 0; transform: translate(0, 0) scale(0.5); }
          20% { opacity: 0.8; transform: translate(${deltaX * 0.05}px, -30px) scale(0.7); }
          60% { opacity: 0.6; transform: translate(${deltaX * 0.5}px, ${deltaY * 0.3}px) scale(0.6); }
          90% { opacity: 0.4; transform: translate(${deltaX * 0.9}px, ${deltaY * 0.9}px) scale(0.5); }
          100% { opacity: 0; transform: translate(${deltaX}px, ${deltaY}px) scale(0); }
        }
        
        @keyframes holmWinTrail2 {
          0%, 20% { opacity: 0; transform: translate(0, 0) scale(0.5); }
          25% { opacity: 0.7; transform: translate(${deltaX * 0.1}px, -25px) scale(0.6); }
          65% { opacity: 0.5; transform: translate(${deltaX * 0.55}px, ${deltaY * 0.35}px) scale(0.5); }
          92% { opacity: 0.3; transform: translate(${deltaX * 0.92}px, ${deltaY * 0.92}px) scale(0.4); }
          100% { opacity: 0; transform: translate(${deltaX}px, ${deltaY}px) scale(0); }
        }
        
        @keyframes holmWinTrail3 {
          0%, 25% { opacity: 0; transform: translate(0, 0) scale(0.4); }
          30% { opacity: 0.6; transform: translate(${deltaX * 0.15}px, -20px) scale(0.5); }
          70% { opacity: 0.4; transform: translate(${deltaX * 0.6}px, ${deltaY * 0.4}px) scale(0.4); }
          94% { opacity: 0.2; transform: translate(${deltaX * 0.94}px, ${deltaY * 0.94}px) scale(0.3); }
          100% { opacity: 0; transform: translate(${deltaX}px, ${deltaY}px) scale(0); }
        }
      `}</style>
    </div>
  );
};

export default HolmWinPotAnimation;
