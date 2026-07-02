/**
 * Yahtzee Reorder Trace
 *
 * On-screen/exportable per-die presentation events emitted at every state
 * transition and every rendered ordering change. Designed to prove, across
 * the reorder-harness scenario, whether the held dice preserve their
 * physical identities, values, colors, and held-row order while die 4
 * changes value.
 *
 * Recording is OFF by default; the pill flips `active` on when armed.
 */

export type YahtzeeDieSourceRow = 'roll' | 'held' | 'result' | 'other';

export type YahtzeeDiePresentationEvent = {
  ts: number;
  reason: string; // free-form emit reason (e.g. 'render', 'roll:1', 'hold:die-2')
  rollNumber: number | null;
  dice: YahtzeeDieSnapshot[];
};

export type YahtzeeDieSnapshot = {
  dieId: number; // stable physical die id (0..4)
  value: number;
  held: boolean;
  colorToken: string | null; // canonical color/token/class
  computedColor: string | null; // resolved rgb(a)
  sourceRow: YahtzeeDieSourceRow;
  indexInRow: number;
  globalRenderIndex: number;
  rect: { x: number; y: number; w: number; h: number } | null;
  animationPhase: string | null; // e.g. 'settled' | 'in-flight' | 'armed'
  reactKey: string | null;
  // Temporary render-source boundary audit fields (populated from
  // DOM data-die-* attributes when available). Prove that the renderer
  // actually iterated the committed canonical order and did not fall
  // back to physical / insertion / animation-array order.
  rendererInputOrder: number[] | null;
  rendererInputSource: string | null;
  phaseBranch: string | null;
  previous: null | Omit<YahtzeeDieSnapshot, 'previous'>;
};

export type YahtzeeReorderViolation =
  | 'DIE_VALUE_CHANGED_WITHOUT_ROLL'
  | 'DIE_COLOR_CHANGED_WITHOUT_VALUE_CHANGE'
  | 'HELD_ROW_ORDER_CHANGED'
  | 'HELD_ROW_ORDER_DRIFT_VIOLATION'
  | 'DIE_ROW_CHANGED_WITHOUT_HOLD_OR_RELEASE'
  | 'DIE_IDENTITY_REPLACED'
  | 'DIE_POSITION_CHANGED_WITHOUT_EXPECTED_CAUSE'
  | 'DIE_DISAPPEARED_AFTER_LAND'
  | 'DIE_REORDERED_AFTER_HOLD'
  | 'DIE_RENDER_NODE_REPLACED'
  | 'DIE_SCATTERED_ROW_LOST'
  | 'CATEGORY_SELECTION_HELD_ORDER_DRIFT'
  | 'CATEGORY_SELECTION_DIE_OWNER_SWAP';

export function emitYahtzeeReorderViolation(
  kind: YahtzeeReorderViolation,
  dieId: number | null,
  detail: Record<string, unknown>,
): void {
  pushViolation({
    ts: Date.now(),
    kind,
    dieId,
    rollNumber: currentRollNumber,
    detail,
  });
  notify();
}

export type YahtzeeReorderViolationEvent = {
  ts: number;
  kind: YahtzeeReorderViolation;
  dieId: number | null;
  rollNumber: number | null;
  detail: Record<string, unknown>;
};

const MAX_EVENTS = 400;
const presentationEvents: YahtzeeDiePresentationEvent[] = [];
const violationEvents: YahtzeeReorderViolationEvent[] = [];

