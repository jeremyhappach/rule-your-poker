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
  const completedRef = useRef(false); // Guard against double completion

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

  // Get chipstack center position
  const getChipstackCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
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

  // Get leg indicator position (offset toward table center from chipstack)
  const getLegIndicatorCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
    const isObserver = currentPlayerPosition === null;
    const chipCoords = getChipstackCoords(position, rect);
    
    // Leg indicators are offset toward table center by ~30px
    // For observers: use absolute position to determine side
    // For seated players: use slot index
    let isRightSide: boolean;
    if (isObserver) {
      // Positions 5, 6, 7 are on the right side
      isRightSide = position >= 5;
    } else {
      const isCurrentPlayer = currentPlayerPosition === position;
      const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistance(position) - 1;
      isRightSide = slotIndex >= 3;
    }
    
    const offsetX = isRightSide ? -30 : 30;
    
    return {
      x: chipCoords.x + offsetX,
      y: chipCoords.y,
    };
  };

  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current || !containerRef.current) {
      return;
    }

    lastTriggerIdRef.current = triggerId;
    completedRef.current = false; // Reset for new animation

    // If no legs to animate, immediately complete
    if (legPositions.length === 0) {
      console.log('[LEGS TO PLAYER] No legs to sweep, skipping animation');
      if (!completedRef.current) {
        completedRef.current = true;
        onAnimationComplete?.();
      }
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const winnerCoords = getChipstackCoords(winnerPosition, rect);

    // Create animations for each leg from each player
    const newAnimations: LegChipAnimation[] = [];
    let animIndex = 0;

    legPositions.forEach((playerLeg) => {
      // Start from leg indicator position (offset from chipstack toward table center)
      const legCoords = getLegIndicatorCoords(playerLeg.position, rect);
      const legCount = Math.min(playerLeg.legCount, legsToWin);
      
      for (let i = 0; i < legCount; i++) {
        newAnimations.push({
          id: `${playerLeg.playerId}-leg-${i}`,
          fromX: legCoords.x,
          fromY: legCoords.y,
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
      if (!completedRef.current) {
        completedRef.current = true;
        onAnimationComplete?.();
      }
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
