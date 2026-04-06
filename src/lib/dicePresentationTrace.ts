/**
 * Dice Presentation Trace Utility v5
 *
 * Captures final transform usage plus full-scene composition data across held,
 * scatter, animation, and frozen dice layers.
 *
 * Activated via DiceTraceControl UI (REC/STOP buttons).
 */

export interface DiceBoundingBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface DieRenderDecision {
  originalIndex: number;
  value: number;
  isHeld: boolean;
  isHeldInLayout: boolean;
  displayedRow: 'held' | 'scatter' | 'animating' | 'hidden' | 'frozen';
  slotIndexInHeldRow: number | null;

  // Transform resolution chain
  transformOwner: string; // e.g. "held:stable-slot", "held:layout", "held:cache", "scatter:stable", "freeze"
  intendedPos: { x: number; y: number } | null; // from slot assignment
  actualPos: { x: number; y: number } | null; // final transform applied
  actualTransform: string; // full CSS transform string
  reactKey: string;

  // Resolution chain visibility
  hadRegistryPos: boolean;
  hadLayoutPos: boolean;
  hadCachedHeldPos: boolean;
  hadCachedScatterPos: boolean;
  hadStableScatterPos: boolean;
  hadFrozenTransform: boolean;

  // Composition / paint diagnostics
  compositionLayer?: string | null;
  layerZIndex?: number | null;
  elementZIndex?: number | null;
  domOrder?: number | null;
  siblingOrder?: number | null;
  boundingBox?: DiceBoundingBox | null;
  overlapsWith?: number[];
}

export interface DiceOverlapEvent {
  type: 'DICE_OVERLAP_EVENT';
  dieAIndex: number;
  dieBIndex: number;
  dieARow: DieRenderDecision['displayedRow'];
  dieBRow: DieRenderDecision['displayedRow'];
  dieAReactKey: string;
  dieBReactKey: string;
  dieALayer: string | null;
  dieBLayer: string | null;
  dieALayerZIndex: number | null;
  dieBLayerZIndex: number | null;
  dieAElementZIndex: number | null;
  dieBElementZIndex: number | null;
  dieADomOrder: number | null;
  dieBDomOrder: number | null;
  dieABoundingBox: DiceBoundingBox;
  dieBBoundingBox: DiceBoundingBox;
}

export interface DiceDuplicateRenderEvent {
  type: 'DUPLICATE_DIE_RENDER';
  originalIndex: number;
  layerA: string | null;
  layerB: string | null;
  rowA: DieRenderDecision['displayedRow'];
  rowB: DieRenderDecision['displayedRow'];
  reactKeyA: string;
  reactKeyB: string;
  domOrderA: number | null;
  domOrderB: number | null;
  layerZIndexA: number | null;
  layerZIndexB: number | null;
  boundingBoxA: DiceBoundingBox | null;
  boundingBoxB: DiceBoundingBox | null;
}

export interface DiceHeldRowRemapEvent {
  type: 'HELD_ROW_REMAP';
  originalIndex: number;
  previousSlotIndex: number;
  currentSlotIndex: number;
  row: DieRenderDecision['displayedRow'];
  layer: string | null;
  reactKey: string;
}

export interface DiceCompositionLayerSnapshot {
  layer: string;
  zIndex: number | null;
  domOrder: number;
  containsHeld: boolean;
  containsAnimating: boolean;
}

export interface DiceCompositionLayerGroupDie {
  originalIndex: number;
  value: number;
  isHeld: boolean;
  displayedRow: DieRenderDecision['displayedRow'];
  slotIndexInHeldRow: number | null;
  reactKey: string;
  transformOwner: string;
  boundingBox: DiceBoundingBox | null;
  layerZIndex: number | null;
  domOrder: number | null;
}

export interface DiceCompositionLayerGroup {
  layer: string;
  sources: string[];
  dice: DiceCompositionLayerGroupDie[];
}

