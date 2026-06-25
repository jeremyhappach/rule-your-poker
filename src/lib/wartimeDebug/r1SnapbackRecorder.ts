/**
 * r1SnapbackRecorder — framework-free, imperative.
 *
 * Loaded lazily by R1SnapbackPill only when the user clicks ARM R1 RECORD.
 * No React. No hooks. No game-state writes. No config writes. No global
 * listeners. Owns one bounded 8s recording, then tears itself down.
 *
 * Public API:
 *   arm()          — start a recording (no-op if one is in progress)
 *   isArmed()      — boolean
 *   isReady()      — completed recording exists and can be exported
 *   download()     — download the most recent completed recording
 */

type SizeSnapshot = {
  width: number;
  height: number;
  minWidth: string;
  maxWidth: string;
  minHeight: string;
  maxHeight: string;
  marginLeft: string;
  transform: string;
  display: string;
  visibility: string;
  opacity: string;
};

type NodeSnapshot = {
  identity: string;
  className: string;
  inlineStyle: string;
  parentChain: string;
  rect: { x: number; y: number; w: number; h: number } | null;
  computed: SizeSnapshot | null;
};

type Event = {
  t: number;            // ms relative to ARM
  hr: number;           // performance.now()
  type:
    | 'ARM_SNAPSHOT'
    | 'RAF_FRAME'
    | 'DOM_MUTATION'
    | 'DOM_RESIZE'
    | 'NODE_DISCONNECTED'
    | 'RECORDING_STOP'
    | 'R1_LARGE_FRAME_DETECTED'
    | 'R1_SNAPBACK_DETECTED';
  target?: string;
  detail?: unknown;
  node?: NodeSnapshot;
};

const SHOWDOWN_LS_KEY =
  'geometryLab.threeFiveSeven.showdownRules.opponentExposedCards.v2';
const RECORD_MS = 8000;
const POST_LARGE_QUIET_MS = 1000;
const LARGE_DELTA_PX = 24; // "materially larger" threshold
const SNAPBACK_DELTA_PX = 12;

let armedToken: number | null = null;
let completed: { events: Event[]; meta: Record<string, unknown> } | null = null;

function parentChain(el: Element | null, max = 6): string {
  const out: string[] = [];
  let cur: Element | null = el;
  let i = 0;
  while (cur && i < max) {
    const tag = cur.tagName.toLowerCase();
    const id = cur.id ? `#${cur.id}` : '';
    const dataKeys = Array.from((cur as HTMLElement).attributes || [])
      .filter((a) => a.name.startsWith('data-'))
      .slice(0, 3)
      .map((a) => `[${a.name}=${JSON.stringify(a.value)}]`)
      .join('');
    out.push(`${tag}${id}${dataKeys}`);
    cur = cur.parentElement;
    i++;
  }
  return out.join(' < ');
}

function snapshotNode(el: Element | null, identity: string): NodeSnapshot {
  if (!el) return { identity, className: '', inlineStyle: '', parentChain: '', rect: null, computed: null };
  const he = el as HTMLElement;
  const cs = window.getComputedStyle(he);
  const rect = he.getBoundingClientRect();
  return {
    identity,
    className: he.className || '',
    inlineStyle: he.getAttribute('style') || '',
    parentChain: parentChain(he.parentElement),
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    computed: {
      width: rect.width,
      height: rect.height,
      minWidth: cs.minWidth,
      maxWidth: cs.maxWidth,
      minHeight: cs.minHeight,
      maxHeight: cs.maxHeight,
      marginLeft: cs.marginLeft,
      transform: cs.transform,
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
    },
  };
}

function readLabConfigPassive(): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(SHOWDOWN_LS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    const isSm =
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(min-width: 640px)').matches;
    const three = parsed?.three;
    const resolved = three
      ? {
          widthPx: isSm ? three?.size?.smWidthPx : three?.size?.mobileWidthPx,
          heightPx: isSm ? three?.size?.smHeightPx : three?.size?.mobileHeightPx,
          overlapPx: isSm ? three?.overlap?.smPx : three?.overlap?.mobilePx,
          fanStepDeg: three?.fan?.stepDeg,
          dynEnabled: !!three?.dyn?.enabled,
        }
      : null;
    return {
      lsKey: SHOWDOWN_LS_KEY,
      rawPresent: !!raw,
      breakpoint: isSm ? 'sm' : 'mobile',
      configured: three || null,
      resolved,
      dynEnabled: !!three?.dyn?.enabled,
    };
  } catch (e) {
    return { error: String(e) };
  }
}

