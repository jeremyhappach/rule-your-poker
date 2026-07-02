/**
 * YahtzeeReorderHarnessPill — "YAHTZEE REORDER HARNESS".
 *
 * Visible only when the selected Yahtzee debug harness is `reorder_probe`
 * (managed through Geometry Lab / game_defaults). The pill does NOT own or
 * enable the harness itself; it is a status + RUN/STOP surface for the
 * already-selected harness.
 *
 * RUN button toggles to STOP while a run is in progress and can cancel it
 * mid-scenario. Each scenario step is a real committed presentation
 * boundary:
 *
 *   ACTION_DISPATCHED
 *      → reducer runs
 *   REDUCER_COMMITTED
 *      → await 2× rAF for React paint
 *   DOM_MOUNTED         (rendered [data-die-idx] nodes sampled)
 *   POST_PAINT_CAPTURED (per-die YAHTZEE_DIE_PRESENTATION w/ real rects/colors)
 *      → poll for absence of flying / non-settled dice with timeout
 *   ANIMATION_SETTLED   (or ANIMATION_SETTLE_TIMEOUT diagnostic)
 *   STEP_ADVANCE
 *
 * Between steps the runner cross-checks the previous DOM sample and emits:
 *   DIE_DISAPPEARED_AFTER_LAND
 *   DIE_REORDERED_AFTER_HOLD
 *   DIE_RENDER_NODE_REPLACED
 *   DIE_SCATTERED_ROW_LOST
 *
 * The pill drives the pure Yahtzee reducer for scenario truth; DOM sampling
 * is always sourced from the currently mounted Yahtzee client so real
 * rects/colors/keys/ownership are observed rather than fabricated.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDebugHarness } from '@/lib/debugHarness/useDebugHarness';
import {
  armYahtzeeReorderHarness,
  getYahtzeeReorderConsumedForcedValues,
  getYahtzeeReorderHarnessSnapshot,
  getYahtzeeReorderTotalForcedValues,
  resetYahtzeeReorderHarness,
  subscribeYahtzeeReorderHarness,
} from '@/lib/yahtzee/reorderHarness';
import {
  clearYahtzeeReorderTrace,
  emitYahtzeeDiePresentation,
  emitYahtzeeReorderHarnessLifecycle,
  emitYahtzeeReorderViolation,
  exportYahtzeeReorderTraceJSON,
  getYahtzeeReorderTraceSnapshot,
  setYahtzeeReorderTraceActive,
  setYahtzeeReorderTraceRoll,
  subscribeYahtzeeReorderTrace,
  type YahtzeeDieInput,
  type YahtzeeDieSourceRow,
} from '@/lib/yahtzee/reorderTrace';
import {
  createInitialPlayerState,
  rollYahtzeeDice,
  toggleYahtzeeHold,
} from '@/lib/yahtzeeGameLogic';
import type { YahtzeePlayerState } from '@/lib/yahtzeeTypes';

// ────────────────────────────────────────────────────────────────
// DOM sampling — real mounted Yahtzee dice
// ────────────────────────────────────────────────────────────────
type SampledDie = YahtzeeDieInput & { node: HTMLElement | null };

function toRow(raw: string | null): YahtzeeDieSourceRow {
  if (raw === 'held') return 'held';
  if (raw === 'result') return 'result';
  if (raw === 'roll' || raw === 'animating') return 'roll';
  return 'other';
}

function sampleMountedDice(): SampledDie[] {
  if (typeof document === 'undefined') return [];
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-die-idx]'),
  );
  // Preserve DOM order for globalRenderIndex.
  return nodes.map((el, globalIdx) => {
    const dieId = Number(el.getAttribute('data-die-idx') ?? -1);
    const value = Number(el.getAttribute('data-die-value') ?? 0);
    const held = el.getAttribute('data-die-held') === 'true';
    const row = toRow(el.getAttribute('data-die-row'));
    const rect = el.getBoundingClientRect();
    const cs = window.getComputedStyle(el);
    const rowSiblings = Array.from(
      (el.parentElement ?? document).querySelectorAll<HTMLElement>(
        '[data-die-idx]',
      ),
    );
    const indexInRow = rowSiblings.indexOf(el);
    return {
      dieId,
      value,
      held,
      colorToken: el.getAttribute('data-die-transform-owner') ?? row,
      computedColor: cs.backgroundColor || cs.color || null,
      sourceRow: row,
      indexInRow,
      globalRenderIndex: globalIdx,
      rect:
        rect && rect.width > 0
          ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
          : null,
      animationPhase:
        el.getAttribute('data-die-render-path') ??
        el.getAttribute('data-die-transform-owner') ??
        null,
      reactKey: el.getAttribute('data-die-react-key') ?? `die-${dieId}`,
      node: el,
    };
  });
}

function isAnyDieFlying(): boolean {
  if (typeof document === 'undefined') return false;
  return (
    document.querySelector(
      '[data-die-render-path="fly-in"],[data-die-transform-owner^="animation"]',
    ) !== null
  );
}

// ────────────────────────────────────────────────────────────────
// Async pacing primitives
// ────────────────────────────────────────────────────────────────
function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== 'function') {
      setTimeout(() => resolve(), 16);
      return;
    }
    requestAnimationFrame(() => resolve());
  });
}

async function waitTwoFrames(): Promise<void> {
  await nextFrame();
  await nextFrame();
}

async function waitForSettleOrTimeout(
  runId: string,
  step: string,
  timeoutMs: number,
): Promise<'settled' | 'timeout'> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAnyDieFlying()) return 'settled';
    await nextFrame();
  }
  emitYahtzeeReorderHarnessLifecycle('ANIMATION_SETTLE_TIMEOUT', runId, {
    step,
    timeoutMs,
  });
  return 'timeout';
}

// ────────────────────────────────────────────────────────────────
// Cross-step violation detection
// ────────────────────────────────────────────────────────────────
function detectCrossStepViolations(
  prev: SampledDie[] | null,
  next: SampledDie[],
  ctx: { step: string; heldFrozen: boolean },
): void {
  if (!prev) return;
  const prevById = new Map(prev.map((d) => [d.dieId, d]));
  const nextById = new Map(next.map((d) => [d.dieId, d]));

  // 1. Disappearance after landing.
  for (const p of prev) {
    if (!p.rect) continue;
    const n = nextById.get(p.dieId);
    if (!n || !n.rect) {
      emitYahtzeeReorderViolation('DIE_DISAPPEARED_AFTER_LAND', p.dieId, {
        step: ctx.step,
        prevRect: p.rect,
        stillMounted: Boolean(n),
      });
    }
  }

  // 2. Held-row reorder without release.
  const prevHeldOrder = prev
    .filter((d) => d.held)
    .sort((a, b) => a.indexInRow - b.indexInRow)
    .map((d) => d.dieId);
  const nextHeldOrder = next
    .filter((d) => d.held)
    .sort((a, b) => a.indexInRow - b.indexInRow)
    .map((d) => d.dieId);
  const heldSetSame =
    prevHeldOrder.length === nextHeldOrder.length &&
    prevHeldOrder.every((id) => nextHeldOrder.includes(id));
  if (
    heldSetSame &&
    prevHeldOrder.some((id, i) => id !== nextHeldOrder[i])
  ) {
    emitYahtzeeReorderViolation('DIE_REORDERED_AFTER_HOLD', null, {
      step: ctx.step,
      before: prevHeldOrder,
      after: nextHeldOrder,
    });
  }

  // 3. React-key / node replacement while logical identity is stable.
  for (const [dieId, p] of prevById) {
    const n = nextById.get(dieId);
    if (!n) continue;
    if (
      p.reactKey &&
      n.reactKey &&
      p.reactKey !== n.reactKey &&
      p.held === n.held &&
      p.value === n.value
    ) {
      emitYahtzeeReorderViolation('DIE_RENDER_NODE_REPLACED', dieId, {
        step: ctx.step,
        prevKey: p.reactKey,
        nextKey: n.reactKey,
      });
    }
  }

  // 4. Scattered row lost — after roll (heldFrozen=true means the four held
  // dice must stay in the held row this step), an unheld die that had a
  // row in the previous step and is not held/scored now must still occupy
  // its rendered row.
  if (ctx.heldFrozen) {
    for (const p of prev) {
      if (p.held) continue;
      const n = nextById.get(p.dieId);
      if (!n) continue;
      if (n.held) continue;
      if (p.sourceRow !== 'other' && n.sourceRow === 'other') {
        emitYahtzeeReorderViolation('DIE_SCATTERED_ROW_LOST', p.dieId, {
          step: ctx.step,
          prevRow: p.sourceRow,
          nextRow: n.sourceRow,
        });
      }
    }
  }
}

// ────────────────────────────────────────────────────────────────
// Reducer-derived synthetic snapshot (used when DOM is empty)
// ────────────────────────────────────────────────────────────────
function synthesizeFromReducer(ps: YahtzeePlayerState): YahtzeeDieInput[] {
  const heldIds: number[] = [];
  const rollIds: number[] = [];
  ps.dice.forEach((d, i) => {
    if (d.isHeld) heldIds.push(i);
    else rollIds.push(i);
  });
  const ordered = [...heldIds, ...rollIds];
  return ordered.map((dieId, globalIdx) => {
    const d = ps.dice[dieId];
    const isHeld = d.isHeld;
    const rowIds = isHeld ? heldIds : rollIds;
    return {
      dieId,
      value: d.value,
      held: isHeld,
      colorToken: isHeld ? 'harness:held' : 'harness:roll',
      computedColor: null,
      sourceRow: isHeld ? 'held' : 'roll',
      indexInRow: rowIds.indexOf(dieId),
      globalRenderIndex: globalIdx,
      rect: null,
      animationPhase: `reducer:rollsRemaining=${ps.rollsRemaining}`,
      reactKey: `die-${dieId}`,
    };
  });
}

// ────────────────────────────────────────────────────────────────
// Async scenario runner
// ────────────────────────────────────────────────────────────────
async function runStep(
  runId: string,
  step: string,
  dispatch: () => YahtzeePlayerState,
  prevSampleRef: { current: SampledDie[] | null },
  opts: { heldFrozen: boolean; settleTimeoutMs: number },
  cancelRef: { current: boolean },
): Promise<YahtzeePlayerState | null> {
  if (cancelRef.current) return null;
  emitYahtzeeReorderHarnessLifecycle('ACTION_DISPATCHED', runId, { step });
  const ps = dispatch();
  emitYahtzeeReorderHarnessLifecycle('REDUCER_COMMITTED', runId, {
    step,
    values: ps.dice.map((d) => d.value),
    held: ps.dice.map((d) => d.isHeld),
    rollsRemaining: ps.rollsRemaining,
  });

  await waitTwoFrames();
  if (cancelRef.current) return null;

  const sampled = sampleMountedDice();
  emitYahtzeeReorderHarnessLifecycle('DOM_MOUNTED', runId, {
    step,
    domDieCount: sampled.length,
    hasRealNodes: sampled.length > 0,
  });

  const inputs: YahtzeeDieInput[] =
    sampled.length > 0
      ? sampled.map(({ node: _n, ...rest }) => {
          void _n;
          return rest;
        })
      : synthesizeFromReducer(ps);
  emitYahtzeeDiePresentation(`harness:${step}`, inputs);
  emitYahtzeeReorderHarnessLifecycle('POST_PAINT_CAPTURED', runId, {
    step,
    sampledDice: inputs.length,
    domSourced: sampled.length > 0,
  });

  detectCrossStepViolations(prevSampleRef.current, sampled, {
    step,
    heldFrozen: opts.heldFrozen,
  });
  prevSampleRef.current = sampled;

  const settle = await waitForSettleOrTimeout(
    runId,
    step,
    opts.settleTimeoutMs,
  );
  if (settle === 'settled') {
    emitYahtzeeReorderHarnessLifecycle('ANIMATION_SETTLED', runId, { step });
  }

  emitYahtzeeReorderHarnessLifecycle('STEP_ADVANCE', runId, { step });
  return ps;
}

async function runScenarioAsync(
  runId: string,
  cancelRef: { current: boolean },
): Promise<void> {
  const totalForced = getYahtzeeReorderTotalForcedValues();
  emitYahtzeeReorderHarnessLifecycle(
    'YAHTZEE_REORDER_HARNESS_MANUAL_START',
    runId,
    { totalForcedValues: totalForced },
  );

  const prevSampleRef: { current: SampledDie[] | null } = { current: null };
  let ps: YahtzeePlayerState = createInitialPlayerState();

  try {
    // Step 1
    setYahtzeeReorderTraceRoll(1);
    const s1 = await runStep(
      runId,
      'roll-1',
      () => (ps = rollYahtzeeDice(ps)),
      prevSampleRef,
      { heldFrozen: false, settleTimeoutMs: 1500 },
      cancelRef,
    );
    if (!s1 || cancelRef.current) return;

    // Step 2 — hold 0..3 in one committed pass
    const s2 = await runStep(
      runId,
      'hold-0-3',
      () => {
        for (const idx of [0, 1, 2, 3]) ps = toggleYahtzeeHold(ps, idx);
        return ps;
      },
      prevSampleRef,
      { heldFrozen: false, settleTimeoutMs: 800 },
      cancelRef,
    );
    if (!s2 || cancelRef.current) return;

    // Step 3
    setYahtzeeReorderTraceRoll(2);
    const s3 = await runStep(
      runId,
      'roll-2',
      () => (ps = rollYahtzeeDice(ps)),
      prevSampleRef,
      { heldFrozen: true, settleTimeoutMs: 1500 },
      cancelRef,
    );
    if (!s3 || cancelRef.current) return;

    // Step 4
    setYahtzeeReorderTraceRoll(3);
    const s4 = await runStep(
      runId,
      'roll-3',
      () => (ps = rollYahtzeeDice(ps)),
      prevSampleRef,
      { heldFrozen: true, settleTimeoutMs: 1500 },
      cancelRef,
    );
    if (!s4 || cancelRef.current) return;

    emitYahtzeeReorderHarnessLifecycle(
      'YAHTZEE_REORDER_HARNESS_COMPLETE',
      runId,
      {
        finalValues: ps.dice.map((d) => d.value),
        finalHeld: ps.dice.map((d) => d.isHeld),
        consumed: getYahtzeeReorderConsumedForcedValues(),
        totalForcedValues: totalForced,
      },
    );
  } catch (err) {
    emitYahtzeeReorderHarnessLifecycle(
      'YAHTZEE_REORDER_HARNESS_ERROR',
      runId,
      { message: err instanceof Error ? err.message : String(err) },
    );
  }
}

// ────────────────────────────────────────────────────────────────
// React component
// ────────────────────────────────────────────────────────────────
export function YahtzeeReorderHarnessPill() {
  const selectedHarness = useDebugHarness('yahtzee');
  const enabled = selectedHarness === 'reorder_probe';

  const [snap, setSnap] = useState(() => getYahtzeeReorderHarnessSnapshot());
  const [traceSnap, setTraceSnap] = useState(() =>
    getYahtzeeReorderTraceSnapshot(),
  );
  const [running, setRunning] = useState(false);
  const cancelRef = useRef({ current: false });

  useEffect(
    () =>
      subscribeYahtzeeReorderHarness(() =>
        setSnap(getYahtzeeReorderHarnessSnapshot()),
      ),
    [],
  );
  useEffect(
    () =>
      subscribeYahtzeeReorderTrace(() =>
        setTraceSnap(getYahtzeeReorderTraceSnapshot()),
      ),
    [],
  );

  const handleRun = useCallback(() => {
    if (running) return;
    setRunning(true);
    cancelRef.current = { current: false };
    setYahtzeeReorderTraceActive(true);
    const armed = armYahtzeeReorderHarness();
    const localCancel = cancelRef.current;
    void runScenarioAsync(armed.runId, localCancel).finally(() => {
      setYahtzeeReorderTraceActive(false);
      setSnap(getYahtzeeReorderHarnessSnapshot());
      setTraceSnap(getYahtzeeReorderTraceSnapshot());
      setRunning(false);
    });
  }, [running]);

  const handleStop = useCallback(() => {
    if (!running) return;
    cancelRef.current.current = true;
    emitYahtzeeReorderHarnessLifecycle(
      'YAHTZEE_REORDER_HARNESS_STOPPED',
      snap.runId,
      { reason: 'user-stop' },
    );
    resetYahtzeeReorderHarness('cancel');
  }, [running, snap.runId]);

  const handleClearTrace = useCallback(() => {
    if (running) return;
    resetYahtzeeReorderHarness('manual');
    setYahtzeeReorderTraceActive(false);
    clearYahtzeeReorderTrace();
    setSnap(getYahtzeeReorderHarnessSnapshot());
    setTraceSnap(getYahtzeeReorderTraceSnapshot());
  }, [running]);

  const handleCopy = useCallback(async () => {
    const json = exportYahtzeeReorderTraceJSON();
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
      } else {
        const ta = document.createElement('textarea');
        ta.value = json;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch {
      /* non-fatal */
    }
  }, []);

  if (!enabled) return null;

  const totalForced = getYahtzeeReorderTotalForcedValues();
  const consumed = getYahtzeeReorderConsumedForcedValues();

  let statusLine: string;
  let statusColor: string;
  if (running) {
    statusLine = `RUNNING ${consumed}/${totalForced}`;
    statusColor = '#FFD580';
  } else if (snap.status === 'completed') {
    statusLine = 'COMPLETED';
    statusColor = '#B5FFB5';
  } else if (snap.status === 'cancelled') {
    statusLine = 'STOPPED';
    statusColor = '#CFCFCF';
  } else {
    statusLine = 'IDLE — click RUN to execute scenario';
    statusColor = '#B5FFB5';
  }

  const btn: React.CSSProperties = {
    background: '#FFD580',
    color: '#000',
    border: 'none',
    borderRadius: 3,
    padding: '2px 6px',
    font: 'inherit',
    fontWeight: 700,
    cursor: 'pointer',
  };
  const btnPrimary: React.CSSProperties = {
    ...btn,
    background: running ? '#FF8B8B' : '#B5FFB5',
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 6,
        left: 6,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.88)',
        color: statusColor,
        border: `1px solid ${statusColor}`,
        borderRadius: 6,
        font: '10px/1.25 ui-monospace, Menlo, monospace',
        padding: '5px 7px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        alignItems: 'stretch',
        pointerEvents: 'auto',
        userSelect: 'none',
        maxWidth: 420,
      }}
      data-yahtzee-reorder-harness-pill=""
    >
      <div style={{ fontWeight: 700, color: '#B5FFB5' }}>
        YAHTZEE REORDER HARNESS
      </div>
      <div style={{ fontWeight: 700 }}>{statusLine}</div>
      <div style={{ color: '#CFCFCF' }}>run:{snap.runId ?? '—'}</div>
      <div style={{ color: '#CFCFCF' }}>
        lc:{traceSnap.lifecycle.length} ev:{traceSnap.presentation.length} v:
        <span
          style={{
            color: traceSnap.violations.length ? '#FF8B8B' : '#B5FFB5',
          }}
        >
          {traceSnap.violations.length}
        </span>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={running ? handleStop : handleRun}
          style={btnPrimary}
        >
          {running ? 'STOP' : 'RUN'}
        </button>
        <button type="button" onClick={handleCopy} style={btn}>
          COPY
        </button>
        <button
          type="button"
          onClick={handleClearTrace}
          disabled={running}
          style={{
            ...btn,
            background: '#FF8B8B',
            opacity: running ? 0.5 : 1,
            cursor: running ? 'not-allowed' : 'pointer',
          }}
        >
          Clear Yahtzee Trace
        </button>
      </div>
    </div>
  );
}

export default YahtzeeReorderHarnessPill;