export interface DiceCompositionFrameSummary {
  totalDiceRendered: number;
  heldLayerDiceCount: number;
  animationLayerDiceCount: number;
  duplicateOriginalIndices: number[];
  hasDuplicateOriginalIndexAcrossLayers: boolean;
}

export interface DicePresentationTraceEntry {
  timestamp: number;
  frameNumber: number;
  traceKind: 'render' | 'composition';
  renderPath: 'normal' | 'freeze' | 'fly-in' | 'pre-roll-layout';
  rollKey: string | number | undefined;
  cacheKey: string | number | undefined;
  isObserver: boolean;

  // Per-die render decisions (the actual transforms applied)
  dieRenderDecisions: DieRenderDecision[];

  // Registry state
  registryEntries: Array<{ dieIndex: number; holdOrder: number }>;
  registrySize: number;

  // Layout counts
  layoutHeldCount: number;
  layoutUnheldCount: number;

  // Held positions computed for this registry size
  heldPositionsComputed: Array<{ x: number; y: number }>;

  // Composition state
  overlapEvents: DiceOverlapEvent[];
  duplicateRenderEvents: DiceDuplicateRenderEvent[];
  heldRowRemapEvents: DiceHeldRowRemapEvent[];
  layerSnapshots: DiceCompositionLayerSnapshot[];
  layerGroups: DiceCompositionLayerGroup[];
  frameSummary: DiceCompositionFrameSummary;
  finalHeldSlotMapping: Array<{ originalIndex: number; slotIndexInHeldRow: number }>;
  multipleRenderSources: boolean;
  heldSharesAnimatedLayer: boolean | null;
  heldAboveAnimating: boolean | null;

  // Mismatch detection
  transformMismatch: string | null;
  // Position swap detection (two held dice exchanged X positions)
  positionSwapDetected: string | null;
}

const MAX_ENTRIES = 500;
let traceBuffer: DicePresentationTraceEntry[] = [];
let runtimeEnabled = false;
let frameCounter = 0;
// Track previous frame's held dice actual positions for swap detection
let lastHeldPositions: Map<number, { x: number; y: number }> = new Map();
// Track previous frame's originalIndex -> held-slot mapping for remap detection
let lastHeldSlotMapping: Map<number, number> = new Map();

/** Start recording at runtime */
export function startDicePresentationTrace(): void {
  runtimeEnabled = true;
  traceBuffer = [];
  frameCounter = 0;
  lastHeldPositions = new Map();
  lastHeldSlotMapping = new Map();
}

/** Stop recording at runtime */
export function stopDicePresentationTrace(): void {
  runtimeEnabled = false;
}

/** Check if runtime recording is active */
export function isDicePresentationTraceRecording(): boolean {
  return runtimeEnabled;
}

export function isDicePresentationTraceEnabled(): boolean {
  return runtimeEnabled;
}

/** Get trace as JSON string for copy/export */
export function getDicePresentationTraceJSON(): string {
  return JSON.stringify(traceBuffer, null, 2);
}

function formatBoundingBox(box: DiceBoundingBox | null | undefined): string {
  if (!box) return '(n/a)';
  return `(${box.left.toFixed(1)},${box.top.toFixed(1)},${box.width.toFixed(1)}×${box.height.toFixed(1)})`;
}

function formatOverlapEvent(event: DiceOverlapEvent): string {
  return [
    'DICE_OVERLAP_EVENT:',
    `die${event.dieAIndex}[row=${event.dieARow},layer=${event.dieALayer ?? 'unknown'},z=${event.dieALayerZIndex ?? 'auto'}:${event.dieAElementZIndex ?? 'auto'},dom=${event.dieADomOrder ?? 'n/a'}]`,
    '↔',
    `die${event.dieBIndex}[row=${event.dieBRow},layer=${event.dieBLayer ?? 'unknown'},z=${event.dieBLayerZIndex ?? 'auto'}:${event.dieBElementZIndex ?? 'auto'},dom=${event.dieBDomOrder ?? 'n/a'}]`,
    `boxA=${formatBoundingBox(event.dieABoundingBox)}`,
    `boxB=${formatBoundingBox(event.dieBBoundingBox)}`,
  ].join(' ');
}

