/**
 * holmCommunityLandingForensics — surgical, on-screen forensics export
 * for the Holm community-card landing window only.
 *
 * SINGLE-RECORDER CONTRACT
 *   - All events are written to the existing wartime recorder via
 *     ffRecord(...). No parallel ring buffer. No second store.
 *
 * EXPORT WINDOW
 *   - The derived export reads the retained wartime buffer and slices:
 *       250 events before the first community dispatch
 *       through
 *       250 events after the first stable post-landing frame.
 *
 * START
 *   - First community dispatch is detected by the marker
 *     HOLM_COMMUNITY_WAVE_DISPATCH or HOLM_COMMUNITY_TRANSPORT.
 *
 * END
 *   - First stable post-landing frame is detected by the marker
 *     HOLM_COMMUNITY_STABLE_FRAME (emitted by the visual sampler once
 *     10 rAF frames have elapsed after the final community settle
 *     without any visual mutation/transition/animation activity).
 */

import {
  buildWartimeExportAudit,
  formatWartimeEventsAsText,
  getWartimeEvents,
  type WartimeEvent,
} from '@/lib/wartimeDebug/core';
import { ffRecord } from './holmFullForensics';

// ---------------------------------------------------------------------
// Owner 1: Community presentation state (source feeding the row)
// ---------------------------------------------------------------------

export interface CommunityPresentationState {
  writerId: string;
  roundId?: string | null;
  dealerGameId?: string | null;
  handContextId: string;
  sourceBranch: string;            // which branch of the host chose this row
  cardIds: string[];
  faceUpMask: boolean[];           // per-slot intended face-up
  renderedAs: string[];            // 'face' | 'back' | 'empty-anchor' per slot
  renderKeys: string[];            // per-slot React key
}

const _lastPresentationSig = new Map<string, string>();

export function recordCommunityPresentationState(state: CommunityPresentationState): void {
  const sig = JSON.stringify({
    h: state.handContextId,
    r: state.roundId ?? null,
    d: state.dealerGameId ?? null,
    s: state.sourceBranch,
    ids: state.cardIds,
    f: state.faceUpMask,
    a: state.renderedAs,
    k: state.renderKeys,
  });
  const key = state.handContextId;
  if (_lastPresentationSig.get(key) === sig) return;
  _lastPresentationSig.set(key, sig);
  ffRecord({
    writerId: state.writerId,
    source: 'HOLM_COMMUNITY_PRESENTATION',
    marker: 'HOLM_COMMUNITY_PRESENTATION_STATE',
    identity: {
      segmentId: state.handContextId,
      gameId: state.dealerGameId ?? null,
      roundId: state.roundId ?? null,
    },
    payload: {
      sourceBranch: state.sourceBranch,
      cardIds: state.cardIds,
      faceUpMask: state.faceUpMask,
      renderedAs: state.renderedAs,
      renderKeys: state.renderKeys,
    },
  });
}

// ---------------------------------------------------------------------
// Owner 2: Per-card DOM lifecycle
// ---------------------------------------------------------------------

export type CommunityDomEvent =
  | 'mount'
  | 'unmount'
  | 'remount'
  | 'key-change'
  | 'parent-change'
  | 'dom-replace'
  | 'visibility-change'
  | 'className-change'
  | 'data-change';

export function recordCommunityDomLifecycle(payload: {
  writerId: string;
  handContextId: string;
  slotIndex: number;
  cardId: string;
  event: CommunityDomEvent;
  details?: Record<string, unknown>;
}): void {
  ffRecord({
    writerId: payload.writerId,
    source: 'HOLM_COMMUNITY_DOM',
    marker: 'HOLM_COMMUNITY_DOM_LIFECYCLE',
    identity: { segmentId: payload.handContextId },
    payload: {
      slotIndex: payload.slotIndex,
      cardId: payload.cardId,
      event: payload.event,
      ...(payload.details ?? {}),
    },
  });
}

// ---------------------------------------------------------------------
// Owner 4: Transport / settle ownership (mirrors DealRuntime + orchestrator)
// ---------------------------------------------------------------------

