/**
 * YahtzeeReorderHarnessPill — labeled "YAHTZEE REORDER HARNESS".
 *
 * Manual-run only. Always-enabled "Run YAHTZEE REORDER HARNESS" button.
 * No auto-arm, no eligibility/role/turn gating, no waiting states.
 *
 * On click:
 *   - mint a new run id
 *   - arm the deterministic scenario
 *   - execute it synchronously against the pure Yahtzee reducer
 *     (`rollYahtzeeDice` / `toggleYahtzeeHold`), emitting one
 *     presentation snapshot + STEP lifecycle event per stage
 *   - lifecycle: MANUAL_START → STEP × N → COMPLETE (or ERROR)
 *
 * Scenario:
 *   1. initial [5,2,3,4,2]
 *   2. hold physical dice 0..3
 *   3. reroll die 4 → 2
 *   4. reroll die 4 → 1
 *
 * The presentation ledger and violation detector run as before; snapshots
 * are synthesized from reducer output (no DOM sampling required).
 */
import { useCallback, useEffect, useState } from 'react';
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
  exportYahtzeeReorderTraceJSON,
  getYahtzeeReorderTraceSnapshot,
  setYahtzeeReorderTraceActive,
  setYahtzeeReorderTraceRoll,
  subscribeYahtzeeReorderTrace,
  type YahtzeeDieInput,
} from '@/lib/yahtzee/reorderTrace';
import {
  createInitialPlayerState,
  rollYahtzeeDice,
  toggleYahtzeeHold,
} from '@/lib/yahtzeeGameLogic';
import type { YahtzeePlayerState } from '@/lib/yahtzeeTypes';

// ────────────────────────────────────────────────────────────────
// Snapshot synthesis from reducer output
// ────────────────────────────────────────────────────────────────
function snapshotDiceFromState(ps: YahtzeePlayerState): YahtzeeDieInput[] {
  // Held row first (in physical die-id order), then roll row.
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
    const indexInRow = rowIds.indexOf(dieId);
    return {
      dieId,
      value: d.value,
      held: isHeld,
      colorToken: isHeld ? 'harness:held' : 'harness:roll',
      computedColor: null,
      sourceRow: isHeld ? 'held' : 'roll',
      indexInRow,
      globalRenderIndex: globalIdx,
      rect: null,
      animationPhase: `reducer:rollsRemaining=${ps.rollsRemaining}`,
      reactKey: `die-${dieId}`,
    };
  });
}