function formatDuplicateRenderEvent(event: DiceDuplicateRenderEvent): string {
  return [
    'DUPLICATE_DIE_RENDER:',
    `die${event.originalIndex}`,
    `A[layer=${event.layerA ?? 'unknown'},row=${event.rowA},z=${event.layerZIndexA ?? 'auto'},dom=${event.domOrderA ?? 'n/a'},key=${event.reactKeyA}]`,
    '↔',
    `B[layer=${event.layerB ?? 'unknown'},row=${event.rowB},z=${event.layerZIndexB ?? 'auto'},dom=${event.domOrderB ?? 'n/a'},key=${event.reactKeyB}]`,
    `boxA=${formatBoundingBox(event.boundingBoxA)}`,
    `boxB=${formatBoundingBox(event.boundingBoxB)}`,
  ].join(' ');
}

function formatHeldRowRemapEvent(event: DiceHeldRowRemapEvent): string {
  return [
    'HELD_ROW_REMAP:',
    `die${event.originalIndex}`,
    `slot=${event.previousSlotIndex}→${event.currentSlotIndex}`,
    `row=${event.row}`,
    `layer=${event.layer ?? 'unknown'}`,
    `key=${event.reactKey}`,
  ].join(' ');
}

/** Get all mismatch/swap events from the buffer */
export function getSwapEvents(): string[] {
  return traceBuffer.flatMap((entry) => {
    const events: string[] = [];
    if (entry.transformMismatch) events.push(entry.transformMismatch);
    if (entry.positionSwapDetected) events.push(entry.positionSwapDetected);
    entry.heldRowRemapEvents.forEach((event) => events.push(formatHeldRowRemapEvent(event)));
    entry.duplicateRenderEvents.forEach((event) => events.push(formatDuplicateRenderEvent(event)));
    entry.overlapEvents.forEach((event) => events.push(formatOverlapEvent(event)));
    return events;
  });
}

export function getDicePresentationTraceBuffer(): DicePresentationTraceEntry[] {
  return [...traceBuffer];
}

export function clearDicePresentationTrace(): void {
  traceBuffer = [];
  frameCounter = 0;
  lastHeldPositions = new Map();
  lastHeldSlotMapping = new Map();
}

/**
 * Detect transform mismatches: if a die is held in layout, its actual position
 * should match the intended held-slot position. If not, something is overriding.
 */
function detectTransformMismatch(decisions: DieRenderDecision[]): string | null {
  const mismatches: string[] = [];
  for (const d of decisions) {
    if (d.isHeldInLayout && d.intendedPos && d.actualPos) {
      const dx = Math.abs(d.intendedPos.x - d.actualPos.x);
      const dy = Math.abs(d.intendedPos.y - d.actualPos.y);
      if (dx > 1 || dy > 1) {
        mismatches.push(
          `die${d.originalIndex}(v=${d.value}): intended(${d.intendedPos.x.toFixed(1)},${d.intendedPos.y.toFixed(1)}) actual(${d.actualPos.x.toFixed(1)},${d.actualPos.y.toFixed(1)}) owner=${d.transformOwner}`
        );
      }
    }
  }
  return mismatches.length > 0
    ? `TRANSFORM_MISMATCH: ${mismatches.join(' | ')}`
    : null;
}

/**
 * Detect position swap: two held dice exchanged X positions between frames.
 */