export type YahtzeeReorderHarnessLifecycleKind =
  | 'YAHTZEE_REORDER_HARNESS_ARMED'
  | 'YAHTZEE_REORDER_HARNESS_WAITING'
  | 'YAHTZEE_REORDER_HARNESS_STARTED'
  | 'YAHTZEE_REORDER_HARNESS_STEP'
  | 'YAHTZEE_REORDER_HARNESS_COMPLETED'
  | 'YAHTZEE_REORDER_HARNESS_REJECTED'
  | 'YAHTZEE_REORDER_HARNESS_DISARMED'
  | 'YAHTZEE_REORDER_HARNESS_MANUAL_START'
  | 'YAHTZEE_REORDER_HARNESS_COMPLETE'
  | 'YAHTZEE_REORDER_HARNESS_ERROR'
  | 'YAHTZEE_REORDER_HARNESS_STOPPED'
  | 'ACTION_DISPATCHED'
  | 'REDUCER_COMMITTED'
  | 'DOM_MOUNTED'
  | 'POST_PAINT_CAPTURED'
  | 'ANIMATION_SETTLED'
  | 'ANIMATION_SETTLE_TIMEOUT'
  | 'STEP_ADVANCE'
  | 'YAHTZEE_CATEGORY_SELECTION_INTENT'
  | 'YAHTZEE_CATEGORY_SELECTION_PREVIEW'
  | 'YAHTZEE_CATEGORY_SELECTION_DISPATCHED'
  | 'YAHTZEE_CATEGORY_SELECTION_AUTHORITY_ARRIVAL'
  | 'YAHTZEE_CATEGORY_SELECTION_PRESENTATION_COMMIT'
  | 'YAHTZEE_REORDER_TRACE_HOLD_REQUESTED';

export type YahtzeeReorderHarnessLifecycleEvent = {
  ts: number;
  kind: YahtzeeReorderHarnessLifecycleKind;
  runId: string | null;
  detail: Record<string, unknown>;
};

const lifecycleEvents: YahtzeeReorderHarnessLifecycleEvent[] = [];

let active = false;
let currentRollNumber: number | null = null;

// Previous snapshot per physical dieId for delta detection.
const prevByDieId: Map<number, YahtzeeDieSnapshot> = new Map();

// Committed held-row canonical order: derived once per held-set signature
// using (value ASC, dieId ASC) and then held stable until the set or a
// held die's value legitimately changes. `null` = no commit yet.
let committedHeldSig: string | null = null;
let committedHeldOrder: number[] = []; // dieIds in committed canonical order
let committedHeldValues: Map<number, number> = new Map(); // dieId -> value at commit

export function emitYahtzeeReorderHarnessLifecycle(
  kind: YahtzeeReorderHarnessLifecycleKind,
  runId: string | null,
  detail: Record<string, unknown> = {},
): void {
  const ev: YahtzeeReorderHarnessLifecycleEvent = {
    ts: Date.now(),
    kind,
    runId,
    detail,
  };
  lifecycleEvents.push(ev);
  if (lifecycleEvents.length > MAX_EVENTS) {
    lifecycleEvents.splice(0, lifecycleEvents.length - MAX_EVENTS);
  }
  notify();
}

export function getYahtzeeReorderLifecycleEvents(): readonly YahtzeeReorderHarnessLifecycleEvent[] {
  return lifecycleEvents;
}

export function clearYahtzeeReorderTrace(): void {
  presentationEvents.length = 0;
  violationEvents.length = 0;
  lifecycleEvents.length = 0;
  prevByDieId.clear();
  committedHeldSig = null;
  committedHeldOrder = [];
  committedHeldValues = new Map();
  currentRollNumber = null;
  notify();
}

const listeners = new Set<() => void>();
function notify(): void {
  listeners.forEach((cb) => {
    try {
      cb();
    } catch {
      /* swallow */
    }
  });
}

