import { useState, useLayoutEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { HorsesDie } from "./HorsesDie";
import { getSCCDisplayOrder, SCCHand, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { DiceRollAnimation } from "./DiceRollAnimation";

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
}

// Staggered positions for unheld dice (as pixel offsets from center)
// Organic scatter pattern utilizing corners - not perfect geometric shapes
// NOTE: These are indexed by "number of unheld dice" (not original index).

// Legacy lookup for older code paths that don't use stable positions
const UNHELD_POSITIONS: Record<number, { x: number; y: number; rotate: number }[]> = {
  // 5 unheld dice - rough pentagon using corners + center
  // NOTE: Y positions shifted down so initial roll lands lower, matching where dice stay when 1+ are held
  5: [
    { x: -48, y: 8, rotate: -15 },    // upper-left area (was -22)
    { x: 52, y: 12, rotate: 12 },     // upper-right area (was -18)
    { x: 3, y: 38, rotate: 5 },       // center-ish (was 8)
    { x: -45, y: 68, rotate: -8 },    // lower-left corner (was 38)
    { x: 48, y: 72, rotate: 11 },     // lower-right corner (was 42)
  ],
  // 4 unheld dice - rough rectangle using corners
  4: [
    { x: -44, y: -15, rotate: -12 },  // upper-left
    { x: 50, y: -10, rotate: 14 },    // upper-right
    { x: -48, y: 35, rotate: -6 },    // lower-left
    { x: 45, y: 40, rotate: 9 },      // lower-right
  ],
  // 3 unheld dice - loose triangle (bottom corners + top center)
  3: [
    { x: 5, y: -18, rotate: 8 },      // top center-ish
    { x: -42, y: 35, rotate: -10 },   // lower-left
    { x: 46, y: 38, rotate: 6 },      // lower-right
  ],
  // 2 unheld dice - rough diagonal
  2: [
    { x: -38, y: 8, rotate: -7 },     // left-ish
    { x: 42, y: 18, rotate: 10 },     // right-ish lower
  ],
  // 1 unheld die - slightly off-center with tilt
  1: [
    { x: 5, y: 12, rotate: -4 },
  ],
  // 0 unheld dice - empty
  0: [],
};

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
}: DiceTableLayoutProps) {
  const isSCC = gameType === 'ship-captain-crew';
  
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
        nextStable.set(dieIndex, positions[displayIdx] || { x: 0, y: 0, rotate: 0 });
      });
      stableScatterByDieRef.current = nextStable;

      // Trigger fly-in animation if we have an origin.
      if (animationOrigin && unheldIndices.length > 0) {
        setAnimatingDiceIndices(unheldIndices);
        setIsAnimatingFlyIn(true);
        // Show unheld dice when animation starts (they'll animate in)
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
    };
  }, [
    rollKey,
    animationOrigin,
    dice,
    heldMaskBeforeComplete,
    useSCCDisplayOrder,
    sccHand,
  ]);

  // Handle "all held" transition: when turn completes, delay hiding formerly-unheld dice
  // Use raw `dice` prop here since orderedDice isn't defined yet
  const allHeldNow = dice.length > 0 && dice.every(d => d.isHeld);
  useLayoutEffect(() => {
    if (allHeldNow && !prevAllHeldRef.current && !isAnimatingFlyIn) {
      // Just transitioned to all-held state - start completion transition
      setIsInCompletionTransition(true);
      setHideFormerlyUnheld(false);
      
      // After held dice animate to row (300ms CSS), wait, then hide formerly-unheld dice
      completionTransitionTimeoutRef.current = window.setTimeout(() => {
        setHideFormerlyUnheld(true);
        setTimeout(() => {
          setIsInCompletionTransition(false);
        }, 400);
      }, 600);
    }
    prevAllHeldRef.current = allHeldNow;
  }, [allHeldNow, isAnimatingFlyIn]);

  // Handle animation complete - unheld dice will fade out AFTER held dice finish moving
  // CRITICAL TIMING for Horses to match SCC:
  // 1. Animation lands → setAnimatingDiceIndices([]) (overlay gone, static dice visible)
  // 2. Wait 300ms → setIsAnimatingFlyIn(false) (layout flips: newly-held dice transition to held row via CSS)
  // 3. Wait 600ms → (held dice CSS transition complete, user sees final layout)
  // 4. Wait 800ms → setShowUnheldDice(false) (unheld dice fade out)
  const handleAnimationComplete = useCallback(() => {
    // If this gets called twice for any reason, don't stack timers.
    if (animationCompleteTimeoutRef.current) {
      clearTimeout(animationCompleteTimeoutRef.current);
      animationCompleteTimeoutRef.current = null;
    }

    // Step 1: Stop rendering the DiceRollAnimation overlay (static dice now visible in pre-roll layout)
    setAnimatingDiceIndices([]);

    // Step 2: After a short pause, flip the layout so held dice animate to their row
    window.setTimeout(() => {
      setIsAnimatingFlyIn(false);

      // Step 3 & 4: After held dice have moved (CSS transition ~200ms), fade out unheld dice
      animationCompleteTimeoutRef.current = window.setTimeout(() => {
        setShowUnheldDice(false);
      }, 150);
    }, 150);
  }, []);
  
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
  const dieSizes = {
    sm: 36,
    md: 48,
    lg: 72,
  };
  const dieWidth = dieSizes[size];
  const gap = 6;
  
  // For SCC games, use display order if available
  let orderedDice: { die: HorsesDieType | SCCDieType; originalIndex: number }[] = [];
  
  // Determine which dice source to use - prefer current if valid, fallback to cached
  const hasValidCurrentDice = dice.length > 0 && dice.some(d => d.value > 0);
  const effectiveDice = hasValidCurrentDice ? dice : lastValidDiceRef.current;
  
  // Update cache when we have valid dice
  if (hasValidCurrentDice) {
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
    const getUnheldPos = (displayIndex: number, totalUnheld: number) => {
      const positions = UNHELD_POSITIONS[totalUnheld] || UNHELD_POSITIONS[5];
      return positions[displayIndex] || { x: 0, y: 0, rotate: 0 };
    };

    const heldYOffset = -35;
    // No Y offset needed - UNHELD_POSITIONS for 5 dice already lands at final position
    const scatterYOffset = 0;

    return (
      <div className="relative" style={{ width: '200px', height: '120px' }}>
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
                size={size}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
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
                size={size}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
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
                size={size}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
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
                size={size}
                showWildHighlight={showWildHighlight && !isSCC}
                isSCCDie={isSCCDie}
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
  
  // No Y offset needed - UNHELD_POSITIONS for 5 dice already lands at final position
  const unheldYOffset = 0;
  
  // Get positions based on COUNT of unheld dice (not originalIndex)
  // Each roll, dice get new positions based on how many are being rolled
  const getUnheldPosition = (displayIndex: number, totalUnheld: number) => {
    const positions = UNHELD_POSITIONS[totalUnheld] || UNHELD_POSITIONS[5];
    return positions[displayIndex] || { x: 0, y: 0, rotate: 0 };
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
    <div className="relative" style={{ width: "200px", height: "120px" }}>
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
          size={size}
          isSCC={isSCC}
          scatterYOffset={0}
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

        // Fade out unheld dice when showUnheldDice is false (but never fade held dice)
        const shouldFadeOut = !isHeldInLayout && !showUnheldDice && !isAnimatingFlyIn;

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
              opacity: shouldFadeOut ? 0 : 1,
              pointerEvents: shouldFadeOut ? "none" : "auto",
              zIndex: isHeldInLayout ? 2 : 1,
            }}
          >
            <HorsesDie
              value={item.die.value}
              isHeld={isHeldInLayout}
              isRolling={isRolling && !isHeldInLayout}
              canToggle={canToggle && !isObserver && !isSCC && !isAnimatingFlyIn && !isRolling}
              onToggle={() => onToggleHold?.(item.originalIndex)}
              size={size}
              showWildHighlight={showWildHighlight && !isSCC}
              isSCCDie={isSCCDie}
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
  
  const tightGap = Math.max(2, gap - 4);
  const totalWidth = count * dieWidth + (count - 1) * tightGap;
  const startX = -totalWidth / 2 + dieWidth / 2;
  
  return Array.from({ length: count }, (_, i) => ({
    x: startX + i * (dieWidth + tightGap),
    y: 0,
  }));
}
