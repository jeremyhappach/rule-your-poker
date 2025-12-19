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
  chipAmount?: number; // Display amount on chip (defaults to anteAmount, use pussyTaxValue for pussy tax)
  activePlayers: { position: number; id?: string }[];
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  isWaitingPhase?: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  gameType?: string | null;
  currentRound?: number;
  gameStatus?: string; // Game status to detect ante collection moment
  triggerId?: string | null; // Direct trigger from Game.tsx - fires immediately when set
  specificPlayerIds?: string[]; // If set, only animate from these players (for Chucky loss, etc.)
  onAnimationStart?: () => void;
  onChipsArrived?: () => void;
}

export const AnteUpAnimation: React.FC<AnteUpAnimationProps> = ({
  pot,
  anteAmount,
  chipAmount,
  activePlayers,
  currentPlayerPosition,
  getClockwiseDistance,
  isWaitingPhase = false,
  containerRef,
  gameType,
  currentRound,
  gameStatus,
  triggerId,
  specificPlayerIds,
  onAnimationStart,
  onChipsArrived,
}) => {
  // Use chipAmount if provided, otherwise fall back to anteAmount
  const displayAmount = chipAmount ?? anteAmount;
  const [animations, setAnimations] = useState<ChipAnimation[]>([]);
  // Store the amount when animation starts so it doesn't change when trigger is cleared
  const lockedDisplayAmountRef = useRef<number>(anteAmount);
  const animIdRef = useRef(0);
  // Track what we've animated for to prevent re-triggers
  const lastAnimatedPotRef = useRef<number | null>(null);
  const lastTriggerIdRef = useRef<string | null>(null);

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

  // Get target position on pot box edge based on VISUAL slot position (closest edge to player)
  // Pot box position: Holm = bottom at 35%, 3-5-7 = center at 50%
  // We calculate center and then offset to the nearest edge based on where the player chip starts
  const getPotBoxTarget = (slotIndex: number, rect: DOMRect, isHolm: boolean): { x: number; y: number } => {
    const centerX = rect.width / 2;
    
    // Pot box approximate dimensions (measured from CSS: px-5 py-1.5 for Holm, px-8 py-3 for 3-5-7)
    // Holm: ~90px wide, ~32px tall
    // 3-5-7: ~130px wide, ~56px tall
    const potHalfWidth = isHolm ? 50 : 70; // Add buffer to stop at visible border
    const potHalfHeight = isHolm ? 20 : 32;
    
    // Calculate pot center Y based on CSS positioning
    // Holm: "top-[35%] -translate-y-full" means bottom edge at 35%, so center = 35% - halfHeight
    // 3-5-7: "top-1/2 -translate-y-1/2" means center at 50%
    const potBottomY = isHolm ? rect.height * 0.35 : rect.height * 0.50 + potHalfHeight;
    const potTopY = potBottomY - potHalfHeight * 2;
    const potCenterY = (potTopY + potBottomY) / 2;
    
    // Target the closest edge based on VISUAL slot position (relative to current player)
    // Add a small offset (5px) so chips stop just before the pot border
    const edgeBuffer = -3; // Negative = travel INTO pot area slightly
    switch (slotIndex) {
      case -1: // Current player (bottom) - target bottom edge
        return { x: centerX, y: potBottomY + edgeBuffer };
      case 0:  // Bottom-left - target bottom-left corner area
        return { x: centerX - potHalfWidth * 0.5, y: potBottomY + edgeBuffer };
      case 5:  // Bottom-right - target bottom-right corner area
        return { x: centerX + potHalfWidth * 0.5, y: potBottomY + edgeBuffer };
      case 2:  // Top-left - target top-left corner area
        return { x: centerX - potHalfWidth * 0.5, y: potTopY - edgeBuffer };
      case 3:  // Top-right - target top-right corner area
        return { x: centerX + potHalfWidth * 0.5, y: potTopY - edgeBuffer };
      case 1:  // Middle-left - target left edge
        return { x: centerX - potHalfWidth - edgeBuffer, y: potCenterY };
      case 4:  // Middle-right - target right edge
        return { x: centerX + potHalfWidth + edgeBuffer, y: potCenterY };
      default:
        return { x: centerX, y: potCenterY };
    }
  };

  // Reset when game goes back to waiting phase (new game session)
  useEffect(() => {
    if (isWaitingPhase) {
      lastAnimatedPotRef.current = null;
      lastTriggerIdRef.current = null;
    }
  }, [isWaitingPhase]);

  useEffect(() => {
    if (isWaitingPhase || !containerRef.current || activePlayers.length === 0) {
      return;
    }

    // Only animate via triggerId - lastTriggerIdRef prevents duplicate animations from same trigger
    // CRITICAL: Also check if we already have animations running to prevent double-fire
    if (!triggerId || triggerId === lastTriggerIdRef.current || animations.length > 0) {
      return;
    }
    
    lastTriggerIdRef.current = triggerId;
    
    // Lock the display amount BEFORE calling onAnimationStart (which clears the trigger)
    lockedDisplayAmountRef.current = displayAmount;
    
    const isHolm = gameType === 'holm-game';

    // Start animation immediately
    if (onAnimationStart) {
      onAnimationStart();
    }
    
    const rect = containerRef.current.getBoundingClientRect();

    // Filter to specific players if provided, otherwise all active players
    const playersToAnimate = specificPlayerIds 
      ? activePlayers.filter(p => p.id && specificPlayerIds.includes(p.id))
      : activePlayers;

    const newAnims: ChipAnimation[] = playersToAnimate.map(player => {
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
    
    // Trigger callback when chips arrive at pot (at end of travel animation)
    if (onChipsArrived) {
      setTimeout(() => {
        onChipsArrived();
      }, 800); // Faster callback - chips arrive at 70% of 1s = 700ms
    }
    
    setTimeout(() => {
      setAnimations([]);
    }, 1200); // Cleanup after animation completes
  }, [pot, currentRound, activePlayers, currentPlayerPosition, getClockwiseDistance, isWaitingPhase, containerRef, gameType, gameStatus, triggerId, anteAmount, onAnimationStart, onChipsArrived]);

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
              animation: `anteChipMove${i} 1s ease-out forwards`,
            }}
          >
            <span className="text-black text-[10px] font-bold">${lockedDisplayAmountRef.current}</span>
          </div>
          <style>{`
            @keyframes anteChipMove${i} {
              0% {
                transform: translate(0, 0) scale(1);
                opacity: 1;
              }
              70% {
                transform: translate(${anim.toX - anim.fromX}px, ${anim.toY - anim.fromY}px) scale(1);
                opacity: 1;
              }
              85% {
                transform: translate(${anim.toX - anim.fromX}px, ${anim.toY - anim.fromY}px) scale(1.1);
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
