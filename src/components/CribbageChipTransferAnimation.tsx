import React, { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { formatChipValue } from '@/lib/utils';

interface ChipAnimation {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  loserId: string;
  delay: number;
}

interface CribbageChipTransferAnimationProps {
  triggerId: string | null;
  amount: number; // Per loser
  winnerPosition: { x: number; y: number }; // Already computed coordinates
  loserPositions: { playerId: string; x: number; y: number }[];
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
}

/**
 * Player-to-player chip transfer animation for Cribbage with bounce effect.
 * Chips fly from each loser to the winner with a satisfying bounce on landing.
 */
export const CribbageChipTransferAnimation: React.FC<CribbageChipTransferAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  loserPositions,
  onAnimationStart,
  onAnimationEnd,
}) => {
  const [animations, setAnimations] = useState<ChipAnimation[]>([]);
  const lockedAmountRef = useRef<number>(amount);
  const lastTriggerIdRef = useRef<string | null>(null);
  const animIdRef = useRef(0);

  // Stable refs for callbacks
  const onStartRef = useRef(onAnimationStart);
  const onEndRef = useRef(onAnimationEnd);

  useEffect(() => {
    onStartRef.current = onAnimationStart;
  }, [onAnimationStart]);

  useEffect(() => {
    onEndRef.current = onAnimationEnd;
  }, [onAnimationEnd]);

  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current) {
      return;
    }

    if (loserPositions.length === 0) {
      return;
    }

    lastTriggerIdRef.current = triggerId;
    lockedAmountRef.current = amount;

    // Notify start
    onStartRef.current?.();

    // Create staggered animations
    const newAnims: ChipAnimation[] = loserPositions.map((loser, index) => ({
      id: `crib-transfer-${animIdRef.current++}`,
      fromX: loser.x,
      fromY: loser.y,
      toX: winnerPosition.x,
      toY: winnerPosition.y,
      loserId: loser.playerId,
      delay: index * 200, // Stagger by 200ms
    }));

    setAnimations(newAnims);

    // Total animation time: stagger + flight + bounce
    const totalDuration = (loserPositions.length - 1) * 200 + 2000;

    // Notify end after all animations complete
    setTimeout(() => {
      onEndRef.current?.();
    }, totalDuration - 200);

    // Clear animations after they complete
    setTimeout(() => {
      setAnimations([]);
    }, totalDuration + 400);
  }, [triggerId, amount, winnerPosition, loserPositions]);

  if (animations.length === 0 || typeof document === 'undefined') return null;

  const chips = animations.map((anim) => {
    const dx = anim.toX - anim.fromX;
    const dy = anim.toY - anim.fromY;
    const keyframeName = `cribChipFly_${anim.id.replace(/[^a-zA-Z0-9]/g, '_')}`;

    return (
      <div
        key={anim.id}
        className="fixed pointer-events-none"
        style={{
          left: anim.fromX,
          top: anim.fromY,
          transform: 'translate(-50%, -50%)',
          zIndex: 250,
          animationDelay: `${anim.delay}ms`,
          animationFillMode: 'both',
        }}
      >
        <div
          className="w-8 h-8 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center"
          style={{
            animation: `${keyframeName} 2s ease-out ${anim.delay}ms forwards`,
          }}
        >
          <span className="text-black text-[10px] font-bold">${formatChipValue(lockedAmountRef.current)}</span>
        </div>
        <style>{`
          @keyframes ${keyframeName} {
            0% {
              transform: translate(0, 0) scale(1);
              opacity: 1;
            }
            10% {
              transform: translate(0, -15px) scale(1.15);
              opacity: 1;
            }
            60% {
              transform: translate(${dx}px, ${dy}px) scale(1);
              opacity: 1;
            }
            70% {
              transform: translate(${dx}px, ${dy - 20}px) scale(1.1);
              opacity: 1;
            }
            80% {
              transform: translate(${dx}px, ${dy}px) scale(1);
              opacity: 1;
            }
            88% {
              transform: translate(${dx}px, ${dy - 8}px) scale(1.05);
              opacity: 1;
            }
            95% {
              transform: translate(${dx}px, ${dy}px) scale(1);
              opacity: 1;
            }
            100% {
              transform: translate(${dx}px, ${dy}px) scale(0);
              opacity: 0;
            }
          }
        `}</style>
      </div>
    );
  });

  return createPortal(<>{chips}</>, document.body);
};

export default CribbageChipTransferAnimation;
