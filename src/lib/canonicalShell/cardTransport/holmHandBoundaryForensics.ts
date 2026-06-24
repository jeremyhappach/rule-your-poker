/**
 * holmHandBoundaryForensics — INSTRUMENTATION ONLY.
 *
 * Captures the cross-hand / cross-dealer-game transition timeline for
 * Holm Run-Back failures:
 *   - presentation source registry (chucky, tabled-self, community,
 *     self-hand, outcome/announcement, sticky/cache refs) with
 *     immutable origin HCI/generation and current canonical
 *     HCI/generation;
 *   - teardown writer log (every cache/ref clear or skipped clear);
 *   - new-hand runtime log (resetForHand / beginDealForHand /
 *     beginWaveForHand / manifest arrival / transport intent / active
 *     intent count / phase change);
 *   - violation detectors for old-origin renders past the boundary,
 *     manifests without deal start, runtime mutations from wrong hand,
 *     stalled pre-deal, etc.
 *
 * NO behavior changes. Purely observational. Use freely from every
 * Holm presentation source + lifecycle writer.
 *
 * Surfaces:
 *   window.__holmHandBoundaryForensics.events
 *   window.__holmHandBoundaryForensics.violations
 *   window.__holmHandBoundaryForensics.sources
 */

export type HolmHbEventName =
  | 'HB_PRESENTATION_RENDER'
  | 'HB_PRESENTATION_UNMOUNT'
  | 'HB_TEARDOWN_ATTEMPT'
  | 'HB_TEARDOWN_CLEAR'
  | 'HB_TEARDOWN_SKIP'
  | 'HB_DEALERGAME_ENTER'
  | 'HB_HCI_CHANGE'
  | 'HB_GENERATION_CHANGE'
  | 'HB_RUNTIME_RESET_FOR_HAND'
  | 'HB_RUNTIME_BEGIN_DEAL_FOR_HAND'
  | 'HB_RUNTIME_BEGIN_WAVE_FOR_HAND'
  | 'HB_MANIFEST_ARRIVED'
  | 'HB_TRANSPORT_INTENT_CREATED'
  | 'HB_TRANSPORT_INTENT_ACCEPTED'
  | 'HB_TRANSPORT_INTENT_REJECTED'
  | 'HB_MUTATION_EXPECTED'
  | 'HB_MUTATION_DISPATCHED'
  | 'HB_MUTATION_SETTLED'
  | 'HB_ACTIVE_INTENT_COUNT'
  | 'HB_READINESS_RELEASE'
  | 'HB_PHASE_CHANGE';

export type HolmHbViolationType =
  | 'HOLM_OLD_HAND_PRESENTATION_RENDERED_AFTER_BOUNDARY'
  | 'HOLM_RUNTIME_MUTATION_FROM_WRONG_HAND'
  | 'HOLM_NEW_HAND_MANIFEST_WITHOUT_DEAL_START'
  | 'HOLM_NEW_HAND_EXPECTED_OR_DISPATCHED_WITH_ZERO_ACTIVE_INTENTS'
  | 'HOLM_NEW_HAND_STALLED_PREDEAL'
  | 'HOLM_DEALERGAME_ENTERED_WITH_OLD_PRESENTATION';

export interface HolmHbEvent {
  seq: number;
  t: number;
  wall: string;
  event: HolmHbEventName;
  source: string;                       // file:func / surface name
  originHandContextId: string | null;   // immutable origin of the payload
  originGeneration: number | null;
  activeHandContextId: string | null;   // canonical active at record time
  activeGeneration: number | null;
  payload: Record<string, unknown>;
}

export interface HolmHbViolation {
  seq: number;
  t: number;
  wall: string;
  type: HolmHbViolationType;
  source: string;
  payload: Record<string, unknown>;
}

export interface HolmHbPresentationSource {
  sourceName: string;            // e.g. 'ChuckyHand', 'HolmLonePlayerFan'
  surface: 'chucky' | 'tabled-self' | 'community' | 'self-hand' | 'outcome' | 'sticky-cache' | 'other';
  callsite: string;
  payloadIds: string[];
  contentHash: string | null;
  originHandContextId: string | null;
  originGeneration: number | null;
  activeHandContextId: string | null;
  activeGeneration: number | null;
  renderEligible: boolean;
  mounted: boolean;
  lastSeenAt: number;
  writer: string;
  reason: string;
}

const RING = 1200;
const events: HolmHbEvent[] = [];
const violations: HolmHbViolation[] = [];
const sources = new Map<string, HolmHbPresentationSource>();
let _seq = 0;
let _activeHandContextId: string | null = null;
let _activeGeneration: number | null = null;
let _activeDealerGameId: string | null = null;

const listeners = new Set<() => void>();
function emit() { for (const l of listeners) try { l(); } catch { /* */ } }

