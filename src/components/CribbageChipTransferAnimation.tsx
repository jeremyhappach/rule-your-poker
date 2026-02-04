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
  // Guard against starting a new animation while one is already in progress
  const animationInProgressRef = useRef(false);

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
    // Double-fire prevention: both triggerId guard AND in-progress guard
    if (!triggerId || triggerId === lastTriggerIdRef.current) {
      return;
    }
    
    // Prevent starting a new animation if one is already running
    if (animationInProgressRef.current) {
      console.log('[CRIBBAGE_CHIP_ANIM] Animation already in progress, ignoring trigger:', triggerId);
      return;
    }

    if (loserPositions.length === 0) {
      return;
    }

    lastTriggerIdRef.current = triggerId;
    lockedAmountRef.current = amount;
    animationInProgressRef.current = true;

    // Notify start
    onStartRef.current?.();

    // Create staggered animations (slower stagger for drama)
    const newAnims: ChipAnimation[] = loserPositions.map((loser, index) => ({
      id: `crib-transfer-${animIdRef.current++}`,
      fromX: loser.x,
      fromY: loser.y,
      toX: winnerPosition.x,
      toY: winnerPosition.y,
      loserId: loser.playerId,
      delay: index * 300, // Stagger by 300ms for more dramatic effect
    }));

    setAnimations(newAnims);

    // Total animation time: stagger + flight + bounce (slower, more dramatic = 4s base)
    const totalDuration = (loserPositions.length - 1) * 300 + 4000;

    // Notify end after all animations complete
    setTimeout(() => {
      animationInProgressRef.current = false;
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
          className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 border-3 border-white shadow-xl flex items-center justify-center"
          style={{
            animation: `${keyframeName} 3.5s ease-in-out ${anim.delay}ms forwards`,
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.6), 0 4px 15px rgba(0,0,0,0.4)',
          }}
        >
          <span className="text-amber-950 text-[11px] font-black">${formatChipValue(lockedAmountRef.current)}</span>
        </div>
        <style>{`
          @keyframes ${keyframeName} {
            0% {
              transform: translate(0, 0) scale(1) rotate(0deg);
              opacity: 1;
              filter: brightness(1);
            }
            5% {
              transform: translate(0, -25px) scale(1.3) rotate(-5deg);
              opacity: 1;
              filter: brightness(1.2);
            }
            15% {
              transform: translate(${dx * 0.15}px, ${dy * 0.1 - 40}px) scale(1.2) rotate(5deg);
              opacity: 1;
              filter: brightness(1.3);
            }
            50% {
              transform: translate(${dx * 0.7}px, ${dy * 0.5 - 30}px) scale(1.1) rotate(-3deg);
              opacity: 1;
              filter: brightness(1.1);
            }
            70% {
              transform: translate(${dx}px, ${dy}px) scale(1.05) rotate(2deg);
              opacity: 1;
              filter: brightness(1);
            }
            78% {
              transform: translate(${dx}px, ${dy - 25}px) scale(1.15) rotate(-2deg);
              opacity: 1;
              filter: brightness(1.2);
            }
            86% {
              transform: translate(${dx}px, ${dy}px) scale(1) rotate(0deg);
              opacity: 1;
            }
            91% {
              transform: translate(${dx}px, ${dy - 10}px) scale(1.05);
              opacity: 1;
            }
            96% {
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
