/**
 * 3-5-7 R1 Snapback Forensics — bounded capture window engine.
 *
 * Captures one "edit → snapback" episode for the 3-card opponent R1
 * showdown row. Triggered by any 3-5-7 showdown-rules config change
 * (including dyn.enabled). Ends 3 s after the final DOM mutation
 * affecting any tracked R1 host. Retains the most recent completed
 * capture for export.
 *
 * Implementation is intentionally self-contained — no console logs,
 * no debug_sync_events, no recorder writes. The pill consumes the
 * capture map directly.
 */

import {
  loadShowdownRules,
  subscribeAllR1OwnershipAudits,
  subscribeShowdownRulesUpdates,
  getAllR1OwnershipAudits,
  type ShowdownRulesState,
  type ThreeFiveSevenR1OwnershipAudit,
} from './showdownConfig';

type EventKind =
  | 'capture-start'
  | 'capture-end'
  | 'config-change'
  | 'config-event-receipt'
  | 'audit-update'
  | 'dom-mount'
  | 'dom-unmount'
  | 'dom-mutation'
  | 'rect-sample'
  | 'verdict';

interface ForensicEvent {
  t: number; // ms relative to capture start
  iso: string;
  kind: EventKind;
  payload: Record<string, unknown>;
}

interface CardObservation {
  index: number;
  nodeId: string;
  width: number;
  height: number;
  marginLeft: string;
  transform: string;
  opacity: string;
  inlineStyle: string;
  className: string;
  rect: { x: number; y: number; w: number; h: number };
}

export interface CompletedCapture {
  startedAt: string;
  endedAt: string;
  trigger: { field: string; before: unknown; after: unknown; dynEnabled: boolean };
  events: ForensicEvent[];
  verdict: Record<string, unknown> | null;
}

const SUBSCRIBERS = new Set<() => void>();
function emit() { SUBSCRIBERS.forEach((s) => { try { s(); } catch { /* */ } }); }
export function subscribe(cb: () => void): () => void {
  SUBSCRIBERS.add(cb);
  return () => { SUBSCRIBERS.delete(cb); };
}

let _enabled = false;
let _lastCompleted: CompletedCapture | null = null;
let _activeR1HostCount = 0;
let _hostsPresent = false;
const HOSTS_LISTENERS = new Set<(hosts: boolean) => void>();

export function getLastCompletedCapture(): CompletedCapture | null { return _lastCompleted; }
export function getActiveR1HostCount(): number { return _activeR1HostCount; }
export function hasActiveR1Hosts(): boolean { return _hostsPresent; }
export function subscribeHostsPresence(cb: (hosts: boolean) => void): () => void {
  HOSTS_LISTENERS.add(cb);
  cb(_hostsPresent);
  return () => { HOSTS_LISTENERS.delete(cb); };
}

// ─── Active capture state ─────────────────────────────────────────────────
interface CaptureSession {
  startedAtMs: number;
  startedAtIso: string;
  trigger: CompletedCapture['trigger'];
  events: ForensicEvent[];
  hostObservers: Map<Element, MutationObserver>;
  rafHandle: number | null;
  endTimer: ReturnType<typeof setTimeout> | null;
  cardNodeIds: WeakMap<Element, string>;
  nodeIdSeq: number;
  prevSamples: Map<string, CardObservation>;
  verdict: Record<string, unknown> | null;
}
let _session: CaptureSession | null = null;

const HOST_SELECTOR = '[data-357-r1-host]';
const END_DEBOUNCE_MS = 3000;

// ─── Global host detector (always-on while enabled) ───────────────────────
let _hostObserver: MutationObserver | null = null;

function recomputeHostsPresence() {
  const hosts = document.querySelectorAll(HOST_SELECTOR);
  _activeR1HostCount = hosts.length;
  const present = hosts.length > 0;
  if (present !== _hostsPresent) {
    _hostsPresent = present;
    HOSTS_LISTENERS.forEach((l) => { try { l(present); } catch { /* */ } });
  }
}