export function subscribeHolmHandBoundary(cb: () => void): () => void {
  listeners.add(cb); return () => listeners.delete(cb);
}

function now(): number { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }

function publish() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __holmHandBoundaryForensics?: Record<string, unknown> };
  if (!w.__holmHandBoundaryForensics) w.__holmHandBoundaryForensics = {};
  const d = w.__holmHandBoundaryForensics;
  d.events = events;
  d.violations = violations;
  d.sources = Array.from(sources.values());
  d.active = { handContextId: _activeHandContextId, generation: _activeGeneration, dealerGameId: _activeDealerGameId };
}

export function setHolmActiveIdentity(hci: string | null, generation: number | null, dealerGameId: string | null = null): void {
  const changedHci = hci !== _activeHandContextId;
  const changedGen = generation !== _activeGeneration;
  const changedDg = dealerGameId !== _activeDealerGameId;
  if (changedHci) {
    pushEvent('HB_HCI_CHANGE', 'holmHandBoundaryForensics.setActive', null, null, { from: _activeHandContextId, to: hci });
    _activeHandContextId = hci;
  }
  if (changedGen) {
    pushEvent('HB_GENERATION_CHANGE', 'holmHandBoundaryForensics.setActive', null, null, { from: _activeGeneration, to: generation });
    _activeGeneration = generation;
  }
  if (changedDg && dealerGameId) {
    // Check for any old-origin presentation still rendering at dealer-game entry.
    const stale: string[] = [];
    for (const s of sources.values()) {
      if (s.mounted && s.originHandContextId && s.originHandContextId !== hci) stale.push(s.sourceName);
    }
    pushEvent('HB_DEALERGAME_ENTER', 'holmHandBoundaryForensics.setActive', null, null, { dealerGameId, hci, generation, stalePresentationSources: stale });
    if (stale.length > 0) {
      pushViolation('HOLM_DEALERGAME_ENTERED_WITH_OLD_PRESENTATION', 'holmHandBoundaryForensics.setActive', { dealerGameId, stale, activeHci: hci });
    }
    _activeDealerGameId = dealerGameId;
  }
  publish();
  emit();
}

function pushEvent(event: HolmHbEventName, source: string, originHci: string | null, originGen: number | null, payload: Record<string, unknown>): void {
  events.push({
    seq: ++_seq, t: now(), wall: new Date().toISOString(),
    event, source,
    originHandContextId: originHci, originGeneration: originGen,
    activeHandContextId: _activeHandContextId, activeGeneration: _activeGeneration,
    payload,
  });
  while (events.length > RING) events.shift();
}

function pushViolation(type: HolmHbViolationType, source: string, payload: Record<string, unknown>): void {
  violations.push({ seq: ++_seq, t: now(), wall: new Date().toISOString(), type, source, payload });
  while (violations.length > RING) violations.shift();
}

export interface RecordPresentationInput {
  sourceName: string;
  surface: HolmHbPresentationSource['surface'];
  callsite: string;
  payloadIds: string[];
  contentHash?: string | null;
  originHandContextId: string | null;
  originGeneration: number | null;
  renderEligible: boolean;
  mounted: boolean;
  writer: string;
  reason: string;
}

export function recordHolmPresentationSource(input: RecordPresentationInput): void {
  const snap: HolmHbPresentationSource = {
    sourceName: input.sourceName,
    surface: input.surface,
    callsite: input.callsite,
    payloadIds: input.payloadIds,
    contentHash: input.contentHash ?? null,
    originHandContextId: input.originHandContextId,
    originGeneration: input.originGeneration,
    activeHandContextId: _activeHandContextId,
    activeGeneration: _activeGeneration,
    renderEligible: input.renderEligible,
    mounted: input.mounted,
    lastSeenAt: now(),
    writer: input.writer,
    reason: input.reason,
  };
  sources.set(input.sourceName, snap);

  pushEvent(input.mounted ? 'HB_PRESENTATION_RENDER' : 'HB_PRESENTATION_UNMOUNT',
    input.sourceName, input.originHandContextId, input.originGeneration, {
      surface: input.surface,
      payloadIds: input.payloadIds,
      contentHash: input.contentHash ?? null,
      renderEligible: input.renderEligible,
      mounted: input.mounted,
      writer: input.writer,
      reason: input.reason,
      callsite: input.callsite,
    });

  if (input.mounted && input.originHandContextId && _activeHandContextId &&
      input.originHandContextId !== _activeHandContextId) {
    pushViolation('HOLM_OLD_HAND_PRESENTATION_RENDERED_AFTER_BOUNDARY', input.sourceName, {
      surface: input.surface,
      callsite: input.callsite,
      originHci: input.originHandContextId, originGen: input.originGeneration,
      activeHci: _activeHandContextId, activeGen: _activeGeneration,
      payloadIds: input.payloadIds,
      writer: input.writer,
    });
  }
  publish();
  emit();
}

