/**
 * 3-5-7 R1 SNAPBACK FORENSICS — manually-armed, fully inert by default.
 *
 * Hard contract:
 *   - This module attaches ZERO global listeners, observers, timers, or
 *     storage hooks at import time.
 *   - Nothing runs until `armR1SnapbackCapture()` is called by the
 *     gameplay ARM pill.
 *   - Once armed, the capture window terminates automatically after:
 *       (a) 1000 ms of DOM quiet on the watched R1 host, OR
 *       (b) 8000 ms after arming,
 *     whichever happens first.
 *   - On end, the completed capture is retained for one-tap export by
 *     the EXPORT pill; arming again replaces it.
 *   - No capture state ever flows back into React render trees beyond
 *     the dedicated pill subscription. No game/lifecycle writes.
 *   - No console logging.
 */

import {
  getThreeFiveSevenR1OwnershipAudit,
  loadShowdownRules,
  type ShowdownRulesState,
  type ThreeFiveSevenR1OwnershipAudit,
} from './showdownConfig';

// ─── Types ────────────────────────────────────────────────────────────────

export type SnapbackEventKind =
  | 'arm'
  | 'host-snapshot'
  | 'config-snapshot'
  | 'card-mutation'
  | 'card-style-sample'
  | 'host-resize'
  | 'breakpoint-change'
  | 'verdict'
  | 'capture-end';

export interface SnapbackEvent {
  t: number; // ms since arm
  kind: SnapbackEventKind;
  data: Record<string, unknown>;
}

export interface CompletedCapture {
  startedAt: string;
  endedAt: string;
  endReason: 'quiet' | 'max-window' | 'rearmed';
  startConfig: ShowdownRulesState;
  endConfig: ShowdownRulesState;
  startAudit: ThreeFiveSevenR1OwnershipAudit | null;
  endAudit: ThreeFiveSevenR1OwnershipAudit | null;
  events: SnapbackEvent[];
  verdict: SnapbackEvent | null;
}

// ─── State (all module-local; nothing initialized until arm) ──────────────

const MAX_WINDOW_MS = 8000;
const QUIET_MS = 1000;
const SAMPLE_INTERVAL_MS = 50;

interface ActiveCapture {
  startMs: number;
  startedAt: string;
  startConfig: ShowdownRulesState;
  startAudit: ThreeFiveSevenR1OwnershipAudit | null;
  events: SnapbackEvent[];
  hostEl: HTMLElement | null;
  cardEls: HTMLElement[];
  hostObserver: MutationObserver | null;
  cardObservers: MutationObserver[];
  resizeRO: ResizeObserver | null;
  sampleHandle: number | null;
  quietHandle: number | null;
  maxHandle: number | null;
  mqList: MediaQueryList | null;
  mqHandler: ((e: MediaQueryListEvent) => void) | null;
  lastSampleSig: Map<HTMLElement, string>;
  lastMutationMs: number;
  verdictEmitted: boolean;
}

let _active: ActiveCapture | null = null;
let _last: CompletedCapture | null = null;

const listeners = new Set<() => void>();
function emit() { listeners.forEach((l) => { try { l(); } catch { /* */ } }); }

