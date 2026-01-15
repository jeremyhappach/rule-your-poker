import React, { useEffect, useState, useRef } from 'react';
import { formatChipValue } from '@/lib/utils';

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
  currentPlayerPosition: number | null; // null for observers
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
  // CRITICAL: Use a ref to track animation in progress - state updates are async and can miss rapid re-triggers
  const animationInProgressRef = useRef(false);

  // Animation timing
  const ANTE_TRAVEL_MS = 1000;
  const ANTE_ARRIVE_MS = 800;
  const ANTE_CLEANUP_MS = 1200;

  // Slot positions as percentages of container - MUST MATCH actual player chip positions in MobileGameTable
  // Tailwind classes: bottom-2 (0.5rem≈8px≈2%), left-10 (2.5rem≈40px≈10%), top-1/2 (50%), left-0/right-0 (edge)
  const getSlotPercent = (slotIndex: number): { top: number; left: number } => {
    if (slotIndex === -1) return { top: 92, left: 50 }; // Current player (bottom center)
    const slots: Record<number, { top: number; left: number }> = {
      0: { top: 92, left: 10 }, // Bottom-left: bottom-2 left-10
      1: { top: 50, left: 2 }, // Middle-left: left-0 top-1/2
      2: { top: 2, left: 10 }, // Top-left: top-2 left-10
      3: { top: 2, left: 90 }, // Top-right: top-2 right-10
      4: { top: 50, left: 98 }, // Middle-right: right-0 top-1/2
      5: { top: 92, left: 90 }, // Bottom-right: bottom-2 right-10
    };
    return slots[slotIndex] || { top: 50, left: 50 };
  };

  // OBSERVER MODE: Map absolute position (1-7) to slot percent for observers (no currentPlayer)
  // Positions 1-7 around the table, mapped to visual positions
  const getAbsolutePositionPercent = (position: number): { top: number; left: number } => {
    // Absolute position layout (clockwise from top-left):
    // 1: Top-left, 2: Middle-left, 3: Bottom-left, 4: Bottom-center
    // 5: Bottom-right, 6: Middle-right, 7: Top-right
    const absoluteSlots: Record<number, { top: number; left: number }> = {
      1: { top: 2, left: 10 }, // Top-left
      2: { top: 50, left: 2 }, // Middle-left
      3: { top: 92, left: 10 }, // Bottom-left
      4: { top: 92, left: 50 }, // Bottom-center
      5: { top: 92, left: 90 }, // Bottom-right
      6: { top: 50, left: 98 }, // Middle-right
      7: { top: 2, left: 90 }, // Top-right
    };
    return absoluteSlots[position] || { top: 50, left: 50 };
  };

  // Get target position at the CENTER of the pot box
  // Pot box CSS positioning:
  // - Holm: "top-[35%] -translate-y-full" = bottom edge at 35%
  // - Dice games (Horses/SCC): "top-[28%] -translate-y-full" = bottom edge at 28%
  // - 3-5-7: "top-1/2 -translate-y-1/2" = center at 50%
  const getPotBoxTarget = (_slotIndex: number, rect: DOMRect, gType: string | null | undefined): { x: number; y: number } => {
    const centerX = rect.width / 2;

    const isHolm = gType === 'holm-game';
    const isDiceGame = gType === 'horses' || gType === 'ship-captain-crew';

    // Pot box approximate height (measured from CSS: py-1.5 for Holm/Dice ≈ 24px, py-3 for 3-5-7 ≈ 40px)
    const potHeight = (isHolm || isDiceGame) ? 24 : 40;

    // Calculate pot center Y based on actual CSS positioning
    let potCenterY: number;
    if (isHolm) {
      // top-[35%] -translate-y-full means bottom edge at 35% of container
      const potBottomY = rect.height * 0.35;
      potCenterY = potBottomY - (potHeight / 2);
    } else if (isDiceGame) {
      // top-[28%] -translate-y-full means bottom edge at 28% of container
      const potBottomY = rect.height * 0.28;
      potCenterY = potBottomY - (potHeight / 2);
    } else {
      // top-1/2 -translate-y-1/2 means center at 50%
      potCenterY = rect.height * 0.5;
    }

    // All chips arrive at the exact center of the pot
    return { x: centerX, y: potCenterY };
  };

  // Reset when game goes back to waiting phase (new game session)
  useEffect(() => {
    if (isWaitingPhase) {
      lastAnimatedPotRef.current = null;
      lastTriggerIdRef.current = null;
      animationInProgressRef.current = false;
    }
  }, [isWaitingPhase]);

  useEffect(() => {
    if (isWaitingPhase || !containerRef.current || activePlayers.length === 0) {
      return;
    }

    // Only animate via triggerId - lastTriggerIdRef prevents duplicate animations from same trigger
    // CRITICAL: Use ref for immediate blocking - state updates are async and animations.length can be stale
    if (!triggerId || triggerId === lastTriggerIdRef.current || animationInProgressRef.current) {
      return;
    }

    // IMMEDIATELY mark animation as in progress (ref updates synchronously, prevents race conditions)
    animationInProgressRef.current = true;
    lastTriggerIdRef.current = triggerId;

    // Lock the display amount BEFORE calling onAnimationStart (which clears the trigger)
    lockedDisplayAmountRef.current = displayAmount;

    // Start animation immediately
    onAnimationStart?.();

    const rect = containerRef.current.getBoundingClientRect();

    // Filter to specific players if provided, otherwise all active players
    const playersToAnimate = specificPlayerIds
      ? activePlayers.filter((p) => p.id && specificPlayerIds.includes(p.id))
      : activePlayers;

    // CRITICAL: For observers (currentPlayerPosition is null), use ABSOLUTE position mapping
    // For seated players, use RELATIVE slots based on clockwise distance
    const isObserver = currentPlayerPosition === null;

    const newAnims: ChipAnimation[] = playersToAnimate.map((player) => {
      let slot: { top: number; left: number };
      let slotIndexForTarget: number;

      if (isObserver) {
        // Observer mode: use absolute position directly
        slot = getAbsolutePositionPercent(player.position);
        // For pot target, map absolute position to equivalent slot index
        // Position 1=top-left(slot2), 2=mid-left(slot1), 3=bot-left(slot0), 4=bot-center(-1)
        // 5=bot-right(slot5), 6=mid-right(slot4), 7=top-right(slot3)
        const absToSlot: Record<number, number> = { 1: 2, 2: 1, 3: 0, 4: -1, 5: 5, 6: 4, 7: 3 };
        slotIndexForTarget = absToSlot[player.position] ?? 0;
      } else {
        // Seated player mode: use relative slots
        const isCurrentPlayer = currentPlayerPosition === player.position;
        slotIndexForTarget = isCurrentPlayer ? -1 : getClockwiseDistance(player.position) - 1;
        slot = getSlotPercent(slotIndexForTarget);
      }

      const target = getPotBoxTarget(slotIndexForTarget, rect, gameType);

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

    // Trigger callback when chips arrive at pot (near end of travel)
    if (onChipsArrived) {
      setTimeout(() => {
        onChipsArrived();
      }, ANTE_ARRIVE_MS);
    }

    // Cleanup after animation completes
    setTimeout(() => {
      setAnimations([]);
      animationInProgressRef.current = false; // Clear the ref guard when animation completes
    }, ANTE_CLEANUP_MS);
  }, [
    pot,
    currentRound,
    activePlayers,
    currentPlayerPosition,
    getClockwiseDistance,
    isWaitingPhase,
    containerRef,
    gameType,
    gameStatus,
    triggerId,
    anteAmount,
    displayAmount,
    specificPlayerIds,
    onAnimationStart,
    onChipsArrived,
  ]);

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
              animation: `anteChipMove${i} ${ANTE_TRAVEL_MS}ms ease-out forwards`,
            }}
          >
            <span className="text-black text-[10px] font-bold">${formatChipValue(lockedDisplayAmountRef.current)}</span>
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