export function subscribeYahtzeeReorderTrace(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function setYahtzeeReorderTraceActive(next: boolean): void {
  active = next;
  notify();
}
export function isYahtzeeReorderTraceActive(): boolean {
  return active;
}

export function setYahtzeeReorderTraceRoll(rollNumber: number | null): void {
  currentRollNumber = rollNumber;
}

export function resetYahtzeeReorderTrace(): void {
  presentationEvents.length = 0;
  violationEvents.length = 0;
  prevByDieId.clear();
  committedHeldSig = null;
  committedHeldOrder = [];
  committedHeldValues = new Map();
  currentRollNumber = null;
  notify();
}

export function getYahtzeeReorderTraceSnapshot(): {
  presentation: readonly YahtzeeDiePresentationEvent[];
  violations: readonly YahtzeeReorderViolationEvent[];
  lifecycle: readonly YahtzeeReorderHarnessLifecycleEvent[];
  active: boolean;
  currentRollNumber: number | null;
} {
  return {
    presentation: presentationEvents,
    violations: violationEvents,
    lifecycle: lifecycleEvents,
    active,
    currentRollNumber,
  };
}

function pushEvent(ev: YahtzeeDiePresentationEvent): void {
  presentationEvents.push(ev);
  if (presentationEvents.length > MAX_EVENTS) {
    presentationEvents.splice(0, presentationEvents.length - MAX_EVENTS);
  }
}
function pushViolation(v: YahtzeeReorderViolationEvent): void {
  violationEvents.push(v);
  if (violationEvents.length > MAX_EVENTS) {
    violationEvents.splice(0, violationEvents.length - MAX_EVENTS);
  }
}

export type YahtzeeDieInput = Omit<YahtzeeDieSnapshot, 'previous'>;

/**
 * Public entry: emit one presentation event snapshot covering all dice.
 * Computes previous-per-die + violations vs the last snapshot. No-op when
 * trace is inactive.
 */
export function emitYahtzeeDiePresentation(
  reason: string,
  diceIn: YahtzeeDieInput[],
): void {
  if (!active) return;
  const ts = Date.now();
  const snapshots: YahtzeeDieSnapshot[] = diceIn.map((d) => {
    const prev = prevByDieId.get(d.dieId) ?? null;
    return {
      ...d,
      previous: prev ? stripPrev(prev) : null,
    };
  });

  // Detect violations
  for (const s of snapshots) {
    const p = s.previous;
    if (!p) continue;
    if (
      s.value !== p.value &&
      (currentRollNumber == null || currentRollNumber === (p as YahtzeeDieInput & { rollNumber?: number }).indexInRow /* placeholder */) &&
      // approximate "without roll": value changed but the reason string does not include 'roll' AND held remained true
      !/roll/i.test(reason) &&
      s.held &&
      p.held
    ) {
      pushViolation({
        ts,
        kind: 'DIE_VALUE_CHANGED_WITHOUT_ROLL',
        dieId: s.dieId,
        rollNumber: currentRollNumber,
        detail: { prevValue: p.value, nextValue: s.value, reason, held: s.held },
      });
    }
    if (
      s.value === p.value &&
      s.computedColor !== p.computedColor &&
      s.computedColor != null &&
      p.computedColor != null
    ) {
      pushViolation({
        ts,
        kind: 'DIE_COLOR_CHANGED_WITHOUT_VALUE_CHANGE',
        dieId: s.dieId,
        rollNumber: currentRollNumber,
        detail: {
          value: s.value,
          prevColor: p.computedColor,
          nextColor: s.computedColor,
          prevToken: p.colorToken,
          nextToken: s.colorToken,
          reason,
        },
      });
    }
    if (
      s.sourceRow !== p.sourceRow &&
      !(p.held !== s.held) &&
      !/hold|release/i.test(reason)
    ) {
      pushViolation({
        ts,
        kind: 'DIE_ROW_CHANGED_WITHOUT_HOLD_OR_RELEASE',
        dieId: s.dieId,
        rollNumber: currentRollNumber,
        detail: { prevRow: p.sourceRow, nextRow: s.sourceRow, held: s.held, reason },
      });
    }
    if (s.reactKey && p.reactKey && s.reactKey !== p.reactKey && s.value === p.value && s.held === p.held) {
      pushViolation({
        ts,
        kind: 'DIE_IDENTITY_REPLACED',
        dieId: s.dieId,
        rollNumber: currentRollNumber,
        detail: { prevKey: p.reactKey, nextKey: s.reactKey, reason },
      });
    }
    if (s.rect && p.rect) {
      const dx = Math.abs(s.rect.x - p.rect.x);
      const dy = Math.abs(s.rect.y - p.rect.y);
      const moved = dx > 1.5 || dy > 1.5;
      const expectedCause =
        s.held !== p.held ||
        s.sourceRow !== p.sourceRow ||
        s.value !== p.value ||
        /roll|hold|release|transport|animate|score|reset/i.test(reason);
      if (moved && !expectedCause) {
        pushViolation({
          ts,
          kind: 'DIE_POSITION_CHANGED_WITHOUT_EXPECTED_CAUSE',
          dieId: s.dieId,
          rollNumber: currentRollNumber,
          detail: { prevRect: p.rect, nextRect: s.rect, reason },
        });
      }
    }
  }

  // ── Held-row committed-order contract ──────────────────────────
  //
  // The held row is intentionally sorted (value ASC, dieId ASC) so
  // straights/combinations read cleanly to observers. Once committed
  // for a given held-set signature it must not drift for animation /
  // scoring / preview / unrelated reroll reasons.
  const heldSnaps = snapshots.filter((s) => s.sourceRow === 'held');
  const heldSetSig = heldSnaps
    .map((s) => s.dieId)
    .slice()
    .sort((a, b) => a - b)
    .join(',');
  const canonicalOrder = heldSnaps
    .slice()
    .sort((a, b) => (a.value - b.value) || (a.dieId - b.dieId))
    .map((s) => s.dieId);
  const canonicalValues = canonicalOrder.map(
    (id) => heldSnaps.find((s) => s.dieId === id)?.value ?? -1,
  );
  const domHeldOrder = heldSnaps
    .slice()
    .sort((a, b) => a.indexInRow - b.indexInRow)
    .map((s) => s.dieId);

  // Detect if any committed die's value legitimately changed (roll of
  // a held die is not allowed, but if it happens we treat it as a
  // legitimate cause for recommit rather than drift).
  const heldValueChanged = committedHeldSig === heldSetSig
    && canonicalOrder.some(
      (id) => committedHeldValues.get(id) !== undefined &&
              committedHeldValues.get(id) !== (heldSnaps.find((s) => s.dieId === id)?.value ?? null),
    );

  const setChanged = committedHeldSig !== heldSetSig;

  if (setChanged || heldValueChanged) {
    // Legitimate recommit → announce as CHANGED (informational), not
    // a drift violation.
    if (committedHeldSig !== null) {
      pushViolation({
        ts,
        kind: 'HELD_ROW_ORDER_CHANGED',
        dieId: null,
        rollNumber: currentRollNumber,
        detail: {
          before: committedHeldOrder.slice(),
          after: canonicalOrder.slice(),
          afterValues: canonicalValues,
          trigger: reason,
          cause: setChanged ? 'held-set-changed' : 'held-value-changed',
        },
      });
    }
    committedHeldSig = heldSetSig;
    committedHeldOrder = canonicalOrder.slice();
    committedHeldValues = new Map(
      heldSnaps.map((s) => [s.dieId, s.value] as const),
    );
  } else if (committedHeldSig !== null && committedHeldOrder.length > 0) {
    // Signature + values stable → the DOM order MUST equal the
    // committed canonical order. Any deviation is a drift violation.
    const drifted =
      domHeldOrder.length !== committedHeldOrder.length ||
      domHeldOrder.some((id, i) => id !== committedHeldOrder[i]);
    if (drifted) {
      pushViolation({
        ts,
        kind: 'HELD_ROW_ORDER_DRIFT_VIOLATION',
        dieId: null,
        rollNumber: currentRollNumber,
        detail: {
          committed: committedHeldOrder.slice(),
          committedValues: committedHeldOrder.map(
            (id) => committedHeldValues.get(id) ?? null,
          ),
          domOrder: domHeldOrder.slice(),
          domValues: domHeldOrder.map(
            (id) => heldSnaps.find((s) => s.dieId === id)?.value ?? null,
          ),
          trigger: reason,
        },
      });
    }
  }

  // Commit snapshots as new "previous"
  for (const s of snapshots) prevByDieId.set(s.dieId, s);

  pushEvent({ ts, reason, rollNumber: currentRollNumber, dice: snapshots });
  notify();
}

function stripPrev(s: YahtzeeDieSnapshot): Omit<YahtzeeDieSnapshot, 'previous'> {
  const { previous: _p, ...rest } = s;
  void _p;
  return rest;
}

export function exportYahtzeeReorderTraceJSON(): string {
  return JSON.stringify(
    {
      exportedAt: Date.now(),
      active,
      currentRollNumber,
      lifecycle: lifecycleEvents,
      presentation: presentationEvents,
      violations: violationEvents,
    },
    null,
    2,
  );
}

// ────────────────────────────────────────────────────────────────
// Category-selection boundary instrumentation.
//
// Passive-observer add-on: samples mounted [data-die-idx] nodes at each of
// the five defined boundaries and emits a lifecycle event whose detail
// carries everything needed to prove whether the held row / renderer
// ownership stays stable across the interaction. Also raises drift and
// owner-swap violations when detected.
// ────────────────────────────────────────────────────────────────

type CategoryBoundaryKind =
  | 'YAHTZEE_CATEGORY_SELECTION_INTENT'
  | 'YAHTZEE_CATEGORY_SELECTION_PREVIEW'
  | 'YAHTZEE_CATEGORY_SELECTION_DISPATCHED'
  | 'YAHTZEE_CATEGORY_SELECTION_AUTHORITY_ARRIVAL'
  | 'YAHTZEE_CATEGORY_SELECTION_PRESENTATION_COMMIT';

type CategoryBoundaryOwnerRecord = {
  dieId: number;
  reactKey: string | null;
  parentTag: string | null;
  parentDataAttrs: Record<string, string> | null;
  phaseBranch: string | null;
  rendererInputSource: string | null;
  renderer: string; // normal | freeze | score-preview | score-result | transport | unknown
};

let prevCategoryOwnerByDieId: Map<number, CategoryBoundaryOwnerRecord> | null = null;

function classifyRenderer(el: HTMLElement | null): string {
  if (!el) return 'unknown';
  const check = (node: HTMLElement | null, matches: (n: HTMLElement) => boolean): boolean => {
    let cur: HTMLElement | null = node;
    for (let i = 0; i < 8 && cur; i += 1) {
      if (matches(cur)) return true;
      cur = cur.parentElement;
    }
    return false;
  };
  if (check(el, (n) => n.getAttribute('data-die-render-path') === 'freeze')) return 'freeze';
  if (check(el, (n) => n.getAttribute('data-die-render-path') === 'fly-in')) return 'transport';
  if (check(el, (n) => (n.getAttribute('data-testid') || '').includes('score-preview'))) return 'score-preview';
  if (check(el, (n) => (n.getAttribute('data-testid') || '').includes('score-result'))) return 'score-result';
  if (check(el, (n) => n.getAttribute('data-die-phase-branch') === 'freeze')) return 'freeze';
  return 'normal';
}

function collectParentDataAttrs(el: HTMLElement | null): Record<string, string> | null {
  if (!el || !el.parentElement) return null;
  const out: Record<string, string> = {};
  for (const attr of Array.from(el.parentElement.attributes)) {
    if (attr.name.startsWith('data-')) out[attr.name] = attr.value;
  }
  return out;
}

type DomDieSample = {
  dieId: number;
  value: number;
  held: boolean;
  sourceRow: YahtzeeDieSourceRow;
  indexInRow: number;
  globalRenderIndex: number;
  reactKey: string | null;
  rect: { x: number; y: number; w: number; h: number } | null;
  phaseBranch: string | null;
  rendererInputOrder: number[] | null;
  rendererInputSource: string | null;
  renderer: string;
  parentTag: string | null;
  parentDataAttrs: Record<string, string> | null;
};

function sampleDomDiceForBoundary(): DomDieSample[] {
  if (typeof document === 'undefined') return [];
  const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-die-idx]'));
  return nodes.map((el, globalIdx) => {
    const rawRow = el.getAttribute('data-die-row');
    const row: YahtzeeDieSourceRow =
      rawRow === 'held' ? 'held'
        : rawRow === 'result' ? 'result'
          : rawRow === 'roll' || rawRow === 'animating' ? 'roll'
            : 'other';
    const siblings = Array.from(
      (el.parentElement ?? document).querySelectorAll<HTMLElement>('[data-die-idx]'),
    );
    const rect = el.getBoundingClientRect();
    return {
      dieId: Number(el.getAttribute('data-die-idx') ?? -1),
      value: Number(el.getAttribute('data-die-value') ?? 0),
      held: el.getAttribute('data-die-held') === 'true',
      sourceRow: row,
      indexInRow: siblings.indexOf(el),
      globalRenderIndex: globalIdx,
      reactKey: el.getAttribute('data-die-react-key') ?? `die-${el.getAttribute('data-die-idx')}`,
      rect:
        rect && rect.width > 0
          ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
          : null,
      phaseBranch: el.getAttribute('data-die-phase-branch'),
      rendererInputOrder: (el.getAttribute('data-die-renderer-input-order') ?? '')
        .split(',')
        .filter((s) => s.length > 0)
        .map((s) => Number(s)),
      rendererInputSource: el.getAttribute('data-die-renderer-input-source'),
      renderer: classifyRenderer(el),
      parentTag: el.parentElement ? el.parentElement.tagName.toLowerCase() : null,
      parentDataAttrs: collectParentDataAttrs(el),
    };
  });
}