export function recordCommunityTransport(payload: {
  writerId: string;
  handContextId: string;
  slotIndex: number;
  cardId: string;
  intentId?: string | null;
  sourceEndpoint?: unknown;
  destEndpoint?: unknown;
  launchAt?: number | null;
  dealPhase?: string | null;
  waveStatus?: string | null;
  slotRenderEligible?: boolean | null;
}): void {
  ffRecord({
    writerId: payload.writerId,
    source: 'HOLM_COMMUNITY_TRANSPORT',
    marker: 'HOLM_COMMUNITY_TRANSPORT',
    identity: { segmentId: payload.handContextId },
    payload,
  });
}

export function recordCommunitySettle(payload: {
  writerId: string;
  handContextId: string;
  slotIndex: number;
  cardId: string;
  arrivalAt?: number | null;
  markSettledSource?: string | null;
  dealPhase?: string | null;
  waveStatus?: string | null;
  slotRenderEligible?: boolean | null;
}): void {
  ffRecord({
    writerId: payload.writerId,
    source: 'HOLM_COMMUNITY_SETTLE',
    marker: 'HOLM_COMMUNITY_SETTLE',
    identity: { segmentId: payload.handContextId },
    payload,
  });
}

// ---------------------------------------------------------------------
// Owner 5: Blink verdict
// ---------------------------------------------------------------------

export function recordCommunityBlinkVerdict(payload: {
  writerId: string;
  handContextId: string;
  slotIndex: number;
  cardId: string;
  reason:
    | 'dom-node-replaced'
    | 'opacity-drop'
    | 'display-toggle'
    | 'visibility-toggle'
    | 'transform-reset'
    | 'face-state-changed'
    | 'slot-suppressed-then-rerendered'
    | 'remount-under-new-key';
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  responsibleWriter?: string | null;
  allFourAffected?: boolean | null;
  sequence?: unknown[];
}): void {
  ffRecord({
    writerId: payload.writerId,
    source: 'HOLM_COMMUNITY_BLINK',
    marker: 'HOLM_COMMUNITY_BLINK_VERDICT',
    identity: { segmentId: payload.handContextId },
    payload,
  });
}

// ---------------------------------------------------------------------
// Owner 3: Visual sampler — rAF + observers, bounded landing window
// ---------------------------------------------------------------------

interface SamplerEntry {
  handContextId: string;
  startedAt: number;
  lastSettleAt: number;
  framesSinceLastSettle: number;
  framesSinceLastMutation: number;
  stableEmitted: boolean;
  observers: { mo: MutationObserver; ro: ResizeObserver | null }[];
  cleanups: (() => void)[];
  lastSnap: Map<number, {
    parent: Element | null;
    classNames: string;
    opacity: string;
    visibility: string;
    display: string;
    transform: string;
    rectKey: string;
    nodeId: number;
  }>;
  postLandingActive: boolean;
}

const _armed = new Map<string, SamplerEntry>();
let _nodeIdSeq = 0;
const _nodeIds = new WeakMap<Element, number>();
function nodeIdOf(el: Element | null): number {
  if (!el) return -1;
  let id = _nodeIds.get(el);
  if (id === undefined) {
    id = ++_nodeIdSeq;
    _nodeIds.set(el, id);
  }
  return id;
}

function snapshotSlot(el: HTMLElement) {
  const cs = typeof window !== 'undefined' ? window.getComputedStyle(el) : null;
  const r = el.getBoundingClientRect();
  return {
    parent: el.parentElement,
    classNames: el.className,
    opacity: cs?.opacity ?? '',
    visibility: cs?.visibility ?? '',
    display: cs?.display ?? '',
    transform: cs?.transform ?? '',
    rectKey: `${Math.round(r.x)}x${Math.round(r.y)}@${Math.round(r.width)}x${Math.round(r.height)}`,
    nodeId: nodeIdOf(el),
  };
}

function disarm(handContextId: string): void {
  const entry = _armed.get(handContextId);
  if (!entry) return;
  for (const ob of entry.observers) {
    try { ob.mo.disconnect(); } catch { /* noop */ }
    try { ob.ro?.disconnect(); } catch { /* noop */ }
  }
  for (const c of entry.cleanups) {
    try { c(); } catch { /* noop */ }
  }
  _armed.delete(handContextId);
}

/**
 * Arm the bounded landing window:
 *   - rAF samples [data-card-anchor="community-i"] each frame.
 *   - MutationObserver on attributes (style/class/data-*).
 *   - ResizeObserver on each slot.
 *   - Transition/animation listeners.
 *
 * Auto-stops once 10 frames after the FINAL community settle have
 * elapsed with no visual mutation/transition activity, at which point
 * it emits HOLM_COMMUNITY_STABLE_FRAME (the export END marker).
 *
 * Any visual change that occurs AFTER the stable marker emits a
 * HOLM_COMMUNITY_BLINK_VERDICT.
 */