// ─── Capture helpers ──────────────────────────────────────────────────────
function pushEvent(kind: EventKind, payload: Record<string, unknown>) {
  if (!_session) return;
  const now = performance.now();
  _session.events.push({
    t: Math.round(now - _session.startedAtMs),
    iso: new Date().toISOString(),
    kind,
    payload,
  });
  if (_session.events.length > 5000) _session.events.splice(0, 500);
}

function nodeIdFor(el: Element): string {
  if (!_session) return 'n0';
  const cached = _session.cardNodeIds.get(el);
  if (cached) return cached;
  const id = `card#${++_session.nodeIdSeq}`;
  _session.cardNodeIds.set(el, id);
  return id;
}

function snapshotCard(el: Element, index: number): CardObservation {
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    index,
    nodeId: nodeIdFor(el),
    width: parseFloat(cs.width),
    height: parseFloat(cs.height),
    marginLeft: cs.marginLeft,
    transform: cs.transform,
    opacity: cs.opacity,
    inlineStyle: (el as HTMLElement).getAttribute('style') ?? '',
    className: (el as HTMLElement).getAttribute('class') ?? '',
    rect: { x: r.x, y: r.y, w: r.width, h: r.height },
  };
}

function diffFirstChange(prev: CardObservation, next: CardObservation): { prop: string; old: unknown; new: unknown } | null {
  const keys: (keyof CardObservation)[] = ['width', 'height', 'marginLeft', 'transform', 'opacity', 'className', 'inlineStyle'];
  for (const k of keys) {
    if (JSON.stringify(prev[k]) !== JSON.stringify(next[k])) {
      return { prop: String(k), old: prev[k], new: next[k] };
    }
  }
  return null;
}

function sampleAllHosts() {
  if (!_session) return;
  const hosts = document.querySelectorAll(HOST_SELECTOR);
  hosts.forEach((host) => {
    const hostId = (host as HTMLElement).dataset['357R1Host'] || 'host?';
    const kids = Array.from(host.children).slice(0, 3);
    kids.forEach((kid, i) => {
      const sig = `${hostId}#${i}`;
      const sample = snapshotCard(kid, i);
      const prev = _session!.prevSamples.get(sig);
      if (prev) {
        const diff = diffFirstChange(prev, sample);
        if (diff) {
          pushEvent('rect-sample', { hostId, index: i, ...sample, diff });
          // Verdict: first detected shrink in width.
          if (!_session!.verdict && diff.prop === 'width' && Number(diff.new) < Number(diff.old)) {
            const audit = pickAuditForHost(hostId);
            _session!.verdict = {
              tag: 'R1_STATIC_SNAPBACK_VERDICT',
              firstChangedProperty: diff.prop,
              oldValue: diff.old,
              newValue: diff.new,
              hostId,
              cardIndex: i,
              auditAtVerdict: audit,
              note:
                'First detected width shrink on tracked R1 card. Inspect rect-sample/audit-update/dom-mutation entries immediately preceding to identify the responsible writer.',
            };
            pushEvent('verdict', _session!.verdict);
          }
        }
      } else {
        pushEvent('rect-sample', { hostId, index: i, ...sample, initial: true });
      }
      _session!.prevSamples.set(sig, sample);
    });
  });
}

function pickAuditForHost(hostId: string): ThreeFiveSevenR1OwnershipAudit | null {
  const map = getAllR1OwnershipAudits();
  return map.get(hostId) ?? null;
}