export interface RecordTeardownInput {
  outcomeId: string | null;
  cacheName: string;
  cleared: boolean;
  reason: string;
  writer: string;
  callsite: string;
  originHandContextId?: string | null;
  originGeneration?: number | null;
  extra?: Record<string, unknown>;
}

export function recordHolmTeardown(input: RecordTeardownInput): void {
  pushEvent(input.cleared ? 'HB_TEARDOWN_CLEAR' : 'HB_TEARDOWN_SKIP',
    input.writer, input.originHandContextId ?? null, input.originGeneration ?? null, {
      cacheName: input.cacheName,
      outcomeId: input.outcomeId,
      reason: input.reason,
      callsite: input.callsite,
      ...(input.extra ?? {}),
    });
  publish(); emit();
}

export interface RecordRuntimeInput {
  event: 'resetForHand' | 'beginDealForHand' | 'beginWaveForHand' | 'manifestArrived' |
         'intentCreated' | 'intentAccepted' | 'intentRejected' |
         'mutationExpected' | 'mutationDispatched' | 'mutationSettled' |
         'activeIntentCount' | 'readinessRelease' | 'phaseChange';
  writer: string;
  callsite: string;
  originHandContextId: string | null;
  originGeneration: number | null;
  payload?: Record<string, unknown>;
}

export function recordHolmRuntime(input: RecordRuntimeInput): void {
  const map: Record<RecordRuntimeInput['event'], HolmHbEventName> = {
    resetForHand: 'HB_RUNTIME_RESET_FOR_HAND',
    beginDealForHand: 'HB_RUNTIME_BEGIN_DEAL_FOR_HAND',
    beginWaveForHand: 'HB_RUNTIME_BEGIN_WAVE_FOR_HAND',
    manifestArrived: 'HB_MANIFEST_ARRIVED',
    intentCreated: 'HB_TRANSPORT_INTENT_CREATED',
    intentAccepted: 'HB_TRANSPORT_INTENT_ACCEPTED',
    intentRejected: 'HB_TRANSPORT_INTENT_REJECTED',
    mutationExpected: 'HB_MUTATION_EXPECTED',
    mutationDispatched: 'HB_MUTATION_DISPATCHED',
    mutationSettled: 'HB_MUTATION_SETTLED',
    activeIntentCount: 'HB_ACTIVE_INTENT_COUNT',
    readinessRelease: 'HB_READINESS_RELEASE',
    phaseChange: 'HB_PHASE_CHANGE',
  };
  pushEvent(map[input.event], input.writer, input.originHandContextId, input.originGeneration, {
    callsite: input.callsite,
    ...(input.payload ?? {}),
  });

  // Wrong-hand mutation invariant.
  if (
    (input.event === 'mutationExpected' || input.event === 'mutationDispatched' || input.event === 'mutationSettled' ||
     input.event === 'intentCreated' || input.event === 'beginDealForHand' || input.event === 'beginWaveForHand') &&
    input.originHandContextId && _activeHandContextId &&
    input.originHandContextId !== _activeHandContextId
  ) {
    pushViolation('HOLM_RUNTIME_MUTATION_FROM_WRONG_HAND', input.writer, {
      event: input.event, callsite: input.callsite,
      originHci: input.originHandContextId, originGen: input.originGeneration,
      activeHci: _activeHandContextId, activeGen: _activeGeneration,
    });
  }
  publish(); emit();
}

export function getHolmHbEvents(): HolmHbEvent[] { return events; }
export function getHolmHbViolations(): HolmHbViolation[] { return violations; }
export function getHolmHbSources(): HolmHbPresentationSource[] { return Array.from(sources.values()); }

export function buildHolmHandBoundaryForensicsText(): string {
  const lines: string[] = [];
  lines.push('=== HOLM HAND-BOUNDARY FORENSICS ===');
  lines.push(`generated: ${new Date().toISOString()}`);
  lines.push(`active: hci=${_activeHandContextId} gen=${_activeGeneration} dealerGameId=${_activeDealerGameId}`);
  lines.push(`events=${events.length} violations=${violations.length} sources=${sources.size}`);
  lines.push('');
  lines.push('--- PRESENTATION SOURCES (current snapshot) ---');
  for (const s of sources.values()) lines.push(JSON.stringify(s));
  lines.push('');
  lines.push('--- VIOLATIONS (chronological) ---');
  for (const v of violations) lines.push(JSON.stringify(v));
  lines.push('');
  lines.push('--- EVENTS (chronological) ---');
  for (const e of events) {
    lines.push(`#${e.seq} +${e.t.toFixed(1)} ${e.event} src=${e.source} origin=${e.originHandContextId}/${e.originGeneration} active=${e.activeHandContextId}/${e.activeGeneration} ${JSON.stringify(e.payload)}`);
  }
  return lines.join('\n');
}