export type YahtzeeCategoryBoundaryContext = {
  category?: string | null;
  actor?: 'local' | 'remote' | 'bot' | 'unknown';
  actorPlayerId?: string | null;
  playerId?: string | null;
  rollNumber?: number | null;
  extra?: Record<string, unknown>;
};

export function emitYahtzeeCategorySelectionBoundary(
  kind: CategoryBoundaryKind,
  ctx: YahtzeeCategoryBoundaryContext = {},
): void {
  if (!active) return;
  const ts = Date.now();
  const dom = sampleDomDiceForBoundary();

  // Committed held order (value ASC, dieId ASC) using DOM values.
  const heldSnaps = dom.filter((d) => d.held);
  const heldSetSignature = heldSnaps
    .map((d) => d.dieId)
    .slice()
    .sort((a, b) => a - b)
    .join(',');
  const committedOrder = heldSnaps
    .slice()
    .sort((a, b) => (a.value - b.value) || (a.dieId - b.dieId))
    .map((d) => d.dieId);
  const domHeldOrder = heldSnaps
    .slice()
    .sort((a, b) => a.indexInRow - b.indexInRow)
    .map((d) => d.dieId);
  const rendererInputOrder = heldSnaps
    .map((d) => d.rendererInputOrder)
    .find((o) => o && o.length > 0) ?? [];

  // Local trusted committed order (recorded during passive observer) for
  // comparison — use committedHeldOrder captured in this module when
  // signature matches.
  const trustedCommitted =
    committedHeldSig === heldSetSignature ? committedHeldOrder.slice() : committedOrder.slice();

  // Drift detection: DOM order deviates from trusted committed order
  // while signature and per-die values are unchanged.
  const heldValuesStable = trustedCommitted.every(
    (id) => committedHeldValues.get(id) === undefined ||
            committedHeldValues.get(id) === (heldSnaps.find((d) => d.dieId === id)?.value ?? null),
  );
  if (
    trustedCommitted.length > 0 &&
    heldValuesStable &&
    (domHeldOrder.length !== trustedCommitted.length ||
      domHeldOrder.some((id, i) => id !== trustedCommitted[i]))
  ) {
    pushViolation({
      ts,
      kind: 'CATEGORY_SELECTION_HELD_ORDER_DRIFT',
      dieId: null,
      rollNumber: currentRollNumber,
      detail: {
        boundary: kind,
        category: ctx.category ?? null,
        heldSetSignature,
        committed: trustedCommitted,
        domOrder: domHeldOrder,
        rendererInputOrder,
      },
    });
  }

  // Owner-swap detection vs previous boundary snapshot.
  const nextOwnerByDieId = new Map<number, CategoryBoundaryOwnerRecord>();
  for (const d of dom) {
    nextOwnerByDieId.set(d.dieId, {
      dieId: d.dieId,
      reactKey: d.reactKey,
      parentTag: d.parentTag,
      parentDataAttrs: d.parentDataAttrs,
      phaseBranch: d.phaseBranch,
      rendererInputSource: d.rendererInputSource,
      renderer: d.renderer,
    });
  }
  if (prevCategoryOwnerByDieId) {
    for (const [dieId, prev] of prevCategoryOwnerByDieId) {
      const next = nextOwnerByDieId.get(dieId);
      if (!next) continue;
      // Only meaningful for held dice — but a swap on any is worth logging.
      const heldNow = dom.find((d) => d.dieId === dieId)?.held;
      if (!heldNow) continue;
      const keyChanged = prev.reactKey !== next.reactKey;
      const rendererChanged = prev.renderer !== next.renderer;
      const parentChanged =
        prev.parentTag !== next.parentTag ||
        JSON.stringify(prev.parentDataAttrs) !== JSON.stringify(next.parentDataAttrs);
      if (keyChanged || rendererChanged || parentChanged) {
        pushViolation({
          ts,
          kind: 'CATEGORY_SELECTION_DIE_OWNER_SWAP',
          dieId,
          rollNumber: currentRollNumber,
          detail: {
            boundary: kind,
            category: ctx.category ?? null,
            prev,
            next,
            keyChanged,
            rendererChanged,
            parentChanged,
          },
        });
      }
    }
  }
  prevCategoryOwnerByDieId = nextOwnerByDieId;

  const renderers = Array.from(new Set(dom.map((d) => d.renderer)));
  const phaseBranches = Array.from(
    new Set(dom.map((d) => d.phaseBranch).filter((v): v is string => !!v)),
  );

  const detail: Record<string, unknown> = {
    boundary: kind,
    category: ctx.category ?? null,
    actor: ctx.actor ?? 'unknown',
    actorPlayerId: ctx.actorPlayerId ?? null,
    playerId: ctx.playerId ?? null,
    rollNumber: ctx.rollNumber ?? currentRollNumber,
    heldSetSignature,
    committedOrder: trustedCommitted,
    localDerivedCommittedOrder: committedOrder,
    domHeldOrder,
    rendererInputOrder,
    rendererInputSources: Array.from(
      new Set(dom.map((d) => d.rendererInputSource).filter((v): v is string => !!v)),
    ),
    phaseBranches,
    renderers,
    dice: dom.map((d) => ({
      dieId: d.dieId,
      value: d.value,
      held: d.held,
      sourceRow: d.sourceRow,
      indexInRow: d.indexInRow,
      globalRenderIndex: d.globalRenderIndex,
      reactKey: d.reactKey,
      rect: d.rect,
      phaseBranch: d.phaseBranch,
      renderer: d.renderer,
      parentTag: d.parentTag,
      parentDataAttrs: d.parentDataAttrs,
    })),
    ...(ctx.extra ?? {}),
  };

  const ev: YahtzeeReorderHarnessLifecycleEvent = {
    ts,
    kind,
    runId: null,
    detail,
  };
  lifecycleEvents.push(ev);
  if (lifecycleEvents.length > MAX_EVENTS) {
    lifecycleEvents.splice(0, lifecycleEvents.length - MAX_EVENTS);
  }
  notify();
}

