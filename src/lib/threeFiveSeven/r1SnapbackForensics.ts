/**
 * 3-5-7 R1 SNAPBACK FORENSICS
 *
 * Bounded capture window for diagnosing the "edit R1 static width/height/
 * overlap → cards render large → snap back to standard" regression.
 *
 * Capture lifecycle:
 *   - ARMED when the user enables the pill via Admin Debug Tools.
 *   - START a fresh capture when (a) any 3-5-7 `three.size`/`three.overlap`
 *     value changes in the persisted config OR (b) `three.dyn.enabled`
 *     flips, AND a R1 exposed-opponent showdown host (`[data-357-r1-
 *     snapback-host]`) is currently mounted.
 *   - SAMPLE per frame: ownership-audit snapshots, persisted-config
 *     snapshots, computed DOM state for each of the 3 cards.
 *   - END 3000ms after the last DOM mutation affecting those 3 cards.
 *   - RETAIN the most recent completed capture for one-click .txt download.
 *
 * No console logs, no admin overlay, no persistent recorder writes.
 */

import {
  SHOWDOWN_RULES_STORAGE_KEY,
  loadShowdownRules,
  type ShowdownRulesState,
  type ThreeFiveSevenR1OwnershipAudit,
} from './showdownConfig';

// ─── Types ────────────────────────────────────────────────────────────────

export type SnapbackEventKind =
  | 'capture-start'
  | 'config-change'
  | 'ownership-audit'
  | 'host-mount'
  | 'host-unmount'
  | 'card-mount'
  | 'card-unmount'
  | 'card-mutation'
  | 'card-style-sample'
  | 'breakpoint-change'
  | 'resize'
  | 'verdict'
  | 'capture-end';

export interface SnapbackEvent {
  t: number; // ms since capture start
  kind: SnapbackEventKind;
  data: Record<string, unknown>;
}

export interface CompletedCapture {
  startedAt: string;
  endedAt: string;
  trigger: { field: string; before: unknown; after: unknown };
  startConfig: ShowdownRulesState;
  endConfig: ShowdownRulesState;
  events: SnapbackEvent[];
  verdict: SnapbackEvent | null;
}

// ─── State ────────────────────────────────────────────────────────────────

let _captureEnabled = false;
let _hostEl: HTMLElement | null = null;
let _cardEls: HTMLElement[] = [];
let _cardObservers: MutationObserver[] = [];
let _hostObserver: MutationObserver | null = null;
let _resizeRO: ResizeObserver | null = null;
let _mqList: MediaQueryList | null = null;
let _mqHandler: ((e: MediaQueryListEvent) => void) | null = null;

let _active: {
  startMs: number;
  startedAt: string;
  trigger: { field: string; before: unknown; after: unknown };
  startConfig: ShowdownRulesState;
  events: SnapbackEvent[];
  lastMutationMs: number;
  endTimer: ReturnType<typeof setTimeout> | null;
  rafHandle: number | null;
  lastSampleSig: Map<HTMLElement, string>;
  lastOwnership: ThreeFiveSevenR1OwnershipAudit | null;
  verdictEmitted: boolean;
} | null = null;

let _last: CompletedCapture | null = null;
let _prevConfig: ShowdownRulesState | null = null;

const END_QUIET_MS = 3000;
const SAMPLE_INTERVAL_MS = 50;

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

// ─── Pill enable / lifecycle ──────────────────────────────────────────────

export function setR1SnapbackCaptureEnabled(enabled: boolean): void {
  if (_captureEnabled === enabled) return;
  _captureEnabled = enabled;
  if (enabled) {
    _prevConfig = loadShowdownRules();
    window.addEventListener('storage', _onStorage);
    window.addEventListener('ptp:357showdownRules:updated', _onConfigEvent);
    window.addEventListener('resize', _onResize);
    _mqList = window.matchMedia('(min-width: 640px)');
    _mqHandler = (e) => _push('breakpoint-change', { matches: e.matches });
    _mqList.addEventListener('change', _mqHandler);
  } else {
    window.removeEventListener('storage', _onStorage);
    window.removeEventListener('ptp:357showdownRules:updated', _onConfigEvent);
    window.removeEventListener('resize', _onResize);
    if (_mqList && _mqHandler) _mqList.removeEventListener('change', _mqHandler);
    _mqList = null; _mqHandler = null;
    _endCapture('disabled');
    _detachHost();
  }
  emit();
}

