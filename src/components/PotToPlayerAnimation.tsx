import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatChipValue } from '@/lib/utils';

interface PotToPlayerAnimationProps {
  triggerId: string | null;
  amount: number;
  winnerPosition: number;
  currentPlayerPosition: number | null;
  getClockwiseDistance: (position: number) => number;
  containerRef: React.RefObject<HTMLDivElement>;
  gameType?: string | null; // For position adjustment
  onAnimationStart?: () => void;
  onAnimationEnd?: () => void;
}

export const PotToPlayerAnimation: React.FC<PotToPlayerAnimationProps> = ({
  triggerId,
  amount,
  winnerPosition,
  currentPlayerPosition,
  getClockwiseDistance,
  containerRef,
  gameType,
  onAnimationStart,
  onAnimationEnd,
}) => {
  const [animation, setAnimation] = useState<{ fromX: number; fromY: number; toX: number; toY: number } | null>(null);
  const lockedAmountRef = useRef<number>(amount);
  const lastTriggerIdRef = useRef<string | null>(null);
  const endTimeoutRef = useRef<number | null>(null);
  const clearTimeoutRef = useRef<number | null>(null);
  const chipCenterCacheRef = useRef<Record<number, { xPct: number; yPct: number }>>({});

  // IMPORTANT: parent often passes inline callbacks which change identity on re-render.
  // If we include callbacks in the animation effect deps, React will run cleanup on re-render
  // and cancel our timers. Use refs so the timers stay stable.
  const onStartRef = useRef<(() => void) | undefined>(onAnimationStart);
  const onEndRef = useRef<(() => void) | undefined>(onAnimationEnd);

  useEffect(() => {
    onStartRef.current = onAnimationStart;
  }, [onAnimationStart]);

  useEffect(() => {
    onEndRef.current = onAnimationEnd;
  }, [onAnimationEnd]);

  const animationName = useMemo(() => {
    const safe = (triggerId ?? 'no_trigger').replace(/[^a-zA-Z0-9_-]/g, '_');
    return `potToPlayer_${safe}`;
  }, [triggerId]);

  // Pot center position - different for Holm vs 3-5-7
  const getPotCenter = (rect: DOMRect): { x: number; y: number } => {
    // 3-5-7: pot is centered vertically (50%), Holm: pot is higher (38%)
    const yPercent = gameType === 'holm-game' ? 0.38 : 0.5;
    return {
      x: rect.width * 0.5,
      y: rect.height * yPercent,
    };
  };

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

  const getCachedChipCenter = (position: number, rect: DOMRect): { x: number; y: number } | null => {
    const cached = chipCenterCacheRef.current[position];
    if (!cached) return null;
    return {
      x: cached.xPct * rect.width,
      y: cached.yPct * rect.height,
    };
  };

  const getChipCenterFromDom = (position: number): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;

    // First try to find the actual chip circle element (more accurate)
    let el = container.querySelector(
      `[data-chip-center="${position}"]`
    ) as HTMLElement | null;

    // Fallback to the wrapper if chip circle not found
    if (!el) {
      el = container.querySelector(
        `[data-seat-chip-position="${position}"]`
      ) as HTMLElement | null;
    }
    if (!el) return null;

    const containerRect = container.getBoundingClientRect();
    const r = el.getBoundingClientRect();

    const coords = {
      x: r.left - containerRect.left + r.width / 2,
      y: r.top - containerRect.top + r.height / 2,
    };

    // Cache as % so we still have a good target if the chip DOM is temporarily hidden.
    if (containerRect.width > 0 && containerRect.height > 0) {
      chipCenterCacheRef.current[position] = {
        xPct: coords.x / containerRect.width,
        yPct: coords.y / containerRect.height,
      };
    }

    return coords;
  };

  const getPositionCoords = (position: number, rect: DOMRect): { x: number; y: number } => {
    // Prefer real DOM-measured chipstack center when available (more accurate than % mapping).
    const dom = getChipCenterFromDom(position);
    if (dom) return dom;

    // Use last-known DOM center if the chip stack is currently not in the DOM (e.g. showdown layout).
    const cached = getCachedChipCenter(position, rect);
    if (cached) return cached;

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

  // Store position-related props in refs so the effect doesn't re-run when they change
  const winnerPositionRef = useRef(winnerPosition);
  const currentPlayerPositionRef = useRef(currentPlayerPosition);
  const getClockwiseDistanceRef = useRef(getClockwiseDistance);
  const containerRefRef = useRef(containerRef);
  const gameTypeRef = useRef(gameType);
  const amountRef = useRef(amount);

  useEffect(() => {
    winnerPositionRef.current = winnerPosition;
    currentPlayerPositionRef.current = currentPlayerPosition;
    getClockwiseDistanceRef.current = getClockwiseDistance;
    containerRefRef.current = containerRef;
    gameTypeRef.current = gameType;
    amountRef.current = amount;
  });

  // Main animation effect - ONLY depends on triggerId to prevent timer cancellation
  useEffect(() => {
    if (!triggerId || triggerId === lastTriggerIdRef.current) {
      return;
    }

    const container = containerRefRef.current?.current;
    if (!container) {
      return;
    }

    // Clear any previous timers so older animations can't end this one early.
    if (endTimeoutRef.current) {
      window.clearTimeout(endTimeoutRef.current);
      endTimeoutRef.current = null;
    }
    if (clearTimeoutRef.current) {
      window.clearTimeout(clearTimeoutRef.current);
      clearTimeoutRef.current = null;
    }

    lastTriggerIdRef.current = triggerId;
    lockedAmountRef.current = amountRef.current;

    // Compute positions using refs (won't cause re-runs)
    const rect = container.getBoundingClientRect();
    const yPercent = gameTypeRef.current === 'holm-game' ? 0.38 : 0.5;
    const potCoords = { x: rect.width * 0.5, y: rect.height * yPercent };

    // Winner target
    let winnerCoords: { x: number; y: number };

    // Try live DOM first (best), then cached DOM %, then finally the % slot mapping fallback.
    const domWinner = getChipCenterFromDom(winnerPositionRef.current);
    if (domWinner) {
      winnerCoords = domWinner;
    } else {
      const cachedWinner = getCachedChipCenter(winnerPositionRef.current, rect);
      if (cachedWinner) {
        winnerCoords = cachedWinner;
      } else {
        const isObserver = currentPlayerPositionRef.current === null;
        let slot: { top: number; left: number };
        if (isObserver) {
          const positions: Record<number, { top: number; left: number }> = {
            1: { top: 2, left: 10 }, 2: { top: 50, left: 2 }, 3: { top: 92, left: 10 },
            4: { top: 92, left: 50 }, 5: { top: 92, left: 90 }, 6: { top: 50, left: 98 }, 7: { top: 2, left: 90 },
          };
          slot = positions[winnerPositionRef.current] || { top: 50, left: 50 };
        } else {
          const isCurrentPlayer = currentPlayerPositionRef.current === winnerPositionRef.current;
          const slotIndex = isCurrentPlayer ? -1 : getClockwiseDistanceRef.current(winnerPositionRef.current) - 1;
          if (slotIndex === -1) {
            slot = { top: 92, left: 50 };
          } else {
            const slots: Record<number, { top: number; left: number }> = {
              0: { top: 92, left: 10 }, 1: { top: 50, left: 2 }, 2: { top: 2, left: 10 },
              3: { top: 2, left: 90 }, 4: { top: 50, left: 98 }, 5: { top: 92, left: 90 },
            };
            slot = slots[slotIndex] || { top: 50, left: 50 };
          }
        }
        winnerCoords = { x: (slot.left / 100) * rect.width, y: (slot.top / 100) * rect.height };
      }
    }

    // Notify start - pot should show 0 now
    onStartRef.current?.();

    setAnimation({
      // Convert container-relative coords → viewport coords so we can render with position:fixed
      fromX: rect.left + potCoords.x,
      fromY: rect.top + potCoords.y,
      toX: rect.left + winnerCoords.x,
      toY: rect.top + winnerCoords.y,
    });

    // Timing depends on game type - dice games should be snappy
    const isDiceGame = gameTypeRef.current === 'horses' || gameTypeRef.current === 'ship-captain-crew';
    const animDuration = isDiceGame ? 750 : 3300;
    const clearDelay = isDiceGame ? 900 : 3700;

    // Notify parent AFTER the visual animation fully finishes so the component isn't unmounted mid-flight.
    endTimeoutRef.current = window.setTimeout(() => {
      // Guard: only end the animation we started for this trigger.
      if (lastTriggerIdRef.current === triggerId) {
        onEndRef.current?.();
      }
    }, animDuration);

    // Clear animation after it completes
    clearTimeoutRef.current = window.setTimeout(() => {
      if (lastTriggerIdRef.current === triggerId) {
        setAnimation(null);
      }
    }, clearDelay);

    // NO cleanup that clears timers - we don't want deps changes to cancel timers
    // Timers are only cleared when a NEW triggerId arrives (handled above)
  }, [triggerId]); // ONLY triggerId - other values accessed via refs

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      if (endTimeoutRef.current) window.clearTimeout(endTimeoutRef.current);
      if (clearTimeoutRef.current) window.clearTimeout(clearTimeoutRef.current);
    };
  }, []);

  if (!animation) return null;

  // Fast animation for dice games, slower for card games
  const isDiceGame = gameType === 'horses' || gameType === 'ship-captain-crew';
  const animDuration = isDiceGame ? '0.7s' : '3.2s';
  const timingFn = isDiceGame ? 'linear' : 'ease-in-out';

  // If any ancestor has transform/filter, `position: fixed` can get trapped in that stacking context.
  // Portal to <body> so the chip ALWAYS renders above the entire app UI.
  if (typeof document === 'undefined') return null;

  const chip = (
    <div
      className="fixed pointer-events-none"
      style={{
        left: animation.fromX,
        top: animation.fromY,
        transform: 'translate(-50%, -50%)',
        zIndex: 2147483647,
      }}
    >
      <div
        className="w-8 h-8 rounded-full bg-amber-400 border-2 border-white shadow-lg flex items-center justify-center"
        style={{
          animation: `${animationName} ${animDuration} ${timingFn} forwards`,
        }}
      >
        <span className="text-black text-[10px] font-bold">${formatChipValue(lockedAmountRef.current)}</span>
      </div>
      <style>{`
        @keyframes ${animationName} {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 1;
          }
          ${isDiceGame ? `
          /* Dice games: straight line from pot to player (no bounce), then vanish into the stack */
          92% {
            transform: translate(${animation.toX - animation.fromX}px, ${animation.toY - animation.fromY}px) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(${animation.toX - animation.fromX}px, ${animation.toY - animation.fromY}px) scale(1);
            opacity: 0;
          }
          ` : `
          15% {
            transform: translate(0, -8px) scale(1.1);
            opacity: 1;
          }
          85% {
            transform: translate(${animation.toX - animation.fromX}px, ${animation.toY - animation.fromY}px) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(${animation.toX - animation.fromX}px, ${animation.toY - animation.fromY}px) scale(0);
            opacity: 0;
          }
          `}
        }
      `}</style>
    </div>
  );

  return createPortal(chip, document.body);
};

export default PotToPlayerAnimation;