function attachHostObservers() {
  if (!_session) return;
  // Disconnect stale
  _session.hostObservers.forEach((mo) => mo.disconnect());
  _session.hostObservers.clear();
  const hosts = document.querySelectorAll(HOST_SELECTOR);
  hosts.forEach((host) => {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        pushEvent('dom-mutation', {
          hostId: (host as HTMLElement).dataset['357R1Host'],
          type: m.type,
          attributeName: m.attributeName ?? null,
          target: (m.target as HTMLElement).tagName,
          addedNodes: m.addedNodes.length,
          removedNodes: m.removedNodes.length,
          oldValue: m.oldValue,
        });
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => {
            if (n.nodeType === 1) {
              const idx = Array.from(host.children).indexOf(n as Element);
              pushEvent('dom-mount', { hostId: (host as HTMLElement).dataset['357R1Host'], index: idx, nodeId: nodeIdFor(n as Element) });
            }
          });
          m.removedNodes.forEach((n) => {
            if (n.nodeType === 1) {
              pushEvent('dom-unmount', { hostId: (host as HTMLElement).dataset['357R1Host'], tag: (n as Element).tagName });
            }
          });
        }
      }
      scheduleEnd();
    });
    mo.observe(host, { childList: true, subtree: true, attributes: true, attributeOldValue: true, characterData: false });
    _session!.hostObservers.set(host, mo);
  });
}

function rafLoop() {
  if (!_session) return;
  sampleAllHosts();
  _session.rafHandle = requestAnimationFrame(rafLoop);
}

function scheduleEnd() {
  if (!_session) return;
  if (_session.endTimer) clearTimeout(_session.endTimer);
  _session.endTimer = setTimeout(endCapture, END_DEBOUNCE_MS);
}

function endCapture() {
  if (!_session) return;
  pushEvent('capture-end', { reason: 'debounce-elapsed', durationMs: Math.round(performance.now() - _session.startedAtMs) });
  if (_session.rafHandle != null) cancelAnimationFrame(_session.rafHandle);
  _session.hostObservers.forEach((mo) => mo.disconnect());
  _lastCompleted = {
    startedAt: _session.startedAtIso,
    endedAt: new Date().toISOString(),
    trigger: _session.trigger,
    events: _session.events,
    verdict: _session.verdict,
  };
  _session = null;
  emit();
}

let _prevConfig: ShowdownRulesState = loadShowdownRules();

function diffRelevantConfig(prev: ShowdownRulesState, next: ShowdownRulesState): { field: string; before: unknown; after: unknown } | null {
  // R1-relevant fields for the 3-card path.
  const pairs: Array<[string, unknown, unknown]> = [
    ['three.dyn.enabled', prev.three.dyn.enabled, next.three.dyn.enabled],
    ['three.size.mobileWidthPx', prev.three.size.mobileWidthPx, next.three.size.mobileWidthPx],
    ['three.size.mobileHeightPx', prev.three.size.mobileHeightPx, next.three.size.mobileHeightPx],
    ['three.size.smWidthPx', prev.three.size.smWidthPx, next.three.size.smWidthPx],
    ['three.size.smHeightPx', prev.three.size.smHeightPx, next.three.size.smHeightPx],
    ['three.overlap.mobilePx', prev.three.overlap.mobilePx, next.three.overlap.mobilePx],
    ['three.overlap.smPx', prev.three.overlap.smPx, next.three.overlap.smPx],
    ['three.fan.stepDeg', prev.three.fan.stepDeg, next.three.fan.stepDeg],
  ];
  for (const [f, b, a] of pairs) {
    if (JSON.stringify(b) !== JSON.stringify(a)) return { field: f, before: b, after: a };
  }
  return null;
}

function startCapture(trigger: CompletedCapture['trigger']) {
  if (_session) {
    // Restart fresh.
    if (_session.rafHandle != null) cancelAnimationFrame(_session.rafHandle);
    if (_session.endTimer) clearTimeout(_session.endTimer);
    _session.hostObservers.forEach((mo) => mo.disconnect());
    _session = null;
  }
  const nowMs = performance.now();
  _session = {
    startedAtMs: nowMs,
    startedAtIso: new Date().toISOString(),
    trigger,
    events: [],
    hostObservers: new Map(),
    rafHandle: null,
    endTimer: null,
    cardNodeIds: new WeakMap(),
    nodeIdSeq: 0,
    prevSamples: new Map(),
    verdict: null,
  };
  pushEvent('capture-start', { trigger });
  // Audit snapshot at start.
  const auditMap = getAllR1OwnershipAudits();
  pushEvent('audit-update', { phase: 'at-start', audits: Array.from(auditMap.entries()).map(([k, v]) => ({ key: k, audit: v })) });
  attachHostObservers();
  _session.rafHandle = requestAnimationFrame(rafLoop);
  scheduleEnd();
}