export function isR1SnapbackCaptureEnabled(): boolean {
  return _captureEnabled;
}

// ─── DOM host registration (called from PlayerHand) ───────────────────────

export function registerR1SnapbackHost(el: HTMLElement | null): void {
  if (!_captureEnabled) return;
  if (el === _hostEl) return;
  _detachHost();
  if (!el) return;
  _hostEl = el;
  _push('host-mount', { tag: el.tagName, className: el.className });
  _rescanCards();
  _hostObserver = new MutationObserver(() => _rescanCards());
  _hostObserver.observe(el, { childList: true, subtree: false });
  try {
    _resizeRO = new ResizeObserver((entries) => {
      for (const e of entries) {
        const r = e.contentRect;
        _push('resize', { w: Math.round(r.width), h: Math.round(r.height) });
      }
    });
    _resizeRO.observe(el);
  } catch { /* */ }
}

function _detachHost() {
  if (_hostObserver) { _hostObserver.disconnect(); _hostObserver = null; }
  if (_resizeRO) { try { _resizeRO.disconnect(); } catch { /* */ } _resizeRO = null; }
  for (const o of _cardObservers) o.disconnect();
  _cardObservers = [];
  if (_hostEl) _push('host-unmount', {});
  _hostEl = null;
  _cardEls = [];
}

function _rescanCards() {
  if (!_hostEl) return;
  for (const o of _cardObservers) o.disconnect();
  _cardObservers = [];
  const next = Array.from(_hostEl.querySelectorAll<HTMLElement>(':scope > *'));
  for (let i = 0; i < next.length; i++) {
    const el = next[i];
    if (!_cardEls.includes(el)) {
      _push('card-mount', { index: i, ..._snapshotCard(el, i) });
    }
  }
  for (const prev of _cardEls) {
    if (!next.includes(prev)) {
      _push('card-unmount', _snapshotCard(prev, -1));
    }
  }
  _cardEls = next;
  for (let i = 0; i < _cardEls.length; i++) {
    const el = _cardEls[i];
    const idx = i;
    const mo = new MutationObserver((muts) => {
      const attrs = muts.filter((m) => m.type === 'attributes').map((m) => m.attributeName);
      _push('card-mutation', { index: idx, attrs, ..._snapshotCard(el, idx) });
      if (_active) _active.lastMutationMs = performance.now();
      _scheduleEndTimer();
    });
    mo.observe(el, { attributes: true, attributeOldValue: true, childList: true, subtree: true });
    _cardObservers.push(mo);
  }
}

// ─── Ownership audit ingestion (called from PlayerHand publisher) ─────────

export function ingestR1OwnershipAuditForSnapback(audit: ThreeFiveSevenR1OwnershipAudit | null): void {
  if (!_captureEnabled || !_active) return;
  _active.lastOwnership = audit;
  _push('ownership-audit', { audit: audit as unknown as Record<string, unknown> | null });
  _evaluateVerdict();
}

// ─── Config-change → capture start ────────────────────────────────────────

function _onStorage(e: StorageEvent) {
  if (e.key !== SHOWDOWN_RULES_STORAGE_KEY) return;
  _handleConfigUpdate();
}
function _onConfigEvent() { _handleConfigUpdate(); }
function _onResize() {
  if (_active) _push('resize', { w: window.innerWidth, h: window.innerHeight });
}

function _handleConfigUpdate() {
  const next = loadShowdownRules();
  const prev = _prevConfig ?? next;
  const diff = _diffR1(prev, next);
  _prevConfig = next;
  if (!diff) return;
  if (_active) {
    _push('config-change', diff);
    _active.lastMutationMs = performance.now();
    _scheduleEndTimer();
    return;
  }
  // Start a new capture only if a host is mounted (i.e. R1 showdown live).
  if (!_hostEl) return;
  _startCapture(diff, next);
}

