import { useState, useLayoutEffect, useRef } from "react";
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
// IMPORTANT: positions are indexed by originalIndex slot, not display order
const UNHELD_POSITIONS_5: { x: number; y: number; rotate: number }[] = [
  { x: -48, y: -22, rotate: -15 },  // position 0
  { x: 52, y: -18, rotate: 12 },    // position 1
  { x: 3, y: 8, rotate: 5 },        // position 2
  { x: -45, y: 38, rotate: -8 },    // position 3
  { x: 48, y: 42, rotate: 11 },     // position 4
];

// Legacy lookup for older code paths that don't use stable positions
const UNHELD_POSITIONS: Record<number, { x: number; y: number; rotate: number }[]> = {
  // 5 unheld dice - rough pentagon using corners + center
  5: [
    { x: -48, y: -22, rotate: -15 },  // upper-left area
    { x: 52, y: -18, rotate: 12 },    // upper-right area
    { x: 3, y: 8, rotate: 5 },        // center-ish
    { x: -45, y: 38, rotate: -8 },    // lower-left corner
    { x: 48, y: 42, rotate: 11 },     // lower-right corner
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
  
  // Track whether unheld dice should be visible (they disappear after animation lands until next roll)
  // Unheld dice are only visible during the fly-in animation landing
  const [showUnheldDice, setShowUnheldDice] = useState(true);
  
  // Detect when a new roll starts (rollKey changes) and trigger fly-in animation
  // NOTE: useLayoutEffect prevents a 1-frame flash where dice render in-place before we hide them.
  useLayoutEffect(() => {
    if (rollKey !== undefined && rollKey !== prevRollKeyRef.current && animationOrigin) {
      prevRollKeyRef.current = rollKey;

      // Find which dice were unheld at the START of the roll (these should animate in)
      // IMPORTANT: use heldMaskBeforeComplete when available so SCC "auto-hold" dice
      // still animate if they weren't held pre-roll.
      const heldMask = Array.isArray(heldMaskBeforeComplete) ? heldMaskBeforeComplete : null;
      const unheldIndices = dice
        .map((d, i) => ({ d, i }))
        .filter(({ d, i }) => {
          const wasHeldAtRollStart = heldMask ? !!heldMask[i] : !!d.isHeld;
          return !wasHeldAtRollStart && d.value !== 0;
        })
        .map(({ i }) => i);

      if (unheldIndices.length > 0) {
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
    };
  }, [rollKey, animationOrigin, dice, heldMaskBeforeComplete]);
  
  // Handle animation complete - unheld dice will fade out after a brief moment
  const handleAnimationComplete = () => {
    setIsAnimatingFlyIn(false);
    setAnimatingDiceIndices([]);
    // After animation lands, hide unheld dice (they'll reappear on next roll)
    // Brief delay so user sees where they landed before they disappear
    animationCompleteTimeoutRef.current = window.setTimeout(() => {
      setShowUnheldDice(false);
    }, 400);
  };
  
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
  
  if (useSCCDisplayOrder && sccHand) {
    orderedDice = getSCCDisplayOrder(sccHand).map(({ die, originalIndex }) => ({
      die: die as SCCDieType,
      originalIndex,
    }));
  } else {
    orderedDice = dice.map((die, i) => ({ die, originalIndex: i }));
  }
  
  // Filter out unrolled dice if hideUnrolledDice is true
  if (hideUnrolledDice) {
    orderedDice = orderedDice.filter(d => d.die.value !== 0);
  }
  
  // If no dice to show, return empty container
  if (orderedDice.length === 0) {
    return <div className="relative" style={{ width: '200px', height: '120px' }} />;
  }
  
  // Separate held and unheld dice
  const heldDice = orderedDice.filter(d => d.die.isHeld);
  const unheldDice = orderedDice.filter(d => !d.die.isHeld);
  
  const heldCount = heldDice.length;
  const unheldCount = unheldDice.length;
  
  // Special case: all 5 dice held (player's turn is complete)
  // Layout should freeze to exactly what it was at the START of the final roll:
  // - dice that were already held stay in the held row
  // - dice that were not held stay in scatter positions (but show held styling)
  const allHeld = heldCount === 5;

  const hasValidHeldMask =
    Array.isArray(heldMaskBeforeComplete) &&
    heldMaskBeforeComplete.length >= dice.length;

  // CRITICAL: Don't early-return if we're currently animating - let animation run first
  if (allHeld && hasValidHeldMask && !isAnimatingFlyIn) {
    const wasHeld = (originalIndex: number) => !!heldMaskBeforeComplete?.[originalIndex];

    const heldAtStartOfFinalRoll = orderedDice.filter((d) => wasHeld(d.originalIndex));
    const unheldAtStartOfFinalRoll = orderedDice.filter((d) => !wasHeld(d.originalIndex));

    const heldPositions = getHeldPositions(heldAtStartOfFinalRoll.length, dieWidth, gap);
    
    // Use STABLE positions based on originalIndex (same as animation)
    const getStablePos = (originalIndex: number) => UNHELD_POSITIONS_5[originalIndex] || { x: 0, y: 0, rotate: 0 };

    const heldYOffset = -35;
    // CRITICAL: Must match the CONSTANT unheldYOffset used in normal path (35)
    const scatterYOffset = 35;

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

        {/* Dice that were NOT held when the final roll started - use STABLE positions by originalIndex */}
        {unheldAtStartOfFinalRoll.map((item) => {
          // Use stable position based on originalIndex (matches animation landing)
          const pos = getStablePos(item.originalIndex);

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

  // Legacy fallback: we know only "how many" were held (not which ones). Use stable positions.
  // CRITICAL: Don't early-return if we're currently animating
  if (allHeld && previouslyHeldCount !== undefined && !isAnimatingFlyIn) {
    const prevHeldCount = Math.min(previouslyHeldCount, 5);

    const diceInHeldRow = orderedDice.slice(0, prevHeldCount);
    const diceInScatter = orderedDice.slice(prevHeldCount);

    const heldPositions = getHeldPositions(prevHeldCount, dieWidth, gap);
    
    // Use STABLE positions based on originalIndex
    const getStablePos = (originalIndex: number) => UNHELD_POSITIONS_5[originalIndex] || { x: 0, y: 0, rotate: 0 };

    const heldYOffset = -35;
    // CRITICAL: Must match the CONSTANT unheldYOffset used in normal path (35)
    const scatterYOffset = 35;

    return (
      <div className="relative" style={{ width: '200px', height: '120px' }}>
        {diceInHeldRow.map((item, displayIdx) => {
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

        {diceInScatter.map((item) => {
          // Use stable position based on originalIndex
          const pos = getStablePos(item.originalIndex);

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
  
  // Fallback for all held without previouslyHeldCount: show all in scatter using stable positions
  // CRITICAL: Don't early-return if we're currently animating
  if (allHeld && !isAnimatingFlyIn) {
    // Use STABLE positions based on originalIndex
    const getStablePos = (originalIndex: number) => UNHELD_POSITIONS_5[originalIndex] || { x: 0, y: 0, rotate: 0 };
    // CRITICAL: Must match the CONSTANT unheldYOffset used in normal path (35)
    const yOffset = 35;
    
    return (
      <div className="relative" style={{ width: '200px', height: '120px' }}>
        {orderedDice.map((item) => {
          const pos = getStablePos(item.originalIndex);
          
          const sccDie = item.die as SCCDieType;
          const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;
          
          return (
            <div
              key={`die-${item.originalIndex}`}
              className="absolute transition-all duration-300 ease-out"
              style={{
                left: '50%',
                top: '50%',
                transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + yOffset}px)) rotate(${pos.rotate}deg)`,
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
  
  // CRITICAL: Use a CONSTANT Y offset for unheld dice so they NEVER shift
  // when held count changes. This keeps dice in stable positions across rolls.
  // Value of 35 balances well between held row (at -35) and bottom of container.
  const unheldYOffset = 35;
  
  // Get stable positions for ALL dice based on their original indices
  // Each die keeps its assigned position regardless of hold state changes
  const getStableUnheldPosition = (originalIndex: number) => {
    return UNHELD_POSITIONS_5[originalIndex] || { x: 0, y: 0, rotate: 0 };
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
  
  return (
    <div className="relative" style={{ width: '200px', height: '120px' }}>
      {/* Held dice - horizontal line */}
      {layoutHeldDice.map((item, displayIdx) => {
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
              canToggle={canToggle && !isObserver && !isAnimatingFlyIn && !isRolling}
              onToggle={() => onToggleHold?.(item.originalIndex)}
              size={size}
              showWildHighlight={showWildHighlight && !isSCC}
              isSCCDie={isSCCDie}
            />
          </div>
        );
      })}
      
      {/* Fly-in animation for unheld dice - uses STABLE positions based on originalIndex */}
      {isAnimatingFlyIn && animationOrigin && (
        <DiceRollAnimation
          dice={dice}
          animatingIndices={animatingDiceIndices}
          targetPositions={animatingDiceIndices.map((origIdx) => getStableUnheldPosition(origIdx))}
          originPosition={animationOrigin}
          onComplete={handleAnimationComplete}
          size={size}
          isSCC={isSCC}
          scatterYOffset={unheldYOffset}
        />
      )}
      
      {/* Unheld dice - STABLE scatter positions based on originalIndex */}
      {/* They fade out after animation lands and stay hidden until next roll */}
      {layoutUnheldDice.map((item) => {
        // Use stable position based on originalIndex (die keeps its spot)
        const pos = getStableUnheldPosition(item.originalIndex);
        
        const sccDie = item.die as SCCDieType;
        const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;
        
        // Don't render this die at all if it's currently animating in
        // This prevents the "double render" where animation dice and static dice both show
        const isThisDieAnimating = isAnimatingFlyIn && animatingDiceIndices.includes(item.originalIndex);
        if (isThisDieAnimating) return null;
        
        // Fade out unheld dice when showUnheldDice is false
        const shouldFadeOut = !showUnheldDice && !isAnimatingFlyIn;
        
        return (
          <div
            key={`unheld-${item.originalIndex}`}
            className="absolute transition-all duration-300 ease-out"
            style={{
              left: '50%',
              top: '50%',
              transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + unheldYOffset}px)) rotate(${pos.rotate}deg)`,
              opacity: shouldFadeOut ? 0 : 1,
              pointerEvents: shouldFadeOut ? 'none' : 'auto',
            }}
          >
            <HorsesDie
              value={item.die.value}
              isHeld={item.die.isHeld}
              isRolling={false}
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
