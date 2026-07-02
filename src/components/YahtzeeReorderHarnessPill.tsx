/**
 * YahtzeeReorderHarnessPill — labeled "YAHTZEE REORDER HARNESS".
 *
 * Auto-arms the deterministic 3-roll scenario as soon as the local player is
 * a non-host on an eligible Yahtzee turn. Exposes a visible status panel and
 * a Clear Yahtzee Trace control. No manual Arm button — auto-arm is the
 * intended activation path.
 *
 * Emits lifecycle events via `reorderTrace`:
 *   YAHTZEE_REORDER_HARNESS_ARMED     (immediately on arm)
 *   YAHTZEE_REORDER_HARNESS_WAITING   (eligibility unmet, with blocking reason)
 *   YAHTZEE_REORDER_HARNESS_STARTED   (first real forced value consumed)
 *   YAHTZEE_REORDER_HARNESS_STEP      (each subsequent forced value consumed)
 *   YAHTZEE_REORDER_HARNESS_COMPLETED (all 7 forced values consumed)
 *   YAHTZEE_REORDER_HARNESS_REJECTED  (arm refused, with reason)
 *
 * Trace events are NEVER cleared automatically. Only the explicit
 * "Clear Yahtzee Trace" control erases them.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  armYahtzeeReorderHarness,
  getYahtzeeReorderConsumedForcedValues,
  getYahtzeeReorderHarnessSnapshot,
  getYahtzeeReorderTotalForcedValues,
  isYahtzeeReorderHarnessArmed,
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
  type YahtzeeDieSourceRow,
} from '@/lib/yahtzee/reorderTrace';

function readAttr(el: HTMLElement, name: string): string | null {
  return el.getAttribute(name);
}
function classifyRow(rowAttr: string | null): YahtzeeDieSourceRow {
  if (rowAttr === 'held') return 'held';
  if (rowAttr === 'result' || rowAttr === 'scored') return 'result';
  if (rowAttr === 'scatter' || rowAttr === 'roll' || rowAttr === 'animating')
    return 'roll';
  return 'other';
}

function sampleAndEmit(reason: string): void {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-die-idx]'),
  );
  if (nodes.length === 0) return;

  const perRow: Record<string, HTMLElement[]> = {};
  nodes.forEach((el) => {
    const row = readAttr(el, 'data-die-row') ?? 'other';
    if (!perRow[row]) perRow[row] = [];
    perRow[row].push(el);
  });

  const inputs: YahtzeeDieInput[] = nodes.map((el, globalIdx) => {
    const dieId = Number(readAttr(el, 'data-die-idx') ?? -1);
    const value = Number(readAttr(el, 'data-die-value') ?? 0);
    const heldAttr = readAttr(el, 'data-die-held');
    const held = heldAttr === 'true';
    const rowAttr = readAttr(el, 'data-die-row');
    const sourceRow = classifyRow(rowAttr);
    const rowArr = perRow[rowAttr ?? 'other'] ?? [];
    const indexInRow = rowArr.indexOf(el);
    const rect = el.getBoundingClientRect();
    const reactKey = readAttr(el, 'data-die-react-key');
    const animationPhase =
      readAttr(el, 'data-die-transform-owner') ?? readAttr(el, 'data-die-layer');
    const colorToken =
      readAttr(el, 'data-die-color-token') ?? (el.className || null);
    let computedColor: string | null = null;
    try {
      const cs = window.getComputedStyle(el);
      computedColor = cs.backgroundColor || cs.color || null;
    } catch {
      computedColor = null;
    }
    return {
      dieId,
      value,
      held,
      colorToken,
      computedColor,
      sourceRow,
      indexInRow,
      globalRenderIndex: globalIdx,
      rect: {
        x: Math.round(rect.left * 100) / 100,
        y: Math.round(rect.top * 100) / 100,
        w: Math.round(rect.width * 100) / 100,
        h: Math.round(rect.height * 100) / 100,
      },
      animationPhase,
      reactKey,
    };
  });

  emitYahtzeeDiePresentation(reason, inputs);
}

function useReorderSampler(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let stopped = false;
    let mo: MutationObserver | null = null;

    const schedule = (reason: string) => {
      if (stopped) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => sampleAndEmit(reason));
    };

    schedule('sampler:init');

    mo = new MutationObserver(() => schedule('sampler:mutation'));
    mo.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        'data-die-idx',
        'data-die-value',
        'data-die-held',
        'data-die-held-layout',
        'data-die-row',
        'data-die-react-key',
        'data-die-transform-owner',
        'data-die-layer',
        'data-die-color-token',
        'class',
        'style',
      ],
    });

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      mo?.disconnect();
    };
  }, [active]);
}

function blockingReason(el: {
  isYahtzeeTurn: boolean;
  isLocalTurn: boolean;
  isNonHost: boolean;
  playerId: string | null;
}): string | null {
  if (!el.isYahtzeeTurn) return 'not in a Yahtzee turn';
  if (!el.isLocalTurn) return 'not your turn';
  if (!el.isNonHost) return 'local player is host';
  if (!el.playerId) return 'no local player id';
  return null;
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

  useEffect(() => {
    setYahtzeeReorderTraceRoll(snap.nextRollIdx + 1);
  }, [snap.nextRollIdx]);

  // ============================================================
  // Auto-arm + lifecycle emission
  // ============================================================
  const prevStatusRef = useRef(snap.status);
  const prevConsumedRef = useRef(0);
  const lastWaitingReasonRef = useRef<string | null>(null);
  const clearedRef = useRef(false); // suppress auto-arm after explicit Clear until eligibility toggles

  useEffect(() => {
    const reason = blockingReason(snap.eligibility);
    const eligible = reason === null;

    // WAITING emit (only when reason changes and no active/prior run visible)
    if (
      !eligible &&
      snap.status === 'idle' &&
      snap.runId === null &&
      reason !== lastWaitingReasonRef.current
    ) {
      lastWaitingReasonRef.current = reason;
      emitYahtzeeReorderHarnessLifecycle(
        'YAHTZEE_REORDER_HARNESS_WAITING',
        null,
        { reason, eligibility: snap.eligibility },
      );
    }

    // Re-enable auto-arm once eligibility becomes true after a Clear.
    if (eligible) clearedRef.current = false;

    // AUTO-ARM: eligible, idle, no prior run, not suppressed.
    if (
      eligible &&
      snap.status === 'idle' &&
      snap.runId === null &&
      !clearedRef.current
    ) {
      setYahtzeeReorderTraceActive(true);
      const res = armYahtzeeReorderHarness();
      const fresh = getYahtzeeReorderHarnessSnapshot();
      if (res.ok) {
        emitYahtzeeReorderHarnessLifecycle(
          'YAHTZEE_REORDER_HARNESS_ARMED',
          res.runId ?? fresh.runId,
          {
            eligibility: fresh.eligibility,
            totalForcedValues: getYahtzeeReorderTotalForcedValues(),
            totalRolls: fresh.totalRolls,
          },
        );
      } else {
        setYahtzeeReorderTraceActive(false);
        emitYahtzeeReorderHarnessLifecycle(
          'YAHTZEE_REORDER_HARNESS_REJECTED',
          null,
          { reason: res.reason ?? 'unknown', eligibility: fresh.eligibility },
        );
      }
      setSnap(fresh);
      setTraceSnap(getYahtzeeReorderTraceSnapshot());
    }
  }, [snap.eligibility, snap.status, snap.runId]);

  // Status transition + STEP emission (armed → in_progress → completed)
  useEffect(() => {
    const prev = prevStatusRef.current;
    const now = snap.status;
    const consumedNow = getYahtzeeReorderConsumedForcedValues();
    const consumedPrev = prevConsumedRef.current;

    if (prev !== 'in_progress' && now === 'in_progress') {
      emitYahtzeeReorderHarnessLifecycle(
        'YAHTZEE_REORDER_HARNESS_STARTED',
        snap.runId,
        {
          consumed: consumedNow,
          totalForcedValues: getYahtzeeReorderTotalForcedValues(),
          rollIdx: snap.nextRollIdx,
        },
      );
    } else if (now === 'in_progress' && consumedNow > consumedPrev) {
      emitYahtzeeReorderHarnessLifecycle(
        'YAHTZEE_REORDER_HARNESS_STEP',
        snap.runId,
        {
          consumed: consumedNow,
          totalForcedValues: getYahtzeeReorderTotalForcedValues(),
          rollIdx: snap.nextRollIdx,
        },
      );
    }

    if (prev !== 'completed' && now === 'completed') {
      emitYahtzeeReorderHarnessLifecycle(
        'YAHTZEE_REORDER_HARNESS_COMPLETED',
        snap.runId,
        {
          consumed: consumedNow,
          totalForcedValues: getYahtzeeReorderTotalForcedValues(),
        },
      );
      // Stop the sampler but KEEP trace events intact.
      setYahtzeeReorderTraceActive(false);
    }

    prevStatusRef.current = now;
    prevConsumedRef.current = consumedNow;
  }, [snap.status, snap.nextRollIdx, snap.runId]);

  const traceActive = traceSnap.active;
  useReorderSampler(traceActive);

  const handleDisarm = useCallback(() => {
    if (isYahtzeeReorderHarnessArmed()) {
      resetYahtzeeReorderHarness('cancel');
      emitYahtzeeReorderHarnessLifecycle(
        'YAHTZEE_REORDER_HARNESS_DISARMED',
        snap.runId,
        { manual: true },
      );
    }
    setYahtzeeReorderTraceActive(false);
    clearedRef.current = true;
    setSnap(getYahtzeeReorderHarnessSnapshot());
    setTraceSnap(getYahtzeeReorderTraceSnapshot());
  }, [snap.runId]);

  const handleClearTrace = useCallback(() => {
    // Explicit erase — only path that clears events.
    resetYahtzeeReorderHarness('manual');
    setYahtzeeReorderTraceActive(false);
    clearYahtzeeReorderTrace();
    clearedRef.current = true;
    lastWaitingReasonRef.current = null;
    prevStatusRef.current = 'idle';
    prevConsumedRef.current = 0;
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

  // ============================================================
  // Visibility: show whenever there's any Yahtzee context OR trace history.
  // ============================================================
  const hasHistory =
    traceSnap.lifecycle.length > 0 ||
    traceSnap.presentation.length > 0 ||
    traceSnap.violations.length > 0;
  const anyContext =
    snap.eligibility.isYahtzeeTurn ||
    isYahtzeeReorderHarnessArmed() ||
    traceActive ||
    hasHistory ||
    snap.status === 'completed' ||
    snap.status === 'cancelled';
  if (!anyContext) return null;

  // ============================================================
  // Status line
  // ============================================================
  const reason = blockingReason(snap.eligibility);
  const totalForced = getYahtzeeReorderTotalForcedValues();
  const consumed = getYahtzeeReorderConsumedForcedValues();

  let statusLine: string;
  let statusColor: string;
  if (snap.status === 'completed') {
    statusLine = 'COMPLETED';
    statusColor = '#B5FFB5';
  } else if (snap.status === 'cancelled') {
    statusLine = 'REJECTED:cancelled';
    statusColor = '#FF8B8B';
  } else if (snap.status === 'in_progress') {
    statusLine = `RUNNING step ${consumed} of ${totalForced}`;
    statusColor = '#FFD580';
  } else if (snap.status === 'armed') {
    statusLine = 'AUTO-ARMED';
    statusColor = '#B5FFB5';
  } else if (reason) {
    statusLine = `WAITING FOR ELIGIBLE NON-HOST YAHTZEE TURN (${reason})`;
    statusColor = '#FFD580';
  } else {
    statusLine = 'AUTO-ARMED';
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
      <div style={{ color: '#CFCFCF' }}>
        run:{snap.runId ?? '—'}
      </div>
      <div style={{ color: '#CFCFCF' }}>
        elig: turn={String(snap.eligibility.isYahtzeeTurn)} local=
        {String(snap.eligibility.isLocalTurn)} nonHost=
        {String(snap.eligibility.isNonHost)} pid=
        {snap.eligibility.playerId ?? '—'}
      </div>
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
        <button type="button" onClick={handleCopy} style={btnPrimary}>
          COPY
        </button>
        <button type="button" onClick={handleDisarm} style={btn}>
          DISARM
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
