/**
 * holmSelfTimerForensics — INSTRUMENTATION ONLY.
 *
 * Captures the entire self-timer chain for every actionable segment:
 *   - canonical segment identity & authority
 *   - timer owner inventory (one record per MobilePlayerTimer instance)
 *   - first-commit / first-paint evidence (preprint, rAF1, rAF2, 250ms)
 *   - mandatory violation detectors
 *
 * NO behavior changes. NO patches. Purely observational.
 *
 * Surfaces:
 *   window.__holmSelfTimerForensics.events
 *   window.__holmSelfTimerForensics.violations
 *   window.__holmSelfTimerForensics.owners
 *   window.__holmSelfTimerForensics.segments
 */

export type HolmTimerEventName =
  | 'HOLM_TIMER_SEGMENT_ACTIVATED'
  | 'HOLM_TIMER_RENDER_COMMIT_PREPAINT'
  | 'HOLM_TIMER_FIRST_RAF'
  | 'HOLM_TIMER_SECOND_RAF'
  | 'HOLM_TIMER_250MS'
  | 'HOLM_TIMER_RENDER_SAME_SEGMENT'
  | 'HOLM_TIMER_PROGRESS_DESCENT'
  | 'HOLM_TIMER_DEACTIVATED'
  | 'HOLM_TIMER_OWNER_MOUNT'
  | 'HOLM_TIMER_OWNER_UNMOUNT';

export type HolmTimerViolationType =
  | 'HOLM_TIMER_FIRST_COMMIT_BELOW_FULL'
  | 'HOLM_TIMER_FIRST_RAF_BELOW_FULL'
  | 'HOLM_TIMER_PROGRESS_INCREASE_WITHOUT_PAUSE_RESUME'
  | 'HOLM_TIMER_POSTPAINT_SEED_OR_DEADLINE_REBASE'
  | 'HOLM_TIMER_STALE_SEGMENT_WRITE'
  | 'HOLM_TIMER_MULTIPLE_VISIBLE_OWNERS'
  | 'HOLM_TIMER_LOGICAL_DOM_DIVERGENCE'
  | 'HOLM_TIMER_CSS_TRANSITION_FROM_STALE_VALUE';

export interface HolmTimerEvent {
  seq: number;
  t: number;
  wall: string;
  instanceId: number;
  segmentId: string | null;
  segmentKind: 'NEW_TURN' | 'PAUSE_RESUME_REFILL' | 'SAME_SEGMENT_UPDATE' | 'STALE_SEGMENT' | 'UNKNOWN';
  event: HolmTimerEventName;
  payload: Record<string, unknown>;
}

export interface HolmTimerViolation {
  seq: number;
  t: number;
  wall: string;
  type: HolmTimerViolationType;
  instanceId: number;
  segmentId: string | null;
  payload: Record<string, unknown>;
}

export interface HolmTimerOwnerSnapshot {
  instanceId: number;
  componentName: string;
  callsite: string;
  gameType: string | null;
  handContextId: string | null;
  selfPlayerId: string | null;
  activePlayerId: string | null;
  seatPosition: number | null;
  mounted: boolean;
  mountedAt: number;
  unmountedAt: number | null;
  lastSegmentId: string | null;
  renderCount: number;
}

export interface HolmTimerSegmentSummary {
  segmentId: string;
  instanceId: number;
  activatedAt: number;
  activatedWall: string;
  handContextId: string | null;
  selfPlayerId: string | null;
  activePlayerId: string | null;
  duration: number;
  deadline: number | null;
  paused: boolean;
  authoritativeSource: string;
  preCommitProgress: number | null;
  firstRafProgress: number | null;
  secondRafProgress: number | null;
  at250msProgress: number | null;
  lastProgress: number | null;
  firstDescentSeen: boolean;
  firstDescentAt: number | null;
  domSvgFirstDashoffset: number | null;
  domSvgFirstCircumference: number | null;
  domSvgFirstVisualRatio: number | null;
  cssTransition: string | null;
  classNameFirstCommit: string | null;
  violations: HolmTimerViolationType[];
}

const RING = 600;
const events: HolmTimerEvent[] = [];
const violations: HolmTimerViolation[] = [];
const owners = new Map<number, HolmTimerOwnerSnapshot>();
const segments = new Map<string, HolmTimerSegmentSummary>();
let _seq = 0;

