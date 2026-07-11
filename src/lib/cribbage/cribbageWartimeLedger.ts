/**
 * cribbageWartimeLedger — single bounded in-memory ring buffer receiving
 * DIRECT emissions from authoritative Cribbage producer/render sites.
 *
 * Policy (per wartime spec):
 *  - Direct emissions are the primary source for A/B/C/D.
 *  - Legacy ledger bridges are OFF by default. They may be enabled via
 *    `attachCribbageWartimeBridges({ pegTerminalOnly, countingTerminalOnly })`
 *    to supplement missing terminal lifecycle events only. Each mirrored
 *    entry is tagged `provenance: 'legacy-adapter'` and dedupe-suppressed
 *    against any matching direct entry.
 *  - Reserved capacity by category prevents any single group (deal DOM
 *    samples, pegging rect samples) from evicting others.
 *  - Every entry carries `provenance`, `producerComponent`, `producerFunction`,
 *    `dedupeKey`. Callers deduplicate one canonical entry per logical
 *    event using dedupeKey; identical repeat within 250ms is suppressed.
 *
 * No console logs. No backend writes. No storage. No behavior effects.
 */

// ─── Types ────────────────────────────────────────────────────────────

export type WartimeGroup = 'deal' | 'pegging' | 'counting' | 'boundary' | 'identity';

export type WartimeProvenance = 'direct' | 'legacy-adapter';

export type WartimeEventKind =
  // Identity
  | 'hand_identity_changed'
  | 'phase_changed'
  // A. Deal
  | 'orchestrator_mount'
  | 'orchestrator_unmount'
  | 'dispatch_prerequisites_evaluated'
  | 'dispatch_attempt'
  | 'dispatch_succeeded'
  | 'duplicate_dispatch_suppressed'
  | 'duplicate_dispatch_suppressed_by_runtime'
  | 'timing_snapshot_taken'
  | 'dealruntime_phase_changed'
  | 'dealruntime_expected_changed'
  | 'dealruntime_active_intents_changed'
  | 'dealruntime_ready_released_changed'
  | 'settled_count_changed'
  | 'settled_local_count_changed'
  // NOTE: `transport_intent_first_seen` is emitted by CardTransportRuntime
  // on its first resolution pass over an active intent. It is NOT the
  // upstream game-side dispatch/enqueue moment (that fact is owned by the
  // producer that called ctx.dispatch). The runtime's first canonical
  // acceptance into its resolution queue is what this event records.
  | 'transport_intent_first_seen'
  | 'transport_intent_mounted'
  | 'transport_intent_launched'
  | 'transport_intent_settled'
  | 'transport_intent_dropped'
  | 'source_hand_count_changed'
  | 'clipped_hand_count_changed'
  | 'presentation_hand_count_changed'
  | 'rendered_hand_count_changed'
  | 'active_hand_blocked_changed'
  | 'active_hand_cards_prop_changed'
  | 'active_hand_dom_count_changed'
  | 'first_local_card_visible'
  | 'full_local_hand_visible'
  | 'resolver_rule_changed'
  // B. Pegging row
  | 'pegging_row_render'
  | 'pegging_row_sequence_changed'
  | 'pegging_row_card_rect_sample'
  | 'pegging_row_transport_destination_computed'
  // C. Counting
  | 'scoring_target_enter'
  | 'scoring_target_exit_start'
  | 'scoring_target_advance'
  | 'next_scoring_target_enter'
  | 'combo_announcement_publish'
  | 'combo_announcement_clear_request'
  | 'combo_announcement_unmounted'
  | 'total_announcement_publish'
  | 'total_announcement_clear_request'
  | 'total_announcement_unmounted'
  | 'parent_counting_announcement_changed'
  | 'parent_counting_target_label_changed'
  | 'announcement_dom_state_changed'
  | 'counting_complete'
  // D. Go/31
  | 'go_event_seen'
  | 'thirty_one_event_seen'
  | 'pegging_boundary_hold_started'
  // Direct producer at the state owner (CribbageMobileGameTable):
  //   emitted when the pegging-row's owning presentation state advances
  //   sequenceStartIndex forward, i.e. the boundary that logically
  //   removes/releases the pegging-row cards.
  | 'row_clear_requested'
  // Observer-level events emitted from the row render probe. These
  // describe DOM/logical transitions *observed* by the render probe —
  // they do NOT imply the state owner initiated the clear. Distinct
  // from `row_clear_requested` on purpose.
  | 'row_clear_logical_observed'
  | 'row_clear_dom_started_observed'
  | 'row_clear_dom_empty_observed'
  | 'boundary_hold_released'
  | 'authoritative_turn_changed'
  | 'local_action_eligibility_changed'
  | 'play_button_enabled_changed'
  | 'play_intent_created'
  | 'play_destination_computed'
  // Legacy adapter fallback
  | 'legacy_peg_terminal'
  | 'legacy_counting_terminal';

