import React, { useEffect, useState, useRef } from 'react';
import { SweepTheLegsAnimation } from './SweepTheLegsAnimation';

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
  legValue?: number; // Dollar value of each leg
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
  legValue = 0,
  onAnimationComplete,
}) => {
  const [animations, setAnimations] = useState<LegChipAnimation[]>([]);
  const [showSweepOverlay, setShowSweepOverlay] = useState(false);
  const lastTriggerIdRef = useRef<string | null>(null);
  const completedRef = useRef(false); // Guard against double completion
  const completionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // IMPORTANT: Store callback in ref to prevent effect re-runs when parent re-renders
  const onCompleteRef = useRef<(() => void) | undefined>(onAnimationComplete);
  useEffect(() => {
    onCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  // Store position-related props in refs to prevent effect re-runs
  const legPositionsRef = useRef(legPositions);
  const winnerPositionRef = useRef(winnerPosition);
  const currentPlayerPositionRef = useRef(currentPlayerPosition);
  const getClockwiseDistanceRef = useRef(getClockwiseDistance);
  const containerRefRef = useRef(containerRef);
  const legsToWinRef = useRef(legsToWin);

  useEffect(() => {
    legPositionsRef.current = legPositions;
    winnerPositionRef.current = winnerPosition;
    currentPlayerPositionRef.current = currentPlayerPosition;
    getClockwiseDistanceRef.current = getClockwiseDistance;
    containerRefRef.current = containerRef;
    legsToWinRef.current = legsToWin;
  });

  // Main animation effect - ONLY depends on triggerId to prevent multi-fire
  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current) {
      return;
    }

    const container = containerRefRef.current?.current;
    if (!container) {
      return;
    }

    // Clear any existing timeout from previous animation
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }

    lastTriggerIdRef.current = triggerId;
    completedRef.current = false; // Reset for new animation

    const positions = legPositionsRef.current;
    const winner = winnerPositionRef.current;
    const maxLegs = legsToWinRef.current;

    // If no legs to animate, immediately complete
    if (positions.length === 0) {
      console.log('[LEGS TO PLAYER] No legs to sweep, skipping animation');
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

    const rect = container.getBoundingClientRect();
    
    // Use refs for position calculations
    const currentPos = currentPlayerPositionRef.current;
    const getDistance = getClockwiseDistanceRef.current;

    // Inline position calculation using refs
    const getSlot = (slotIndex: number): { top: number; left: number } => {
      if (slotIndex === -1) return { top: 92, left: 50 };
      const slots: Record<number, { top: number; left: number }> = {
        0: { top: 92, left: 10 }, 1: { top: 50, left: 2 }, 2: { top: 2, left: 10 },
        3: { top: 2, left: 90 }, 4: { top: 50, left: 98 }, 5: { top: 92, left: 90 },
      };
      return slots[slotIndex] || { top: 50, left: 50 };
    };

    const getAbsPos = (position: number): { top: number; left: number } => {
      const positions: Record<number, { top: number; left: number }> = {
        1: { top: 2, left: 10 }, 2: { top: 50, left: 2 }, 3: { top: 92, left: 10 },
        4: { top: 92, left: 50 }, 5: { top: 92, left: 90 }, 6: { top: 50, left: 98 }, 7: { top: 2, left: 90 },
      };
      return positions[position] || { top: 50, left: 50 };
    };

    const getChipCoords = (position: number): { x: number; y: number } => {
      const isObserver = currentPos === null;
      let slot: { top: number; left: number };
      if (isObserver) {
        slot = getAbsPos(position);
      } else {
        const isCurrentPlayer = currentPos === position;
        const slotIndex = isCurrentPlayer ? -1 : getDistance(position) - 1;
        slot = getSlot(slotIndex);
      }
      return { x: (slot.left / 100) * rect.width, y: (slot.top / 100) * rect.height };
    };

    const getLegCoords = (position: number): { x: number; y: number } => {
      const chipCoords = getChipCoords(position);
      const isObserver = currentPos === null;
      let isRightSide: boolean;
      if (isObserver) {
        isRightSide = position >= 5;
      } else {
        const isCurrentPlayer = currentPos === position;
        const slotIndex = isCurrentPlayer ? -1 : getDistance(position) - 1;
        isRightSide = slotIndex >= 3;
      }
      const offsetX = isRightSide ? -30 : 30;
      return { x: chipCoords.x + offsetX, y: chipCoords.y };
    };

    const winnerCoords = getChipCoords(winner);

    // Create animations for each leg from each player (excluding winner - their legs stay in place)
    const newAnimations: LegChipAnimation[] = [];
    let animIndex = 0;

    positions.forEach((playerLeg) => {
      // Skip the winner - their legs don't need to animate to themselves
      if (playerLeg.position === winner) {
        return;
      }
      
      const legCoords = getLegCoords(playerLeg.position);
      const legCount = Math.min(playerLeg.legCount, maxLegs);
      
      for (let i = 0; i < legCount; i++) {
        newAnimations.push({
          id: `${playerLeg.playerId}-leg-${i}`,
          fromX: legCoords.x,
          fromY: legCoords.y,
          toX: winnerCoords.x,
          toY: winnerCoords.y,
          delay: animIndex * 100,
        });
        animIndex++;
      }
    });

    setAnimations(newAnimations);
    setShowSweepOverlay(true);
    console.log('[LEGS TO PLAYER] Animating', newAnimations.length, 'legs to winner');

    // Animation duration: 3.5s + stagger delays + buffer
    const totalDuration = 3500 + (newAnimations.length * 100);
    
    completionTimeoutRef.current = setTimeout(() => {
      setAnimations([]);
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
    }, totalDuration);
  }, [triggerId]); // ONLY triggerId - other values accessed via refs

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (completionTimeoutRef.current) {
        clearTimeout(completionTimeoutRef.current);
      }
    };
  }, []);

  // Format leg value for display
  const displayValue = legValue > 0 ? `$${legValue}` : 'L';

  if (animations.length === 0 && !showSweepOverlay) return null;

  return (
    <>
      {/* "Sweep the Legs" overlay - non-blocking, runs in parallel */}
      <SweepTheLegsAnimation 
        show={showSweepOverlay} 
        onComplete={() => setShowSweepOverlay(false)} 
      />
      
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
              className={`rounded-full bg-white border-2 border-amber-500 shadow-lg flex items-center justify-center ${
                legValue > 0 ? 'w-8 h-8' : 'w-6 h-6'
              }`}
              style={{
                animation: `${uniqueKeyframeName} 3.2s ease-in-out ${anim.delay}ms forwards`,
              }}
            >
              <span className={`text-slate-800 font-bold ${legValue > 0 ? 'text-[8px]' : 'text-[10px]'}`}>
                {displayValue}
              </span>
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
