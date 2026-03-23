import { useState, useLayoutEffect, useRef, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { HorsesDie } from "./HorsesDie";
import { getSCCDisplayOrder, SCCHand, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { DiceRollAnimation } from "./DiceRollAnimation";
import { useDeviceSize } from "@/hooks/useDeviceSize";
import { pushDiceTrace, isDiceTraceRecording } from "@/components/DiceTraceHUD";
import { isDiceSnapEnabled } from "@/lib/diceSnapshots/enabled";
import { recordDiceSnapFrame, DiceSnapSample } from "@/lib/diceSnapshots/recorder";

// Persist rollKey / fly-in consumption across DiceTableLayout remounts.
// MobileGameTable intentionally remounts DiceTableLayout when the dice "owner" changes,
// but other UI transitions can also cause remounts. Without persistence, the fly-in can refire
// for the same rollKey after a remount (the exact bug you captured).
const lastSeenRollKeyByCacheKey = new Map<string, string | number>();
const lastFlyInRollKeyByCacheKey = new Map<string, string | number>();

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
  /**
   * Stable identity for the *owner* of these dice (usually the currentTurnPlayerId).
   * When this changes, DiceTableLayout will clear its internal anti-flicker caches so it never
   * shows the previous player's dice values during turn transitions.
   */
  cacheKey?: string | number;
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
  // 3 unheld dice - triangle with better spacing (lower to avoid overlap with held row)
  3: [
    { x: 0, y: 0, rotate: 8 },         // center top
    { x: -48, y: 40, rotate: -10 },    // lower-left (more spread)
    { x: 48, y: 42, rotate: 6 },       // lower-right (more spread)
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
  cacheKey,
}: DiceTableLayoutProps) {
  const isSCC = gameType === 'ship-captain-crew';
  const { isTablet } = useDeviceSize();
  
  // TABLET: Use larger dice size
  const effectiveSize = isTablet ? "lg" : size;
  
  // Track fly-in animation state
  const [isAnimatingFlyIn, setIsAnimatingFlyIn] = useState(false);
  const [animatingDiceIndices, setAnimatingDiceIndices] = useState<number[]>([]);
  const prevRollKeyRef = useRef<string | number | undefined>(undefined);
  const lastFlyInRollKeyRef = useRef<string | number | undefined>(undefined);
  const [flyInRunId, setFlyInRunId] = useState(0);
  const animationCompleteTimeoutRef = useRef<number | null>(null);

  // Stable scatter positions for the CURRENT rollKey.
  // This prevents unheld dice from jumping around when the active player toggles holds.
  const stableScatterRollKeyRef = useRef<string | number | undefined>(undefined);
  const stableScatterByDieRef = useRef<
    Map<number, { x: number; y: number; rotate: number }>
  >(new Map());
  const stableHeldRollKeyRef = useRef<string | number | undefined>(undefined);
  // Registry: Map<dieIndex, holdOrder> where holdOrder is a monotonically increasing counter.
  // This preserves the order in which dice were held, enabling stable ordering + dynamic recentering.
  const stableHeldSlotByDieRef = useRef<Map<number, number>>(new Map());
  const holdOrderCounterRef = useRef(0);
  const pendingReleaseCountRef = useRef<Map<number, number>>(new Map());
  const lastHeldTransformByDieRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Frozen presentation snapshot: captured at the moment all dice become held (lock-in / roll 3).
  // Each die's position is frozen exactly where it was, preventing any post-lock movement.
  const frozenPresentationRef = useRef<Map<number, string> | null>(null);
  const frozenForRollKeyRef = useRef<string | number | undefined>(undefined);
  const lastScatterTransformByDieRef = useRef<Map<number, { x: number; y: number; rotate: number }>>(new Map());
  const renderDecisionByDieRef = useRef<
    Map<
      number,
      {
        summary: string;
        data: Record<string, unknown>;
      }
    >
  >(new Map());

  // Track held count at the START of animation (so animation lands at correct Y offset)
  const [animationHeldCount, setAnimationHeldCount] = useState(0);

  // Track whether unheld dice should be visible
  // NOTE: Unheld dice should remain visible after landing; we only hide them during
  // the fly-in overlay to avoid double-rendering.
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

  // CRITICAL: When the dice "owner" changes (turn changes), clear internal caches immediately.
  // Without this, observer dice can momentarily reuse the previous player's dice as a fallback
  // when the next player hasn't rolled yet (all zeros / filtered), causing the exact flicker you reported.
  const prevCacheKeyRef = useRef<string | number | undefined>(cacheKey);
  useEffect(() => {
    if (cacheKey === prevCacheKeyRef.current) return;
    prevCacheKeyRef.current = cacheKey;

    // Cancel any pending timers from the previous owner
    if (animationCompleteTimeoutRef.current) {
      clearTimeout(animationCompleteTimeoutRef.current);
      animationCompleteTimeoutRef.current = null;
    }
    if (completionTransitionTimeoutRef.current) {
      clearTimeout(completionTransitionTimeoutRef.current);
      completionTransitionTimeoutRef.current = null;
    }
    if (stabilizationTimeoutRef.current) {
      clearTimeout(stabilizationTimeoutRef.current);
      stabilizationTimeoutRef.current = null;
    }

    // Reset cached dice + per-roll layout caches
    // IMPORTANT: On owner change, props can still briefly contain the *previous* player's dice.
    // If we seed lastValidDiceRef with that, the next roll may "land" using stale dice and then snap.
    // Instead, reset to a blank baseline; we'll repopulate once we see real (value>0) dice.
    lastValidDiceRef.current = Array.from({ length: dice.length || 5 }, () => ({
      value: 0,
      isHeld: false,
    })) as any;
    stableScatterRollKeyRef.current = undefined;
    stableScatterByDieRef.current = new Map();
    stableHeldRollKeyRef.current = undefined;
    stableHeldSlotByDieRef.current = new Map();
    holdOrderCounterRef.current = 0;
    pendingReleaseCountRef.current = new Map();
    lastHeldTransformByDieRef.current = new Map();
    lastScatterTransformByDieRef.current = new Map();
    frozenPresentationRef.current = null;
    frozenForRollKeyRef.current = undefined;

    // Seed roll-key refs to the CURRENT rollKey so we don't accidentally replay a fly-in
    // for an already-completed roll when cacheKey changes (e.g., post-turn hold UI).
    // The next real roll will change rollKey and trigger normally.
    prevRollKeyRef.current = rollKey;
    lastFlyInRollKeyRef.current = rollKey;

    // Reset transient animation/stabilization state
    setIsAnimatingFlyIn(false);
    setAnimatingDiceIndices([]);

    // Keep unheld dice visible on owner change. Hiding here caused unheld/scatter dice
    // to disappear permanently in contexts where animationOrigin isn't provided.
    setShowUnheldDice(true);

    setIsInCompletionTransition(false);
    setHideFormerlyUnheld(false);
    setIsStabilizing(false);
    prevAllHeldRef.current = false;
    prevIsCompleteRef.current = false;
  }, [cacheKey, dice]);

  // Stabilization period after roll 3 completes - hold the current visual state
  // to prevent flickering during the isComplete transition
  const [isStabilizing, setIsStabilizing] = useState(false);
  const stabilizationTimeoutRef = useRef<number | null>(null);
  const prevIsCompleteRef = useRef(false);
  
  // Ref to access the container DOM for position sampling
  const containerRef = useRef<HTMLDivElement>(null);
  const snapFrameSeq = useRef(0);
  
  // 50ms interval recording of die positions when ?diceSnap=1 is active
  useEffect(() => {
    if (!isDiceSnapEnabled()) return;
    
    const intervalId = window.setInterval(() => {
      const container = containerRef.current;
      if (!container) return;
      
      const containerRect = container.getBoundingClientRect();
      const dieEls = container.querySelectorAll<HTMLElement>('[data-die-idx]');
      if (dieEls.length === 0) return;
      
      const samples: DiceSnapSample[] = [];
      const frameSeq = ++snapFrameSeq.current;
      const tMs = Date.now();
      
      dieEls.forEach((el) => {
        const idxStr = el.getAttribute('data-die-idx');
        if (!idxStr) return;
        const dieIndex = parseInt(idxStr, 10);
        const rect = el.getBoundingClientRect();
        
        // Extract die state from data attributes
        const dieValue = parseInt(el.getAttribute('data-die-value') || '0', 10);
        const dieIsHeld = el.getAttribute('data-die-held') === 'true';
        const dieIsHeldInLayout = el.getAttribute('data-die-held-layout') === 'true';
        
        samples.push({
          t_ms: tMs,
          frame_seq: frameSeq,
          cache_key: cacheKey != null ? String(cacheKey) : null,
          roll_key: rollKey != null ? String(rollKey) : null,
          die_index: dieIndex,
          die_value: dieValue,
          die_is_held: dieIsHeld,
          die_is_held_in_layout: dieIsHeldInLayout,
          is_observer: isObserver,
          is_rolling: isRolling,
          is_animating_fly_in: isAnimatingFlyIn,
          x: rect.left - containerRect.left,
          y: rect.top - containerRect.top,
          w: rect.width,
          h: rect.height,
          container_w: containerRect.width,
          container_h: containerRect.height,
          extra: {
            showUnheldDice,
            allHeldNow: dice.every(d => d.isHeld),
            heldCount: dice.filter(d => d.isHeld).length,
          },
        });
      });
      
      if (samples.length > 0) {
        void recordDiceSnapFrame(samples);
      }
    }, 50);
    
    return () => window.clearInterval(intervalId);
  }, [cacheKey, rollKey, isObserver, isRolling, isAnimatingFlyIn, showUnheldDice, dice]);
  
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
    // While a fly-in is in progress, ignore prop churn (DB updates, hold toggles) to avoid refires/stutter.
    if (isAnimatingFlyIn) return;

    // Prevent "same rollKey" replays across remounts by persisting last-seen rollKey per cacheKey.
    const cacheKeyStr = String(cacheKey ?? "");
    const lastSeenGlobal = cacheKeyStr ? lastSeenRollKeyByCacheKey.get(cacheKeyStr) : undefined;

    const isNewRollKey =
      rollKey !== undefined &&
      rollKey !== prevRollKeyRef.current &&
      (lastSeenGlobal === undefined || rollKey !== lastSeenGlobal);
    if (!isNewRollKey) return;

    prevRollKeyRef.current = rollKey;
    if (cacheKeyStr) lastSeenRollKeyByCacheKey.set(cacheKeyStr, rollKey);

    stableHeldRollKeyRef.current = rollKey;
    // Preserve registry entries for dice that remain held across re-rolls.
    // This maintains stable hold order so held dice don't reshuffle after re-roll.
    const preservedRegistry = new Map<number, number>();
    stableHeldSlotByDieRef.current.forEach((holdOrder, dieIdx) => {
      const d = dice[dieIdx];
      if (d?.isHeld) {
        preservedRegistry.set(dieIdx, holdOrder);
      }
    });
    stableHeldSlotByDieRef.current = preservedRegistry;
    pendingReleaseCountRef.current = new Map();
    frozenPresentationRef.current = null;
    frozenForRollKeyRef.current = undefined;

    // Reset completion transition when a new roll starts
    setIsInCompletionTransition(false);
    setHideFormerlyUnheld(false);
    if (completionTransitionTimeoutRef.current) {
      clearTimeout(completionTransitionTimeoutRef.current);
      completionTransitionTimeoutRef.current = null;
    }

    const heldMask = Array.isArray(heldMaskBeforeComplete) ? heldMaskBeforeComplete : null;

    // Build an index order consistent with what we render (important for SCC).
    const orderedIndices =
      useSCCDisplayOrder && sccHand
        ? getSCCDisplayOrder(sccHand).map(({ originalIndex }) => originalIndex)
        : dice.map((_, i) => i);

    // Find which dice were unheld at the START of the roll.
    // IMPORTANT: do NOT require die.value !== 0 here.
    // Observers can receive rollKey before values propagate; we still want to start fly-in on time.
    const unheldIndices = orderedIndices.filter((i) => {
      const d = dice[i];
      if (!d) return false;

      // CRITICAL FIX for Roll 3 animation:
      // When heldMaskBeforeComplete is provided (from the roller), trust it EXCLUSIVELY.
      // The old OR logic (!!heldMask[i] || !!d.isHeld) broke Roll 3 because the game logic
      // auto-marks ALL dice as isHeld when rollsRemaining === 0. This caused unheldIndices
      // to be empty, skipping the fly-in animation entirely for observers.
      //
      // The mask is authoritative: it captures what was held at the START of the roll.
      // The current d.isHeld can already reflect post-roll state (all held on Roll 3).
      const wasHeldAtRollStart = heldMask ? !!heldMask[i] : !!d.isHeld;
      return !wasHeldAtRollStart;
    });

    // Track how many were held at the START of this roll (for Y offset calculation)
    const heldAtRollStart = heldMask
      ? orderedIndices.filter((i) => {
          const d = dice[i];
          return !!(heldMask[i] || d?.isHeld);
        }).length
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
    lastScatterTransformByDieRef.current = new Map(nextStable);

    // Trigger fly-in animation once per rollKey.
    // NOTE: animatingIndices can be identical between rolls (e.g., rolling all 5 dice twice),
    // so we use rollKey as the stable "new roll" signal.
    //
    // IMPORTANT:
    // - The active player's window should only fly-in during the rolling window (isRolling=true).
    // Trigger fly-in animation once per rollKey.
    // NOTE: animatingIndices can be identical between rolls (e.g., rolling all 5 dice twice),
    // so we use rollKey as the stable "new roll" signal.
    //
    // IMPORTANT:
    // - The active player's window should only fly-in during the rolling window (isRolling=true).
    // - Observers should still get the fly-in (but NEVER the rumble), so we allow fly-in when isObserver=true.
    // - Do NOT "consume" rollKey when fly-in didn't start; rollKey can arrive before isRolling flips true.
    // - CRITICAL: Do NOT block fly-in just because all dice are now held.
    //   The final roll auto-marks dice held (game logic) *before* the animation should run.
    const flyInWindowActive = !!isRolling || !!isObserver;

    // Prevent fly-in refires across remounts by persisting last "consumed" rollKey per cacheKey.
    const flyInCacheKeyStr = String(cacheKey ?? "");
    const lastFlyInGlobal = flyInCacheKeyStr ? lastFlyInRollKeyByCacheKey.get(flyInCacheKeyStr) : undefined;
    const effectiveLastFlyIn = lastFlyInGlobal ?? lastFlyInRollKeyRef.current;

    const shouldStartFlyIn =
      !!animationOrigin &&
      flyInWindowActive &&
      unheldIndices.length > 0 &&
      effectiveLastFlyIn !== rollKey;

    // TRACE: Fly-in decision point
    if (isDiceTraceRecording()) {
      pushDiceTrace("DiceTableLayout:flyIn", {
        rollKey,
        isRolling,
        cacheKey: String(cacheKey ?? ""),
        isAnimatingFlyIn,
        showUnheldDice,
        lastFlyInRollKey: effectiveLastFlyIn,
        extra: {
          flyInWindowActive,
          shouldStartFlyIn,
          unheldCount: unheldIndices.length,
          hasAnimationOrigin: !!animationOrigin,
          isObserver,
        },
      });
    }

    if (shouldStartFlyIn) {
      lastFlyInRollKeyRef.current = rollKey;
      if (flyInCacheKeyStr) lastFlyInRollKeyByCacheKey.set(flyInCacheKeyStr, rollKey);

      // Hide previously-rendered unheld dice while the fly-in animation runs.
      // They will be shown again when handleAnimationComplete fires.
      setShowUnheldDice(false);

      setAnimatingDiceIndices(unheldIndices);
      setIsAnimatingFlyIn(true);
      setFlyInRunId((v) => v + 1);

      // NOTE: Do NOT set showUnheldDice(true) here synchronously - React batches it and
      // the false state is never committed. The animation overlay renders the flying dice,
      // and handleAnimationComplete will restore showUnheldDice=true when done.
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
    isAnimatingFlyIn,
    isTablet,
    isRolling,
    isObserver,
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
  // Timeline: fly-in done → immediately flip layout → 200ms CSS → 300ms delay → hide unheld
  // CRITICAL FIX: Clear animation state atomically to prevent dice hopping during the gap
  const handleAnimationComplete = useCallback(() => {
    if (animationCompleteTimeoutRef.current) {
      clearTimeout(animationCompleteTimeoutRef.current);
      animationCompleteTimeoutRef.current = null;
    }

    // CRITICAL: Set both states together to prevent a gap where dice are neither animating
    // nor properly positioned. The 50ms delay was causing dice to briefly render at stale positions.
    setAnimatingDiceIndices([]);
    setIsAnimatingFlyIn(false);

    // Restore visibility of unheld dice now that animation has landed.
    // This was previously set to false when the animation started.
    setShowUnheldDice(true);
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
  const hasValidCurrentDice = dice.length > 0 && dice.some((d) => d.value > 0);

  // IMPORTANT: Only fall back to cached dice if we're in the middle of a roll/animation.
  // If rollKey is undefined (no roll has started for the current player yet), showing cached dice
  // can leak the previous player's final dice onto the felt during turn transitions.
  const canFallbackToCache = rollKey !== undefined || isRolling;
  const shouldFallbackToCache = !hasValidCurrentDice && canFallbackToCache;

  const effectiveDice = isStabilizing
    ? lastValidDiceRef.current
    : hasValidCurrentDice
      ? dice
      : shouldFallbackToCache
        ? lastValidDiceRef.current
        : dice;

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
  
  // Special case: all visible dice are held
  // This covers: turn completion (lock-in / roll 3), early lock-in (all held before committing),
  // and any other state where every die has isHeld=true.
  const allHeld = orderedDice.length > 0 && orderedDice.every(d => d.die.isHeld);

  // PRESENTATION FREEZE: When all dice become held, capture each die's current position
  // and freeze it. No recentering, no regrouping, no post-lock movement.
  if (allHeld && !isAnimatingFlyIn) {
    // Capture frozen positions ONCE per rollKey lock
    if (!frozenPresentationRef.current || frozenForRollKeyRef.current !== rollKey) {
      const frozenMap = new Map<number, string>();
      const heldYOffset = -35;
      const unheldYOffset = 50;

      orderedDice.forEach((item) => {
        // Check where this die was BEFORE the all-held transition:
        // 1. If it was in the held slot registry → use its held position
        // 2. If it was in scatter → use its scatter position
        // 3. Fallback to last known cached position
        const registryOrder = stableHeldSlotByDieRef.current.get(item.originalIndex);
        
        if (registryOrder !== undefined) {
          // Die was in held row — compute its position from registry order
          const entries = [...stableHeldSlotByDieRef.current.entries()].sort((a, b) => a[1] - b[1]);
          const registrySize = entries.length;
          const posIdx = entries.findIndex(([di]) => di === item.originalIndex);
          if (posIdx >= 0) {
            const positions = getHeldPositions(registrySize, dieWidth, gap);
            const pos = positions[posIdx];
            if (pos) {
              frozenMap.set(item.originalIndex,
                `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`);
              return;
            }
          }
        }

        // Die was in scatter — use last known scatter position
        const lastHeld = lastHeldTransformByDieRef.current.get(item.originalIndex);
        const stableScatter = stableScatterRollKeyRef.current === rollKey
          ? stableScatterByDieRef.current.get(item.originalIndex)
          : undefined;
        const lastScatter = lastScatterTransformByDieRef.current.get(item.originalIndex);
        const scatterPos = stableScatter ?? lastScatter;

        if (scatterPos) {
          frozenMap.set(item.originalIndex,
            `translate(calc(-50% + ${scatterPos.x}px), calc(-50% + ${scatterPos.y + unheldYOffset}px)) rotate(${scatterPos.rotate}deg)`);
        } else if (lastHeld) {
          frozenMap.set(item.originalIndex,
            `translate(calc(-50% + ${lastHeld.x}px), calc(-50% + ${lastHeld.y + heldYOffset}px))`);
        } else {
          // Ultimate fallback: compute held row position
          const actualDiceCount = orderedDice.length;
          const positions = getHeldPositions(actualDiceCount, dieWidth, gap);
          const idx = orderedDice.findIndex(d => d.originalIndex === item.originalIndex);
          const pos = positions[idx] || { x: 0, y: 0 };
          frozenMap.set(item.originalIndex,
            `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`);
        }
      });

      frozenPresentationRef.current = frozenMap;
      frozenForRollKeyRef.current = rollKey;
    }

    return (
      <div ref={containerRef} className="relative" style={{ width: isTablet ? '360px' : '200px', height: isTablet ? '220px' : '120px' }}>
        {orderedDice.map((item) => {
          const frozenTransform = frozenPresentationRef.current?.get(item.originalIndex);
          if (!frozenTransform) return null;

          const sccDie = item.die as SCCDieType;
          const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;

          return (
            <div
              key={`die-${item.originalIndex}`}
              data-die-idx={item.originalIndex}
              data-die-value={item.die.value}
              data-die-held={true}
              data-die-held-layout={true}
              className="absolute will-change-transform"
              style={{
                left: '50%',
                top: '50%',
                transform: frozenTransform,
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
  // (stableHeldPositions removed — positions now computed dynamically by getStableHeldPos)

  const scatterLayoutByOriginalIndex = new Map<number, { x: number; y: number; rotate: number }>();
  layoutUnheldDice.forEach((item, displayIdx) => {
    scatterLayoutByOriginalIndex.set(
      item.originalIndex,
      getUnheldPosition(displayIdx, layoutUnheldDice.length),
    );
  });

  // Build quick lookup maps so a die can smoothly transition between scatter and held row
  // CRITICAL FIX for Issue #2: Include ALL currently-held dice in the position map, not just layout dice.
  // This ensures that dice which were held BEFORE the roll (and remain held) always have a valid
  // held position during animation, preventing them from flashing to scatter positions.
  const heldPositionByOriginalIndex = new Map<number, { x: number; y: number }>();
  layoutHeldDice.forEach((item, displayIdx) => {
    const pos = heldPositions[displayIdx];
    if (pos) heldPositionByOriginalIndex.set(item.originalIndex, pos);
  });
  
  // Additionally, ensure dice that are actually held (by current isHeld state) also have positions
  // This prevents held dice from reverting to scatter when heldMaskBeforeComplete differs from actual state
  if (!usePreRollLayout) {
    // Not in animation - already handled above
  } else {
    // During animation: also compute positions for dice that are ACTUALLY held now (not just pre-roll held)
    // so they don't flash to scatter positions if they were held before the roll started
    const actualHeldDice = orderedDice.filter((d) => d.die.isHeld);
    const actualHeldPositions = getHeldPositions(actualHeldDice.length, dieWidth, gap);
    actualHeldDice.forEach((item, displayIdx) => {
      // Only add if not already in the map (pre-roll held dice take precedence for their positions)
      if (!heldPositionByOriginalIndex.has(item.originalIndex)) {
        const pos = actualHeldPositions[displayIdx];
        if (pos) heldPositionByOriginalIndex.set(item.originalIndex, pos);
      }
    });
  }

  if (stableHeldRollKeyRef.current !== rollKey) {
    stableHeldRollKeyRef.current = rollKey;
    // Preserve registry for dice that remain held (same as fly-in path)
    const preservedRegistry = new Map<number, number>();
    stableHeldSlotByDieRef.current.forEach((holdOrder, dieIdx) => {
      const d = dice[dieIdx];
      if (d?.isHeld) {
        preservedRegistry.set(dieIdx, holdOrder);
      }
    });
    stableHeldSlotByDieRef.current = preservedRegistry;
    pendingReleaseCountRef.current = new Map();
  }

  // --- AUTHORITATIVE HELD ORDER REGISTRY ---
  // Tracks the order in which dice were held (monotonic counter).
  // Used for BOTH roller and observer to provide:
  // 1. Stable hold order (dice don't reshuffle)
  // 2. Dynamic recentering (positions computed from current registry size)
  // 3. Preservation across re-rolls (held dice keep their order)
  if (rollKey !== undefined) {
    orderedDice.forEach((item) => {
      const hasEntry = stableHeldSlotByDieRef.current.has(item.originalIndex);
      if (item.die.isHeld) {
        // Die is held: register if new, clear any pending release
        pendingReleaseCountRef.current.delete(item.originalIndex);
        if (!hasEntry) {
          stableHeldSlotByDieRef.current.set(item.originalIndex, holdOrderCounterRef.current++);
        }
      } else if (hasEntry) {
        // Die is NOT held but HAS a registered entry: release immediately.
        stableHeldSlotByDieRef.current.delete(item.originalIndex);
        pendingReleaseCountRef.current.delete(item.originalIndex);
      }
    });
  }

  // Lookup helper: returns the held position for a die based on its registry order.
  // Positions are computed dynamically from the CURRENT registry size, so they
  // automatically recenter when a die is unholded.
  // For observers: always returns position if entry exists (prevents transient hop).
  // For roller: also returns position for stable ordering + recentering.
  const getStableHeldPos = (originalIndex: number): { x: number; y: number } | undefined => {
    if (rollKey === undefined) return undefined;
    const holdOrder = stableHeldSlotByDieRef.current.get(originalIndex);
    if (holdOrder === undefined) return undefined;

    // Sort all registered dice by their hold order
    const entries = [...stableHeldSlotByDieRef.current.entries()].sort((a, b) => a[1] - b[1]);
    const registrySize = entries.length;
    const positionIdx = entries.findIndex(([di]) => di === originalIndex);
    if (positionIdx < 0) return undefined;

    // Compute centered positions for the current number of held dice
    const positions = getHeldPositions(registrySize, dieWidth, gap);
    return positions[positionIdx];
  };

  // Cache management: update last-known transforms for smooth transitions
  orderedDice.forEach((item) => {
    const layoutHeldPos = heldPositionByOriginalIndex.get(item.originalIndex);
    const layoutScatterPos = scatterLayoutByOriginalIndex.get(item.originalIndex);
    const stableScatterPos =
      stableScatterRollKeyRef.current === rollKey
        ? stableScatterByDieRef.current.get(item.originalIndex)
        : undefined;

    // For observers: if die has a registered slot, treat as held for caching purposes
    const registryHeldPos = getStableHeldPos(item.originalIndex);
    const effectivelyHeld = item.die.isHeld || !!registryHeldPos;

    if (effectivelyHeld) {
      const stableHeldPos = registryHeldPos;
      const committedHeldPos =
        stableHeldPos ??
        layoutHeldPos ??
        lastHeldTransformByDieRef.current.get(item.originalIndex) ??
        (() => {
          const actuallyHeldDice = orderedDice.filter((d) => d.die.isHeld);
          const heldIdx = actuallyHeldDice.findIndex((d) => d.originalIndex === item.originalIndex);
          if (heldIdx < 0) return undefined;
          return getHeldPositions(actuallyHeldDice.length, dieWidth, gap)[heldIdx];
        })();

      if (committedHeldPos) {
        lastHeldTransformByDieRef.current.set(item.originalIndex, committedHeldPos);
        lastScatterTransformByDieRef.current.delete(item.originalIndex);
      }
      return;
    }

    const committedScatterPos =
      stableScatterPos ??
      layoutScatterPos ??
      lastScatterTransformByDieRef.current.get(item.originalIndex);

    if (committedScatterPos) {
      lastScatterTransformByDieRef.current.set(item.originalIndex, committedScatterPos);
      lastHeldTransformByDieRef.current.delete(item.originalIndex);
    }
  });

  return (
    <div ref={containerRef} className="relative" style={{ width: isTablet ? "360px" : "200px", height: isTablet ? "220px" : "120px" }}>
      {/* Fly-in animation overlay for unheld dice */}
      {isAnimatingFlyIn && animationOrigin && animatingDiceIndices.length > 0 && (
        <DiceRollAnimation
          runKey={flyInRunId}
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
          showWildHighlight={showWildHighlight}
        />
      )}

      {/* Render each die once (stable key) so it can transition between scatter ↔ held row */}
      {orderedDice.map((item) => {
        const sccDie = item.die as SCCDieType;
        const isSCCDie = isSCC && "isSCC" in sccDie && sccDie.isSCC;

        // Don't render this die at all if it's currently animating in (prevents double render)
        const isThisDieAnimating = isAnimatingFlyIn && animatingDiceIndices.includes(item.originalIndex);
        if (isThisDieAnimating) return null;

        // --- AUTHORITATIVE LAYOUT DECISION ---
        // For observers: the held slot registry is the sole authority.
        // If a die has a registered slot, it renders in the held row regardless of transient isHeld flips.
        // For roller (non-observer): use actual die.isHeld for immediate feedback.
        const actuallyHeld = item.die.isHeld;
        const registryHeldPos = getStableHeldPos(item.originalIndex);
        const layoutHeldPos = heldPositionByOriginalIndex.get(item.originalIndex);
        const cachedHeldPos = lastHeldTransformByDieRef.current.get(item.originalIndex);
        const cachedScatterPos = lastScatterTransformByDieRef.current.get(item.originalIndex);

        // Observer: registry is authoritative (prevents transient hop to scatter)
        // Roller: actuallyHeld is authoritative (immediate toggle feedback)
        const effectivelyHeld = isObserver ? (!!registryHeldPos || actuallyHeld) : actuallyHeld;

        let heldPos = registryHeldPos ?? layoutHeldPos ?? (effectivelyHeld ? cachedHeldPos : undefined);
        if (effectivelyHeld && !heldPos) {
          const actuallyHeldDice = orderedDice.filter((d) => d.die.isHeld);
          const heldIdx = actuallyHeldDice.findIndex((d) => d.originalIndex === item.originalIndex);
          if (heldIdx >= 0) {
            const allHeldPositions = getHeldPositions(actuallyHeldDice.length, dieWidth, gap);
            heldPos = allHeldPositions[heldIdx];
          }
        }
        
        // Die is in held layout if effectively held AND we have a position
        const isHeldInLayout = effectivelyHeld && !!heldPos;

        // Scatter positions: only for dice NOT in held layout
        const hasValidStablePos =
          !isHeldInLayout &&
          stableScatterRollKeyRef.current === rollKey &&
          stableScatterByDieRef.current.has(item.originalIndex);
        const stablePos = hasValidStablePos
          ? stableScatterByDieRef.current.get(item.originalIndex)
          : undefined;

        const layoutScatterPos = scatterLayoutByOriginalIndex.get(item.originalIndex);
        const scatterPos =
          stablePos ??
          layoutScatterPos ??
          cachedScatterPos ??
          getUnheldPosition(0, Math.max(1, layoutUnheldDice.length));

        // Hide unheld dice when showUnheldDice is false (after 1s delay from held dice moving)
        const shouldHide = !isHeldInLayout && !showUnheldDice && !isAnimatingFlyIn;
        
        // Don't render unheld dice at all when they should be hidden
        if (shouldHide) return null;

        // CRITICAL: When all dice just became held (early lock-in), do NOT animate unheld→held transition.
        // Skip the transition by omitting transition classes for dice that just switched from unheld to held.
        const justBecameHeld = allHeld && !isAnimatingFlyIn && !isHeldInLayout;
        const shouldSkipTransition = justBecameHeld;

        // CRITICAL FIX: Observers should NOT use CSS transitions for held↔scatter changes.
        // The roller's rapid hold toggles arrive as separate realtime updates ~150ms apart.
        // With a 300ms CSS transition, each update interrupts the in-progress animation,
        // causing dice to visibly "hop" (start moving to scatter, then reverse back to held).
        // Fly-in animation uses the DiceRollAnimation overlay, not CSS transitions, so it's unaffected.
        const useInstantTransform = isObserver && !isAnimatingFlyIn;

        const transformOwner = isHeldInLayout
          ? registryHeldPos
            ? "held:stable-slot"
            : layoutHeldPos
            ? "held:layout"
            : cachedHeldPos
              ? "held:cache"
              : "held:derived"
          : stablePos
            ? "scatter:stable"
            : layoutScatterPos
              ? "scatter:layout"
              : cachedScatterPos
                ? "scatter:cache"
                : "scatter:default";

        const transform = isHeldInLayout
          ? `translate(calc(-50% + ${heldPos!.x}px), calc(-50% + ${heldPos!.y + heldYOffset}px))`
          : `translate(calc(-50% + ${scatterPos.x}px), calc(-50% + ${scatterPos.y + unheldYOffset}px)) rotate(${scatterPos.rotate}deg)`;

        if (isDiceTraceRecording()) {
          const traceData = {
            rollKey,
            isRolling,
            isAnimatingFlyIn,
            showUnheldDice,
            cacheKey: String(cacheKey ?? ""),
            extra: {
              dieIdx: item.originalIndex,
              dieValue: item.die.value,
              dieIsHeld: item.die.isHeld,
              isHeldInLayout,
              actuallyHeld,
              layoutHeldPosPresent: !!layoutHeldPos,
              cachedHeldPosPresent: !!cachedHeldPos,
              layoutScatterPosPresent: !!layoutScatterPos,
              stablePosPresent: !!stablePos,
              cachedScatterPosPresent: !!cachedScatterPos,
              allHeld,
              transformOwner,
              transform,
            },
          };

          const summary = [
            item.die.isHeld ? "held" : "unheld",
            isHeldInLayout ? "layout-held" : "layout-scatter",
            transformOwner,
            transform,
            String(rollKey ?? ""),
            String(cacheKey ?? ""),
          ].join("|");

          const previous = renderDecisionByDieRef.current.get(item.originalIndex);
          if (previous?.summary !== summary) {
            pushDiceTrace("DiceTableLayout:renderDecision", {
              ...traceData,
              extra: {
                ...traceData.extra,
                previousTransformOwner: previous?.data?.transformOwner,
                previousTransform: previous?.data?.transform,
                previousIsHeldInLayout: previous?.data?.isHeldInLayout,
              },
            });
          }
          renderDecisionByDieRef.current.set(item.originalIndex, { summary, data: traceData.extra });
        }

        return (
          <div
            key={`die-${item.originalIndex}`}
            data-die-idx={item.originalIndex}
            data-die-value={item.die.value}
            data-die-held={item.die.isHeld}
            data-die-held-layout={isHeldInLayout}
            className={cn(
              "absolute will-change-transform",
              !shouldSkipTransition && !useInstantTransform && "transition-transform duration-300 ease-out",
            )}
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
                // SCC: allow toggling ONLY for non-locked dice (cargo / non-SCC dice).
                // Locked Ship/Captain/Crew dice (isSCCDie) can never be unheld.
                canToggle={
                  canToggle &&
                  !isObserver &&
                  !isAnimatingFlyIn &&
                  !isRolling &&
                  (!isSCC || !isSCCDie)
                }
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

// (getHeldSlotOrder removed — registry now uses hold-order counter, not slot indices)