function detectPositionSwap(decisions: DieRenderDecision[]): string | null {
  const currentHeld = decisions.filter(d => d.isHeldInLayout && d.actualPos);
  if (currentHeld.length < 2 || lastHeldPositions.size < 2) {
    // Update tracking
    lastHeldPositions = new Map();
    currentHeld.forEach(d => {
      if (d.actualPos) lastHeldPositions.set(d.originalIndex, d.actualPos);
    });
    return null;
  }

  // Check if any two dice swapped X positions
  const swaps: string[] = [];
  for (const d of currentHeld) {
    const prevPos = lastHeldPositions.get(d.originalIndex);
    if (!prevPos || !d.actualPos) continue;
    const dx = Math.abs(d.actualPos.x - prevPos.x);
    if (dx > 5) {
      // This die moved significantly — check if another die took its old position
      for (const other of currentHeld) {
        if (other.originalIndex === d.originalIndex) continue;
        if (!other.actualPos) continue;
        const otherPrevPos = lastHeldPositions.get(other.originalIndex);
        if (!otherPrevPos) continue;
        // Did 'other' move to where 'd' was, and 'd' moved to where 'other' was?
        const otherTookMySpot = Math.abs(other.actualPos.x - prevPos.x) < 3;
        const iTookOtherSpot = Math.abs(d.actualPos.x - otherPrevPos.x) < 3;
        if (otherTookMySpot && iTookOtherSpot) {
          const key = [d.originalIndex, other.originalIndex].sort().join('-');
          const msg = `POSITION_SWAP: die${d.originalIndex}↔die${other.originalIndex} x(${prevPos.x.toFixed(0)}↔${otherPrevPos.x.toFixed(0)}) owner=${d.transformOwner}/${other.transformOwner}`;
          if (!swaps.some(s => s.includes(key))) swaps.push(msg);
        }
      }
    }
  }

  // Update tracking
  lastHeldPositions = new Map();
  currentHeld.forEach(d => {
    if (d.actualPos) lastHeldPositions.set(d.originalIndex, d.actualPos);
  });

  return swaps.length > 0 ? swaps.join(' | ') : null;
}

function getLayerKey(decision: DieRenderDecision): string {
  return decision.compositionLayer ?? 'unknown';
}

function getHeldDecisionPriority(decision: DieRenderDecision): number {
  switch (decision.displayedRow) {
    case 'held':
      return 0;
    case 'frozen':
      return 1;
    default:
      return 2;
  }
}

function getFinalHeldSlotMapping(decisions: DieRenderDecision[]): Array<{ originalIndex: number; slotIndexInHeldRow: number }> {
  const mapping = new Map<number, number>();
  const sorted = [...decisions].sort((a, b) => {
    const priorityDelta = getHeldDecisionPriority(a) - getHeldDecisionPriority(b);
    if (priorityDelta !== 0) return priorityDelta;
    const domOrderA = a.domOrder ?? Number.MAX_SAFE_INTEGER;
    const domOrderB = b.domOrder ?? Number.MAX_SAFE_INTEGER;
    if (domOrderA !== domOrderB) return domOrderA - domOrderB;
    return a.originalIndex - b.originalIndex;
  });

  for (const decision of sorted) {
    if (decision.slotIndexInHeldRow == null) continue;
    if (!(decision.isHeldInLayout || decision.displayedRow === 'held' || decision.displayedRow === 'frozen')) continue;
    if (!mapping.has(decision.originalIndex)) {
      mapping.set(decision.originalIndex, decision.slotIndexInHeldRow);
    }
  }

  return Array.from(mapping.entries())
    .map(([originalIndex, slotIndexInHeldRow]) => ({ originalIndex, slotIndexInHeldRow }))
    .sort((a, b) => a.slotIndexInHeldRow - b.slotIndexInHeldRow || a.originalIndex - b.originalIndex);
}