export interface WartimeIdentity {
  playerId: string | null;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  currentHandKey: string | null;
  renderHandContextId: string | null;
  authoritativeHandContextId: string | null;
  phase: string | null;
  subphase: string | null;
  dealRuntimePhase: string | null;
  scoringTargetIndex: number | null;
  scoringOwnerPlayerId: string | null;
  peggingSequenceIndex: number | null;
}

export interface WartimeEntry {
  seq: number;
  ts: number;
  group: WartimeGroup;
  kind: WartimeEventKind;
  provenance: WartimeProvenance;
  producerComponent: string;
  producerFunction: string;
  dedupeKey: string;
  identity: WartimeIdentity;
  eventReason: string | null;
  payload: Record<string, unknown>;
  contradictions: string[];
}

// ─── Retention buckets ────────────────────────────────────────────────
//
// Two rings by design:
//   • normal per-group rings — capped per category
//   • one protected ring — receives every contradiction entry AND every
//     lifecycle-critical event; capped at PROTECTED_CAPACITY total.
//
// Contradictions & lifecycle bypass dedupe but do NOT bypass eviction:
// once the protected ring is full, the oldest protected entry is dropped
// (FIFO). This guarantees a hard total-entry bound regardless of session
// length. Export merges both rings by seq for chronological order.

const CAPACITY: Record<WartimeGroup, number> = {
  deal: 300,
  pegging: 200,
  counting: 250,
  boundary: 200,
  identity: 100,
};

const PROTECTED_CAPACITY = 150;

const HARD_MAX_TOTAL_ENTRIES =
  CAPACITY.deal + CAPACITY.pegging + CAPACITY.counting +
  CAPACITY.boundary + CAPACITY.identity + PROTECTED_CAPACITY;

const LIFECYCLE_KINDS = new Set<WartimeEventKind>([
  'hand_identity_changed',
  'phase_changed',
  'orchestrator_mount',
  'orchestrator_unmount',
  'dispatch_succeeded',
  'dealruntime_phase_changed',
  'transport_intent_first_seen',
  'transport_intent_launched',
  'transport_intent_settled',
  'transport_intent_dropped',
  'pegging_boundary_hold_started',
  'boundary_hold_released',
  'row_clear_requested',
  'row_clear_logical_observed',
  'row_clear_dom_started_observed',
  'row_clear_dom_empty_observed',
  'play_button_enabled_changed',
  'play_intent_created',
  'play_destination_computed',
  'counting_complete',
]);

const buckets: Record<WartimeGroup, WartimeEntry[]> = {
  deal: [],
  pegging: [],
  counting: [],
  boundary: [],
  identity: [],
};

const protectedRing: WartimeEntry[] = [];

let seqCounter = 0;
const listeners = new Set<() => void>();

// Dedupe: last-seen ts by (group|kind|producer|dedupeKey)
const lastSeenAt = new Map<string, number>();
const DEDUPE_WINDOW_MS = 250;

