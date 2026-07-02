/**
 * YahtzeeReorderHarnessPill — labeled "YAHTZEE REORDER HARNESS".
 *
 * Self-gates: only renders when the local player is the non-host in an
 * eligible Yahtzee turn (eligibility is published by YahtzeeGameTable via
 * `setYahtzeeReorderHarnessEligibility`).
 *
 * Provides:
 *   - ARM       — arms the deterministic 3-roll scenario
 *   - RESET     — disarms and clears trace buffers
 *   - COPY      — copies YAHTZEE_DIE_PRESENTATION + violation events as JSON
 *   - Status    — armed state, roll progress (n/3), violation count
 *
 * Also mounts a passive DOM sampler that walks `[data-die-idx]` after every
 * animation frame while the trace is active, converts per-die DOM attributes
 * into `YahtzeeDieInput` snapshots, and calls `emitYahtzeeDiePresentation`.
 * No production rendering paths are altered.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  armYahtzeeReorderHarness,
  getYahtzeeReorderHarnessSnapshot,
  isYahtzeeReorderHarnessArmed,
  resetYahtzeeReorderHarness,
  subscribeYahtzeeReorderHarness,
} from '@/lib/yahtzee/reorderHarness';
import {
  emitYahtzeeDiePresentation,
  exportYahtzeeReorderTraceJSON,
  getYahtzeeReorderTraceSnapshot,
  resetYahtzeeReorderTrace,
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

/**
 * Sample all `[data-die-idx]` nodes and emit one presentation event.
 * Runs post-frame while the trace is active.
 */
function sampleAndEmit(reason: string): void {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('[data-die-idx]'),
  );
  if (nodes.length === 0) return;

  // Group by row so indexInRow is stable within its rendered row.
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
      readAttr(el, 'data-die-color-token') ?? el.className || null;
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

    // Initial paint sample.
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

  // Keep the trace roll number in sync with the harness progress.
  useEffect(() => {
    setYahtzeeReorderTraceRoll(snap.nextRollIdx + 1);
  }, [snap.nextRollIdx]);

  const traceActive = traceSnap.active;
  useReorderSampler(traceActive);

  const handleArm = useCallback(() => {
    resetYahtzeeReorderTrace();
    setYahtzeeReorderTraceActive(true);
    const res = armYahtzeeReorderHarness();
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[YAHTZEE REORDER HARNESS] arm refused:', res.reason);
      setYahtzeeReorderTraceActive(false);
    }
    setSnap(getYahtzeeReorderHarnessSnapshot());
    setTraceSnap(getYahtzeeReorderTraceSnapshot());
  }, []);

  const handleReset = useCallback(() => {
    resetYahtzeeReorderHarness('manual');
    setYahtzeeReorderTraceActive(false);
    resetYahtzeeReorderTrace();
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

  const eligible =
    snap.eligibility.isYahtzeeTurn &&
    snap.eligibility.isLocalTurn &&
    snap.eligibility.isNonHost;

  // Only render when at least "in a Yahtzee context" (any of the eligibility
  // flags set) so the pill stays invisible elsewhere.
  const anyContext =
    snap.eligibility.isYahtzeeTurn ||
    isYahtzeeReorderHarnessArmed() ||
    traceActive;
  if (!anyContext) return null;

  const btn = (bg: string, disabled = false): React.CSSProperties => ({
    background: bg,
    color: '#000',
    border: 'none',
    borderRadius: 3,
    padding: '2px 6px',
    font: 'inherit',
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.4 : 1,
  });

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 6,
        left: 6,
        zIndex: 100000,
        background: 'rgba(0,0,0,0.85)',
        color: '#B5FFB5',
        border: '1px solid #B5FFB5',
        borderRadius: 6,
        font: '10px/1.2 ui-monospace, Menlo, monospace',
        padding: '4px 6px',
        display: 'flex',
        gap: 6,
        alignItems: 'center',
        pointerEvents: 'auto',
        userSelect: 'none',
        maxWidth: 380,
        flexWrap: 'wrap',
      }}
      data-yahtzee-reorder-harness-pill=""
    >
      <span style={{ fontWeight: 700 }}>YAHTZEE REORDER HARNESS</span>
      <span>
        {snap.status} {snap.nextRollIdx}/{snap.totalRolls}
      </span>
      <span>ev:{traceSnap.presentation.length}</span>
      <span style={{ color: traceSnap.violations.length ? '#FF8B8B' : '#B5FFB5' }}>
        v:{traceSnap.violations.length}
      </span>
      <button
        type="button"
        onClick={handleArm}
        disabled={!eligible || isYahtzeeReorderHarnessArmed()}
        style={btn('#B5FFB5', !eligible || isYahtzeeReorderHarnessArmed())}
      >
        ARM
      </button>
      <button type="button" onClick={handleReset} style={btn('#FFD580')}>
        RESET
      </button>
      <button type="button" onClick={handleCopy} style={btn('#B5FFB5')}>
        COPY
      </button>
    </div>
  );
}

export default YahtzeeReorderHarnessPill;