function detectDuplicateDieRender(decisions: DieRenderDecision[]): DiceDuplicateRenderEvent[] {
  const byOriginalIndex = new Map<number, DieRenderDecision[]>();
  decisions.forEach((decision) => {
    const existing = byOriginalIndex.get(decision.originalIndex) ?? [];
    existing.push(decision);
    byOriginalIndex.set(decision.originalIndex, existing);
  });

  const events: DiceDuplicateRenderEvent[] = [];
  const seenPairs = new Set<string>();

  byOriginalIndex.forEach((matches, originalIndex) => {
    for (let i = 0; i < matches.length; i++) {
      for (let j = i + 1; j < matches.length; j++) {
        const a = matches[i];
        const b = matches[j];
        const layerA = getLayerKey(a);
        const layerB = getLayerKey(b);
        if (layerA === layerB) continue;

        const dedupeKey = [
          originalIndex,
          layerA,
          layerB,
          a.reactKey,
          b.reactKey,
          a.domOrder ?? 'na',
          b.domOrder ?? 'na',
        ].join('|');

        if (seenPairs.has(dedupeKey)) continue;
        seenPairs.add(dedupeKey);

        events.push({
          type: 'DUPLICATE_DIE_RENDER',
          originalIndex,
          layerA: a.compositionLayer ?? null,
          layerB: b.compositionLayer ?? null,
          rowA: a.displayedRow,
          rowB: b.displayedRow,
          reactKeyA: a.reactKey,
          reactKeyB: b.reactKey,
          domOrderA: a.domOrder ?? null,
          domOrderB: b.domOrder ?? null,
          layerZIndexA: a.layerZIndex ?? null,
          layerZIndexB: b.layerZIndex ?? null,
          boundingBoxA: a.boundingBox ?? null,
          boundingBoxB: b.boundingBox ?? null,
        });
      }
    }
  });

  return events;
}

function detectHeldRowRemap(decisions: DieRenderDecision[]): {
  finalHeldSlotMapping: Array<{ originalIndex: number; slotIndexInHeldRow: number }>;
  heldRowRemapEvents: DiceHeldRowRemapEvent[];
} {
  const finalHeldSlotMapping = getFinalHeldSlotMapping(decisions);
  const currentMapping = new Map(finalHeldSlotMapping.map((entry) => [entry.originalIndex, entry.slotIndexInHeldRow]));
  const preferredDecisionByIndex = new Map<number, DieRenderDecision>();

  [...decisions]
    .sort((a, b) => {
      const priorityDelta = getHeldDecisionPriority(a) - getHeldDecisionPriority(b);
      if (priorityDelta !== 0) return priorityDelta;
      const domOrderA = a.domOrder ?? Number.MAX_SAFE_INTEGER;
      const domOrderB = b.domOrder ?? Number.MAX_SAFE_INTEGER;
      if (domOrderA !== domOrderB) return domOrderA - domOrderB;
      return a.originalIndex - b.originalIndex;
    })
    .forEach((decision) => {
      if (decision.slotIndexInHeldRow == null) return;
      if (!(decision.isHeldInLayout || decision.displayedRow === 'held' || decision.displayedRow === 'frozen')) return;
      if (!preferredDecisionByIndex.has(decision.originalIndex)) {
        preferredDecisionByIndex.set(decision.originalIndex, decision);
      }
    });

  const heldRowRemapEvents: DiceHeldRowRemapEvent[] = [];
  currentMapping.forEach((slotIndex, originalIndex) => {
    const prevSlotIndex = lastHeldSlotMapping.get(originalIndex);
    if (prevSlotIndex == null || prevSlotIndex === slotIndex) return;

    const preferredDecision = preferredDecisionByIndex.get(originalIndex);
    heldRowRemapEvents.push({
      type: 'HELD_ROW_REMAP',
      originalIndex,
      previousSlotIndex: prevSlotIndex,
      currentSlotIndex: slotIndex,
      row: preferredDecision?.displayedRow ?? 'held',
      layer: preferredDecision?.compositionLayer ?? null,
      reactKey: preferredDecision?.reactKey ?? `die-${originalIndex}`,
    });
  });

  lastHeldSlotMapping = currentMapping;

  return {
    finalHeldSlotMapping,
    heldRowRemapEvents,
  };
}

