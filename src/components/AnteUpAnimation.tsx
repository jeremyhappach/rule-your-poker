import React, { useEffect, useState, useRef } from 'react';

interface ChipAnimation {
  id: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

interface AnteUpAnimationProps {
  pot: number;
  anteAmount: number;
  activePlayers: { position: number }[];
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  isWaitingPhase?: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  gameType?: string | null;
  currentRound?: number;
  onChipsArrived?: () => void;
}

export const AnteUpAnimation: React.FC<AnteUpAnimationProps> = ({
  pot,
  anteAmount,
  activePlayers,
  currentPlayerPosition,
  getClockwiseDistance,
  isWaitingPhase = false,
  containerRef,
  gameType,
  currentRound,
  onChipsArrived,
}) => {
  const [animations, setAnimations] = useState<ChipAnimation[]>([]);
  const prevRoundRef = useRef<number | null>(null);
  const animIdRef = useRef(0);
  const hasTriggeredForRoundRef = useRef<number | null>(null);

  // Slot positions as percentages of container
  const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
    if (slotIndex === -1) return { top: 92, left: 50 }; // Current player
    const slots: Record<number, { top: number; left: number }> = {
      0: { top: 85, left: 12 },
      1: { top: 50, left: 3 },
      2: { top: 8, left: 12 },
      3: { top: 8, left: 88 },
      4: { top: 50, left: 97 },
      5: { top: 85, left: 88 },
    };
    return slots[slotIndex] || { top: 50, left: 50 };
  };

  // Reset when game goes back to waiting phase
  useEffect(() => {
    if (isWaitingPhase) {
      prevRoundRef.current = null;
      hasTriggeredForRoundRef.current = null;
    }
  }, [isWaitingPhase]);

  useEffect(() => {
    if (isWaitingPhase || !containerRef.current || !currentRound) {
      return;
    }

    // Only trigger once per round - use round number as the trigger
    const isNewRound = currentRound !== prevRoundRef.current && currentRound > 0;
    const alreadyTriggeredThisRound = hasTriggeredForRoundRef.current === currentRound;

    if (isNewRound && !alreadyTriggeredThisRound && activePlayers.length > 0) {
      hasTriggeredForRoundRef.current = currentRound;
      prevRoundRef.current = currentRound;
      
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      // Target pot position differs by game type
      // Holm: pot at top-[35%], 3-5-7: pot at top-1/2 (50%)
      const centerY = gameType === 'holm-game' ? rect.height * 0.32 : rect.height * 0.47;

      const newAnims: ChipAnimation[] = activePlayers.map(player => {
        const isCurrentPlayer = currentPlayerPosition === player.position;
        const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistance(player.position) - 1;
        const slot = getSlotPercent(slotIndex);
        
        return {
          id: `chip-${animIdRef.current++}`,
          fromX: (slot.left / 100) * rect.width,
          fromY: (slot.top / 100) * rect.height,
          toX: centerX,
          toY: centerY,
        };
      });

      setAnimations(newAnims);
      
      // Trigger callback when chips arrive at pot (at 80% of 2s = 1.6s)
      if (onChipsArrived) {
        setTimeout(() => {
          onChipsArrived();
        }, 1600);
      }
      
      setTimeout(() => {
        setAnimations([]);
      }, 2200);
    }
  }, [currentRound, activePlayers, currentPlayerPosition, getClockwiseDistance, isWaitingPhase, containerRef, gameType, onChipsArrived]);

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
            className="w-7 h-7 rounded-full bg-sky-400 border-2 border-white shadow-lg flex items-center justify-center"
            style={{
              animation: `anteChipMove${i} 2s ease-in-out forwards`,
            }}
          >
            <span className="text-black text-[10px] font-bold">${anteAmount}</span>
          </div>
          <style>{`
            @keyframes anteChipMove${i} {
              0% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
              }
              80% {
                transform: translate(${anim.toX - anim.fromX}px, ${anim.toY - anim.fromY}px) scale(0.9);
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

export default AnteUpAnimation;
