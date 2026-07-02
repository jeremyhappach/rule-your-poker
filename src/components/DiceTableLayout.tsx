import { useState, useLayoutEffect, useRef, useCallback, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { HorsesDie } from "./HorsesDie";
import { getSCCDisplayOrder, SCCHand, SCCDie as SCCDieType } from "@/lib/sccGameLogic";
import { HorsesDie as HorsesDieType } from "@/lib/horsesGameLogic";
import { DiceRollAnimation } from "./DiceRollAnimation";
import { useDeviceSize } from "@/hooks/useDeviceSize";
import { useIsRectDriven } from "@/lib/wave5GameplayGeometry/AssignedRectPx";

import { isDiceSnapEnabled } from "@/lib/diceSnapshots/enabled";
import { recordDiceSnapFrame, DiceSnapSample } from "@/lib/diceSnapshots/recorder";
import {
  isDicePresentationTraceEnabled,
  recordDicePresentationTrace,
  type DicePresentationTraceEntry,
  type TraceInput,
  type DieRenderDecision,
  type DiceOverlapEvent,
} from "@/lib/dicePresentationTrace";

// Persist rollKey / fly-in consumption across DiceTableLayout remounts.
// MobileGameTable intentionally remounts DiceTableLayout when the dice "owner" changes,
// but other UI transitions can also cause remounts. Without persistence, the fly-in can refire
// for the same rollKey after a remount (the exact bug you captured).
const lastSeenRollKeyByCacheKey = new Map<string, string | number>();
const lastFlyInRollKeyByCacheKey = new Map<string, string | number>();
let diceTableLayoutInstanceCounter = 0;

/** Optional trace context for held-die corruption instrumentation */
export interface DiceTraceContext {
  gameId: string;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number;
  turnPlayerId: string | null;
  rollNumber: number;
  /** Authoritative dice state for cross-layer invariant checks */
  authoritativeDice?: { value: number; isHeld: boolean }[];
}

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
  /** Trace context for held-die corruption instrumentation (Yahtzee only) */
  traceContext?: DiceTraceContext;
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
  traceContext,
}: DiceTableLayoutProps) {
  const isSCC = gameType === 'ship-captain-crew';
  const { isTablet: rawIsTablet } = useDeviceSize();
  // Wave 6A — when this DiceTableLayout is wrapped in an AssignedRectFitter
  // (i.e. it lives inside an anchored Wave 5D dice stage), the assigned rect
  // owns absolute size via a uniform `transform: scale(k)`. Internal isTablet
  // size bumps would double-scale, so suppress them.
  const isRectDriven = useIsRectDriven();
  const isTablet = rawIsTablet && !isRectDriven;

  // TABLET: Use larger dice size
  const effectiveSize = isTablet ? "lg" : size;
  
  // Track fly-in animation state
  const [isAnimatingFlyIn, setIsAnimatingFlyIn] = useState(false);
  const [animatingDiceIndices, setAnimatingDiceIndices] = useState<number[]>([]);
  const prevRollKeyRef = useRef<string | number | undefined>(undefined);
  const lastFlyInRollKeyRef = useRef<string | number | undefined>(undefined);
  const instanceIdRef = useRef(++diceTableLayoutInstanceCounter);
  const lastStableFrameSnapshotRef = useRef<Record<string, unknown> | null>(null);
  const prevRenderTraceRollKeyRef = useRef<string | number | undefined>(rollKey);
  const activeTraceRollKeyRef = useRef<string | number | undefined>(undefined);
  const frame2LoggedRollKeyRef = useRef<string | number | undefined>(undefined);
  const frame3LoggedRollKeyRef = useRef<string | number | undefined>(undefined);
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
  // Observer stabilization: tracks how many consecutive renders a die has been isHeld=true
  // before committing it to the held row. Prevents rapid toggle flicker (scatter→held→scatter).
  const pendingHoldFramesRef = useRef<Map<number, number>>(new Map());
  const lastHeldTransformByDieRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  // Frozen presentation snapshot: captured at the moment all dice become held (lock-in / roll 3).
  // Each die's position is frozen exactly where it was, preventing any post-lock movement.
  // CRITICAL: Stores BOTH transform AND value so the freeze render always uses the values
  // that determined the slot positions, even if effectiveDice source changes between renders
  // (e.g., stabilization cache → presentationDice).
  const frozenPresentationRef = useRef<Map<number, { transform: string; value: number }> | null>(null);
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

  // Invariant check refs: previous frame held-slot state
  const prevFrameHeldSlotsRef = useRef<Map<number, { slot: number; row: string; transformOwner: string }>>(new Map());
  const invariantFrameCounterRef = useRef(0);

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
  
   // ── Observer hold-state presentation debounce ───────────────────────
   // When isObserver, rapid hold/unhold toggles from the roller arrive as separate
   // realtime snapshots ~50-100ms apart. Rendering each intermediate state causes dice
   // to teleport scatter→held→scatter. Instead, debounce: store the latest incoming
   // dice and apply after 100ms of quiet, so only the final hold state renders.
   const [debouncedDice, setDebouncedDice] = useState(dice);
   const observerDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

   useEffect(() => {
     if (!isObserver) {
       // Roller: no debounce, immediate
       setDebouncedDice(dice);
       return;
     }

     // Check if only hold states changed (values same) — if values changed it's a
     // new roll and should apply immediately.
     const onlyHoldChanged = dice.length === debouncedDice.length &&
       dice.every((d, i) => d.value === debouncedDice[i]?.value);

     if (!onlyHoldChanged) {
       // Values changed (new roll) — apply immediately
       if (observerDebounceTimerRef.current) {
         clearTimeout(observerDebounceTimerRef.current);
         observerDebounceTimerRef.current = null;
       }
       setDebouncedDice(dice);
       return;
     }

     // FIX B1: Only debounce held→scatter (release) transitions.
     // scatter→held transitions apply immediately so held dice never linger in scatter.
     const hasNewHolds = dice.some((d, i) => d.isHeld && !debouncedDice[i]?.isHeld);
     const hasNewReleases = dice.some((d, i) => !d.isHeld && debouncedDice[i]?.isHeld);

     if (hasNewHolds && !hasNewReleases) {
       // Pure scatter→held: apply immediately, no debounce
       if (observerDebounceTimerRef.current) {
         clearTimeout(observerDebounceTimerRef.current);
         observerDebounceTimerRef.current = null;
       }
       setDebouncedDice(dice);
       return;
     }

     // Has releases (held→scatter) — debounce to avoid flicker
     if (observerDebounceTimerRef.current) {
       clearTimeout(observerDebounceTimerRef.current);
     }
     observerDebounceTimerRef.current = setTimeout(() => {
       setDebouncedDice(dice);
       observerDebounceTimerRef.current = null;
     }, 100);

     return () => {
       if (observerDebounceTimerRef.current) {
         clearTimeout(observerDebounceTimerRef.current);
         observerDebounceTimerRef.current = null;
       }
     };
   }, [dice, isObserver]);
   // Alias for downstream: observer uses debounced, roller uses raw
   const presentationDice = isObserver ? debouncedDice : dice;

   // CRITICAL: For observers, ALL visual/layout/count/registry derivations must flow from
   // presentationDice (the debounced source). Using raw `dice` anywhere in observer render
   // paths causes mixed-source frames where counts disagree with layout positions.
   // For the roller, visualDice === dice (no debounce).
   const visualDice = presentationDice;

   // CRITICAL: Cache the last valid dice state to prevent flicker when dice briefly become invalid
   // This prevents the empty container from rendering during state transitions
   const lastValidDiceRef = useRef<(HorsesDieType | SCCDieType)[]>(presentationDice);

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
    lastValidDiceRef.current = Array.from({ length: visualDice.length || 5 }, () => ({
      value: 0,
      isHeld: false,
    })) as any;
    stableScatterRollKeyRef.current = undefined;
    stableScatterByDieRef.current = new Map();
    stableHeldRollKeyRef.current = undefined;
    stableHeldSlotByDieRef.current = new Map();
    holdOrderCounterRef.current = 0;
    pendingReleaseCountRef.current = new Map();
    pendingHoldFramesRef.current = new Map();
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
  }, [cacheKey, visualDice]);

  // Stabilization period after roll 3 completes - hold the current visual state
  // to prevent flickering during the isComplete transition
  const [isStabilizing, setIsStabilizing] = useState(false);
  const stabilizationTimeoutRef = useRef<number | null>(null);
  const prevIsCompleteRef = useRef(false);
  
  // Ref to access the container DOM for position sampling
  const containerRef = useRef<HTMLDivElement>(null);
  const snapFrameSeq = useRef(0);
  const traceBaseInputRef = useRef<TraceInput | null>(null);
  
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
            allHeldNow: visualDice.every(d => d.isHeld),
            heldCount: visualDice.filter(d => d.isHeld).length,
          },
        });
      });
      
      if (samples.length > 0) {
        void recordDiceSnapFrame(samples);
      }
    }, 50);
    
    return () => window.clearInterval(intervalId);
  }, [cacheKey, rollKey, isObserver, isRolling, isAnimatingFlyIn, showUnheldDice, visualDice]);

  useEffect(() => {
    const toNumber = (value: string | null | undefined): number | null => {
      if (!value || value === "auto") return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const toDisplayedRow = (value: string | null): DieRenderDecision["displayedRow"] => {
      switch (value) {
        case "held":
        case "scatter":
        case "animating":
        case "hidden":
        case "frozen":
          return value;
        default:
          return "scatter";
      }
    };

    const toBoundingBox = (rect: DOMRect) => ({
      left: Number(rect.left.toFixed(2)),
      top: Number(rect.top.toFixed(2)),
      right: Number(rect.right.toFixed(2)),
      bottom: Number(rect.bottom.toFixed(2)),
      width: Number(rect.width.toFixed(2)),
      height: Number(rect.height.toFixed(2)),
    });

    const overlaps = (
      a: { left: number; right: number; top: number; bottom: number },
      b: { left: number; right: number; top: number; bottom: number },
    ) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 1 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 1;

    let rafId = 0;

    const sampleCompositionFrame = () => {
      rafId = window.requestAnimationFrame(sampleCompositionFrame);

      if (!isDicePresentationTraceEnabled()) return;

      const baseTrace = traceBaseInputRef.current;
      const container = containerRef.current;
      if (!baseTrace || !container) return;

      const dieElements = Array.from(container.querySelectorAll<HTMLElement>("[data-die-idx]"));
      if (dieElements.length === 0) return;

      const baseDecisionByIndex = new Map(baseTrace.dieRenderDecisions.map((decision) => [decision.originalIndex, decision]));

      const compositionDecisions = dieElements.map((element, domOrder) => {
        const dieIndex = Number(element.getAttribute("data-die-idx") ?? "-1");
        const baseDecision = baseDecisionByIndex.get(dieIndex);
        const computedStyle = window.getComputedStyle(element);
        const parent = element.parentElement as HTMLElement | null;
        const siblingOrder = parent
          ? Array.from(parent.querySelectorAll<HTMLElement>("[data-die-idx]")).indexOf(element)
          : -1;
        const displayedRow = toDisplayedRow(element.getAttribute("data-die-row"));
        const value = Number(element.getAttribute("data-die-value") ?? baseDecision?.value ?? 0);
        const isHeld = element.getAttribute("data-die-held") === "true";
        const isHeldInLayout = element.getAttribute("data-die-held-layout") === "true";
        const slotIndexAttr = element.getAttribute("data-die-slot-index");
        const slotIndexInHeldRow = slotIndexAttr ? Number(slotIndexAttr) : baseDecision?.slotIndexInHeldRow ?? null;
        const boundingBox = toBoundingBox(element.getBoundingClientRect());
        const fallbackDecision: DieRenderDecision = {
          originalIndex: dieIndex,
          value,
          isHeld,
          isHeldInLayout,
          displayedRow,
          slotIndexInHeldRow,
          transformOwner: element.getAttribute("data-die-transform-owner") ?? "dom",
          intendedPos: null,
          actualPos: null,
          actualTransform: element.style.transform || computedStyle.transform || "none",
          reactKey: element.getAttribute("data-die-react-key") ?? `die-${dieIndex}`,
          hadRegistryPos: false,
          hadLayoutPos: false,
          hadCachedHeldPos: false,
          hadCachedScatterPos: false,
          hadStableScatterPos: false,
          hadFrozenTransform: false,
        };

        return {
          ...(baseDecision ?? fallbackDecision),
          value,
          isHeld,
          isHeldInLayout,
          displayedRow,
          slotIndexInHeldRow,
          transformOwner: element.getAttribute("data-die-transform-owner") ?? baseDecision?.transformOwner ?? "dom",
          actualTransform: element.style.transform || computedStyle.transform || baseDecision?.actualTransform || "none",
          reactKey: element.getAttribute("data-die-react-key") ?? baseDecision?.reactKey ?? `die-${dieIndex}`,
          compositionLayer: element.getAttribute("data-die-layer") ?? parent?.getAttribute("data-dice-layer") ?? null,
          layerZIndex: toNumber(element.getAttribute("data-die-layer-z") ?? parent?.getAttribute("data-layer-z") ?? (parent ? window.getComputedStyle(parent).zIndex : null)),
          elementZIndex: toNumber(computedStyle.zIndex),
          domOrder,
          siblingOrder: siblingOrder >= 0 ? siblingOrder : null,
          boundingBox,
          overlapsWith: [],
        } satisfies DieRenderDecision;
      });

      const overlapEvents: DiceOverlapEvent[] = [];
      for (let i = 0; i < compositionDecisions.length; i++) {
        for (let j = i + 1; j < compositionDecisions.length; j++) {
          const dieA = compositionDecisions[i];
          const dieB = compositionDecisions[j];
          if (!dieA.boundingBox || !dieB.boundingBox) continue;
          if (dieA.displayedRow !== "animating" && dieB.displayedRow !== "animating") continue;
          if (!overlaps(dieA.boundingBox, dieB.boundingBox)) continue;

          dieA.overlapsWith = [...(dieA.overlapsWith ?? []), dieB.originalIndex];
          dieB.overlapsWith = [...(dieB.overlapsWith ?? []), dieA.originalIndex];

          overlapEvents.push({
            type: "DICE_OVERLAP_EVENT",
            dieAIndex: dieA.originalIndex,
            dieBIndex: dieB.originalIndex,
            dieARow: dieA.displayedRow,
            dieBRow: dieB.displayedRow,
            dieAReactKey: dieA.reactKey,
            dieBReactKey: dieB.reactKey,
            dieALayer: dieA.compositionLayer ?? null,
            dieBLayer: dieB.compositionLayer ?? null,
            dieALayerZIndex: dieA.layerZIndex ?? null,
            dieBLayerZIndex: dieB.layerZIndex ?? null,
            dieAElementZIndex: dieA.elementZIndex ?? null,
            dieBElementZIndex: dieB.elementZIndex ?? null,
            dieADomOrder: dieA.domOrder ?? null,
            dieBDomOrder: dieB.domOrder ?? null,
            dieABoundingBox: dieA.boundingBox,
            dieBBoundingBox: dieB.boundingBox,
          });
        }
      }

      const layerSnapshots = Array.from(container.children)
        .filter((child): child is HTMLElement => child instanceof HTMLElement && child.hasAttribute("data-dice-layer"))
        .map((child, domOrder) => ({
          layer: child.getAttribute("data-dice-layer") ?? "unknown",
          zIndex: toNumber(child.getAttribute("data-layer-z") ?? window.getComputedStyle(child).zIndex),
          domOrder,
          containsHeld: child.querySelector('[data-die-row="held"]') !== null,
          containsAnimating: child.querySelector('[data-die-row="animating"]') !== null,
        }));

      const heldLayers = layerSnapshots.filter((layer) => layer.containsHeld);
      const animatingLayers = layerSnapshots.filter((layer) => layer.containsAnimating);
      const renderedLayerCount = layerSnapshots.filter((layer) => {
        const layerEl = container.children[layer.domOrder] as HTMLElement | undefined;
        return layerEl?.querySelector("[data-die-idx]") != null;
      }).length;

      recordDicePresentationTrace({
        ...baseTrace,
        traceKind: "composition",
        dieRenderDecisions: compositionDecisions,
        overlapEvents,
        layerSnapshots,
        multipleRenderSources:
          renderedLayerCount > 1 || new Set(compositionDecisions.map((decision) => decision.originalIndex)).size < compositionDecisions.length,
        heldSharesAnimatedLayer:
          heldLayers.length > 0 && animatingLayers.length > 0
            ? heldLayers.some((heldLayer) => animatingLayers.some((animatingLayer) => animatingLayer.layer === heldLayer.layer))
            : null,
        heldAboveAnimating:
          heldLayers.length > 0 && animatingLayers.length > 0
            ? Math.max(...heldLayers.map((layer) => layer.zIndex ?? 0)) > Math.max(...animatingLayers.map((layer) => layer.zIndex ?? 0))
            : null,
      });
    };

    rafId = window.requestAnimationFrame(sampleCompositionFrame);
    return () => window.cancelAnimationFrame(rafId);
  }, []);
  
  // Schedules a timeout
  const scheduleTimeout = useCallback(
    (delayMs: number, cb: () => void) => {
      return window.setTimeout(cb, delayMs);
    },
    []
  );

  useEffect(() => {

    return () => {
    };
  }, []);

  // Detect when a new roll starts (rollKey changes) and trigger fly-in animation

  // NOTE: useLayoutEffect prevents a 1-frame flash where dice render in-place before we hide them.
  useLayoutEffect(() => {
    // FIX A: Do NOT return early when isAnimatingFlyIn.
    // If a new rollKey arrives mid-animation, cancel the current fly-in and restart.

    // Prevent "same rollKey" replays across remounts by persisting last-seen rollKey per cacheKey.
    const cacheKeyStr = String(cacheKey ?? "");
    const lastSeenGlobal = cacheKeyStr ? lastSeenRollKeyByCacheKey.get(cacheKeyStr) : undefined;

    const isNewRollKey =
      rollKey !== undefined &&
      rollKey !== prevRollKeyRef.current &&
      (lastSeenGlobal === undefined || rollKey !== lastSeenGlobal);
    if (!isNewRollKey) {
      // Not a new roll — but if we're mid-animation, don't interrupt
      return;
    }

    // FIX A: If a fly-in is currently running, cancel it before starting the new one.
    if (isAnimatingFlyIn) {
      console.log('[FIX_A] Cancelling in-progress fly-in for new rollKey', { oldRollKey: prevRollKeyRef.current, newRollKey: rollKey });
      setIsAnimatingFlyIn(false);
      setAnimatingDiceIndices([]);
      setShowUnheldDice(true);
      if (animationCompleteTimeoutRef.current) {
        clearTimeout(animationCompleteTimeoutRef.current);
        animationCompleteTimeoutRef.current = null;
      }
    }

    prevRollKeyRef.current = rollKey;
    if (cacheKeyStr) lastSeenRollKeyByCacheKey.set(cacheKeyStr, rollKey);

    stableHeldRollKeyRef.current = rollKey;
    // Preserve registry entries for dice that remain held across re-rolls.
    // This maintains stable hold order so held dice don't reshuffle after re-roll.
    // CRITICAL: Use heldMaskBeforeComplete as authority on roll 3.
    // Game logic marks ALL dice isHeld=true when rollsRemaining=0, but only the
    // pre-roll held dice should be preserved in the registry. Without this guard,
    // the registry gets 5 entries on roll 3, causing held-row left-justify.
    const heldMaskForPreserve = Array.isArray(heldMaskBeforeComplete) ? heldMaskBeforeComplete : null;
    const preservedRegistry = new Map<number, number>();
    stableHeldSlotByDieRef.current.forEach((holdOrder, dieIdx) => {
      const wasHeldBeforeRoll = heldMaskForPreserve ? !!heldMaskForPreserve[dieIdx] : !!visualDice[dieIdx]?.isHeld;
      if (wasHeldBeforeRoll) {
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
        : visualDice.map((_, i) => i);

    // Find which dice were unheld at the START of the roll.
    // IMPORTANT: do NOT require die.value !== 0 here.
    // Observers can receive rollKey before values propagate; we still want to start fly-in on time.
    const unheldIndices = orderedIndices.filter((i) => {
      const d = visualDice[i];
      if (!d) return false;

      // FIX A: Animation eligibility must be based on held-at-roll-START, not post-roll isHeld.
      // On the final roll, game logic marks ALL dice isHeld=true after resolving,
      // but dice that were NOT held before the roll must still animate (fly-in).
      // Use heldMaskBeforeComplete as the authoritative "held at roll start" signal.
      if (heldMask) {
        // heldMask captures pre-roll hold state — trust it exclusively
        return !heldMask[i];
      }

      // No heldMask available — fall back to current isHeld (safe for roll 1/2 where
      // game logic hasn't force-held all dice yet)
      return !d.isHeld;
    });

    // Track how many were held at the START of this roll (for Y offset calculation)
    const heldAtRollStart = heldMask
      ? orderedIndices.filter((i) => {
          const d = visualDice[i];
          return !!(heldMask[i] || d?.isHeld);
        }).length
      : visualDice.filter((d) => d.isHeld).length;
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

    // Debug: trace fly-in decision for every new rollKey
    if (rollKey !== undefined) {
      console.log('[ROLL CONSUME CHECK]', {
        rollKey,
        lastConsumed: effectiveLastFlyIn,
        lastFlyInGlobal,
        lastFlyInRef: lastFlyInRollKeyRef.current,
        cacheKey: flyInCacheKeyStr,
        shouldStartFlyIn,
        flyInWindowActive,
        unheldCount: unheldIndices.length,
        hasAnimOrigin: !!animationOrigin,
        isAnimatingFlyIn,
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
    visualDice,
    heldMaskBeforeComplete,
    useSCCDisplayOrder,
    sccHand,
    isAnimatingFlyIn,
    isTablet,
    isRolling,
    isObserver,
  ]);

  // Handle "all held" transition: when turn completes, hide formerly-unheld dice quickly
  const allHeldNow = visualDice.length > 0 && visualDice.every(d => d.isHeld);
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
  const hasValidCurrentDice = presentationDice.length > 0 && presentationDice.some((d) => d.value > 0);

  // IMPORTANT: Only fall back to cached dice if we're in the middle of a roll/animation.
  // If rollKey is undefined (no roll has started for the current player yet), showing cached dice
  // can leak the previous player's final dice onto the felt during turn transitions.
  const canFallbackToCache = rollKey !== undefined || isRolling;
  const shouldFallbackToCache = !hasValidCurrentDice && canFallbackToCache;

  const effectiveDice = isStabilizing
    ? lastValidDiceRef.current
    : hasValidCurrentDice
      ? presentationDice
      : shouldFallbackToCache
        ? lastValidDiceRef.current
        : presentationDice;

  // Update cache when we have valid dice (but not during stabilization)
  if (hasValidCurrentDice && !isStabilizing) {
    lastValidDiceRef.current = presentationDice;
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
  const hasNoOrderedDice = orderedDice.length === 0;
  if (hasNoOrderedDice) {
    console.warn('[DiceTableLayout] Empty orderedDice - this may cause visual flicker');
  }
  
  // Separate held and unheld dice.
  // CANONICAL HELD-ROW POLICY: held dice are always sorted by (value ASC, dieId ASC).
  // Every downstream layout consumer (heldPositions, heldPositionByOriginalIndex, fallback
  // held-position derivations, and heldSlotIndexByDie) reads from this ordering, so a die's
  // horizontal slot is solely a function of its position in the committed canonical order.
  // This prevents a category-selection / authority-arrival render from silently switching
  // the row into physical/insertion order via a `held:layout` fallback.
  const canonicalHeldSort = (
    a: (typeof orderedDice)[number],
    b: (typeof orderedDice)[number],
  ) => (a.die.value !== b.die.value ? a.die.value - b.die.value : a.originalIndex - b.originalIndex);
  const heldDice = orderedDice.filter(d => d.die.isHeld).sort(canonicalHeldSort);
  const unheldDice = orderedDice.filter(d => !d.die.isHeld);

  const heldCount = heldDice.length;
  const unheldCount = unheldDice.length;
  
  // Special case: all visible dice are held
  // This covers: turn completion (lock-in / roll 3), early lock-in (all held before committing),
  // and any other state where every die has isHeld=true.
  const allHeld = orderedDice.length > 0 && orderedDice.every(d => d.die.isHeld);

  // PRESENTATION FREEZE: When all dice become held, capture each die's current position
  // and freeze it. No recentering, no regrouping, no post-lock movement.
  // CRITICAL: Skip freeze on the FIRST render with a new rollKey. The useLayoutEffect hasn't
  // fired yet to start the fly-in animation, so entering freeze here would flash a stale
  // all-held layout for one frame before the fly-in takes over.
  const rollKeyProcessed = rollKey === prevRollKeyRef.current;
  const shouldUseFreezePresentation = !hasNoOrderedDice && allHeld && !isAnimatingFlyIn && rollKeyProcessed;
  if (shouldUseFreezePresentation) {
    // Capture frozen positions ONCE per rollKey lock
    // CRITICAL: Also recompute if effectiveDice values changed since last capture.
    // This prevents the bug where stabilization cache values are used to compute positions
    // but then presentationDice values (which may differ) are rendered at those positions.
    const currentValueFingerprint = orderedDice.map(d => d.die.value).join(',');
    const prevFrozenFingerprint = frozenPresentationRef.current
      ? Array.from(frozenPresentationRef.current.entries())
          .sort((a, b) => a[0] - b[0])
          .map(([, entry]) => entry.value)
          .join(',')
      : null;
    const valuesChanged = prevFrozenFingerprint !== null && prevFrozenFingerprint !== currentValueFingerprint;

    if (!frozenPresentationRef.current || frozenForRollKeyRef.current !== rollKey || valuesChanged) {
      const frozenMap = new Map<number, { transform: string; value: number }>();
      const heldYOffset = -35;
      const unheldYOffset = 50;

      // CRITICAL: Use heldMaskBeforeComplete to determine which dice were in the held row
      // vs scatter BEFORE all-held. This prevents roll-3 from moving scatter dice into held row.
      const heldMask = Array.isArray(heldMaskBeforeComplete) ? heldMaskBeforeComplete : null;

      // Build held-row positions for ONLY the dice that were held before freeze
      const preHeldIndices = orderedDice
        .filter((item) => {
          if (heldMask) return !!heldMask[item.originalIndex];
          return stableHeldSlotByDieRef.current.has(item.originalIndex);
        })
        .map((item) => item.originalIndex);

      // CANONICAL HELD-ROW POLICY: sort by (die value ASC, originalIndex ASC).
      // This ensures held dice always display in ascending value order.
      const sortedPreHeld = preHeldIndices.sort((a, b) => {
        const valA = effectiveDice[a]?.value ?? 0;
        const valB = effectiveDice[b]?.value ?? 0;
        return valA !== valB ? valA - valB : a - b;
      });
      const preHeldPositions = getHeldPositions(sortedPreHeld.length, dieWidth, gap);

      orderedDice.forEach((item) => {
        const wasHeldBefore = heldMask
          ? !!heldMask[item.originalIndex]
          : stableHeldSlotByDieRef.current.has(item.originalIndex);

        if (wasHeldBefore) {
          // Die was in held row — use its stable held-row position
          const posIdx = sortedPreHeld.indexOf(item.originalIndex);
          if (posIdx >= 0 && preHeldPositions[posIdx]) {
            const pos = preHeldPositions[posIdx];
            frozenMap.set(item.originalIndex, {
              transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`,
              value: item.die.value,
            });
            return;
          }
          // Fallback: use cached held position
          const cachedHeld = lastHeldTransformByDieRef.current.get(item.originalIndex);
          if (cachedHeld) {
            frozenMap.set(item.originalIndex, {
              transform: `translate(calc(-50% + ${cachedHeld.x}px), calc(-50% + ${cachedHeld.y + heldYOffset}px))`,
              value: item.die.value,
            });
            return;
          }
        }

        // Die was in scatter — freeze at its scatter position
        const stableScatter = stableScatterRollKeyRef.current === rollKey
          ? stableScatterByDieRef.current.get(item.originalIndex)
          : undefined;
        const lastScatter = lastScatterTransformByDieRef.current.get(item.originalIndex);
        const scatterPos = stableScatter ?? lastScatter;

        if (scatterPos) {
          frozenMap.set(item.originalIndex, {
            transform: `translate(calc(-50% + ${scatterPos.x}px), calc(-50% + ${scatterPos.y + unheldYOffset}px)) rotate(${scatterPos.rotate}deg)`,
            value: item.die.value,
          });
        } else {
          // Ultimate fallback: use held position (all dice in a row)
          const actualDiceCount = orderedDice.length;
          const positions = getHeldPositions(actualDiceCount, dieWidth, gap);
          const idx = orderedDice.findIndex(d => d.originalIndex === item.originalIndex);
          const pos = positions[idx] || { x: 0, y: 0 };
          frozenMap.set(item.originalIndex, {
            transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y + heldYOffset}px))`,
            value: item.die.value,
          });
        }
      });

      frozenPresentationRef.current = frozenMap;
      frozenForRollKeyRef.current = rollKey;
    }

  }
  
  // CRITICAL: During fly-in animation, use the held mask from BEFORE the roll to determine positions.
  // This prevents dice from jumping to held positions before the animation lands.
  // After animation completes, dice will transition to their correct (new) positions.
  // CRITICAL: Also use pre-roll layout on the FIRST render after rollKey changes (!rollKeyProcessed).
  // The useLayoutEffect hasn't fired yet to start the fly-in, but game logic already marked all dice
  // isHeld=true. Without this guard, layout briefly uses 5 held dice → left-justify flash for one frame.
  const usePreRollLayout = (isAnimatingFlyIn || !rollKeyProcessed) && Array.isArray(heldMaskBeforeComplete) && heldMaskBeforeComplete.length >= visualDice.length;
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
    // During animation: use the pre-roll held state for layout (canonicalized).
    layoutHeldDice = orderedDice
      .filter((d) => !!heldMaskBeforeComplete?.[d.originalIndex])
      .sort(canonicalHeldSort);
    layoutUnheldDice = orderedDice.filter((d) => !heldMaskBeforeComplete?.[d.originalIndex]);
  } else {
    // Normal: use actual isHeld state (already canonicalized above)
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
  
  // IMPORTANT: In pre-roll layout we must stay fully mask/registry-authoritative.
  // Backfilling held positions from actual current isHeld reintroduces a transient 5-die held row
  // on roll 3 frame 1, because game logic already marked all dice held before the animation starts.

  if (stableHeldRollKeyRef.current !== rollKey) {
    stableHeldRollKeyRef.current = rollKey;
    // Preserve registry for dice that remain held (same as fly-in path)
    // CRITICAL: Use heldMaskBeforeComplete as authority on roll 3 (same as useLayoutEffect path).
    // Without this, all 5 dice get registered on the first render frame → left-justify.
    const heldMaskForPreserve = Array.isArray(heldMaskBeforeComplete) ? heldMaskBeforeComplete : null;
    const preservedRegistry = new Map<number, number>();
    stableHeldSlotByDieRef.current.forEach((holdOrder, dieIdx) => {
      const wasHeldBeforeRoll = heldMaskForPreserve ? !!heldMaskForPreserve[dieIdx] : !!visualDice[dieIdx]?.isHeld;
      if (wasHeldBeforeRoll) {
        preservedRegistry.set(dieIdx, holdOrder);
      }
    });
    stableHeldSlotByDieRef.current = preservedRegistry;
    pendingReleaseCountRef.current = new Map();
  }

  // CRITICAL FIX: When in pre-roll layout mode, purge any registry entries that don't
  // match heldMaskBeforeComplete. The registry can contain stale entries from a previous
  // roll (e.g., die was held then unheld, but the unhold didn't propagate to observer
  // before rollKey changed). Without this purge, the stale entry widens the held row
  // for one frame, causing the left-justify flash.
  if (usePreRollLayout && Array.isArray(heldMaskBeforeComplete)) {
    const purged: number[] = [];
    stableHeldSlotByDieRef.current.forEach((_, dieIdx) => {
      if (!heldMaskBeforeComplete[dieIdx]) {
        purged.push(dieIdx);
      }
    });
    purged.forEach(dieIdx => stableHeldSlotByDieRef.current.delete(dieIdx));
  }

  // --- AUTHORITATIVE HELD ORDER REGISTRY ---
  // Tracks the order in which dice were held (monotonic counter).
  // Used for BOTH roller and observer to provide:
  // 1. Stable hold order (dice don't reshuffle)
  // 2. Dynamic recentering (positions computed from current registry size)
  // 3. Preservation across re-rolls (held dice keep their order)
  // CRITICAL: During fly-in animation, do NOT register dice that are currently animating.
  // On roll 3, game logic marks ALL dice as isHeld, but the animating dice are still visually
  // in scatter. Registering them would pollute the registry and cause the freeze to
  // treat scatter dice as held-row dice (the "left-justify all 5" bug).
  if (rollKey !== undefined) {
    orderedDice.forEach((item) => {
      // Skip dice that are currently flying in — they shouldn't enter the registry yet
      if (isAnimatingFlyIn && animatingDiceIndices.includes(item.originalIndex)) {
        return;
      }
      // CRITICAL: On the first render after rollKey changes (!rollKeyProcessed), the
      // useLayoutEffect hasn't fired yet to start the fly-in. Game logic already marked
      // all dice isHeld=true on roll 3, so without this guard ALL 5 dice get registered,
      // causing getStableHeldPos to compute positions for 5 → left-justify for one frame.
      // Use heldMaskBeforeComplete to determine which dice should actually be in the registry.
      if (!rollKeyProcessed && Array.isArray(heldMaskBeforeComplete)) {
        const wasHeldBefore = !!heldMaskBeforeComplete[item.originalIndex];
        if (!wasHeldBefore) return; // Don't register dice that weren't held pre-roll
      }
      const hasEntry = stableHeldSlotByDieRef.current.has(item.originalIndex);
      if (item.die.isHeld) {
        // Die is held: register if new, clear any pending release
        pendingReleaseCountRef.current.delete(item.originalIndex);
        if (!hasEntry) {
          // Observer hold-state stabilization is handled upstream via the presentation
          // debounce (debouncedDice), so no per-frame gating is needed here.
          stableHeldSlotByDieRef.current.set(item.originalIndex, holdOrderCounterRef.current++);
        }
      } else if (hasEntry) {
        // Die is NOT held but HAS a registered entry: release immediately.
        stableHeldSlotByDieRef.current.delete(item.originalIndex);
        pendingReleaseCountRef.current.delete(item.originalIndex);
        pendingHoldFramesRef.current.delete(item.originalIndex);
      } else {
        // Die is not held and has no entry: clear any pending hold
        pendingHoldFramesRef.current.delete(item.originalIndex);
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

    // CANONICAL HELD-ROW POLICY: sort by (die value ASC, originalIndex ASC).
    // This ensures held dice always display in ascending value order.
    const entries = [...stableHeldSlotByDieRef.current.entries()].sort((a, b) => {
      const valA = effectiveDice[a[0]]?.value ?? 0;
      const valB = effectiveDice[b[0]]?.value ?? 0;
      return valA !== valB ? valA - valB : a[0] - b[0];
    });
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
    const preRollHeld = !!heldMaskBeforeComplete?.[item.originalIndex];

    // For observers: if die has a registered slot, treat as held for caching purposes
    const registryHeldPos = getStableHeldPos(item.originalIndex);
    // CRITICAL: When usePreRollLayout is active with an authoritative mask, use ONLY
    // the mask. The registry can contain stale entries that would incorrectly widen the held row.
    const effectivelyHeld = usePreRollLayout && Array.isArray(heldMaskBeforeComplete)
      ? preRollHeld
      : (item.die.isHeld || !!registryHeldPos);

    if (effectivelyHeld) {
      const stableHeldPos = registryHeldPos;
      const committedHeldPos =
        stableHeldPos ??
        layoutHeldPos ??
        lastHeldTransformByDieRef.current.get(item.originalIndex) ??
        (() => {
          const heldSourceDice = usePreRollLayout
            ? layoutHeldDice
            : orderedDice.filter((d) => d.die.isHeld);
          const heldIdx = heldSourceDice.findIndex((d) => d.originalIndex === item.originalIndex);
          if (heldIdx < 0) return undefined;
          return getHeldPositions(heldSourceDice.length, dieWidth, gap)[heldIdx];
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

  // CANONICAL HELD-ROW POLICY: sort by (die value ASC, originalIndex ASC).
  const stableHeldRegistryEntries = [...stableHeldSlotByDieRef.current.entries()].sort((a, b) => {
    const valA = effectiveDice[a[0]]?.value ?? 0;
    const valB = effectiveDice[b[0]]?.value ?? 0;
    return valA !== valB ? valA - valB : a[0] - b[0];
  });
  const preRollHeldIndices = Array.isArray(heldMaskBeforeComplete)
    ? orderedDice
        .filter((item) => !!heldMaskBeforeComplete[item.originalIndex])
        .map((item) => item.originalIndex)
    : [];
  const mainBranch = hasNoOrderedDice
    ? "null/unmounted path"
    : shouldUseFreezePresentation
      ? "freeze path"
      : "held row path";
  const frameSnapshot = {
    instanceId: instanceIdRef.current,
    rollKey,
    rollKeyProcessed,
    cacheKey: String(cacheKey ?? ""),
    isAnimatingFlyIn,
    allHeld,
    heldMaskPresent: Array.isArray(heldMaskBeforeComplete),
    stableHeldSlotRegistrySize: stableHeldRegistryEntries.length,
    stableHeldSlotRegistry: stableHeldRegistryEntries,
    heldDiceCountUsedForLayout: layoutHeldDice.length,
    heldPositionsLength: heldPositions.length,
    heldPositionsX: heldPositions.map((pos) => pos.x),
    layoutHeldIndices: layoutHeldDice.map((item) => item.originalIndex),
    layoutUnheldIndices: layoutUnheldDice.map((item) => item.originalIndex),
    preRollHeldIndices,
    orderedDiceLength: orderedDice.length,
    usePreRollLayout,
    mainBranch,
  };

  // ── DIE_VALUE_IDENTITY_MISMATCH INVARIANT ──
  // Verify that every die's rendered value matches the authoritative source for its originalIndex.
  // Check 1: effectiveDice vs visualDice divergence
  // Check 2: frozen value vs effectiveDice divergence (the root cause of the post-roll-3 bug)
  if (layoutHeldDice.length > 0) {
    for (const item of orderedDice) {
      const effectiveVal = effectiveDice[item.originalIndex]?.value;
      const visualVal = visualDice[item.originalIndex]?.value;
      const itemVal = item.die.value;
      if (effectiveVal !== undefined && visualVal !== undefined && effectiveVal !== visualVal) {
        console.error('[DIE_VALUE_IDENTITY_MISMATCH]', {
          originalIndex: item.originalIndex,
          effectiveDiceValue: effectiveVal,
          visualDiceValue: visualVal,
          itemDieValue: itemVal,
          isHeld: item.die.isHeld,
          rollKey,
          effectiveDiceSource: isStabilizing ? 'lastValidDiceRef' : hasValidCurrentDice ? 'presentationDice' : shouldFallbackToCache ? 'lastValidDiceRef' : 'presentationDice',
          isStabilizing,
          isObserver,
        });
      }
      // Check frozen value consistency
      if (shouldUseFreezePresentation) {
        const frozenEntry = frozenPresentationRef.current?.get(item.originalIndex);
        if (frozenEntry && frozenEntry.value !== itemVal) {
          console.error('[DIE_FROZEN_VALUE_STALE]', {
            originalIndex: item.originalIndex,
            frozenValue: frozenEntry.value,
            currentEffectiveValue: itemVal,
            rollKey,
            isStabilizing,
            renderPath: 'freeze',
          });
        }
      }
    }
  }

  // ── PRE-COMPUTE RENDER DECISIONS (shared by trace + JSX) ──
  // This ensures the trace captures the EXACT same transforms applied in the render.
  const precomputedRenderDecisions = useMemo(() => {
    if (hasNoOrderedDice || showRollingMessage) return [];

    return orderedDice.map((item) => {
      const isThisDieAnimating = isAnimatingFlyIn && animatingDiceIndices.includes(item.originalIndex);
      const actuallyHeld = item.die.isHeld;
      const preRollHeld = !!heldMaskBeforeComplete?.[item.originalIndex];
      const registryHeldPos = getStableHeldPos(item.originalIndex);
      const layoutHeldPos2 = heldPositionByOriginalIndex.get(item.originalIndex);
      const cachedHeldPos = lastHeldTransformByDieRef.current.get(item.originalIndex);
      const cachedScatterPos = lastScatterTransformByDieRef.current.get(item.originalIndex);

      const effectivelyHeld2 = usePreRollLayout && Array.isArray(heldMaskBeforeComplete)
        ? preRollHeld
        : actuallyHeld;

      let heldPos2 = registryHeldPos ?? layoutHeldPos2 ?? (effectivelyHeld2 ? cachedHeldPos : undefined);
      if (effectivelyHeld2 && !heldPos2) {
        const heldSourceDice = usePreRollLayout
          ? layoutHeldDice
          : orderedDice.filter((d) => d.die.isHeld);
        const heldIdx = heldSourceDice.findIndex((d) => d.originalIndex === item.originalIndex);
        if (heldIdx >= 0) {
          const allHeldPositions = getHeldPositions(heldSourceDice.length, dieWidth, gap);
          heldPos2 = allHeldPositions[heldIdx];
        }
      }

      const isHeldInLayout2 = effectivelyHeld2 && !!heldPos2;

      // Scatter position resolution (mirrors render)
      const hasValidStablePos2 =
        !isHeldInLayout2 &&
        stableScatterRollKeyRef.current === rollKey &&
        stableScatterByDieRef.current.has(item.originalIndex);
      const stablePos2 = hasValidStablePos2
        ? stableScatterByDieRef.current.get(item.originalIndex)
        : undefined;
      const layoutScatterPos2 = scatterLayoutByOriginalIndex.get(item.originalIndex);
      const scatterPos2 =
        stablePos2 ??
        layoutScatterPos2 ??
        cachedScatterPos ??
        getUnheldPosition(0, Math.max(1, layoutUnheldDice.length));

      // Compute the ACTUAL transform string (same as render)
      let actualTransform: string;
      let actualPos: { x: number; y: number } | null = null;
      let intendedPos: { x: number; y: number } | null = null;

      if (shouldUseFreezePresentation) {
        const frozenEntry = frozenPresentationRef.current?.get(item.originalIndex);
        actualTransform = frozenEntry?.transform ?? 'none';
        // Parse frozen transform for position tracking
        const match = actualTransform.match(/calc\(-50% \+ ([-\d.]+)px\).*calc\(-50% \+ ([-\d.]+)px\)/);
        if (match) actualPos = { x: parseFloat(match[1]), y: parseFloat(match[2]) };
        // Intended = registry position
        if (registryHeldPos) intendedPos = { x: registryHeldPos.x, y: registryHeldPos.y + heldYOffset };
      } else if (isHeldInLayout2 && heldPos2) {
        actualPos = { x: heldPos2.x, y: heldPos2.y + heldYOffset };
        actualTransform = `translate(calc(-50% + ${heldPos2.x}px), calc(-50% + ${heldPos2.y + heldYOffset}px))`;
        intendedPos = registryHeldPos ? { x: registryHeldPos.x, y: registryHeldPos.y + heldYOffset } : actualPos;
      } else {
        actualPos = { x: scatterPos2.x, y: scatterPos2.y + unheldYOffset };
        actualTransform = `translate(calc(-50% + ${scatterPos2.x}px), calc(-50% + ${scatterPos2.y + unheldYOffset}px)) rotate(${scatterPos2.rotate}deg)`;
      }

      // Transform owner (same logic as render)
      const transformOwner2 = shouldUseFreezePresentation
        ? 'freeze'
        : isHeldInLayout2
          ? registryHeldPos
            ? 'held:stable-slot'
            : layoutHeldPos2
            ? 'held:layout'
            : cachedHeldPos
              ? 'held:cache'
              : 'held:derived'
          : stablePos2
            ? 'scatter:stable'
            : layoutScatterPos2
              ? 'scatter:layout'
              : cachedScatterPos
                ? 'scatter:cache'
                : 'scatter:default';

      // Display row
      let displayedRow2: 'held' | 'scatter' | 'animating' | 'hidden' | 'frozen';
      if (isThisDieAnimating) displayedRow2 = 'animating';
      else if (shouldUseFreezePresentation) displayedRow2 = frozenPresentationRef.current?.has(item.originalIndex) ? 'frozen' : 'hidden';
      else if (isHeldInLayout2) displayedRow2 = 'held';
      else displayedRow2 = 'scatter';

      // Slot index
      const registrySorted = stableHeldRegistryEntries.map(([di]) => di);
      let slotIndex: number | null = null;
      if (displayedRow2 === 'held' || displayedRow2 === 'frozen') {
        slotIndex = registrySorted.indexOf(item.originalIndex);
        if (slotIndex < 0) slotIndex = null;
      }

      return {
        originalIndex: item.originalIndex,
        value: item.die.value,
        isHeld: actuallyHeld,
        isHeldInLayout: isHeldInLayout2,
        displayedRow: displayedRow2,
        slotIndexInHeldRow: slotIndex,
        transformOwner: transformOwner2,
        intendedPos,
        actualPos,
        actualTransform,
        reactKey: `die-${item.originalIndex}`,
        hadRegistryPos: !!registryHeldPos,
        hadLayoutPos: !!layoutHeldPos2,
        hadCachedHeldPos: !!cachedHeldPos,
        hadCachedScatterPos: !!cachedScatterPos,
        hadStableScatterPos: !!stablePos2,
        hadFrozenTransform: !!frozenPresentationRef.current?.get(item.originalIndex),
      };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderedDice, shouldUseFreezePresentation, isAnimatingFlyIn, animatingDiceIndices, usePreRollLayout, rollKey, heldYOffset, unheldYOffset]);

  const activeRenderPath: DicePresentationTraceEntry['renderPath'] =
    shouldUseFreezePresentation ? 'freeze'
    : usePreRollLayout ? 'pre-roll-layout'
    : isAnimatingFlyIn ? 'fly-in'
    : 'normal';

  const registryEntries = stableHeldRegistryEntries.map(([dieIndex, holdOrder]) => ({ dieIndex, holdOrder }));
  const traceBaseInput: TraceInput = {
    traceKind: 'render',
    renderPath: activeRenderPath,
    rollKey,
    cacheKey,
    isObserver,
    registryEntries,
    heldPositionsComputed: heldPositions,
    layoutHeldCount: layoutHeldDice.length,
    layoutUnheldCount: layoutUnheldDice.length,
    dieRenderDecisions: precomputedRenderDecisions,
  };

  traceBaseInputRef.current = traceBaseInput;

  if (isDicePresentationTraceEnabled() && precomputedRenderDecisions.length > 0) {
    recordDicePresentationTrace(traceBaseInput);
  }

  // ── INVARIANT CHECKS: Held Slot Violation + Held Layer Escape ──
  {
    invariantFrameCounterRef.current++;
    const frameNum = invariantFrameCounterRef.current;
    const currentHeldSlots = new Map<number, { slot: number; row: string; transformOwner: string }>();

    if (layoutHeldDice.length > 0) {
      for (const decision of precomputedRenderDecisions) {
        if (!decision.isHeld) continue;

        // 1. HELD SLOT VIOLATION: slot changed while die stayed held
        const prev = prevFrameHeldSlotsRef.current.get(decision.originalIndex);
        if (prev && decision.slotIndexInHeldRow !== null && prev.slot !== decision.slotIndexInHeldRow) {
          console.error(
            `[HELD_SLOT_VIOLATION] die=${decision.originalIndex} prevSlot=${prev.slot} currSlot=${decision.slotIndexInHeldRow} rollKey=${rollKey} frame=${frameNum} renderPath=${activeRenderPath} transformOwner=${decision.transformOwner}`
          );
        }

        // 2. HELD LAYER ESCAPE: held die not in held row / not stable-slot transform
        if (decision.displayedRow !== 'held' && decision.displayedRow !== 'frozen') {
          console.error(
            `[HELD_ESCAPED_LAYER] die=${decision.originalIndex} displayedRow=${decision.displayedRow} transformOwner=${decision.transformOwner} rollKey=${rollKey} frame=${frameNum} renderPath=${activeRenderPath}`
          );
        } else if (
          decision.transformOwner !== 'held:stable-slot' &&
          decision.transformOwner !== 'freeze'
        ) {
          console.error(
            `[HELD_ESCAPED_LAYER] die=${decision.originalIndex} displayedRow=${decision.displayedRow} transformOwner=${decision.transformOwner} rollKey=${rollKey} frame=${frameNum} renderPath=${activeRenderPath}`
          );
        }

        if (decision.slotIndexInHeldRow !== null) {
          currentHeldSlots.set(decision.originalIndex, {
            slot: decision.slotIndexInHeldRow,
            row: decision.displayedRow,
            transformOwner: decision.transformOwner,
          });
        }
      }
    }

    prevFrameHeldSlotsRef.current = currentHeldSlots;
  }
  // ── END INVARIANT CHECKS ──

  // ── HELD-DIE CORRUPTION TRACE: Render boundary ──
  if (traceContext && gameType === 'yahtzee' && precomputedRenderDecisions.length > 0) {
    import('@/lib/yahtzeeHeldDieTrace').then(({
      traceYahtzeeHeldDie, buildDieTuples, isYahtzeeHeldTraceEnabled,
      checkHeldDieInScatter, checkHeldDieReanimated, checkValueHoldMismatch, checkCrossRollStateReuse,
    }) => {
      const rollGen = rollKey != null ? String(rollKey) : null;
      const renderDice = precomputedRenderDecisions.map(d => ({ value: d.value, isHeld: d.isHeld }));
      const renderDecisions = precomputedRenderDecisions.map(d => ({
        displayedRow: d.displayedRow,
        transformOwner: d.transformOwner,
        slotIndexInHeldRow: d.slotIndexInHeldRow,
        originalIndex: d.originalIndex,
        value: d.value,
        isHeld: d.isHeld,
      }));

      // Always run invariant checks (persist violations regardless of trace flag)
      if (traceContext.authoritativeDice) {
        checkHeldDieInScatter(traceContext.gameId, traceContext.handNumber, traceContext.roundId, traceContext.authoritativeDice, renderDecisions);
        checkValueHoldMismatch(traceContext.gameId, traceContext.handNumber, traceContext.roundId, traceContext.authoritativeDice, renderDecisions);
      }
      checkHeldDieReanimated(traceContext.gameId, traceContext.handNumber, traceContext.roundId, renderDecisions);
      checkCrossRollStateReuse(traceContext.gameId, traceContext.handNumber, traceContext.roundId, rollGen, renderDecisions);

      // Verbose trace when enabled
      if (isYahtzeeHeldTraceEnabled()) {
        traceYahtzeeHeldDie({
          gameId: traceContext.gameId,
          dealerGameId: traceContext.dealerGameId,
          roundId: traceContext.roundId,
          handNumber: traceContext.handNumber,
          turnPlayerId: traceContext.turnPlayerId,
          rollNumber: traceContext.rollNumber,
          rollGeneration: rollGen,
          sourceLayer: 'render',
          renderReason: isAnimatingFlyIn ? 'roll-start' : shouldUseFreezePresentation ? 'freeze' : 'roll-end',
          dice: buildDieTuples(renderDice, 'render',
            isAnimatingFlyIn ? 'roll-start' : shouldUseFreezePresentation ? 'freeze' : 'roll-end',
            traceContext.gameId, rollGen, renderDecisions),
          timestamp: Date.now(),
        });
      }
    });
  }

  const renderedDice = orderedDice.map((entry) => entry.die);
  const heldSlotIndexByDie = new Map<number, number>(
    stableHeldRegistryEntries.map(([dieIndex], slotIndex) => [dieIndex, slotIndex]),
  );

  // ── SHARED COMMITTED HELD-ROW ORDER (single render-source boundary) ──
  // Every render path below (normal held layer + freeze path) must iterate
  // held dice through this ordering so the React .map() order = DOM child
  // order = committed canonical order (value ASC, dieId ASC).
  // Scatter/unheld items follow in physical order — their relative DOM
  // position is irrelevant because they are placed by transform.
  const isHeldForCommittedOrder = (item: (typeof orderedDice)[number]) => {
    const preRollHeld = !!heldMaskBeforeComplete?.[item.originalIndex];
    return usePreRollLayout && Array.isArray(heldMaskBeforeComplete)
      ? preRollHeld
      : item.die.isHeld;
  };
  const committedHeldItems = orderedDice
    .filter(isHeldForCommittedOrder)
    .sort((a, b) =>
      a.die.value !== b.die.value
        ? a.die.value - b.die.value
        : a.originalIndex - b.originalIndex,
    );
  const nonHeldItems = orderedDice.filter((item) => !isHeldForCommittedOrder(item));
  const committedHeldLayerIterationOrder = [...committedHeldItems, ...nonHeldItems];

  const renderDieForLayer = (item: (typeof orderedDice)[number], targetLayer: "held" | "scatter") => {
    const sccDie = item.die as SCCDieType;
    const isSCCDie = isSCC && "isSCC" in sccDie && sccDie.isSCC;

    const isThisDieAnimating = isAnimatingFlyIn && animatingDiceIndices.includes(item.originalIndex);
    if (isThisDieAnimating) return null;

    const actuallyHeld = item.die.isHeld;
    const preRollHeld = !!heldMaskBeforeComplete?.[item.originalIndex];
    const registryHeldPos = getStableHeldPos(item.originalIndex);
    const layoutHeldPos = heldPositionByOriginalIndex.get(item.originalIndex);
    const cachedHeldPos = lastHeldTransformByDieRef.current.get(item.originalIndex);
    const cachedScatterPos = lastScatterTransformByDieRef.current.get(item.originalIndex);

    const effectivelyHeld = usePreRollLayout && Array.isArray(heldMaskBeforeComplete)
      ? preRollHeld
      : actuallyHeld;

    let heldPos = registryHeldPos ?? layoutHeldPos ?? (effectivelyHeld ? cachedHeldPos : undefined);
    if (effectivelyHeld && !heldPos) {
      const heldSourceDice = usePreRollLayout
        ? layoutHeldDice
        : orderedDice.filter((dieItem) => dieItem.die.isHeld).sort(canonicalHeldSort);
      const heldIdx = heldSourceDice.findIndex((dieItem) => dieItem.originalIndex === item.originalIndex);
      if (heldIdx >= 0) {
        const allHeldPositions = getHeldPositions(heldSourceDice.length, dieWidth, gap);
        heldPos = allHeldPositions[heldIdx];
      }
    }

    let isHeldInLayout = effectivelyHeld && !!heldPos;

    // FIX B2: Final render-boundary mutual exclusion rule.
    // If authoritative/presentation says die is held AND it's not currently animating fly-in,
    // it must NEVER render in scatter — not even for a single frame.
    // Force it into the held row with a fallback position (in canonical committed order).
    if (!isHeldInLayout && actuallyHeld && !isThisDieAnimating && !usePreRollLayout) {
      const heldSourceDice = orderedDice
        .filter((dieItem) => dieItem.die.isHeld)
        .sort(canonicalHeldSort);
      const heldIdx = heldSourceDice.findIndex((dieItem) => dieItem.originalIndex === item.originalIndex);
      if (heldIdx >= 0) {
        const allHeldPositions = getHeldPositions(heldSourceDice.length, dieWidth, gap);
        heldPos = allHeldPositions[heldIdx];
      } else {
        // Ultimate fallback: single die centered
        heldPos = getHeldPositions(1, dieWidth, gap)[0];
      }
      isHeldInLayout = true;
    }

    if (targetLayer === "held" ? !isHeldInLayout : isHeldInLayout) return null;

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

    const shouldHide = !isHeldInLayout && !showUnheldDice && !isAnimatingFlyIn;
    const isPreFlyInFrame = !rollKeyProcessed && !isAnimatingFlyIn && !isHeldInLayout
      && Array.isArray(heldMaskBeforeComplete) && !heldMaskBeforeComplete[item.originalIndex];

    if (shouldHide || isPreFlyInFrame) return null;

    const justBecameHeld = allHeld && !isAnimatingFlyIn && !isHeldInLayout;
    const shouldSkipTransition = justBecameHeld;
    const useInstantTransform = (isObserver && !isAnimatingFlyIn) || (targetLayer === "held" && isAnimatingFlyIn);

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

    const reactKey = `die-${item.originalIndex}`;
    const displayedRow = isHeldInLayout ? "held" : "scatter";
    const layerZIndex = targetLayer === "held" ? 30 : 10;
    const slotIndexInHeldRow = isHeldInLayout ? heldSlotIndexByDie.get(item.originalIndex) ?? null : null;

    return (
      <div
        key={reactKey}
        data-die-idx={item.originalIndex}
        data-die-value={item.die.value}
        data-die-held={item.die.isHeld}
        data-die-held-layout={isHeldInLayout}
        data-die-row={displayedRow}
        data-die-render-path={activeRenderPath}
        data-die-layer={targetLayer}
        data-die-layer-z={layerZIndex}
        data-die-react-key={reactKey}
        data-die-transform-owner={transformOwner}
        data-die-slot-index={slotIndexInHeldRow ?? ""}
        data-die-renderer-input-order={committedHeldItems.map((h) => h.originalIndex).join(",")}
        data-die-renderer-input-source="committedHeldLayerIterationOrder"
        data-die-committed-order={committedHeldItems.map((h) => h.originalIndex).join(",")}
        data-die-phase-branch={usePreRollLayout ? "pre-roll" : (isAnimatingFlyIn ? "fly-in" : "normal")}
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
          isUnusedDie={isDieUnused(item.die, isSCC, isQualified, allHeld, renderedDice)}
          isCargoDie={isCargoDie(item.die, isSCC, isQualified, allHeld, renderedDice)}
        />
      </div>
    );
  };


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

  if (hasNoOrderedDice) {
    return <div className="relative" style={{ width: '200px', height: '120px' }} />;
  }

  if (shouldUseFreezePresentation) {
    return (
      <div ref={containerRef} className="relative isolate" style={{ width: isTablet ? '360px' : '200px', height: isTablet ? '220px' : '120px' }}>
        {committedHeldLayerIterationOrder.map((item) => {
          const frozenEntry = frozenPresentationRef.current?.get(item.originalIndex);
          if (!frozenEntry) return null;

          const sccDie = item.die as SCCDieType;
          const isSCCDie = isSCC && 'isSCC' in sccDie && sccDie.isSCC;

          const heldMask = Array.isArray(heldMaskBeforeComplete) ? heldMaskBeforeComplete : null;
          const wasHeld = heldMask
            ? !!heldMask[item.originalIndex]
            : stableHeldSlotByDieRef.current.has(item.originalIndex);

          // CRITICAL: Use the frozen value (captured when positions were computed)
          // NOT item.die.value which may come from a different effectiveDice source
          // after stabilization ends. This prevents value-position mismatch.
          const frozenValue = frozenEntry.value;

          return (
            <div
              key={`die-${item.originalIndex}`}
              data-die-idx={item.originalIndex}
              data-die-value={frozenValue}
              data-die-held={true}
              data-die-held-layout={wasHeld}
              data-die-row="frozen"
              data-die-render-path="freeze"
              data-die-layer="freeze"
              data-die-layer-z={30}
              data-die-react-key={`die-${item.originalIndex}`}
              data-die-transform-owner="freeze"
              data-die-renderer-input-order={committedHeldItems.map((h) => h.originalIndex).join(",")}
              data-die-renderer-input-source="committedHeldLayerIterationOrder"
              data-die-committed-order={committedHeldItems.map((h) => h.originalIndex).join(",")}
              data-die-phase-branch="freeze"
              className="absolute will-change-transform"
              style={{
                left: '50%',
                top: '50%',
                transform: frozenEntry.transform,
              }}
            >
              <HorsesDie
                value={frozenValue}
                isHeld={wasHeld}
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

  return (
    <div ref={containerRef} className="relative isolate" style={{ width: isTablet ? "360px" : "200px", height: isTablet ? "220px" : "120px" }}>
      <div className="absolute inset-0 z-10 pointer-events-none" data-dice-layer="scatter" data-layer-z={10}>
        {orderedDice.map((item) => renderDieForLayer(item, "scatter"))}
      </div>

      {/* Fly-in animation overlay for unheld dice */}
      {isAnimatingFlyIn && animationOrigin && animatingDiceIndices.length > 0 && (
        <DiceRollAnimation
          runKey={flyInRunId}
          dice={effectiveDice}
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

      <div className="absolute inset-0 z-30 pointer-events-none" data-dice-layer="held" data-layer-z={30}>
        {committedHeldLayerIterationOrder.map((item) => renderDieForLayer(item, "held"))}
      </div>
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