function buildLayerGroups(decisions: DieRenderDecision[]): DiceCompositionLayerGroup[] {
  const groups = new Map<string, DiceCompositionLayerGroup>();

  decisions.forEach((decision) => {
    const layer = getLayerKey(decision);
    const existing = groups.get(layer) ?? {
      layer,
      sources: [],
      dice: [],
    };

    if (!existing.sources.includes(decision.transformOwner)) {
      existing.sources.push(decision.transformOwner);
    }

    existing.dice.push({
      originalIndex: decision.originalIndex,
      value: decision.value,
      isHeld: decision.isHeld,
      displayedRow: decision.displayedRow,
      slotIndexInHeldRow: decision.slotIndexInHeldRow,
      reactKey: decision.reactKey,
      transformOwner: decision.transformOwner,
      boundingBox: decision.boundingBox ?? null,
      layerZIndex: decision.layerZIndex ?? null,
      domOrder: decision.domOrder ?? null,
    });

    groups.set(layer, existing);
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      sources: [...group.sources].sort(),
      dice: [...group.dice].sort((a, b) => {
        const domOrderA = a.domOrder ?? Number.MAX_SAFE_INTEGER;
        const domOrderB = b.domOrder ?? Number.MAX_SAFE_INTEGER;
        if (domOrderA !== domOrderB) return domOrderA - domOrderB;
        return a.originalIndex - b.originalIndex;
      }),
    }))
    .sort((a, b) => a.layer.localeCompare(b.layer));
}

function buildFrameSummary(
  decisions: DieRenderDecision[],
  duplicateRenderEvents: DiceDuplicateRenderEvent[]
): DiceCompositionFrameSummary {
  const duplicateOriginalIndices = Array.from(
    new Set(duplicateRenderEvents.map((event) => event.originalIndex))
  ).sort((a, b) => a - b);

  return {
    totalDiceRendered: decisions.length,
    heldLayerDiceCount: decisions.filter((decision) => getLayerKey(decision) === 'held').length,
    animationLayerDiceCount: decisions.filter((decision) => getLayerKey(decision) === 'animation').length,
    duplicateOriginalIndices,
    hasDuplicateOriginalIndexAcrossLayers: duplicateOriginalIndices.length > 0,
  };
}

export interface TraceInput {
  traceKind?: DicePresentationTraceEntry['traceKind'];
  renderPath: DicePresentationTraceEntry['renderPath'];
  rollKey: string | number | undefined;
  cacheKey: string | number | undefined;
  isObserver: boolean;
  registryEntries: Array<{ dieIndex: number; holdOrder: number }>;
  heldPositionsComputed: Array<{ x: number; y: number }>;
  layoutHeldCount: number;
  layoutUnheldCount: number;
  dieRenderDecisions: DieRenderDecision[];
  overlapEvents?: DiceOverlapEvent[];
  layerSnapshots?: DiceCompositionLayerSnapshot[];
  multipleRenderSources?: boolean;
  heldSharesAnimatedLayer?: boolean | null;
  heldAboveAnimating?: boolean | null;
}