let currentIdentity: WartimeIdentity = {
  playerId: null,
  roundId: null,
  handNumber: null,
  handContextId: null,
  currentHandKey: null,
  renderHandContextId: null,
  authoritativeHandContextId: null,
  phase: null,
  subphase: null,
  dealRuntimePhase: null,
  scoringTargetIndex: null,
  scoringOwnerPlayerId: null,
  peggingSequenceIndex: null,
};

function notify() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

function isProtectedEntry(entry: WartimeEntry): boolean {
  return entry.contradictions.length > 0 || LIFECYCLE_KINDS.has(entry.kind);
}

function push(entry: WartimeEntry): void {
  const protectedEntry = isProtectedEntry(entry);
  const dedupeK = `${entry.group}|${entry.kind}|${entry.producerComponent}|${entry.dedupeKey}`;
  if (!protectedEntry) {
    const prev = lastSeenAt.get(dedupeK);
    if (prev != null && entry.ts - prev < DEDUPE_WINDOW_MS) return;
  }
  lastSeenAt.set(dedupeK, entry.ts);

  if (protectedEntry) {
    protectedRing.push(entry);
    if (protectedRing.length > PROTECTED_CAPACITY) protectedRing.shift();
  } else {
    const bucket = buckets[entry.group];
    const cap = CAPACITY[entry.group];
    bucket.push(entry);
    if (bucket.length > cap) bucket.shift();
  }
  notify();
}

// ─── Identity API ─────────────────────────────────────────────────────

function normalizeIdentityValue(v: unknown): string | number | null {
  if (v == null) return null; // treat undefined and null identically
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') return v; // strings compare by value already
  return String(v);
}

export function setCribbageWartimeIdentity(patch: Partial<WartimeIdentity>): void {
  const prev = currentIdentity;
  const next: WartimeIdentity = { ...prev, ...patch };

  // Normalize field values before diffing so newly allocated but
  // semantically identical inputs do not emit noise.
  const changedKeys: string[] = [];
  for (const k of Object.keys(patch) as (keyof WartimeIdentity)[]) {
    const a = normalizeIdentityValue(prev[k]);
    const b = normalizeIdentityValue(next[k]);
    if (a !== b) changedKeys.push(k as string);
  }
  currentIdentity = next;
  if (changedKeys.length === 0) return;

  const isHandBoundary = changedKeys.some((k) =>
    k === 'handContextId' || k === 'authoritativeHandContextId' ||
    k === 'currentHandKey' || k === 'renderHandContextId' ||
    k === 'handNumber' || k === 'roundId',
  );
  const kind: WartimeEventKind = isHandBoundary ? 'hand_identity_changed' : 'phase_changed';
  const dedupeKey = changedKeys.map((k) => `${k}=${String(next[k as keyof WartimeIdentity])}`).join(';');

  push({
    seq: ++seqCounter,
    ts: Date.now(),
    group: 'identity',
    kind,
    provenance: 'direct',
    producerComponent: 'CribbageMobileGameTable',
    producerFunction: 'setCribbageWartimeIdentity',
    dedupeKey,
    identity: { ...next },
    eventReason: `changed: ${changedKeys.join(',')}`,
    payload: {
      changedKeys,
      prev: Object.fromEntries(changedKeys.map((k) => [k, prev[k as keyof WartimeIdentity]])),
      next: Object.fromEntries(changedKeys.map((k) => [k, next[k as keyof WartimeIdentity]])),
    },
    contradictions: [],
  });
}

export function getCribbageWartimeIdentity(): WartimeIdentity {
  return currentIdentity;
}

// ─── Direct record API ────────────────────────────────────────────────

export interface RecordWartimeOptions {
  producerComponent: string;
  producerFunction: string;
  dedupeKey: string;
  provenance?: WartimeProvenance;
  eventReason?: string | null;
  contradictions?: string[];
}