export function subscribeR1Snapback(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getLastR1SnapbackCapture(): CompletedCapture | null {
  return _last;
}

export function isR1SnapbackCaptureActive(): boolean {
  return _active !== null;
}

// ─── ARM ──────────────────────────────────────────────────────────────────

export function armR1SnapbackCapture(): boolean {
  if (typeof window === 'undefined') return false;
  // Replace any in-flight capture (manual rearm).
  if (_active) _endCapture('rearmed');

  const hostEl = document.querySelector<HTMLElement>('[data-357-r1-snapback-host]');
  if (!hostEl) {
    // Not in a live R1 showdown — refuse to arm.
    return false;
  }

  const startConfig = loadShowdownRules();
  const startAudit = getThreeFiveSevenR1OwnershipAudit();
  const startMs = performance.now();

  const active: ActiveCapture = {
    startMs,
    startedAt: new Date().toISOString(),
    startConfig,
    startAudit,
    events: [],
    hostEl,
    cardEls: [],
    hostObserver: null,
    cardObservers: [],
    resizeRO: null,
    sampleHandle: null,
    quietHandle: null,
    maxHandle: null,
    mqList: null,
    mqHandler: null,
    lastSampleSig: new Map(),
    lastMutationMs: startMs,
    verdictEmitted: false,
  };
  _active = active;

  _push('arm', {
    href: window.location.pathname,
    startConfig: { anchor: startConfig.anchor, three: startConfig.three },
    startAudit: startAudit as unknown as Record<string, unknown> | null,
  });
  _push('host-snapshot', _snapshotHost(hostEl));
  _push('config-snapshot', { three: startConfig.three, anchor: startConfig.anchor });

  _rescanCards();

  // Watch host for child changes.
  try {
    active.hostObserver = new MutationObserver(() => {
      if (!_active) return;
      _rescanCards();
      _active.lastMutationMs = performance.now();
    });
    active.hostObserver.observe(hostEl, { childList: true, subtree: false });
  } catch { /* */ }

  // Resize observer on host.
  try {
    active.resizeRO = new ResizeObserver((entries) => {
      if (!_active) return;
      for (const e of entries) {
        const r = e.contentRect;
        _push('host-resize', { w: Math.round(r.width), h: Math.round(r.height) });
      }
      _active.lastMutationMs = performance.now();
    });
    active.resizeRO.observe(hostEl);
  } catch { /* */ }

  // Breakpoint changes.
  try {
    active.mqList = window.matchMedia('(min-width: 640px)');
    active.mqHandler = (e) => {
      if (!_active) return;
      _push('breakpoint-change', { matches: e.matches });
      _active.lastMutationMs = performance.now();
    };
    active.mqList.addEventListener('change', active.mqHandler);
  } catch { /* */ }

  _scheduleSample();
  _scheduleQuietCheck();
  active.maxHandle = window.setTimeout(() => _endCapture('max-window'), MAX_WINDOW_MS);

  emit();
  return true;
}

function _rescanCards() {
  if (!_active || !_active.hostEl) return;
  for (const o of _active.cardObservers) { try { o.disconnect(); } catch { /* */ } }
  _active.cardObservers = [];
  const next = Array.from(_active.hostEl.querySelectorAll<HTMLElement>(':scope > *'));
  _active.cardEls = next;
  for (let i = 0; i < next.length; i++) {
    const el = next[i];
    const idx = i;
    try {
      const mo = new MutationObserver((muts) => {
        if (!_active) return;
        const attrs = muts.filter((m) => m.type === 'attributes').map((m) => m.attributeName);
        _push('card-mutation', { index: idx, attrs, ..._snapshotCard(el, idx) });
        _active.lastMutationMs = performance.now();
      });
      mo.observe(el, { attributes: true, attributeOldValue: true, childList: true, subtree: true });
      _active.cardObservers.push(mo);
    } catch { /* */ }
  }
}

function _scheduleSample() {
  if (!_active) return;
  _active.sampleHandle = window.setTimeout(() => {
    if (!_active) return;
    for (let i = 0; i < _active.cardEls.length; i++) {
      const el = _active.cardEls[i];
      const snap = _snapshotCard(el, i);
      const sig = `${snap.cw}|${snap.ch}|${snap.ml}|${snap.tr}|${snap.op}|${snap.cls}|${snap.style}`;
      if (_active.lastSampleSig.get(el) !== sig) {
        _active.lastSampleSig.set(el, sig);
        _push('card-style-sample', { index: i, ...snap });
        _active.lastMutationMs = performance.now();
        _evaluateVerdict();
      }
    }
    _scheduleSample();
  }, SAMPLE_INTERVAL_MS);
}

function _scheduleQuietCheck() {
  if (!_active) return;
  _active.quietHandle = window.setTimeout(() => {
    if (!_active) return;
    const quiet = performance.now() - _active.lastMutationMs;
    if (quiet >= QUIET_MS) {
      _endCapture('quiet');
    } else {
      _scheduleQuietCheck();
    }
  }, Math.max(50, QUIET_MS - (performance.now() - _active.lastMutationMs)));
}

function _endCapture(reason: CompletedCapture['endReason']) {
  if (!_active) return;
  if (_active.sampleHandle != null) { try { clearTimeout(_active.sampleHandle); } catch { /* */ } }
  if (_active.quietHandle != null) { try { clearTimeout(_active.quietHandle); } catch { /* */ } }
  if (_active.maxHandle != null) { try { clearTimeout(_active.maxHandle); } catch { /* */ } }
  if (_active.hostObserver) { try { _active.hostObserver.disconnect(); } catch { /* */ } }
  for (const o of _active.cardObservers) { try { o.disconnect(); } catch { /* */ } }
  if (_active.resizeRO) { try { _active.resizeRO.disconnect(); } catch { /* */ } }
  if (_active.mqList && _active.mqHandler) {
    try { _active.mqList.removeEventListener('change', _active.mqHandler); } catch { /* */ }
  }

  _push('capture-end', { reason });
  const endConfig = loadShowdownRules();
  const endAudit = getThreeFiveSevenR1OwnershipAudit();

  _last = {
    startedAt: _active.startedAt,
    endedAt: new Date().toISOString(),
    endReason: reason,
    startConfig: _active.startConfig,
    endConfig,
    startAudit: _active.startAudit,
    endAudit,
    events: _active.events.slice(),
    verdict: _active.events.find((e) => e.kind === 'verdict') ?? null,
  };
  _active = null;
  emit();
}

// ─── Verdict ──────────────────────────────────────────────────────────────

function _evaluateVerdict() {
  if (!_active || _active.verdictEmitted) return;
  const cur = loadShowdownRules();
  const targetW = cur.three.size.mobileWidthPx;
  if (targetW <= 40) return;
  for (let i = _active.events.length - 1; i >= 0; i--) {
    const e = _active.events[i];
    if (e.kind !== 'card-style-sample' && e.kind !== 'card-mutation') continue;
    const w = Number(e.data.cw ?? 0);
    if (w > 0 && w <= 42) {
      const idx = e.data.index;
      let prior: SnapbackEvent | null = null;
      for (let j = i - 1; j >= 0; j--) {
        const p = _active.events[j];
        if ((p.kind === 'card-style-sample' || p.kind === 'card-mutation') && p.data.index === idx) {
          const pw = Number(p.data.cw ?? 0);
          if (pw > 42) { prior = p; break; }
        }
      }
      if (!prior) continue;
      const ownership = getThreeFiveSevenR1OwnershipAudit();
      _push('verdict', {
        firstChangedProp: 'width',
        oldValue: prior.data.cw,
        newValue: e.data.cw,
        cardIndex: idx,
        atMs: e.t,
        renderedBranch: ownership?.renderedBranch ?? null,
        predicates: ownership?.predicates ?? null,
        priorClassName: prior.data.cls,
        nextClassName: e.data.cls,
        priorInlineStyle: prior.data.style,
        nextInlineStyle: e.data.style,
        priorTransform: prior.data.tr,
        nextTransform: e.data.tr,
        suspectedCause:
          ownership?.renderedBranch === 'dynamic'
            ? 'useCardRowLayout (dyn resolver) is owning size; static edits ignored.'
            : (prior.data.cls !== e.data.cls
                ? 'className mutation between samples — competing classname writer.'
                : 'inline style overwritten — competing style writer or remount.'),
      });
      _active.verdictEmitted = true;
      return;
    }
  }
}

// ─── DOM snapshot helpers ─────────────────────────────────────────────────

function _snapshotHost(el: HTMLElement): Record<string, unknown> {
  let cs: CSSStyleDeclaration | null = null;
  try { cs = window.getComputedStyle(el); } catch { cs = null; }
  let rect: DOMRect | null = null;
  try { rect = el.getBoundingClientRect(); } catch { rect = null; }
  return {
    tag: el.tagName,
    cls: el.className,
    style: el.getAttribute('style') ?? '',
    cw: cs ? Math.round(parseFloat(cs.width) || 0) : null,
    ch: cs ? Math.round(parseFloat(cs.height) || 0) : null,
    rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
  };
}

function _snapshotCard(el: HTMLElement, index: number): Record<string, unknown> {
  let cs: CSSStyleDeclaration | null = null;
  try { cs = window.getComputedStyle(el); } catch { cs = null; }
  let rect: DOMRect | null = null;
  try { rect = el.getBoundingClientRect(); } catch { rect = null; }
  return {
    index,
    tag: el.tagName,
    cls: el.className,
    style: el.getAttribute('style') ?? '',
    cw: cs ? Math.round(parseFloat(cs.width) || 0) : null,
    ch: cs ? Math.round(parseFloat(cs.height) || 0) : null,
    ml: cs ? cs.marginLeft : null,
    tr: cs ? cs.transform : null,
    op: cs ? cs.opacity : null,
    rect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
  };
}

function _push(kind: SnapbackEventKind, data: Record<string, unknown>) {
  if (!_active) return;
  _active.events.push({ t: Math.round(performance.now() - _active.startMs), kind, data });
}

// ─── Export ───────────────────────────────────────────────────────────────

export function buildR1SnapbackTxt(cap: CompletedCapture): string {
  const lines: string[] = [];
  lines.push('# 3-5-7 R1 STATIC SNAPBACK FORENSIC CAPTURE');
  lines.push(`startedAt: ${cap.startedAt}`);
  lines.push(`endedAt:   ${cap.endedAt}`);
  lines.push(`endReason: ${cap.endReason}`);
  lines.push('');
  lines.push('## START AUDIT (R1 ownership at arm)');
  lines.push(JSON.stringify(cap.startAudit, null, 2));
  lines.push('');
  lines.push('## END AUDIT (R1 ownership at end)');
  lines.push(JSON.stringify(cap.endAudit, null, 2));
  lines.push('');
  lines.push('## START CONFIG (three / anchor)');
  lines.push(JSON.stringify({ anchor: cap.startConfig.anchor, three: cap.startConfig.three }, null, 2));
  lines.push('');
  lines.push('## END CONFIG (three / anchor)');
  lines.push(JSON.stringify({ anchor: cap.endConfig.anchor, three: cap.endConfig.three }, null, 2));
  lines.push('');
  if (cap.verdict) {
    lines.push('## R1_STATIC_SNAPBACK_VERDICT');
    lines.push(JSON.stringify(cap.verdict.data, null, 2));
  } else {
    lines.push('## R1_STATIC_SNAPBACK_VERDICT');
    lines.push('(no snapback detected in capture window)');
  }
  lines.push('');
  lines.push('## EVENTS');
  for (const e of cap.events) {
    lines.push(`+${String(e.t).padStart(5, ' ')}ms  ${e.kind}`);
    lines.push(`    ${JSON.stringify(e.data)}`);
  }
  return lines.join('\n');
}

export function downloadR1SnapbackCapture(): boolean {
  const cap = _last;
  if (!cap) return false;
  const txt = buildR1SnapbackTxt(cap);
  const stamp = cap.endedAt.replace(/[:.]/g, '-');
  const filename = `357-r1-static-snapback-${stamp}.txt`;
  const blob = new Blob([txt], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 500);
  return true;
}