export function isArmed(): boolean {
  return armedToken !== null;
}
export function isReady(): boolean {
  return completed !== null;
}

export function arm(): { ok: boolean; reason?: string } {
  if (armedToken !== null) return { ok: false, reason: 'already armed' };
  const row = document.querySelector<HTMLElement>('[data-357-r1-row="true"]');
  if (!row) return { ok: false, reason: 'no R1 row in DOM' };
  const cards: HTMLElement[] = [];
  row.querySelectorAll<HTMLElement>('[data-357-r1-card]').forEach((n) => {
    cards.push(n);
  });
  if (cards.length === 0) return { ok: false, reason: 'no R1 cards in DOM' };

  const token = (armedToken = Date.now());
  const t0 = performance.now();
  const events: Event[] = [];
  const initialSize = new Map<HTMLElement, { w: number; h: number }>();
  let largeSeenAt = -1;
  let lastMutationAt = -1;

  const push = (e: Omit<Event, 't' | 'hr'>) => {
    const hr = performance.now();
    events.push({ ...e, t: hr - t0, hr });
  };

  // Per-card current root snapshot — the PlayingCard root is the only child
  // of each marker span (display:contents).
  const cardRoot = (span: HTMLElement): HTMLElement | null =>
    (span.firstElementChild as HTMLElement) || null;

  // ARM snapshots
  push({ type: 'ARM_SNAPSHOT', target: 'row', node: snapshotNode(row, 'row') });
  push({
    type: 'ARM_SNAPSHOT',
    target: 'row-parent',
    node: snapshotNode(row.parentElement, 'row-parent'),
  });
  cards.forEach((span, i) => {
    push({
      type: 'ARM_SNAPSHOT',
      target: `card-host-${i}`,
      node: snapshotNode(span, `card-host-${i}`),
    });
    const root = cardRoot(span);
    push({
      type: 'ARM_SNAPSHOT',
      target: `card-root-${i}`,
      node: snapshotNode(root, `card-root-${i}`),
    });
    if (root) {
      const r = root.getBoundingClientRect();
      initialSize.set(root, { w: r.width, h: r.height });
    }
  });

  const labConfig = readLabConfigPassive();

  // RAF sampling
  let rafId: number | null = null;
  let stopped = false;
  let lastLargeMarker: 'large' | 'small' = 'small';

  const sampleRAF = () => {
    if (stopped) return;
    cards.forEach((span, i) => {
      const root = cardRoot(span);
      if (!root) return;
      const r = root.getBoundingClientRect();
      const snap = snapshotNode(root, `card-root-${i}`);
      push({
        type: 'RAF_FRAME',
        target: `card-root-${i}`,
        detail: { w: r.width, h: r.height },
        node: snap,
      });
      const initial = initialSize.get(root);
      if (initial) {
        const dW = r.width - initial.w;
        const dH = r.height - initial.h;
        if (
          lastLargeMarker !== 'large' &&
          (dW >= LARGE_DELTA_PX || dH >= LARGE_DELTA_PX)
        ) {
          lastLargeMarker = 'large';
          if (largeSeenAt < 0) largeSeenAt = performance.now();
          push({
            type: 'R1_LARGE_FRAME_DETECTED',
            target: `card-root-${i}`,
            detail: {
              from: initial,
              to: { w: r.width, h: r.height },
              deltaW: dW,
              deltaH: dH,
            },
            node: snap,
          });
        } else if (
          lastLargeMarker === 'large' &&
          dW < SNAPBACK_DELTA_PX &&
          dH < SNAPBACK_DELTA_PX
        ) {
          lastLargeMarker = 'small';
          push({
            type: 'R1_SNAPBACK_DETECTED',
            target: `card-root-${i}`,
            detail: {
              from: 'large',
              to: { w: r.width, h: r.height },
              relativeToInitial: initial,
              deltaW: dW,
              deltaH: dH,
            },
            node: snap,
          });
        }
      }
    });
    rafId = window.requestAnimationFrame(sampleRAF);
  };
  rafId = window.requestAnimationFrame(sampleRAF);

  // MutationObserver — row, row.parent, and the three card hosts (subtree)
  const mo = new MutationObserver((records) => {
    lastMutationAt = performance.now();
    for (const rec of records) {
      const target = rec.target as Element;
      push({
        type: 'DOM_MUTATION',
        target: target?.tagName?.toLowerCase() || 'unknown',
        detail: {
          mutationType: rec.type,
          attributeName: rec.attributeName,
          addedNodes: rec.addedNodes.length,
          removedNodes: rec.removedNodes.length,
        },
        node: snapshotNode(target, 'mutation-target'),
      });
      // Track disconnect of any monitored node
      if (rec.removedNodes.length > 0) {
        rec.removedNodes.forEach((n) => {
          if (n === row || cards.includes(n as HTMLElement)) {
            push({
              type: 'NODE_DISCONNECTED',
              target: (n as Element).tagName?.toLowerCase() || 'unknown',
              node: snapshotNode(n as Element, 'disconnected'),
            });
          }
        });
      }
    }
  });
  const moTargets: Element[] = [row];
  if (row.parentElement) moTargets.push(row.parentElement);
  cards.forEach((c) => moTargets.push(c));
  moTargets.forEach((t) =>
    mo.observe(t, {
      attributes: true,
      attributeOldValue: true,
      childList: true,
      subtree: true,
      characterData: false,
    }),
  );

  // ResizeObserver
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      const r = el.getBoundingClientRect();
      push({
        type: 'DOM_RESIZE',
        target: el.getAttribute('data-357-r1-card') ? `card-host-${el.getAttribute('data-357-r1-card')}` : 'row',
        detail: { w: r.width, h: r.height, contentRect: { w: entry.contentRect.width, h: entry.contentRect.height } },
        node: snapshotNode(el, 'resize-target'),
      });
    }
  });
  ro.observe(row);
  cards.forEach((c) => {
    ro.observe(c);
    const root = cardRoot(c);
    if (root) ro.observe(root);
  });

  // Quiet-after-large stop polling
  let quietTimer: number | null = window.setInterval(() => {
    if (stopped) return;
    if (largeSeenAt > 0 && lastMutationAt > 0) {
      const now = performance.now();
      if (now - lastMutationAt > POST_LARGE_QUIET_MS && now - largeSeenAt > POST_LARGE_QUIET_MS) {
        stop('quiet-after-large');
      }
    }
  }, 100);

  // Hard stop
  const hardStopId = window.setTimeout(() => stop('8s-hard-stop'), RECORD_MS);

  function stop(reason: string) {
    if (stopped) return;
    if (armedToken !== token) return;
    stopped = true;
    push({
      type: 'RECORDING_STOP',
      target: reason,
      detail: {
        eventCount: events.length,
        largeSeenAtRel: largeSeenAt > 0 ? largeSeenAt - t0 : null,
        lastMutationAtRel: lastMutationAt > 0 ? lastMutationAt - t0 : null,
      },
    });
    if (rafId !== null) cancelAnimationFrame(rafId);
    try { mo.disconnect(); } catch { /* noop */ }
    try { ro.disconnect(); } catch { /* noop */ }
    if (quietTimer !== null) {
      window.clearInterval(quietTimer);
      quietTimer = null;
    }
    window.clearTimeout(hardStopId);
    completed = {
      events,
      meta: {
        armedAt: new Date(token).toISOString(),
        stoppedReason: reason,
        durationMs: performance.now() - t0,
        labConfigArm: labConfig,
        labConfigExportPending: true,
      },
    };
    armedToken = null;
  }

  return { ok: true };
}

export function download(): { ok: boolean; reason?: string } {
  if (!completed) return { ok: false, reason: 'no recording' };
  const exportLab = readLabConfigPassive();
  const payload = {
    schema: '357-r1-snapback/v1',
    meta: { ...completed.meta, labConfigExport: exportLab },
    events: completed.events,
  };
  const text = JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `357-r1-snapback-recording-${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { ok: true };
}