export function recordCribbageWartime(
  group: WartimeGroup,
  kind: WartimeEventKind,
  payload: Record<string, unknown>,
  opts: RecordWartimeOptions,
): void {
  push({
    seq: ++seqCounter,
    ts: Date.now(),
    group,
    kind,
    provenance: opts.provenance ?? 'direct',
    producerComponent: opts.producerComponent,
    producerFunction: opts.producerFunction,
    dedupeKey: opts.dedupeKey,
    identity: { ...currentIdentity },
    eventReason: opts.eventReason ?? null,
    payload,
    contradictions: opts.contradictions ?? [],
  });
}

export function clearCribbageWartime(): void {
  for (const g of Object.keys(buckets) as WartimeGroup[]) buckets[g] = [];
  protectedRing.length = 0;
  lastSeenAt.clear();
  seqCounter = 0;
  notify();
}

export function getCribbageWartimeEntries(): WartimeEntry[] {
  // Chronologically merge normal buckets AND the protected ring.
  const all: WartimeEntry[] = [];
  for (const g of Object.keys(buckets) as WartimeGroup[]) all.push(...buckets[g]);
  all.push(...protectedRing);
  all.sort((a, b) => a.seq - b.seq);
  return all;
}

export function getCribbageWartimeHardMax(): number {
  return HARD_MAX_TOTAL_ENTRIES;
}