// ─── Lifecycle: enable/disable the engine ─────────────────────────────────
let _wired = false;
let _unsubConfig: (() => void) | null = null;
let _unsubAudits: (() => void) | null = null;

export function setR1SnapbackEngineEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (enabled === _enabled) return;
  _enabled = enabled;
  if (enabled) wire();
  else unwire();
}

function wire() {
  if (_wired) return;
  _wired = true;
  _prevConfig = loadShowdownRules();
  // Host presence observer.
  _hostObserver = new MutationObserver(() => recomputeHostsPresence());
  _hostObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-357-r1-host'] });
  recomputeHostsPresence();
  _unsubConfig = subscribeShowdownRulesUpdates(() => {
    const next = loadShowdownRules();
    const diff = diffRelevantConfig(_prevConfig, next);
    _prevConfig = next;
    if (!diff) return;
    // Only capture when a 3-card R1 host is on-screen.
    if (!_hostsPresent) return;
    if (_session) {
      pushEvent('config-event-receipt', { diff, dynEnabled: next.three.dyn.enabled });
      pushEvent('config-change', diff);
      scheduleEnd();
    } else {
      startCapture({ field: diff.field, before: diff.before, after: diff.after, dynEnabled: next.three.dyn.enabled });
    }
  });
  _unsubAudits = subscribeAllR1OwnershipAudits((snapshot) => {
    if (!_session) return;
    pushEvent('audit-update', { audits: Array.from(snapshot.entries()).map(([k, v]) => ({ key: k, audit: v })) });
    scheduleEnd();
  });
}

function unwire() {
  if (!_wired) return;
  _wired = false;
  _hostObserver?.disconnect(); _hostObserver = null;
  _unsubConfig?.(); _unsubConfig = null;
  _unsubAudits?.(); _unsubAudits = null;
  if (_session) {
    if (_session.rafHandle != null) cancelAnimationFrame(_session.rafHandle);
    if (_session.endTimer) clearTimeout(_session.endTimer);
    _session.hostObservers.forEach((mo) => mo.disconnect());
    _session = null;
  }
}

// ─── Export ───────────────────────────────────────────────────────────────
export function buildExportText(cap: CompletedCapture): string {
  const lines: string[] = [];
  lines.push('=== 3-5-7 R1 STATIC SNAPBACK CAPTURE ===');
  lines.push(`startedAt: ${cap.startedAt}`);
  lines.push(`endedAt:   ${cap.endedAt}`);
  lines.push(`trigger:   ${JSON.stringify(cap.trigger)}`);
  lines.push('');
  lines.push('--- VERDICT ---');
  lines.push(cap.verdict ? JSON.stringify(cap.verdict, null, 2) : 'NO_VERDICT (no width shrink detected during window)');
  lines.push('');
  lines.push(`--- EVENTS (${cap.events.length}) ---`);
  for (const ev of cap.events) {
    lines.push(`+${String(ev.t).padStart(5, ' ')}ms  ${ev.iso}  ${ev.kind}  ${safeJson(ev.payload)}`);
  }
  return lines.join('\n');
}

function safeJson(v: unknown): string {
  try { return JSON.stringify(v); } catch { return '[unserializable]'; }
}

export function downloadLastCapture(): void {
  if (typeof window === 'undefined') return;
  const cap = _lastCompleted;
  if (!cap) return;
  const ts = cap.endedAt.replace(/[:.]/g, '-');
  const text = buildExportText(cap);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `357-r1-static-snapback-${ts}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