// ────────────────────────────────────────────────────────────────
// Trace-hold API: informational request to keep the passive observer
// armed for at least `holdMs` after `startTs`. The passive observer
// itself is user-STOP driven and does not auto-disarm, so this is a
// declarative marker recorded into lifecycle so trace consumers can
// prove the required capture window covered the requested boundary
// tail (e.g. category authoritative result + 2s animation).
// ────────────────────────────────────────────────────────────────
let traceHoldUntil = 0;
export function requestYahtzeeReorderTraceHold(
  holdMs: number,
  reason: string,
): void {
  const now = Date.now();
  const until = now + Math.max(0, holdMs);
  if (until > traceHoldUntil) traceHoldUntil = until;
  const ev: YahtzeeReorderHarnessLifecycleEvent = {
    ts: now,
    kind: 'YAHTZEE_REORDER_TRACE_HOLD_REQUESTED',
    runId: null,
    detail: { holdMs, until: traceHoldUntil, reason },
  };
  lifecycleEvents.push(ev);
  if (lifecycleEvents.length > MAX_EVENTS) {
    lifecycleEvents.splice(0, lifecycleEvents.length - MAX_EVENTS);
  }
  notify();
}

export function getYahtzeeReorderTraceHoldUntil(): number {
  return traceHoldUntil;
}
