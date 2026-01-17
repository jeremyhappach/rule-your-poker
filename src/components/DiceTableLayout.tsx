import { useState, useLayoutEffect, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { HorsesDie } from "./HorsesDie";
import { getSCCDisplayOrder, SCCHand, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { DiceRollAnimation } from "./DiceRollAnimation";
import { useDeviceSize } from "@/hooks/useDeviceSize";

interface DiceTableLayoutProps {
  dice: (HorsesDieType | SCCDieType)[];
  isRolling?: boolean;
  canToggle?: boolean;
  onToggleHold?: (index: number) => void;
  size?: "sm" | "md" | "lg";
  gameType?: string;
  showWildHighlight?: boolean;
  /** If true, use the SCC display order (frozen 6-5-4 first) */
  useSCCDisplayOrder?: boolean;
  /** The full SCCHand for display order calculation */
  sccHand?: SCCHand;
  /** If true, this is the observer view (not my turn) */
  isObserver?: boolean;
  /** If true, show "You are rolling" message instead of dice (for active roller's own view) */
  showRollingMessage?: boolean;
  /** If true, hide dice that haven't been rolled yet (value === 0) */
  hideUnrolledDice?: boolean;
  /** Per-die mask of what was held BEFORE turn completion (layout should freeze at last-roll start) */
  heldMaskBeforeComplete?: boolean[];
  /** Legacy fallback: number of dice held before completion (can't preserve exact dice) */
  previouslyHeldCount?: number;
  /** Origin position for dice fly-in animation (relative to container center, in pixels) */
  animationOrigin?: { x: number; y: number };
  /** Key that changes when a new roll starts (triggers fly-in animation) */
  rollKey?: string | number;
  /** Whether the SCC hand is qualified (has Ship, Captain, Crew) - used to determine unused dice */
  isQualified?: boolean;
}

// Staggered positions for unheld dice (as pixel offsets from center)
// Organic scatter pattern utilizing corners - not perfect geometric shapes
// NOTE: These are indexed by "number of unheld dice" (not original index).

// Legacy lookup for older code paths that don't use stable positions
// TABLET: These positions get scaled by 1.6x in getUnheldPosition for larger dice
const UNHELD_POSITIONS: Record<number, { x: number; y: number; rotate: number }[]> = {
  // 5 unheld dice - rough pentagon using corners + center
  // NOTE: Y positions shifted down so initial roll lands lower, matching where dice stay when 1+ are held
  5: [
    { x: -55, y: -28, rotate: -15 },   // upper-left area
    { x: 58, y: -24, rotate: 12 },     // upper-right area
    { x: 3, y: 8, rotate: 5 },         // center-ish
    { x: -52, y: 44, rotate: -8 },     // lower-left corner
    { x: 55, y: 48, rotate: 11 },      // lower-right corner
  ],
  // 4 unheld dice - rough rectangle using corners
  4: [
    { x: -50, y: -20, rotate: -12 },  // upper-left
    { x: 56, y: -15, rotate: 14 },    // upper-right
    { x: -54, y: 40, rotate: -6 },    // lower-left
    { x: 52, y: 45, rotate: 9 },      // lower-right
  ],
  // 3 unheld dice - tighter triangle (lower to avoid overlap with held row)
  3: [
    { x: 0, y: 5, rotate: 8 },        // center (moved down from -22)
    { x: -38, y: 32, rotate: -10 },   // lower-left (tighter)
    { x: 38, y: 35, rotate: 6 },      // lower-right (tighter)
  ],
  // 2 unheld dice - rough diagonal
  2: [
    { x: -44, y: 8, rotate: -7 },     // left-ish
    { x: 48, y: 18, rotate: 10 },     // right-ish lower
  ],
  // 1 unheld die - slightly off-center with tilt
  1: [
    { x: 5, y: 12, rotate: -4 },
  ],
  // 0 unheld dice - empty
  0: [],
};

/**
 * Determines if a die is "unused" in the final hand determination.
 * For SCC: cargo dice (non-SCC) are unused when the hand is NOT qualified.
 * For Horses: only dice contributing to the of-a-kind hand are "used"; kickers are unused.
 */
function isDieUnused(
  die: HorsesDieType | SCCDieType,
  isSCC: boolean,
  isQualified: boolean | undefined,
  allHeld: boolean,
  allDice?: (HorsesDieType | SCCDieType)[]
): boolean {
  // Only mark dice as unused when the hand is complete (all held)
  if (!allHeld) return false;
  
  if (isSCC) {
    // SCC logic: red shading only on non-qualifying hands.
    // IMPORTANT: Some caller paths don't provide isQualified, so we compute qualification from dice state.
    const computedQualified =
      isQualified ??
      (Array.isArray(allDice) && allDice.some((d) => (d as SCCDieType).sccType === "crew")) ??
      false;

    // Qualifying hand: no unused dice (no red shading)
    if (computedQualified) return false;

    // Non-qualifying hand: only Ship/Captain/Crew dice are used; all others are unused (red)
    const sccDie = die as SCCDieType;
    const isSCCDie = "isSCC" in sccDie && sccDie.isSCC;
    return !isSCCDie;
  }
  
  // Horses logic: Only dice contributing to the of-a-kind hand are used
  // Wilds (1s) can count toward the of-a-kind, so we need to determine which dice are "used"
  if (!allDice || allDice.length === 0) return false;
  
  const values = allDice.map(d => d.value);
  const currentValue = die.value;
  
  // Count each value (1-6)
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  values.forEach(v => { if (v >= 1 && v <= 6) counts[v]++; });
  
  const wildCount = counts[1]; // 1s are wild
  
  // Special case: All 1s (pure wilds) - all dice are used
  if (wildCount === 5) return false;
  
  // Find the best of-a-kind value (highest value with most matches when combined with wilds)
  let bestOfAKind = 0;
  let bestValue = 0;
  
  for (let value = 6; value >= 2; value--) {
    const totalWithWilds = Math.min(5, counts[value] + wildCount);
    if (totalWithWilds > bestOfAKind) {
      bestOfAKind = totalWithWilds;
      bestValue = value;
    } else if (totalWithWilds === bestOfAKind && value > bestValue) {
      bestValue = value;
    }
  }
  
  // If no pairs or better, it's a high-card hand
  if (bestOfAKind < 2) {
    // High card: only the highest non-wild die is "used", all others are unused
    const nonWildValues = values.filter(v => v !== 1);
    if (nonWildValues.length === 0) return false; // All wilds, all used
    const highCard = Math.max(...nonWildValues);
    // Only the first occurrence of the high card is "used"
    const highCardIndex = values.indexOf(highCard);
    const currentIndex = values.indexOf(currentValue);
    // Mark as unused if not the high card
    return currentValue !== highCard || (currentIndex !== highCardIndex && values.filter(v => v === highCard).length === 1);
  }
  
  // For of-a-kind hands:
  // - Dice matching bestValue are used
  // - Wilds (1s) are used UP TO the number needed to complete the of-a-kind
  
  // Dice matching the target value are always used
  if (currentValue === bestValue) return false;
  
  // Wilds: count how many are needed to complete the of-a-kind
  const naturalCount = counts[bestValue];
  const wildsNeeded = bestOfAKind - naturalCount;
  
  // If this die is a wild (1), check if it's one of the "used" wilds
  if (currentValue === 1 && wildsNeeded > 0) {
    // Find the index of this die among all dice
    const dieIndex = allDice.indexOf(die);
    // Find indices of all wilds
    const wildIndices = allDice
      .map((d, i) => (d.value === 1 ? i : -1))
      .filter(i => i !== -1);
    // The first `wildsNeeded` wilds are used
    const usedWildIndices = wildIndices.slice(0, wildsNeeded);
    return !usedWildIndices.includes(dieIndex);
  }
  
  // This die is neither the target value nor a needed wild - it's unused
  return true;
}

/**
 * SCC only: on a qualifying hand, cargo dice (non-SCC dice) should be shaded light blue when locked.
 */
function isCargoDie(
  die: HorsesDieType | SCCDieType,
  isSCC: boolean,
  isQualified: boolean | undefined,
  allHeld: boolean,
  allDice?: (HorsesDieType | SCCDieType)[],
): boolean {
  if (!isSCC || !allHeld) return false;

  const computedQualified =
    isQualified ??
    (Array.isArray(allDice) && allDice.some((d) => (d as SCCDieType).sccType === "crew")) ??
    false;

  if (!computedQualified) return false;

  const sccDie = die as SCCDieType;
  const isSCCDie = "isSCC" in sccDie && sccDie.isSCC;
  return !isSCCDie;
}

export function DiceTableLayout({
  dice,
  isRolling = false,
  canToggle = false,
  onToggleHold,
  size = "sm",
  gameType,
  showWildHighlight = true,
  useSCCDisplayOrder = false,
  sccHand,
  isObserver = false,
  showRollingMessage = false,
  hideUnrolledDice = false,
  heldMaskBeforeComplete,
  previouslyHeldCount,
  animationOrigin,
  rollKey,
  isQualified,
}: DiceTableLayoutProps) {
  const isSCC = gameType === 'ship-captain-crew';
  const { isTablet } = useDeviceSize();
  
  // TABLET: Use larger dice size
  const effectiveSize = isTablet ? "lg" : size;
  
  // Track fly-in animation state
  const [isAnimatingFlyIn, setIsAnimatingFlyIn] = useState(false);
  const [animatingDiceIndices, setAnimatingDiceIndices] = useState<number[]>([]);
  const prevRollKeyRef = useRef<string | number | undefined>(undefined);
  const animationCompleteTimeoutRef = useRef<number | null>(null);

  // Stable scatter positions for the CURRENT rollKey.
  // This prevents unheld dice from jumping around when the active player toggles holds.
  const stableScatterRollKeyRef = useRef<string | number | undefined>(undefined);
  const stableScatterByDieRef = useRef<
    Map<number, { x: number; y: number; rotate: number }>
  >(new Map());

  // Track held count at the START of animation (so animation lands at correct Y offset)
  const [animationHeldCount, setAnimationHeldCount] = useState(0);

  // Track whether unheld dice should be visible (they disappear after animation lands until next roll)
  // Unheld dice are only visible during the fly-in animation landing
  const [showUnheldDice, setShowUnheldDice] = useState(true);

  // Track "completion transition" - when all dice become held, we delay the final layout
  // to show: held dice move → pause → formerly-unheld dice fade out
  const [isInCompletionTransition, setIsInCompletionTransition] = useState(false);
  const [hideFormerlyUnheld, setHideFormerlyUnheld] = useState(false);
  const prevAllHeldRef = useRef(false);
  const completionTransitionTimeoutRef = useRef<number | null>(null);
  
  // CRITICAL: Cache the last valid dice state to prevent flicker when dice briefly become invalid
  // This prevents the empty container from rendering during state transitions
  const lastValidDiceRef = useRef<(HorsesDieType | SCCDieType)[]>(dice);
  
  // Stabilization period after roll 3 completes - hold the current visual state
  // to prevent flickering during the isComplete transition
  const [isStabilizing, setIsStabilizing] = useState(false);
  const stabilizationTimeoutRef = useRef<number | null>(null);
  const prevIsCompleteRef = useRef(false);
  
  // Schedules a timeout
  const scheduleTimeout = useCallback(
    (delayMs: number, cb: () => void) => {
      return window.setTimeout(cb, delayMs);
    },
    []
  );

  // Detect when a new roll starts (rollKey changes) and trigger fly-in animation

  // NOTE: useLayoutEffect prevents a 1-frame flash where dice render in-place before we hide them.
  useLayoutEffect(() => {
    // Reset completion transition when a new roll starts
    if (rollKey !== undefined && rollKey !== prevRollKeyRef.current) {
      setIsInCompletionTransition(false);
      setHideFormerlyUnheld(false);
      if (completionTransitionTimeoutRef.current) {
        clearTimeout(completionTransitionTimeoutRef.current);
        completionTransitionTimeoutRef.current = null;
      }
    }
    
    if (rollKey !== undefined && rollKey !== prevRollKeyRef.current) {
      prevRollKeyRef.current = rollKey;

      // CRITICAL FIX: Immediately hide any OLD unheld dice from the previous roll.
      // This prevents stale dice from roll 2 persisting on the felt during roll 3's animation.
      // Without this, observers see old dice sitting there until the new animation completes.
      setShowUnheldDice(false);

      const heldMask = Array.isArray(heldMaskBeforeComplete) ? heldMaskBeforeComplete : null;

      // Build an index order consistent with what we render (important for SCC).
      const orderedIndices =
        useSCCDisplayOrder && sccHand
          ? getSCCDisplayOrder(sccHand).map(({ originalIndex }) => originalIndex)
          : dice.map((_, i) => i);

      // Find which dice were unheld at the START of the roll.
      const unheldIndices = orderedIndices.filter((i) => {
        const d = dice[i];
        if (!d) return false;
        const wasHeldAtRollStart = heldMask ? !!heldMask[i] : !!d.isHeld;
        return !wasHeldAtRollStart && d.value !== 0;
      });

      // Track how many were held at the START of this roll (for Y offset calculation)
      const heldAtRollStart = heldMask
        ? heldMask.filter(Boolean).length
        : dice.filter((d) => d.isHeld).length;
      setAnimationHeldCount(heldAtRollStart);

      // Freeze scatter positions for this rollKey (prevents reposition when holds change)
      stableScatterRollKeyRef.current = rollKey;
      const nextStable = new Map<number, { x: number; y: number; rotate: number }>();
      const positions = UNHELD_POSITIONS[unheldIndices.length] || UNHELD_POSITIONS[5];
      unheldIndices.forEach((dieIndex, displayIdx) => {
        const basePos = positions[displayIdx] || { x: 0, y: 0, rotate: 0 };
        // IMPORTANT: Match the exact tablet scatter scaling used by getUnheldPosition.
        // Otherwise, dice will "snap" back into the tighter mobile formation after the fly-in lands.
        const stablePos = isTablet
          ? { x: basePos.x * 1.6, y: basePos.y * 1.5, rotate: basePos.rotate }
          : basePos;
        nextStable.set(dieIndex, stablePos);
      });
      stableScatterByDieRef.current = nextStable;

      // Trigger fly-in animation if we have an origin.
      if (animationOrigin && unheldIndices.length > 0) {
        setAnimatingDiceIndices(unheldIndices);
        setIsAnimatingFlyIn(true);
        // Show unheld dice when animation starts (they'll animate in from player window)
        setShowUnheldDice(true);
      }
    }

    return () => {
      if (animationCompleteTimeoutRef.current) {
        clearTimeout(animationCompleteTimeoutRef.current);
      }
      if (completionTransitionTimeoutRef.current) {
        clearTimeout(completionTransitionTimeoutRef.current);
      }
      if (stabilizationTimeoutRef.current) {
        clearTimeout(stabilizationTimeoutRef.current);
      }
    };
  }, [
    rollKey,
    animationOrigin,
    dice,
    heldMaskBeforeComplete,
    useSCCDisplayOrder,
    sccHand,
  ]);

  // Handle "all held" transition: when turn completes, hide formerly-unheld dice quickly
  const allHeldNow = dice.length > 0 && dice.every(d => d.isHeld);
  useLayoutEffect(() => {
    if (allHeldNow && !prevAllHeldRef.current && !isAnimatingFlyIn) {
      setIsInCompletionTransition(true);
      setHideFormerlyUnheld(false);

      // Quick transition: 200ms for CSS + 100ms buffer = 300ms total
      completionTransitionTimeoutRef.current = scheduleTimeout(200, () => {
        setHideFormerlyUnheld(true);
        scheduleTimeout(100, () => {
          setIsInCompletionTransition(false);
        });
      });
    }
    prevAllHeldRef.current = allHeldNow;
  }, [allHeldNow, isAnimatingFlyIn, scheduleTimeout]);

  // Stabilization: when isComplete transition happens (all dice become held),
  // enter a brief stabilization period where we force-use cached dice to prevent flicker
  useLayoutEffect(() => {
    const isComplete = allHeldNow && !isAnimatingFlyIn;
    
    if (isComplete && !prevIsCompleteRef.current) {
      // Just became complete - start stabilization period
      setIsStabilizing(true);
      
      if (stabilizationTimeoutRef.current) {
        clearTimeout(stabilizationTimeoutRef.current);
      }
      
      // Hold stable state for 150ms to let parent components settle
      stabilizationTimeoutRef.current = window.setTimeout(() => {
        setIsStabilizing(false);
      }, 150);
    }
    
    prevIsCompleteRef.current = isComplete;
  }, [allHeldNow, isAnimatingFlyIn]);
  // Timeline: fly-in done → 50ms → layout flip → 200ms CSS → 300ms delay → hide unheld
  // Total: ~1750ms from roll start (1200ms fly-in + 550ms post)
  const handleAnimationComplete = useCallback(() => {
    if (animationCompleteTimeoutRef.current) {
      clearTimeout(animationCompleteTimeoutRef.current);
      animationCompleteTimeoutRef.current = null;
    }

    setAnimatingDiceIndices([]);

    // Quick flip to held layout
    scheduleTimeout(50, () => {
      setIsAnimatingFlyIn(false);

      // After held dice CSS transition (200ms), wait 300ms then hide unheld
      animationCompleteTimeoutRef.current = scheduleTimeout(200 + 300, () => {
        setShowUnheldDice(false);
      });
    });
  }, [scheduleTimeout]);
  
  // If showing "You are rolling" message, render that instead of dice
  if (showRollingMessage) {
    return (
      <div className="relative flex items-center justify-center" style={{ width: '200px', height: '120px' }}>
        <div className="text-center">
          <p className="text-lg font-semibold text-amber-200/90 animate-pulse">
            You are rolling
          </p>
        </div>
      </div>
    );
  }
  
  // Get die dimensions based on size (reduced for less overlap)
  // TABLET: Larger container and adjusted positions with more spacing to prevent overlap
  const dieSizes = {
    sm: isTablet ? 56 : 36,
    md: isTablet ? 68 : 48,
    lg: isTablet ? 92 : 72,
  };
  const dieWidth = dieSizes[effectiveSize];
  // TABLET: Pack held dice as tightly as possible (user requested near-zero padding)
  const gap = isTablet ? 0 : 6;
  
  // For SCC games, use display order if available
  let orderedDice: { die: HorsesDieType | SCCDieType; originalIndex: number }[] = [];
  
  // Determine which dice source to use - prefer current if valid, fallback to cached
  // During stabilization period, ALWAYS use cached dice to prevent flicker
  const hasValidCurrentDice = dice.length > 0 && dice.some(d => d.value > 0);
  const effectiveDice = isStabilizing 
    ? lastValidDiceRef.current 
    : (hasValidCurrentDice ? dice : lastValidDiceRef.current);
  
  // Update cache when we have valid dice (but not during stabilization)
  if (hasValidCurrentDice && !isStabilizing) {
    lastValidDiceRef.current = dice;
  }
  
  if (useSCCDisplayOrder && sccHand) {
    orderedDice = getSCCDisplayOrder(sccHand).map(({ die, originalIndex }) => ({
      die: die as SCCDieType,
      originalIndex,
    }));
  } else {
    orderedDice = effectiveDice.map((die, i) => ({ die, originalIndex: i }));
  }
  
  // Filter out unrolled dice if hideUnrolledDice is true
  if (hideUnrolledDice) {
    orderedDice = orderedDice.filter(d => d.die.value !== 0);
  }
  
  // If no dice to show, return empty container
  // CRITICAL: This should rarely happen now due to lastValidDiceRef caching
  if (orderedDice.length === 0) {
    console.warn('[DiceTableLayout] Empty orderedDice - this may cause visual flicker');
    return <div className="relative" style={{ width: '200px', height: '120px' }} />;
  }
  
  // Separate held and unheld dice
  const heldDice = orderedDice.filter(d => d.die.isHeld);
  const unheldDice = orderedDice.filter(d => !d.die.isHeld);
  
  const heldCount = heldDice.length;
  const unheldCount = unheldDice.length;
  
  // Special case: all visible dice are held (player's turn is complete)
  // Layout should freeze to exactly what it was at the START of the final roll:
  // - dice that were already held stay in the held row
  // - dice that were not held stay in scatter positions (but show held styling)
  // NOTE: Check if ALL orderedDice are held, not just if there are 5 held.
  // This handles cases where hideUnrolledDice filtered some out.
  const allHeld = orderedDice.length > 0 && orderedDice.every(d => d.die.isHeld);

  const hasValidHeldMask =
    Array.isArray(heldMaskBeforeComplete) &&
    heldMaskBeforeComplete.length >= dice.length;

  // CRITICAL: Don't early-return if we're currently animating - let animation run first
  if (allHeld && hasValidHeldMask && !isAnimatingFlyIn) {
    const wasHeld = (originalIndex: number) => !!heldMaskBeforeComplete?.[originalIndex];

    const heldAtStartOfFinalRoll = orderedDice.filter((d) => wasHeld(d.originalIndex));
    const unheldAtStartOfFinalRoll = orderedDice.filter((d) => !wasHeld(d.originalIndex));

    const heldPositions = getHeldPositions(heldAtStartOfFinalRoll.length, dieWidth, gap);
    
    // Position unheld dice based on COUNT (not original index)
    // TABLET: Scale positions by 1.6x to prevent overlap with larger dice
    const getUnheldPos = (displayIndex: number, totalUnheld: number) => {
      const positions = UNHELD_POSITIONS[totalUnheld] || UNHELD_POSITIONS[5];
      const basePos = positions[displayIndex] || { x: 0, y: 0, rotate: 0 };
      if (isTablet) {
        return {
          x: basePos.x * 1.6,
          y: basePos.y * 1.5,
          rotate: basePos.rotate
        };
      }
      return basePos;
    };

    const heldYOffset = -35;
    // Keep scatter dice vertically separated from the held row (matches normal layout)
    const scatterYOffset = 50;

    return (
      <div className="relative" style={{ width: isTablet ? '360px' : '200px', height: isTablet ? '220px' : '120px' }}>
        {/* Dice that were held before the final roll started */}
        {heldAtStartOfFinalRoll.map((item, displayIdx) => {
          const pos = heldPositions[displayIdx];
          if (!pos) return null;

          const sccDie = item.die as SCCDieType;
          const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;

          return (
            <div
              key={`held-${item.originalIndex}`}
              className="absolute transition-all duration-300 ease-out"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`,
              }}
            >
              <HorsesDie
                value={item.die.value}
                isHeld={true}
                isRolling={false}
                canToggle={false}
                onToggle={() => onToggleHold?.(item.originalIndex)}
                size={effectiveSize}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
                isUnusedDie={isDieUnused(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
                isCargoDie={isCargoDie(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
              />
            </div>
          );
        })}

        {/* Dice that were NOT held when the final roll started - use count-based positions */}
        {unheldAtStartOfFinalRoll.map((item, displayIdx) => {
          // Use position based on count of unheld dice (matches animation landing)
          const pos = getUnheldPos(displayIdx, unheldAtStartOfFinalRoll.length);

          const sccDie = item.die as SCCDieType;
          const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;

          return (
            <div
              key={`scatter-held-${item.originalIndex}`}
              className="absolute transition-all duration-300 ease-out"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + scatterYOffset}px)) rotate(${pos.rotate}deg)`,
              }}
            >
              <HorsesDie
                value={item.die.value}
                isHeld={true}
                isRolling={false}
                canToggle={false}
                onToggle={() => onToggleHold?.(item.originalIndex)}
                size={effectiveSize}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
                isUnusedDie={isDieUnused(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
                isCargoDie={isCargoDie(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
              />
            </div>
          );
        })}
      </div>
    );
  }

  // Legacy fallback: we know only "how many" were held (not which ones).
  // For a clean final layout, show ALL dice in a horizontal held row.
  // CRITICAL: Don't early-return if we're currently animating
  if (allHeld && previouslyHeldCount !== undefined && !isAnimatingFlyIn) {
    const actualDiceCount = orderedDice.length;
    const heldPositions = getHeldPositions(actualDiceCount, dieWidth, gap);
    const heldYOffset = -35;

    return (
      <div className="relative" style={{ width: '200px', height: '120px' }}>
        {orderedDice.map((item, displayIdx) => {
          const pos = heldPositions[displayIdx];
          if (!pos) return null;

          const sccDie = item.die as SCCDieType;
          const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;

          return (
            <div
              key={`held-${item.originalIndex}`}
              className="absolute transition-all duration-300 ease-out"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`,
              }}
            >
              <HorsesDie
                value={item.die.value}
                isHeld={true}
                isRolling={false}
                canToggle={false}
                onToggle={() => onToggleHold?.(item.originalIndex)}
                size={effectiveSize}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
                isUnusedDie={isDieUnused(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
                isCargoDie={isCargoDie(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
              />
            </div>
          );
        })}
      </div>
    );
  }
  
  // Fallback for all held without previouslyHeldCount or heldMaskBeforeComplete:
  // This happens when turn completes but we don't know which dice were held before.
  // In Horses, we should show ALL dice in a neat horizontal held row (not scattered)
  // so the final layout is consistent and clean.
  // CRITICAL: Don't early-return if we're currently animating
  if (allHeld && !isAnimatingFlyIn) {
    // Show all dice in a neat horizontal held row (consistent final state)
    const actualDiceCount = orderedDice.length;
    const heldPositions = getHeldPositions(actualDiceCount, dieWidth, gap);
    const heldYOffset = -35;

    return (
      <div className="relative" style={{ width: '200px', height: '120px' }}>
        {orderedDice.map((item, displayIdx) => {
          const pos = heldPositions[displayIdx];
          if (!pos) return null;

          const sccDie = item.die as SCCDieType;
          const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;

          return (
            <div
              key={`die-${item.originalIndex}`}
              className="absolute transition-all duration-300 ease-out"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`,
              }}
            >
              <HorsesDie
                value={item.die.value}
                isHeld={true}
                isRolling={false}
                canToggle={false}
                onToggle={() => onToggleHold?.(item.originalIndex)}
                size={effectiveSize}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
                isUnusedDie={isDieUnused(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
                isCargoDie={isCargoDie(item.die, isSCC, isQualified, true, orderedDice.map(d => d.die))}
              />
            </div>
          );
        })}
      </div>
    );
  }
  
  // CRITICAL: During fly-in animation, use the held mask from BEFORE the roll to determine positions.
  // This prevents dice from jumping to held positions before the animation lands.
  // After animation completes, dice will transition to their correct (new) positions.
  const usePreRollLayout = isAnimatingFlyIn && Array.isArray(heldMaskBeforeComplete) && heldMaskBeforeComplete.length >= dice.length;
  // Keep unheld dice lower than the held row to avoid overlap
  const unheldYOffset = 50;
  
  // Get positions based on COUNT of unheld dice (not originalIndex)
  // Each roll, dice get new positions based on how many are being rolled
  // TABLET: Scale positions by 1.6x to prevent overlap with larger dice
  const getUnheldPosition = (displayIndex: number, totalUnheld: number) => {
    const positions = UNHELD_POSITIONS[totalUnheld] || UNHELD_POSITIONS[5];
    const basePos = positions[displayIndex] || { x: 0, y: 0, rotate: 0 };
    // For tablets, spread positions further apart to prevent overlap
    if (isTablet) {
      return {
        x: basePos.x * 1.6,
        y: basePos.y * 1.5,
        rotate: basePos.rotate
      };
    }
    return basePos;
  };
  
  // Held dice go at the top (tighter to pot)
  const heldYOffset = -35;
  
  // Calculate which dice should render where
  let layoutHeldDice: typeof orderedDice;
  let layoutUnheldDice: typeof orderedDice;
  
  if (usePreRollLayout) {
    // During animation: use the pre-roll held state for layout
    layoutHeldDice = orderedDice.filter((d) => !!heldMaskBeforeComplete?.[d.originalIndex]);
    layoutUnheldDice = orderedDice.filter((d) => !heldMaskBeforeComplete?.[d.originalIndex]);
  } else {
    // Normal: use actual isHeld state
    layoutHeldDice = heldDice;
    layoutUnheldDice = unheldDice;
  }
  
  const heldPositions = getHeldPositions(layoutHeldDice.length, dieWidth, gap);

  // Build quick lookup maps so a die can smoothly transition between scatter and held row
  const heldPositionByOriginalIndex = new Map<number, { x: number; y: number }>();
  layoutHeldDice.forEach((item, displayIdx) => {
    const pos = heldPositions[displayIdx];
    if (pos) heldPositionByOriginalIndex.set(item.originalIndex, pos);
  });

  return (
    <div className="relative" style={{ width: isTablet ? "360px" : "200px", height: isTablet ? "220px" : "120px" }}>
      {/* Fly-in animation overlay for unheld dice */}
      {isAnimatingFlyIn && animationOrigin && animatingDiceIndices.length > 0 && (
        <DiceRollAnimation
          key={`dice-roll-${String(rollKey ?? 'no-key')}`}
          dice={dice}
          animatingIndices={animatingDiceIndices}
          targetPositions={animatingDiceIndices.map((_, displayIdx) =>
            getUnheldPosition(displayIdx, animatingDiceIndices.length),
          )}
          originPosition={animationOrigin}
          onComplete={handleAnimationComplete}
          size={effectiveSize}
          isSCC={isSCC}
          scatterYOffset={unheldYOffset}
        />
      )}

      {/* Render each die once (stable key) so it can transition between scatter ↔ held row */}
      {orderedDice.map((item) => {
        const sccDie = item.die as SCCDieType;
        const isSCCDie = isSCC && "isSCC" in sccDie && sccDie.isSCC;

        // Don't render this die at all if it's currently animating in (prevents double render)
        const isThisDieAnimating = isAnimatingFlyIn && animatingDiceIndices.includes(item.originalIndex);
        if (isThisDieAnimating) return null;

        const heldPos = heldPositionByOriginalIndex.get(item.originalIndex);
        const isHeldInLayout = !!heldPos;

        // Prefer stable, per-roll positions (prevents re-scatter when holds change mid-roll)
        const stablePos =
          stableScatterRollKeyRef.current === rollKey
            ? stableScatterByDieRef.current.get(item.originalIndex)
            : undefined;

        // For scatter positions, we need the die's index among *layoutUnheldDice*
        const unheldDisplayIdx = layoutUnheldDice.findIndex((d) => d.originalIndex === item.originalIndex);
        const scatterPos =
          stablePos ??
          (unheldDisplayIdx >= 0
            ? getUnheldPosition(unheldDisplayIdx, layoutUnheldDice.length)
            : getUnheldPosition(0, Math.max(1, layoutUnheldDice.length)));

        // Hide unheld dice when showUnheldDice is false (after 1s delay from held dice moving)
        const shouldHide = !isHeldInLayout && !showUnheldDice && !isAnimatingFlyIn;
        
        // Don't render unheld dice at all when they should be hidden
        if (shouldHide) return null;

        // CRITICAL: When all dice just became held (early lock-in), do NOT animate unheld→held transition.
        // Skip the transition by omitting transition classes for dice that just switched from unheld to held.
        const justBecameHeld = allHeld && !isAnimatingFlyIn && !isHeldInLayout;
        const shouldSkipTransition = justBecameHeld;

        const transform = isHeldInLayout
          ? `translate(calc(-50% + ${heldPos!.x}px), calc(-50% + ${heldPos!.y + heldYOffset}px))`
          : `translate(calc(-50% + ${scatterPos.x}px), calc(-50% + ${scatterPos.y + unheldYOffset}px)) rotate(${scatterPos.rotate}deg)`;

        return (
          <div
            key={`die-${item.originalIndex}`}
            className={cn("absolute", !shouldSkipTransition && "transition-all duration-300 ease-out")}
            style={{
              left: "50%",
              top: "50%",
              transform,
              pointerEvents: "auto",
              zIndex: isHeldInLayout ? 2 : 1,
            }}
          >
            <HorsesDie
              value={item.die.value}
              isHeld={isHeldInLayout}
              isRolling={isRolling && !isHeldInLayout}
              canToggle={canToggle && !isObserver && !isSCC && !isAnimatingFlyIn && !isRolling}
              onToggle={() => onToggleHold?.(item.originalIndex)}
              size={effectiveSize}
              showWildHighlight={showWildHighlight && !isSCC}
              isSCCDie={isSCCDie}
              isUnusedDie={isDieUnused(item.die, isSCC, isQualified, allHeld, orderedDice.map(d => d.die))}
              isCargoDie={isCargoDie(item.die, isSCC, isQualified, allHeld, orderedDice.map(d => d.die))}
            />
          </div>
        );
      })}
    </div>
  );
}

// Calculate held dice positions (horizontal line, centered)
function getHeldPositions(count: number, dieWidth: number, gap: number): { x: number; y: number }[] {
  if (count === 0) return [];

  // Allow truly tight packing on tablet (gap can be 0 or negative for overlap).
  const tightGap = gap <= 0 ? -2 : Math.max(0, gap - 4);
  const totalWidth = count * dieWidth + (count - 1) * tightGap;
  const startX = -totalWidth / 2 + dieWidth / 2;

  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (dieWidth + tightGap),
    y: 0,
  }));
}
