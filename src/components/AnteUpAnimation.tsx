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
  gameStatus?: string; // Game status to detect ante collection moment
  onAnimationStart?: () => void;
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
  gameStatus,
  onAnimationStart,
  onChipsArrived,
}) => {
  const [animations, setAnimations] = useState<ChipAnimation[]>([]);
  const animIdRef = useRef(0);
  // Track what we've animated for to prevent re-triggers
  const lastAnimatedPotRef = useRef<number | null>(null);
  const lastAnimatedRoundRef = useRef<number | null>(null);
  const hasAnimatedThisSessionRef = useRef(false);
  const lastStatusRef = useRef<string | null>(null);

  // Slot positions as percentages of container (where chips START from)
  const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
    if (slotIndex === -1) return { top: 92, left: 50 }; // Current player (bottom center)
    const slots: Record<number, { top: number; left: number }> = {
      0: { top: 85, left: 12 },   // Bottom-left
      1: { top: 50, left: 3 },    // Middle-left
      2: { top: 8, left: 12 },    // Top-left
      3: { top: 8, left: 88 },    // Top-right
      4: { top: 50, left: 97 },   // Middle-right
      5: { top: 85, left: 88 },   // Bottom-right
    };
    return slots[slotIndex] || { top: 50, left: 50 };
  };

  // Get target position on pot box edge based on slot (closest edge to player)
  const getPotBoxTarget = (slotIndex: number, rect: DOMRect, isHolm: boolean): { x: number; y: number } => {
    const centerX = rect.width / 2;
    // Pot box center Y position
    const potCenterY = isHolm ? rect.height * 0.35 : rect.height * 0.50;
    // Pot box approximate dimensions (half-widths/heights from center to edge)
    const potHalfWidth = isHolm ? 45 : 65;
    const potHalfHeight = isHolm ? 18 : 28;
    
    // Target the closest edge based on slot position
    switch (slotIndex) {
      case -1: // Current player (bottom) - target bottom edge
      case 0:  // Bottom-left - target bottom-left edge
      case 5:  // Bottom-right - target bottom-right edge
        return { x: centerX, y: potCenterY + potHalfHeight };
      case 2:  // Top-left - target top edge
      case 3:  // Top-right - target top edge
        return { x: centerX, y: potCenterY - potHalfHeight };
      case 1:  // Middle-left - target left edge
        return { x: centerX - potHalfWidth, y: potCenterY };
      case 4:  // Middle-right - target right edge
        return { x: centerX + potHalfWidth, y: potCenterY };
      default:
        return { x: centerX, y: potCenterY };
    }
  };

  // Reset when game goes back to waiting phase (new game session)
  useEffect(() => {
    if (isWaitingPhase) {
      lastAnimatedPotRef.current = null;
      lastAnimatedRoundRef.current = null;
      hasAnimatedThisSessionRef.current = false;
      lastStatusRef.current = null;
    }
  }, [isWaitingPhase]);

  useEffect(() => {
    if (isWaitingPhase || !containerRef.current || !currentRound || activePlayers.length === 0) {
      return;
    }

    const isHolm = gameType === 'holm-game';
    const wasAnteDecision = lastStatusRef.current === 'ante_decision';
    const isNowInProgress = gameStatus === 'in_progress';
    
    // Update status ref
    lastStatusRef.current = gameStatus || null;
    
    let shouldAnimate = false;
    
    if (isHolm) {
      // Holm: trigger IMMEDIATELY when status changes from ante_decision to in_progress
      // This happens the instant chips are deducted
      if (wasAnteDecision && isNowInProgress && !hasAnimatedThisSessionRef.current) {
        shouldAnimate = true;
        hasAnimatedThisSessionRef.current = true;
      }
    } else {
      // 3-5-7: animate when round 1 starts and status just changed to in_progress
      if (currentRound === 1 && lastAnimatedRoundRef.current !== 1 && wasAnteDecision && isNowInProgress) {
        shouldAnimate = true;
        lastAnimatedRoundRef.current = 1;
      }
      // Reset tracking when not in round 1 (allows re-animation when round cycles back)
      if (currentRound !== 1) {
        lastAnimatedRoundRef.current = currentRound;
      }
    }

    if (!shouldAnimate) return;

    // Start animation immediately
    if (onAnimationStart) {
      onAnimationStart();
    }
    
    const rect = containerRef.current.getBoundingClientRect();

    const newAnims: ChipAnimation[] = activePlayers.map(player => {
      const isCurrentPlayer = currentPlayerPosition === player.position;
      const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistance(player.position) - 1;
      const slot = getSlotPercent(slotIndex);
      const target = getPotBoxTarget(slotIndex, rect, isHolm);
      
      return {
        id: `chip-${animIdRef.current++}`,
        fromX: (slot.left / 100) * rect.width,
        fromY: (slot.top / 100) * rect.height,
        toX: target.x,
        toY: target.y,
      };
    });

    setAnimations(newAnims);
    lastAnimatedPotRef.current = pot;
    
    // Trigger callback when chips arrive at pot (at 80% of 2s = 1.6s)
    if (onChipsArrived) {
      setTimeout(() => {
        onChipsArrived();
      }, 1600);
    }
    
    setTimeout(() => {
      setAnimations([]);
    }, 2200);
  }, [pot, currentRound, activePlayers, currentPlayerPosition, getClockwiseDistance, isWaitingPhase, containerRef, gameType, gameStatus, anteAmount, onAnimationStart, onChipsArrived]);

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
