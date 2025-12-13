import React, { useEffect, useState, useRef } from 'react';

interface LegChipAnimation {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  delay: number;
}

interface LegsToPlayerAnimationProps {
  triggerId: string | null;
  legPositions: { playerId: string; position: number; legCount: number }[]; // All players with legs
  winnerPosition: number;
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  legsToWin: number;
  onAnimationComplete?: () => void;
}

export const LegsToPlayerAnimation: React.FC<LegsToPlayerAnimationProps> = ({
  triggerId,
  legPositions,
  winnerPosition,
  currentPlayerPosition,
  getClockwiseDistance,
  containerRef,
  legsToWin,
  onAnimationComplete,
}) => {
  const [animations, setAnimations] = useState<LegChipAnimation[]>([]);
  const lastTriggerIdRef = useRef<string | null>(null);

  // Get position coordinates as percentage of container
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

    // If no legs to animate, immediately complete
    if (legPositions.length === 0) {
      console.log('[LEGS TO PLAYER] No legs to sweep, skipping animation');
      onAnimationComplete?.();
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const winnerCoords = getPositionCoords(winnerPosition, rect);

    // Create animations for each leg from each player
    const newAnimations: LegChipAnimation[] = [];
    let animIndex = 0;

    legPositions.forEach((playerLeg) => {
      const playerCoords = getPositionCoords(playerLeg.position, rect);
      const legCount = Math.min(playerLeg.legCount, legsToWin);
      
      for (let i = 0; i < legCount; i++) {
        newAnimations.push({
          id: `${playerLeg.playerId}-leg-${i}`,
          fromX: playerCoords.x,
          fromY: playerCoords.y,
          toX: winnerCoords.x,
          toY: winnerCoords.y,
          delay: animIndex * 100, // Stagger each leg by 100ms
        });
        animIndex++;
      }
    });

    setAnimations(newAnimations);
    console.log('[LEGS TO PLAYER] Animating', newAnimations.length, 'legs to winner');

    // Animation duration: 1.2s per chip + stagger delays + buffer
    const totalDuration = 1500 + (newAnimations.length * 100);
    
    setTimeout(() => {
      setAnimations([]);
      onAnimationComplete?.();
    }, totalDuration);
  }, [triggerId, legPositions, winnerPosition, currentPlayerPosition, getClockwiseDistance, containerRef, legsToWin, onAnimationComplete]);

  if (animations.length === 0) return null;

  return (
    <>
      {animations.map((anim) => {
        const deltaX = anim.toX - anim.fromX;
        const deltaY = anim.toY - anim.fromY;
        const uniqueKeyframeName = `legToPlayer-${anim.id.replace(/[^a-zA-Z0-9]/g, '')}`;
        
        return (
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
              className="w-6 h-6 rounded-full bg-white border-2 border-amber-500 shadow-lg flex items-center justify-center"
              style={{
                animation: `${uniqueKeyframeName} 1.2s ease-in-out ${anim.delay}ms forwards`,
              }}
            >
              <span className="text-slate-800 font-bold text-[10px]">L</span>
            </div>
            <style>{`
              @keyframes ${uniqueKeyframeName} {
                0% {
                  transform: translate(0, 0) scale(1);
                  opacity: 1;
                }
                15% {
                  transform: translate(0, -5px) scale(1.1);
                  opacity: 1;
                }
                85% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(1);
                  opacity: 1;
                }
                100% {
                  transform: translate(${deltaX}px, ${deltaY}px) scale(0);
                  opacity: 0;
                }
              }
            `}</style>
          </div>
        );
      })}
    </>
  );
};

export default LegsToPlayerAnimation;