function _diffR1(a: ShowdownRulesState, b: ShowdownRulesState): { field: string; before: unknown; after: unknown } | null {
  const ka = JSON.stringify(a.three.size);
  const kb = JSON.stringify(b.three.size);
  if (ka !== kb) return { field: 'three.size', before: a.three.size, after: b.three.size };
  const oa = JSON.stringify(a.three.overlap);
  const ob = JSON.stringify(b.three.overlap);
  if (oa !== ob) return { field: 'three.overlap', before: a.three.overlap, after: b.three.overlap };
  if (a.three.dyn.enabled !== b.three.dyn.enabled) {
    return { field: 'three.dyn.enabled', before: a.three.dyn.enabled, after: b.three.dyn.enabled };
  }
  return null;
}

function _startCapture(trigger: { field: string; before: unknown; after: unknown }, startConfig: ShowdownRulesState) {
  // Replace any in-flight capture.
  if (_active) _endCapture('superseded');
  _active = {
    startMs: performance.now(),
    startedAt: new Date().toISOString(),
    trigger,
    startConfig,
    events: [],
    lastMutationMs: performance.now(),
    endTimer: null,
    rafHandle: null,
    lastSampleSig: new Map(),
    lastOwnership: null,
    verdictEmitted: false,
  };
  _push('capture-start', { trigger });
  // Sample current cards immediately.
  if (_hostEl) {
    for (let i = 0; i < _cardEls.length; i++) {
      _push('card-style-sample', { index: i, ..._snapshotCard(_cardEls[i], i) });
    }
  }
  _scheduleSample();
  _scheduleEndTimer();
}

function _scheduleSample() {
  if (!_active) return;
  _active.rafHandle = window.setTimeout(() => {
    if (!_active) return;
    for (let i = 0; i < _cardEls.length; i++) {
      const el = _cardEls[i];
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

function _scheduleEndTimer() {
  if (!_active) return;
  if (_active.endTimer) clearTimeout(_active.endTimer);
  _active.endTimer = setTimeout(() => {
    if (!_active) return;
    const quiet = performance.now() - _active.lastMutationMs;
    if (quiet >= END_QUIET_MS - 10) {
      _endCapture('quiet');
    } else {
      _scheduleEndTimer();
    }
  }, Math.max(50, END_QUIET_MS - (performance.now() - _active.lastMutationMs)));
}

function _endCapture(reason: string) {
  if (!_active) return;
  if (_active.endTimer) clearTimeout(_active.endTimer);
  if (_active.rafHandle != null) clearTimeout(_active.rafHandle);
  _push('capture-end', { reason });
  const endConfig = loadShowdownRules();
  _last = {
    startedAt: _active.startedAt,
    endedAt: new Date().toISOString(),
    trigger: _active.trigger,
    startConfig: _active.startConfig,
    endConfig,
    events: _active.events.slice(),
    verdict: _active.events.find((e) => e.kind === 'verdict') ?? null,
  };
  _active = null;
  emit();
}

// ─── Verdict ──────────────────────────────────────────────────────────────

function _evaluateVerdict() {
  if (!_active || _active.verdictEmitted) return;
  // Identify "edited large" target width from current persisted three.size.
  const cur = loadShowdownRules();
  const targetW = cur.three.size.mobileWidthPx;
  // After the edit raised width past baseline (40), any sample whose
  // measured width returns to ~40 px counts as snapback.
  if (targetW <= 40) return;
  for (let i = _active.events.length - 1; i >= 0; i--) {
    const e = _active.events[i];
    if (e.kind !== 'card-style-sample' && e.kind !== 'card-mutation') continue;
    const w = Number(e.data.cw ?? 0);
    if (w > 0 && w <= 42) {
      // Find the prior sample showing the larger size for the same card.
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
      const ownership = _active.lastOwnership;
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

// ─── DOM snapshot helper ──────────────────────────────────────────────────

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
  lines.push(`trigger:   ${cap.trigger.field}`);
  lines.push(`  before:  ${JSON.stringify(cap.trigger.before)}`);
  lines.push(`  after:   ${JSON.stringify(cap.trigger.after)}`);
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