// Cached snapshot arrays — refreshed only when data mutates so
// useSyncExternalStore's reference-equality check stays stable.
let _ownersSnap: HolmTimerOwnerSnapshot[] = [];
let _segmentsSnap: HolmTimerSegmentSummary[] = [];
function refreshOwnersSnap() { _ownersSnap = Array.from(owners.values()); }
function refreshSegmentsSnap() { _segmentsSnap = Array.from(segments.values()); }

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) { try { l(); } catch { /* */ } } }

export function subscribeHolmSelfTimer(cb: () => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function getHolmTimerEvents(): HolmTimerEvent[] { return events; }
export function getHolmTimerViolations(): HolmTimerViolation[] { return violations; }
export function getHolmTimerOwners(): HolmTimerOwnerSnapshot[] { return _ownersSnap; }
export function getHolmTimerSegments(): HolmTimerSegmentSummary[] { return _segmentsSnap; }

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

export function recordHolmTimerEvent(
  event: HolmTimerEventName,
  instanceId: number,
  segmentId: string | null,
  segmentKind: HolmTimerEvent['segmentKind'],
  payload: Record<string, unknown>,
): void {
  events.push({
    seq: ++_seq,
    t: now(),
    wall: new Date().toISOString(),
    instanceId,
    segmentId,
    segmentKind,
    event,
    payload,
  });
  while (events.length > RING) events.shift();
  publish();
  emit();
}

export function recordHolmTimerViolation(
  type: HolmTimerViolationType,
  instanceId: number,
  segmentId: string | null,
  payload: Record<string, unknown>,
): void {
  violations.push({
    seq: ++_seq,
    t: now(),
    wall: new Date().toISOString(),
    type,
    instanceId,
    segmentId,
    payload,
  });
  while (violations.length > RING) violations.shift();
  const s = segmentId ? segments.get(segmentId) : null;
  if (s && !s.violations.includes(type)) s.violations.push(type);
  publish();
  emit();
}

export function registerHolmTimerOwner(snap: HolmTimerOwnerSnapshot): void {
  owners.set(snap.instanceId, snap);
  recordHolmTimerEvent('HOLM_TIMER_OWNER_MOUNT', snap.instanceId, null, 'UNKNOWN', {
    componentName: snap.componentName,
    callsite: snap.callsite,
    gameType: snap.gameType,
    handContextId: snap.handContextId,
    selfPlayerId: snap.selfPlayerId,
    activePlayerId: snap.activePlayerId,
    seatPosition: snap.seatPosition,
  });
}

export function updateHolmTimerOwner(instanceId: number, patch: Partial<HolmTimerOwnerSnapshot>): void {
  const o = owners.get(instanceId);
  if (!o) return;
  Object.assign(o, patch);
  publish();
}

export function unregisterHolmTimerOwner(instanceId: number): void {
  const o = owners.get(instanceId);
  if (!o) return;
  o.mounted = false;
  o.unmountedAt = now();
  recordHolmTimerEvent('HOLM_TIMER_OWNER_UNMOUNT', instanceId, o.lastSegmentId, 'UNKNOWN', {
    componentName: o.componentName,
    handContextId: o.handContextId,
  });
}

export interface HolmTimerSegmentInit {
  instanceId: number;
  segmentId: string;
  handContextId: string | null;
  selfPlayerId: string | null;
  activePlayerId: string | null;
  duration: number;
  deadline: number | null;
  paused: boolean;
  authoritativeSource: string;
  preCommitProgress: number;
  classNameFirstCommit: string | null;
  cssTransition: string | null;
  domSvgDashoffset: number | null;
  domSvgCircumference: number | null;
  prevSegmentId: string | null;
  isPauseResume: boolean;
}

export function beginHolmTimerSegment(init: HolmTimerSegmentInit): void {
  const visualRatio = init.domSvgCircumference && init.domSvgCircumference > 0 && init.domSvgDashoffset != null
    ? 1 - init.domSvgDashoffset / init.domSvgCircumference
    : null;
  const seg: HolmTimerSegmentSummary = {
    segmentId: init.segmentId,
    instanceId: init.instanceId,
    activatedAt: now(),
    activatedWall: new Date().toISOString(),
    handContextId: init.handContextId,
    selfPlayerId: init.selfPlayerId,
    activePlayerId: init.activePlayerId,
    duration: init.duration,
    deadline: init.deadline,
    paused: init.paused,
    authoritativeSource: init.authoritativeSource,
    preCommitProgress: init.preCommitProgress,
    firstRafProgress: null,
    secondRafProgress: null,
    at250msProgress: null,
    lastProgress: init.preCommitProgress,
    firstDescentSeen: false,
    firstDescentAt: null,
    domSvgFirstDashoffset: init.domSvgDashoffset,
    domSvgFirstCircumference: init.domSvgCircumference,
    domSvgFirstVisualRatio: visualRatio,
    cssTransition: init.cssTransition,
    classNameFirstCommit: init.classNameFirstCommit,
    violations: [],
  };
  segments.set(init.segmentId, seg);
  const o = owners.get(init.instanceId);
  if (o) o.lastSegmentId = init.segmentId;

  const kind: HolmTimerEvent['segmentKind'] = init.isPauseResume ? 'PAUSE_RESUME_REFILL' : 'NEW_TURN';
  recordHolmTimerEvent('HOLM_TIMER_SEGMENT_ACTIVATED', init.instanceId, init.segmentId, kind, {
    handContextId: init.handContextId,
    selfPlayerId: init.selfPlayerId,
    activePlayerId: init.activePlayerId,
    duration: init.duration,
    deadline: init.deadline,
    paused: init.paused,
    prevSegmentId: init.prevSegmentId,
    authoritativeSource: init.authoritativeSource,
  });
  recordHolmTimerEvent('HOLM_TIMER_RENDER_COMMIT_PREPAINT', init.instanceId, init.segmentId, kind, {
    preCommitProgress: init.preCommitProgress,
    domSvgDashoffset: init.domSvgDashoffset,
    domSvgCircumference: init.domSvgCircumference,
    domSvgVisualRatio: visualRatio,
    classNameFirstCommit: init.classNameFirstCommit,
    cssTransition: init.cssTransition,
  });

  if (init.preCommitProgress < 0.999) {
    recordHolmTimerViolation('HOLM_TIMER_FIRST_COMMIT_BELOW_FULL', init.instanceId, init.segmentId, {
      preCommitProgress: init.preCommitProgress,
      domSvgVisualRatio: visualRatio,
      classNameFirstCommit: init.classNameFirstCommit,
      cssTransition: init.cssTransition,
      authoritativeSource: init.authoritativeSource,
    });
  }
  if (visualRatio != null && visualRatio < 0.999) {
    recordHolmTimerViolation('HOLM_TIMER_LOGICAL_DOM_DIVERGENCE', init.instanceId, init.segmentId, {
      stage: 'PREPAINT',
      logicalProgress: init.preCommitProgress,
      domSvgVisualRatio: visualRatio,
      dashoffset: init.domSvgDashoffset,
      circumference: init.domSvgCircumference,
    });
  }
  if (init.cssTransition && /\d/.test(init.cssTransition) && !/^(?:none|0s)/i.test(init.cssTransition)) {
    if (init.preCommitProgress >= 0.999 && visualRatio != null && visualRatio < 0.999) {
      recordHolmTimerViolation('HOLM_TIMER_CSS_TRANSITION_FROM_STALE_VALUE', init.instanceId, init.segmentId, {
        stage: 'PREPAINT',
        cssTransition: init.cssTransition,
        logicalProgress: init.preCommitProgress,
        domSvgVisualRatio: visualRatio,
      });
    }
  }
}

export interface HolmTimerSamplePoint {
  instanceId: number;
  segmentId: string;
  stage: 'FIRST_RAF' | 'SECOND_RAF' | '250MS' | 'TICK';
  logicalProgress: number;
  timeLeft: number | null;
  deadline: number | null;
  domSvgDashoffset: number | null;
  domSvgCircumference: number | null;
  className: string | null;
  cssTransition: string | null;
  visibleOwnerCount: number;
}

export function recordHolmTimerSample(s: HolmTimerSamplePoint): void {
  const seg = segments.get(s.segmentId);
  if (!seg) return;
  const visualRatio = s.domSvgCircumference && s.domSvgCircumference > 0 && s.domSvgDashoffset != null
    ? 1 - s.domSvgDashoffset / s.domSvgCircumference
    : null;
  const payload = {
    logicalProgress: s.logicalProgress,
    domSvgVisualRatio: visualRatio,
    dashoffset: s.domSvgDashoffset,
    circumference: s.domSvgCircumference,
    timeLeft: s.timeLeft,
    deadline: s.deadline,
    className: s.className,
    cssTransition: s.cssTransition,
    visibleOwnerCount: s.visibleOwnerCount,
  };
  if (s.stage === 'FIRST_RAF') {
    seg.firstRafProgress = s.logicalProgress;
    recordHolmTimerEvent('HOLM_TIMER_FIRST_RAF', s.instanceId, s.segmentId, 'SAME_SEGMENT_UPDATE', payload);
    if (s.logicalProgress < 0.999) {
      recordHolmTimerViolation('HOLM_TIMER_FIRST_RAF_BELOW_FULL', s.instanceId, s.segmentId, payload);
    }
  } else if (s.stage === 'SECOND_RAF') {
    seg.secondRafProgress = s.logicalProgress;
    recordHolmTimerEvent('HOLM_TIMER_SECOND_RAF', s.instanceId, s.segmentId, 'SAME_SEGMENT_UPDATE', payload);
  } else if (s.stage === '250MS') {
    seg.at250msProgress = s.logicalProgress;
    recordHolmTimerEvent('HOLM_TIMER_250MS', s.instanceId, s.segmentId, 'SAME_SEGMENT_UPDATE', payload);
  } else {
    recordHolmTimerEvent('HOLM_TIMER_RENDER_SAME_SEGMENT', s.instanceId, s.segmentId, 'SAME_SEGMENT_UPDATE', payload);
  }

  // Monotonic-descent invariant check (within an active segment).
  const prev = seg.lastProgress ?? 1;
  if (s.logicalProgress > prev + 0.0005) {
    recordHolmTimerViolation('HOLM_TIMER_PROGRESS_INCREASE_WITHOUT_PAUSE_RESUME', s.instanceId, s.segmentId, {
      stage: s.stage,
      prevProgress: prev,
      nextProgress: s.logicalProgress,
      domSvgVisualRatio: visualRatio,
      causalNote: 'same segmentId, no PAUSE_RESUME_REFILL recorded',
    });
    if (seg.preCommitProgress != null && s.logicalProgress > seg.preCommitProgress + 0.0005) {
      recordHolmTimerViolation('HOLM_TIMER_POSTPAINT_SEED_OR_DEADLINE_REBASE', s.instanceId, s.segmentId, {
        stage: s.stage,
        preCommitProgress: seg.preCommitProgress,
        nextProgress: s.logicalProgress,
        timeLeft: s.timeLeft,
        deadline: s.deadline,
      });
    }
  } else if (s.logicalProgress < prev - 0.0005 && !seg.firstDescentSeen) {
    seg.firstDescentSeen = true;
    seg.firstDescentAt = now();
    recordHolmTimerEvent('HOLM_TIMER_PROGRESS_DESCENT', s.instanceId, s.segmentId, 'SAME_SEGMENT_UPDATE', {
      from: prev,
      to: s.logicalProgress,
    });
  }
  seg.lastProgress = s.logicalProgress;

  // DOM ↔ logical divergence (steady-state >250ms; CSS transition smoothing
  // can lag for ≤1s, but the magnitude check below is permissive).
  if (visualRatio != null && Math.abs(visualRatio - s.logicalProgress) > 0.05 && s.stage !== 'FIRST_RAF' && s.stage !== 'SECOND_RAF') {
    recordHolmTimerViolation('HOLM_TIMER_LOGICAL_DOM_DIVERGENCE', s.instanceId, s.segmentId, {
      stage: s.stage,
      logicalProgress: s.logicalProgress,
      domSvgVisualRatio: visualRatio,
      delta: visualRatio - s.logicalProgress,
    });
  }

  // Multiple visible owners (only need to flag once per segment).
  if (s.visibleOwnerCount > 1 && !seg.violations.includes('HOLM_TIMER_MULTIPLE_VISIBLE_OWNERS')) {
    recordHolmTimerViolation('HOLM_TIMER_MULTIPLE_VISIBLE_OWNERS', s.instanceId, s.segmentId, {
      stage: s.stage,
      visibleOwnerCount: s.visibleOwnerCount,
    });
  }
}

export function endHolmTimerSegment(instanceId: number, segmentId: string | null, reason: string): void {
  if (!segmentId) return;
  recordHolmTimerEvent('HOLM_TIMER_DEACTIVATED', instanceId, segmentId, 'SAME_SEGMENT_UPDATE', { reason });
}

// ─── Publication ──────────────────────────────────────────────────────────

function publish() {
  refreshOwnersSnap();
  refreshSegmentsSnap();
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __holmSelfTimerForensics?: Record<string, unknown> };
  if (!w.__holmSelfTimerForensics) w.__holmSelfTimerForensics = {};
  const d = w.__holmSelfTimerForensics;
  d.events = events;
  d.violations = violations;
  d.owners = _ownersSnap;
  d.segments = _segmentsSnap;
}