// ────────────────────────────────────────────────────────────────
// Scenario runner
// ────────────────────────────────────────────────────────────────
function runScenario(runId: string): void {
  const totalForced = getYahtzeeReorderTotalForcedValues();

  emitYahtzeeReorderHarnessLifecycle(
    'YAHTZEE_REORDER_HARNESS_MANUAL_START',
    runId,
    { totalForcedValues: totalForced },
  );

  try {
    // Step 1: initial roll [5,2,3,4,2]
    setYahtzeeReorderTraceRoll(1);
    let ps: YahtzeePlayerState = createInitialPlayerState();
    ps = rollYahtzeeDice(ps);
    emitYahtzeeDiePresentation('harness:roll-1', snapshotDiceFromState(ps));
    emitYahtzeeReorderHarnessLifecycle(
      'YAHTZEE_REORDER_HARNESS_STEP',
      runId,
      {
        step: 'roll-1',
        values: ps.dice.map((d) => d.value),
        consumed: getYahtzeeReorderConsumedForcedValues(),
        totalForcedValues: totalForced,
      },
    );

    // Step 2: hold physical dice 0..3
    for (const idx of [0, 1, 2, 3]) {
      ps = toggleYahtzeeHold(ps, idx);
    }
    emitYahtzeeDiePresentation('harness:hold-0-3', snapshotDiceFromState(ps));
    emitYahtzeeReorderHarnessLifecycle(
      'YAHTZEE_REORDER_HARNESS_STEP',
      runId,
      {
        step: 'hold-0-3',
        heldMask: ps.dice.map((d) => d.isHeld),
      },
    );

    // Step 3: reroll — die 4 → 2
    setYahtzeeReorderTraceRoll(2);
    ps = rollYahtzeeDice(ps);
    emitYahtzeeDiePresentation('harness:roll-2', snapshotDiceFromState(ps));
    emitYahtzeeReorderHarnessLifecycle(
      'YAHTZEE_REORDER_HARNESS_STEP',
      runId,
      {
        step: 'roll-2',
        values: ps.dice.map((d) => d.value),
        consumed: getYahtzeeReorderConsumedForcedValues(),
        totalForcedValues: totalForced,
      },
    );

    // Step 4: reroll — die 4 → 1
    setYahtzeeReorderTraceRoll(3);
    ps = rollYahtzeeDice(ps);
    emitYahtzeeDiePresentation('harness:roll-3', snapshotDiceFromState(ps));
    emitYahtzeeReorderHarnessLifecycle(
      'YAHTZEE_REORDER_HARNESS_STEP',
      runId,
      {
        step: 'roll-3',
        values: ps.dice.map((d) => d.value),
        consumed: getYahtzeeReorderConsumedForcedValues(),
        totalForcedValues: totalForced,
      },
    );

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

export function YahtzeeReorderHarnessPill() {
  const [snap, setSnap] = useState(() => getYahtzeeReorderHarnessSnapshot());
  const [traceSnap, setTraceSnap] = useState(() =>
    getYahtzeeReorderTraceSnapshot(),
  );

  useEffect(() => {
    return subscribeYahtzeeReorderHarness(() =>
      setSnap(getYahtzeeReorderHarnessSnapshot()),
    );
  }, []);
  useEffect(() => {
    return subscribeYahtzeeReorderTrace(() =>
      setTraceSnap(getYahtzeeReorderTraceSnapshot()),
    );
  }, []);

  const handleRun = useCallback(() => {
    setYahtzeeReorderTraceActive(true);
    const armed = armYahtzeeReorderHarness();
    try {
      runScenario(armed.runId);
    } finally {
      // Consuming the queue transitions the harness to `completed` via
      // `advanceYahtzeeReorderHarnessRoll`; the runId is preserved.
      // Turn the sampler off but keep every event in place.
      setYahtzeeReorderTraceActive(false);
      setSnap(getYahtzeeReorderHarnessSnapshot());
      setTraceSnap(getYahtzeeReorderTraceSnapshot());
    }
  }, []);

  const handleClearTrace = useCallback(() => {
    resetYahtzeeReorderHarness('manual');
    setYahtzeeReorderTraceActive(false);
    clearYahtzeeReorderTrace();
    setSnap(getYahtzeeReorderHarnessSnapshot());
    setTraceSnap(getYahtzeeReorderTraceSnapshot());
  }, []);

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

  const totalForced = getYahtzeeReorderTotalForcedValues();
  const consumed = getYahtzeeReorderConsumedForcedValues();

  let statusLine: string;
  let statusColor: string;
  if (snap.status === 'completed') {
    statusLine = 'COMPLETED';
    statusColor = '#B5FFB5';
  } else if (snap.status === 'in_progress') {
    statusLine = `RUNNING ${consumed}/${totalForced}`;
    statusColor = '#FFD580';
  } else if (snap.status === 'armed') {
    statusLine = 'ARMED';
    statusColor = '#FFD580';
  } else if (snap.status === 'cancelled') {
    statusLine = 'CLEARED';
    statusColor = '#CFCFCF';
  } else {
    statusLine = 'IDLE — click Run to execute scenario';
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
  const btnPrimary: React.CSSProperties = { ...btn, background: '#B5FFB5' };

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
        <button type="button" onClick={handleRun} style={btnPrimary}>
          Run YAHTZEE REORDER HARNESS
        </button>
        <button type="button" onClick={handleCopy} style={btn}>
          COPY
        </button>
        <button
          type="button"
          onClick={handleClearTrace}
          style={{ ...btn, background: '#FF8B8B' }}
        >
          Clear Yahtzee Trace
        </button>
      </div>
    </div>
  );
}

export default YahtzeeReorderHarnessPill;