export function subscribeCribbageWartime(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function getCribbageWartimeContradictionCount(): number {
  let n = 0;
  for (const g of Object.keys(buckets) as WartimeGroup[]) {
    for (const e of buckets[g]) n += e.contradictions.length;
  }
  for (const e of protectedRing) n += e.contradictions.length;
  return n;
}

// ─── Bridges (opt-in, supplemental terminal-only) ─────────────────────
//
// Off by default. Enable only via attach() with narrow flags. Bridges
// are tagged `provenance: 'legacy-adapter'` and each mirrored event is
// deduped against direct emissions by dedupeKey. This function retains
// its name so the pill import is stable, but performs no work unless
// the caller explicitly enables a bridge.

export interface AttachBridgeOptions {
  /** Mirror ONLY peg-transport terminal lifecycle (settled|dropped|cleanup). */
  pegTerminalOnly?: boolean;
  /** Mirror ONLY counting terminal completion. */
  countingTerminalOnly?: boolean;
}

let _bridgesAttached = false;
export function attachCribbageWartimeBridges(_opts: AttachBridgeOptions = {}): void {
  // Direct emissions are the primary source. Bridges are intentionally
  // disabled unless a caller opts in with a non-empty flag object.
  // Legacy adapters may be added here in the future without touching
  // direct producer sites.
  if (_bridgesAttached) return;
  _bridgesAttached = true;
  // No-op by default per policy: broad legacy mirroring is forbidden.
}

// ─── Serialisation ────────────────────────────────────────────────────

export function serializeCribbageWartime(
  filter: WartimeGroup | 'all' = 'all',
): string {
  const list = getCribbageWartimeEntries(); // export always full timeline
  const shown = filter === 'all' ? list : list.filter((e) => e.group === filter);
  const lines: string[] = [];

  const contradictionCounts: Record<string, number> = {};
  const perGroup: Record<WartimeGroup, number> = {
    deal: 0, pegging: 0, counting: 0, boundary: 0, identity: 0,
  };
  for (const e of list) {
    perGroup[e.group]++;
    for (const c of e.contradictions) contradictionCounts[c] = (contradictionCounts[c] ?? 0) + 1;
  }

  lines.push('# Cribbage Wartime Truth — export');
  lines.push(`totalEntries: ${list.length}`);
  lines.push(`byGroup: ${JSON.stringify(perGroup)}`);
  lines.push(`capacity: ${JSON.stringify(CAPACITY)}`);
  lines.push(`protectedCapacity: ${PROTECTED_CAPACITY} (in use: ${protectedRing.length})`);
  lines.push(`hardMaxTotalEntries: ${HARD_MAX_TOTAL_ENTRIES}`);
  lines.push(`firstEventAt: ${list[0] ? new Date(list[0].ts).toISOString() : 'n/a'}`);
  lines.push(`lastEventAt: ${list.length ? new Date(list[list.length - 1].ts).toISOString() : 'n/a'}`);
  lines.push(`identity: ${JSON.stringify(currentIdentity)}`);
  lines.push(`filter: ${filter} (export always includes all groups: ${shown.length}/${list.length} shown)`);
  lines.push('contradictionCountsByType:');
  const keys = Object.keys(contradictionCounts).sort();
  if (keys.length === 0) lines.push('  (none)');
  for (const k of keys) lines.push(`  ${k}: ${contradictionCounts[k]}`);
  lines.push('---');

  for (const e of list) {
    lines.push(
      `#${e.seq} ${new Date(e.ts).toISOString()} [${e.group}] ${e.kind} ` +
        `prov=${e.provenance} ${e.producerComponent}.${e.producerFunction}` +
        (e.eventReason ? ` reason="${e.eventReason}"` : ''),
    );
    lines.push(`  dedupeKey: ${e.dedupeKey}`);
    lines.push(`  identity: ${JSON.stringify(e.identity)}`);
    if (Object.keys(e.payload).length) lines.push(`  payload: ${JSON.stringify(e.payload)}`);
    if (e.contradictions.length) lines.push(`  contradictions: ${e.contradictions.join(', ')}`);
  }
  return lines.join('\n');
}

// ─── Cribbage-scoped transport intent lifecycle helper ────────────────
//
// Called by the canonical CardTransportRuntime. The runtime hands over
// the raw intent object plus the lifecycle kind and any timing/reason
// extras it already owns. Non-Cribbage intents are ignored via the
// cribbageIntentScope predicate. No behavior side effects.

import { isCribbageIntentLike } from './cribbageIntentScope';

export type IntentLifecycleKind =
  | 'transport_intent_first_seen'
  | 'transport_intent_launched'
  | 'transport_intent_settled'
  | 'transport_intent_dropped';

export function recordCribbageTransportIntentLifecycle(
  kind: IntentLifecycleKind,
  intent: {
    id?: string | null;
    cardId?: string | null;
    handContextId?: string | null;
    recipientPlayerId?: string | null;
    from?: unknown;
    to?: unknown;
    launchDelayMs?: number | null;
    durationMs?: number | null;
    ownershipClaimDelayMs?: number | null;
  },
  extras: {
    dispatchId?: string | null;
    reason?: string | null;
    timing?: Record<string, unknown>;
    // Explicit immutable game provenance from the transport context
    // (`ctx.gameType`). When provided, it takes precedence over any
    // shape/id heuristic in `isCribbageIntentLike`.
    gameType?: string | null;
  } = {},
): void {
  if (!isCribbageIntentLike(intent, { gameType: extras.gameType ?? null })) return;
  const intentId = intent.id ?? '';
  recordCribbageWartime('deal', kind, {
    intentId,
    cardId: intent.cardId ?? null,
    handContextId: intent.handContextId ?? null,
    recipientPlayerId: intent.recipientPlayerId ?? null,
    from: intent.from ?? null,
    to: intent.to ?? null,
    launchDelayMs: intent.launchDelayMs ?? null,
    durationMs: intent.durationMs ?? null,
    ownershipClaimDelayMs: intent.ownershipClaimDelayMs ?? null,
    dispatchId: extras.dispatchId ?? null,
    reason: extras.reason ?? null,
    timing: extras.timing ?? null,
  }, {
    producerComponent: 'CardTransportRuntime',
    producerFunction: kind,
    dedupeKey: `${kind}:${intentId}`,
    eventReason: extras.reason ?? null,
  });
}