export function armCommunityLandingSampler(args: {
  handContextId: string;
  expectedCount?: number;
}): void {
  if (typeof window === 'undefined') return;
  if (_armed.has(args.handContextId)) return;

  const expectedCount = args.expectedCount ?? 4;
  const entry: SamplerEntry = {
    handContextId: args.handContextId,
    startedAt: performance.now(),
    lastSettleAt: 0,
    framesSinceLastSettle: 0,
    framesSinceLastMutation: 0,
    stableEmitted: false,
    observers: [],
    cleanups: [],
    lastSnap: new Map(),
    postLandingActive: true,
  };
  _armed.set(args.handContextId, entry);

  ffRecord({
    writerId: 'holmCommunityLandingForensics:armCommunityLandingSampler',
    source: 'HOLM_COMMUNITY_VISUAL',
    marker: 'HOLM_COMMUNITY_SAMPLER_ARM',
    identity: { segmentId: args.handContextId },
    payload: { expectedCount },
  });

  const findSlots = (): HTMLElement[] => {
    const out: HTMLElement[] = [];
    for (let i = 0; i < expectedCount; i++) {
      const el = document.querySelector<HTMLElement>(
        `[data-anchor-owner="HolmCanonicalCommunityRow"][data-card-anchor="community-${i}"]`,
      ) || document.querySelector<HTMLElement>(`[data-card-anchor="community-${i}"]`);
      if (el) out.push(el);
    }
    return out;
  };

  const ensureObserversFor = (slots: HTMLElement[]) => {
    if (entry.observers.length >= slots.length) return;
    for (let i = entry.observers.length; i < slots.length; i++) {
      const el = slots[i];
      const slotIndex = i;
      const mo = new MutationObserver((records) => {
        entry.framesSinceLastMutation = 0;
        for (const r of records) {
          ffRecord({
            writerId: 'holmCommunityLandingForensics:MutationObserver',
            source: 'HOLM_COMMUNITY_VISUAL',
            marker: 'HOLM_COMMUNITY_VISUAL_MUTATION',
            identity: { segmentId: args.handContextId },
            payload: {
              slotIndex,
              type: r.type,
              attributeName: r.attributeName,
              oldValue: r.oldValue,
              newAttr: r.attributeName ? el.getAttribute(r.attributeName) : null,
            },
          });
          if (entry.stableEmitted) {
            recordCommunityBlinkVerdict({
              writerId: 'holmCommunityLandingForensics:postStableMutation',
              handContextId: args.handContextId,
              slotIndex,
              cardId: `${args.handContextId}#community-${slotIndex}`,
              reason:
                r.attributeName === 'style' && /opacity|visibility|display|transform/i.test(el.getAttribute('style') ?? '')
                  ? 'opacity-drop'
                  : r.attributeName === 'class'
                    ? 'className-change' as never
                    : 'dom-node-replaced',
              before: { attribute: r.attributeName, oldValue: r.oldValue },
              after: { attribute: r.attributeName, newValue: r.attributeName ? el.getAttribute(r.attributeName) : null },
              responsibleWriter: null,
            });
          }
        }
      });
      mo.observe(el, {
        attributes: true,
        attributeOldValue: true,
        childList: true,
        subtree: true,
        attributeFilter: ['style', 'class', 'data-holm-card-id', 'data-holm-renderer'],
      });

      let ro: ResizeObserver | null = null;
      try {
        ro = new ResizeObserver((es) => {
          for (const e of es) {
            ffRecord({
              writerId: 'holmCommunityLandingForensics:ResizeObserver',
              source: 'HOLM_COMMUNITY_VISUAL',
              marker: 'HOLM_COMMUNITY_VISUAL_MUTATION',
              identity: { segmentId: args.handContextId },
              payload: { slotIndex, kind: 'resize', width: e.contentRect.width, height: e.contentRect.height },
            });
          }
        });
        ro.observe(el);
      } catch { /* noop */ }

      const onT = (e: Event) => {
        entry.framesSinceLastMutation = 0;
        const ev = e as TransitionEvent;
        ffRecord({
          writerId: 'holmCommunityLandingForensics:transition',
          source: 'HOLM_COMMUNITY_VISUAL',
          marker: 'HOLM_COMMUNITY_VISUAL_MUTATION',
          identity: { segmentId: args.handContextId },
          payload: { slotIndex, kind: e.type, property: ev.propertyName, elapsed: ev.elapsedTime },
        });
      };
      const onA = (e: Event) => {
        entry.framesSinceLastMutation = 0;
        const ev = e as AnimationEvent;
        ffRecord({
          writerId: 'holmCommunityLandingForensics:animation',
          source: 'HOLM_COMMUNITY_VISUAL',
          marker: 'HOLM_COMMUNITY_VISUAL_MUTATION',
          identity: { segmentId: args.handContextId },
          payload: { slotIndex, kind: e.type, animationName: ev.animationName, elapsed: ev.elapsedTime },
        });
      };
      el.addEventListener('transitionrun', onT);
      el.addEventListener('transitionstart', onT);
      el.addEventListener('transitionend', onT);
      el.addEventListener('transitioncancel', onT);
      el.addEventListener('animationstart', onA);
      el.addEventListener('animationend', onA);
      el.addEventListener('animationcancel', onA);
      entry.cleanups.push(() => {
        el.removeEventListener('transitionrun', onT);
        el.removeEventListener('transitionstart', onT);
        el.removeEventListener('transitionend', onT);
        el.removeEventListener('transitioncancel', onT);
        el.removeEventListener('animationstart', onA);
        el.removeEventListener('animationend', onA);
        el.removeEventListener('animationcancel', onA);
      });
      entry.observers.push({ mo, ro });
    }
  };

  const STABLE_FRAMES = 10;
  const MAX_DURATION_MS = 8000;
  const tick = () => {
    if (!_armed.has(args.handContextId)) return;
    const slots = findSlots();
    ensureObserversFor(slots);
    entry.framesSinceLastSettle += 1;
    entry.framesSinceLastMutation += 1;
    for (let i = 0; i < slots.length; i++) {
      const el = slots[i];
      const snap = snapshotSlot(el);
      const prev = entry.lastSnap.get(i);
      if (prev) {
        const changed =
          prev.classNames !== snap.classNames ||
          prev.opacity !== snap.opacity ||
          prev.visibility !== snap.visibility ||
          prev.display !== snap.display ||
          prev.transform !== snap.transform ||
          prev.rectKey !== snap.rectKey ||
          prev.nodeId !== snap.nodeId ||
          prev.parent !== snap.parent;
        if (changed) {
          entry.framesSinceLastMutation = 0;
          if (prev.nodeId !== snap.nodeId || prev.parent !== snap.parent) {
            recordCommunityDomLifecycle({
              writerId: 'holmCommunityLandingForensics:tick:diff',
              handContextId: args.handContextId,
              slotIndex: i,
              cardId: `${args.handContextId}#community-${i}`,
              event: prev.parent !== snap.parent ? 'parent-change' : 'dom-replace',
              details: { prevNodeId: prev.nodeId, nextNodeId: snap.nodeId },
            });
            if (entry.stableEmitted) {
              recordCommunityBlinkVerdict({
                writerId: 'holmCommunityLandingForensics:tick:postStable',
                handContextId: args.handContextId,
                slotIndex: i,
                cardId: `${args.handContextId}#community-${i}`,
                reason: 'dom-node-replaced',
                before: prev,
                after: snap,
                responsibleWriter: null,
              });
            }
          }
        }
      } else {
        recordCommunityDomLifecycle({
          writerId: 'holmCommunityLandingForensics:tick:firstSeen',
          handContextId: args.handContextId,
          slotIndex: i,
          cardId: `${args.handContextId}#community-${i}`,
          event: 'mount',
          details: { nodeId: snap.nodeId },
        });
      }
      entry.lastSnap.set(i, snap);
      ffRecord({
        writerId: 'holmCommunityLandingForensics:rafTick',
        source: 'HOLM_COMMUNITY_VISUAL',
        marker: 'HOLM_COMMUNITY_VISUAL_FRAME',
        identity: { segmentId: args.handContextId },
        payload: {
          slotIndex: i,
          nodeId: snap.nodeId,
          classNames: snap.classNames,
          opacity: snap.opacity,
          visibility: snap.visibility,
          display: snap.display,
          transform: snap.transform,
          rect: snap.rectKey,
        },
      });
    }
    const elapsed = performance.now() - entry.startedAt;
    if (
      !entry.stableEmitted &&
      entry.lastSettleAt > 0 &&
      entry.framesSinceLastSettle >= STABLE_FRAMES &&
      entry.framesSinceLastMutation >= STABLE_FRAMES
    ) {
      entry.stableEmitted = true;
      ffRecord({
        writerId: 'holmCommunityLandingForensics:stable',
        source: 'HOLM_COMMUNITY_VISUAL',
        marker: 'HOLM_COMMUNITY_STABLE_FRAME',
        identity: { segmentId: args.handContextId },
        payload: {
          framesSinceLastSettle: entry.framesSinceLastSettle,
          framesSinceLastMutation: entry.framesSinceLastMutation,
          elapsedMsSinceArm: Math.round(elapsed),
        },
      });
      // Keep sampler armed briefly to capture post-stable blinks.
    }
    if (elapsed > MAX_DURATION_MS) {
      disarm(args.handContextId);
      ffRecord({
        writerId: 'holmCommunityLandingForensics:disarm',
        source: 'HOLM_COMMUNITY_VISUAL',
        marker: 'HOLM_COMMUNITY_SAMPLER_DONE',
        identity: { segmentId: args.handContextId },
        payload: { elapsedMs: Math.round(elapsed) },
      });
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/**
 * Called by DealRuntime when a community card settles. Resets the
 * "frames since last settle" counter on the active sampler so the
 * stable marker waits until the FINAL settle.
 */
export function notifyCommunitySettleToSampler(handContextId: string): void {
  const entry = _armed.get(handContextId);
  if (!entry) return;
  entry.lastSettleAt = performance.now();
  entry.framesSinceLastSettle = 0;
  entry.framesSinceLastMutation = 0;
}

// ---------------------------------------------------------------------
// Derived export — read wartime ring, slice [first dispatch - 250 ..
//   first stable frame + 250]
// ---------------------------------------------------------------------

const START_MARKERS = new Set(['HOLM_COMMUNITY_WAVE_DISPATCH', 'HOLM_COMMUNITY_TRANSPORT']);
const END_MARKER = 'HOLM_COMMUNITY_STABLE_FRAME';

export function buildHolmCommunityLandingExport(): string {
  const all = getWartimeEvents();
  const firstStart = all.findIndex((e) => START_MARKERS.has(e.event));
  if (firstStart < 0) {
    return [
      '# HOLM COMMUNITY LANDING — no community dispatch found in wartime ring',
      `# retained events: ${all.length}`,
      `# exportedAt: ${new Date().toISOString()}`,
    ].join('\n');
  }
  const firstStableRel = all.slice(firstStart).findIndex((e) => e.event === END_MARKER);
  const endIdx = firstStableRel >= 0 ? firstStart + firstStableRel : all.length - 1;
  const lo = Math.max(0, firstStart - 250);
  const hi = Math.min(all.length - 1, endIdx + 250);
  const window: WartimeEvent[] = all.slice(lo, hi + 1);
  const audit = buildWartimeExportAudit(window);
  const header = {
    derivedExport: 'HOLM COMMUNITY LANDING',
    firstCommunityDispatchSeq: all[firstStart]?.seq ?? null,
    firstCommunityDispatchEvent: all[firstStart]?.event ?? null,
    firstStablePostLandingSeq: firstStableRel >= 0 ? all[endIdx].seq : null,
    firstStablePostLandingEvent: firstStableRel >= 0 ? all[endIdx].event : '(stable marker not yet emitted)',
    sliceLowSeq: window[0]?.seq ?? null,
    sliceHighSeq: window[window.length - 1]?.seq ?? null,
    sliceEventCount: window.length,
    contextBefore: 250,
    contextAfter: 250,
  };
  return [
    '# HOLM COMMUNITY LANDING — DERIVED EXPORT',
    JSON.stringify(header, null, 2),
    '# --- WARTIME EXPORT AUDIT ---',
    JSON.stringify(audit, null, 2),
    '# --- EVENTS ---',
    formatWartimeEventsAsText(window),
  ].join('\n');
}

export function downloadHolmCommunityLandingExport(): void {
  if (typeof window === 'undefined') return;
  const text = buildHolmCommunityLandingExport();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `holm-community-landing-${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
