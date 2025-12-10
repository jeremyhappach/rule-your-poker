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
}

export const AnteUpAnimation: React.FC<AnteUpAnimationProps> = ({
  pot,
  anteAmount,
  activePlayers,
  currentPlayerPosition,
  getClockwiseDistance,
  isWaitingPhase = false,
  containerRef,
}) => {
  const [animations, setAnimations] = useState<ChipAnimation[]>([]);
  const prevPotRef = useRef<number>(pot);
  const animIdRef = useRef(0);

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

  useEffect(() => {
    if (isWaitingPhase || !containerRef.current) {
      prevPotRef.current = pot;
      return;
    }

    const potIncrease = pot - prevPotRef.current;
    const expectedIncrease = anteAmount * activePlayers.length;

    if (potIncrease > 0 && potIncrease >= expectedIncrease * 0.8 && activePlayers.length > 0) {
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.width / 2;
      const centerY = rect.height * 0.45;

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
      setTimeout(() => setAnimations([]), 600);
    }

    prevPotRef.current = pot;
  }, [pot, anteAmount, activePlayers, currentPlayerPosition, getClockwiseDistance, isWaitingPhase, containerRef]);

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
            className="w-5 h-5 rounded-full bg-gradient-to-b from-green-400 to-green-600 border-2 border-green-300 shadow-lg"
            style={{
              animation: `anteChipMove${i} 0.5s ease-in forwards`,
            }}
          />
          <style>{`
            @keyframes anteChipMove${i} {
              0% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
              }
              80% {
                transform: translate(${anim.toX - anim.fromX}px, ${anim.toY - anim.fromY}px) scale(0.8);
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