export function recordDicePresentationTrace(input: TraceInput): void {
  if (!runtimeEnabled) return;

  const overlapEvents = input.overlapEvents ?? [];
  const duplicateRenderEvents = detectDuplicateDieRender(input.dieRenderDecisions);
  const { finalHeldSlotMapping, heldRowRemapEvents } = detectHeldRowRemap(input.dieRenderDecisions);
  const layerGroups = buildLayerGroups(input.dieRenderDecisions);
  const frameSummary = buildFrameSummary(input.dieRenderDecisions, duplicateRenderEvents);
  const hasHeldEvidence =
    input.layoutHeldCount > 0 ||
    input.heldPositionsComputed.length > 0 ||
    input.registryEntries.length > 0 ||
    input.dieRenderDecisions.some(
      (decision) =>
        decision.isHeldInLayout ||
        decision.displayedRow === 'held' ||
        decision.displayedRow === 'frozen' ||
        decision.slotIndexInHeldRow !== null
    ) ||
    frameSummary.heldLayerDiceCount > 0;

  if (!hasHeldEvidence && overlapEvents.length === 0 && duplicateRenderEvents.length === 0 && heldRowRemapEvents.length === 0) {
    return;
  }

  frameCounter++;

  const mismatch = detectTransformMismatch(input.dieRenderDecisions);
  const swap = detectPositionSwap(input.dieRenderDecisions);
  const multipleRenderSources =
    input.multipleRenderSources ??
    layerGroups.filter((group) => group.dice.length > 0).length > 1;

  const entry: DicePresentationTraceEntry = {
    timestamp: Date.now(),
    frameNumber: frameCounter,
    traceKind: input.traceKind ?? 'render',
    renderPath: input.renderPath,
    rollKey: input.rollKey,
    cacheKey: input.cacheKey,
    isObserver: input.isObserver,
    dieRenderDecisions: input.dieRenderDecisions,
    registryEntries: input.registryEntries,
    registrySize: input.registryEntries.length,
    layoutHeldCount: input.layoutHeldCount,
    layoutUnheldCount: input.layoutUnheldCount,
    heldPositionsComputed: input.heldPositionsComputed,
    overlapEvents,
    duplicateRenderEvents,
    heldRowRemapEvents,
    layerSnapshots: input.layerSnapshots ?? [],
    layerGroups,
    frameSummary,
    finalHeldSlotMapping,
    multipleRenderSources,
    heldSharesAnimatedLayer: input.heldSharesAnimatedLayer ?? null,
    heldAboveAnimating: input.heldAboveAnimating ?? null,
    transformMismatch: mismatch,
    positionSwapDetected: swap,
  };

  traceBuffer.push(entry);
  if (traceBuffer.length > MAX_ENTRIES) {
    traceBuffer = traceBuffer.slice(-MAX_ENTRIES);
  }

  // Console output
  if (mismatch) {
    console.warn(`[DICE TRACE] ⚠️ ${mismatch}`);
  }
  if (swap) {
    console.warn(`[DICE TRACE] 🔄 ${swap}`);
  }
  if (heldRowRemapEvents.length > 0) {
    heldRowRemapEvents.forEach((event) => {
      console.warn(`[DICE TRACE] 🧭 ${formatHeldRowRemapEvent(event)}`);
    });
  }
  if (duplicateRenderEvents.length > 0) {
    duplicateRenderEvents.forEach((event) => {
      console.warn(`[DICE TRACE] 👥 ${formatDuplicateRenderEvent(event)}`);
    });
  }
  if (overlapEvents.length > 0) {
    overlapEvents.forEach((event) => {
      console.warn(`[DICE TRACE] 🎯 ${formatOverlapEvent(event)}`);
    });
  }

  if (!mismatch && !swap && heldRowRemapEvents.length === 0 && duplicateRenderEvents.length === 0 && overlapEvents.length === 0) {
    if (entry.traceKind === 'composition') {
      const heldMapSummary = entry.finalHeldSlotMapping
        .map((mapping) => `die${mapping.originalIndex}->slot${mapping.slotIndexInHeldRow}`)
        .join(', ');
      const layerSummary = entry.layerGroups
        .map((group) => `${group.layer}[${group.dice.map((die) => `die${die.originalIndex}${die.slotIndexInHeldRow != null ? `:slot${die.slotIndexInHeldRow}` : ''}`).join(',')}]`)
        .join(' ');
      console.log(
        `[DICE TRACE] f${frameCounter} composition path=${input.renderPath} total=${entry.frameSummary.totalDiceRendered} heldLayer=${entry.frameSummary.heldLayerDiceCount} animLayer=${entry.frameSummary.animationLayerDiceCount} dup=[${entry.frameSummary.duplicateOriginalIndices.join(',')}] heldMap=[${heldMapSummary}] layers=${layerSummary}`
      );
      return;
    }

    const heldSummary = input.dieRenderDecisions
      .filter(d => d.isHeldInLayout)
      .map(d => `die${d.originalIndex}(v=${d.value})@x=${d.actualPos?.x.toFixed(0)}[${d.transformOwner}]`)
      .join(', ');
    console.log(
      `[DICE TRACE] f${frameCounter} path=${input.renderPath} rollKey=${input.rollKey} held=[${heldSummary}]`
    );
  }
}

// Legacy compat
export function detectOrderingSwap(
  _prev: DicePresentationTraceEntry,
  _curr: DicePresentationTraceEntry
): string | null {
  return _curr.positionSwapDetected ?? _curr.transformMismatch ?? null;
}