// ─── Text export ──────────────────────────────────────────────────────────

export function buildHolmSelfTimerForensicsText(): string {
  const lines: string[] = [];
  lines.push('=== HOLM SELF-TIMER FORENSICS ===');
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push(`events: ${events.length}, violations: ${violations.length}, owners: ${owners.size}, segments: ${segments.size}`);
  lines.push('');

  lines.push('--- OWNERS (every MobilePlayerTimer instance) ---');
  for (const o of owners.values()) {
    lines.push(JSON.stringify(o));
  }
  lines.push('');

  lines.push('--- SEGMENTS (each actionable timer segment) ---');
  for (const s of segments.values()) {
    lines.push(JSON.stringify(s));
  }
  lines.push('');

  lines.push('--- VIOLATIONS (in order) ---');
  for (const v of violations) {
    lines.push(JSON.stringify(v));
  }
  lines.push('');

  lines.push('--- EVENTS (full chronological chain) ---');
  for (const e of events) {
    lines.push(`#${e.seq} +${e.t.toFixed(1)} ${e.event} inst=${e.instanceId} seg=${e.segmentId ?? '-'} kind=${e.segmentKind} ${JSON.stringify(e.payload)}`);
  }
  lines.push('');

  lines.push('--- CAUSAL CHAIN (per segment with any violation) ---');
  for (const s of segments.values()) {
    if (s.violations.length === 0) continue;
    lines.push(`\nSEGMENT ${s.segmentId} [instance ${s.instanceId}] activated=${s.activatedWall}`);
    lines.push(`  authoritativeSource=${s.authoritativeSource}`);
    lines.push(`  handContextId=${s.handContextId} selfPlayerId=${s.selfPlayerId} activePlayerId=${s.activePlayerId}`);
    lines.push(`  duration=${s.duration} deadline=${s.deadline} paused=${s.paused}`);
    lines.push(`  preCommitProgress=${s.preCommitProgress}`);
    lines.push(`  firstRaf=${s.firstRafProgress} secondRaf=${s.secondRafProgress} at250ms=${s.at250msProgress} last=${s.lastProgress}`);
    lines.push(`  domSvg first dashoffset=${s.domSvgFirstDashoffset} circ=${s.domSvgFirstCircumference} visualRatio=${s.domSvgFirstVisualRatio}`);
    lines.push(`  firstCommit className=${s.classNameFirstCommit}`);
    lines.push(`  firstCommit cssTransition=${s.cssTransition}`);
    lines.push(`  violations=${s.violations.join(', ')}`);
    lines.push(`  --- events for this segment ---`);
    for (const e of events) {
      if (e.segmentId !== s.segmentId) continue;
      lines.push(`    #${e.seq} +${e.t.toFixed(1)} ${e.event} kind=${e.segmentKind} ${JSON.stringify(e.payload)}`);
    }
    lines.push(`  --- violations for this segment ---`);
    for (const v of violations) {
      if (v.segmentId !== s.segmentId) continue;
      lines.push(`    !${v.seq} +${v.t.toFixed(1)} ${v.type} ${JSON.stringify(v.payload)}`);
    }
  }

  return lines.join('\n');
}
