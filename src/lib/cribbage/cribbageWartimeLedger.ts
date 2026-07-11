/**
 * cribbageWartimeLedger — single unified, bounded, in-memory ring buffer
 * for all remaining Cribbage instrumentation.
 *
 * Replaces the old separate pills (Counting Truth, Peg Transport, Layout
 * Status). One chronological timeline. Newest entries last.
 *
 * Instrumentation only.
 *  - No console logs
 *  - No backend writes
 *  - No localStorage / sessionStorage
 *  - No incident pipeline
 *  - Must not block gameplay
 *
 * Four instrumentation groups share the same ledger:
 *   A. Opening Deal / Active-Hand Reveal            (group='deal')
 *   B. Pegging Row Fan Geometry                     (group='pegging')
 *   C. Counting Announcement Bleed Between Targets  (group='counting')
 *   D. Go/31 Pegging Boundary + Action Eligibility  (group='boundary')
 *
 * Every entry carries the shared identity/clock context so the pill can
 * be read as a single truth timeline without cross-referencing.
 */

import {
  getPegTransportEntries,
  subscribePegTransport,
  type PegTransportEntry,
} from '@/lib/cribbageTransportInstrumentation';
import {
  countingTruthLedger,
  type CountingTruthEntry,
} from '@/lib/cribbage/countingTruthLedger';

// ─── Types ────────────────────────────────────────────────────────────

export type WartimeGroup = 'deal' | 'pegging' | 'counting' | 'boundary' | 'identity';

/**
 * Full event kind vocabulary. Kept as a single union so the pill and
 * downstream analysers can filter deterministically.
 */
export type WartimeEventKind =
  // Global identity / clock
  | 'hand_identity_seen'
  | 'hand_identity_changed'
  | 'next_hand_mount'
  | 'previous_hand_unmount'
  // A. Deal
  | 'orchestrator_mount'
  | 'dispatch_prerequisites_evaluated'
  | 'dispatch_attempt'
  | 'dispatch_succeeded'
  | 'duplicate_dispatch_suppressed'
  | 'timing_snapshot_taken'
  | 'transport_intent_created'
  | 'transport_intent_mounted'
  | 'transport_intent_launched'
  | 'transport_intent_settled'
  | 'transport_intent_dropped'
  | 'dealruntime_phase_changed'
  | 'settled_count_changed'
  | 'rendered_hand_count_changed'
  | 'active_hand_cards_prop_changed'
  | 'active_hand_dom_count_changed'
  | 'first_local_card_visible'
  | 'full_local_hand_visible'
  // B. Pegging row geometry
  | 'pegging_row_render'
  | 'pegging_row_sequence_changed'
  | 'pegging_row_card_mounted'
  | 'pegging_row_card_rect_sample'
  | 'pegging_row_transport_destination_computed'
  // C. Counting
  | 'scoring_target_enter'
  | 'combo_enter'
  | 'combo_announcement_publish'
  | 'combo_announcement_clear_request'
  | 'combo_announcement_unmounted'
  | 'combo_lower_start'
  | 'combo_lower_complete'
  | 'total_announcement_publish'
  | 'total_announcement_clear_request'
  | 'total_announcement_unmounted'
  | 'scoring_target_exit_start'
  | 'scoring_target_advance'
  | 'next_scoring_target_enter'
  | 'counting_complete'
  // D. Go / 31 boundary
  | 'go_event_seen'
  | 'thirty_one_event_seen'
  | 'pegging_boundary_hold_started'
  | 'row_clear_requested'
  | 'row_clear_dom_started'
  | 'row_clear_dom_complete'
  | 'boundary_hold_released'
  | 'authoritative_turn_changed'
  | 'local_action_eligibility_changed'
  | 'play_button_enabled_changed'
  | 'play_intent_created'
  | 'play_destination_computed'
  | 'play_transport_started'
  | 'play_transport_settled'
  // Bridge / catch-all
  | 'bridge_peg_transport'
  | 'bridge_counting_truth';

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
  identity: WartimeIdentity;
  eventSource: string;
  eventReason: string | null;
  /** Arbitrary structured payload — field names in the spec map 1-1 here. */
  payload: Record<string, unknown>;
  /** Named contradiction flags detected at record time. */
  contradictions: string[];
}

// ─── Store ────────────────────────────────────────────────────────────

const MAX_ENTRIES = 800;

let entries: WartimeEntry[] = [];
let seqCounter = 0;

const listeners = new Set<() => void>();

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

function emit() {
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

/**
 * Update ambient identity/clock context. Values are shallow-merged;
 * pass `null` to explicitly clear. Called by CribbageMobileGameTable
 * on identity, phase, DealRuntime, and scoring-target transitions.
 *
 * Also emits `hand_identity_changed` entries when the handContextId or
 * authoritativeHandContextId changes so the ledger tells the identity
 * story on its own.
 */
export function setCribbageWartimeIdentity(patch: Partial<WartimeIdentity>): void {
  const prev = currentIdentity;
  const next: WartimeIdentity = { ...prev, ...patch };

  const handChanged =
    prev.handContextId !== next.handContextId ||
    prev.authoritativeHandContextId !== next.authoritativeHandContextId ||
    prev.currentHandKey !== next.currentHandKey ||
    prev.renderHandContextId !== next.renderHandContextId;

  currentIdentity = next;

  if (handChanged) {
    pushEntry({
      group: 'identity',
      kind: 'hand_identity_changed',
      eventSource: 'setCribbageWartimeIdentity',
      eventReason: 'hand identity fields changed',
      payload: {
        prev: {
          handContextId: prev.handContextId,
          authoritativeHandContextId: prev.authoritativeHandContextId,
          currentHandKey: prev.currentHandKey,
          renderHandContextId: prev.renderHandContextId,
        },
        next: {
          handContextId: next.handContextId,
          authoritativeHandContextId: next.authoritativeHandContextId,
          currentHandKey: next.currentHandKey,
          renderHandContextId: next.renderHandContextId,
        },
      },
      contradictions: [],
    });
  }
}

export function getCribbageWartimeIdentity(): WartimeIdentity {
  return currentIdentity;
}

function pushEntry(
  init: Omit<WartimeEntry, 'seq' | 'ts' | 'identity'>,
): void {
  const entry: WartimeEntry = {
    seq: ++seqCounter,
    ts: Date.now(),
    identity: { ...currentIdentity },
    ...init,
  };
  entries = entries.length >= MAX_ENTRIES
    ? [...entries.slice(entries.length - MAX_ENTRIES + 1), entry]
    : [...entries, entry];
  emit();
}

// ─── Public record API ────────────────────────────────────────────────

export function recordCribbageWartime(
  group: WartimeGroup,
  kind: WartimeEventKind,
  eventSource: string,
  payload: Record<string, unknown> = {},
  opts: { eventReason?: string | null; contradictions?: string[] } = {},
): void {
  pushEntry({
    group,
    kind,
    eventSource,
    eventReason: opts.eventReason ?? null,
    payload,
    contradictions: opts.contradictions ?? [],
  });
}

export function clearCribbageWartime(): void {
  entries = [];
  seqCounter = 0;
  emit();
}

export function getCribbageWartimeEntries(): WartimeEntry[] {
  return entries;
}

export function subscribeCribbageWartime(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

// ─── Bridges from existing ledgers ────────────────────────────────────
//
// The peg transport ledger and the counting truth ledger are already
// wired at authoritative code sites (transport intent lifecycle, combo
// enter/publish/lower/clear, target advance, etc.). Mirroring their
// entries into the wartime ledger avoids duplicating instrumentation
// and guarantees the wartime timeline stays in lockstep with those
// sources for all groups B, C, and part of A.

let _bridgesAttached = false;

export function attachCribbageWartimeBridges(): void {
  if (_bridgesAttached) return;
  _bridgesAttached = true;

  // Peg transport bridge
  let lastPegCount = getPegTransportEntries().length;
  const seenPeg = new WeakMap<PegTransportEntry, number>();
  const mirrorPeg = (e: PegTransportEntry, kind: WartimeEventKind, reason: string | null) => {
    const contradictions: string[] = [];
    if (e.skipReason) contradictions.push(`peg_skip:${e.skipReason}`);
    if (e.cleanupReason && e.cleanupReason !== 'settled') contradictions.push(`peg_cleanup:${e.cleanupReason}`);
    if (e.intentCreated && !e.intentMounted) contradictions.push('peg_intent_created_not_mounted');
    if (e.didPhaseChangeBeforeMount) contradictions.push('peg_phase_change_before_mount');
    if (e.didUnmountBeforeStart) contradictions.push('peg_unmount_before_start');
    recordCribbageWartime(
      e.mode === 'self' && e.isFinalCardOfPegging ? 'boundary' : 'pegging',
      kind,
      'bridge:pegTransport',
      {
        attemptId: e.attemptId,
        mode: e.mode,
        playedCardId: e.playedCardId,
        playedCardIndex: e.playedCardIndex,
        phaseBefore: e.phaseBefore,
        phaseAfter: e.phaseAfter,
        cardsRemainingBefore: e.cardsRemainingBefore,
        cardsRemainingAfter: e.cardsRemainingAfter,
        isFinalCardOfPegging: e.isFinalCardOfPegging,
        sourceRectStatus: e.sourceRectStatus,
        sourceRect: e.sourceRect,
        destRectStatus: e.destRectStatus,
        destRect: e.destRect,
        intentCreated: e.intentCreated,
        intentMounted: e.intentMounted,
        animationStarted: e.animationStarted,
        animationSettled: e.animationSettled,
        skipReason: e.skipReason,
        cleanupReason: e.cleanupReason,
        boundaryKeyBefore: e.boundaryKeyBefore,
        boundaryKeyAfter: e.boundaryKeyAfter,
        activeInFlightIds: e.activeInFlightIds,
      },
      { eventReason: reason, contradictions },
    );
  };

  subscribePegTransport(() => {
    const all = getPegTransportEntries();
    for (let i = lastPegCount; i < all.length; i++) {
      const e = all[i];
      seenPeg.set(e, e.ts);
      mirrorPeg(e, 'bridge_peg_transport', 'new peg transport attempt');
    }
    lastPegCount = all.length;
    // Mirror updates on any recently-changed entry we've already seen.
    for (const e of all) {
      if (!seenPeg.has(e)) continue;
      // A cheap update signal: settled or dropped or cleanup transitions
      // produce a value change on the same reference; re-mirror once we
      // observe them in a subsequent notification. The bounded ledger
      // absorbs the redundancy.
      if (
        e.animationSettled ||
        e.cleanupReason ||
        e.skipReason ||
        e.didPhaseChangeBeforeMount ||
        e.didUnmountBeforeStart
      ) {
        // Only mirror once per terminal state to avoid runaway growth.
        const marker = `${e.animationSettled}|${e.cleanupReason}|${e.skipReason}`;
        const key = `__wt_marker_${e.attemptId}`;
        const store = seenPeg as unknown as { [k: string]: string };
        if (store[key] !== marker) {
          store[key] = marker;
          mirrorPeg(e, 'bridge_peg_transport', 'peg transport state update');
        }
      }
    }
  });

  // Counting truth bridge
  let lastCountingCount = countingTruthLedger.get().length;
  countingTruthLedger.subscribe(() => {
    const all = countingTruthLedger.get();
    for (let i = lastCountingCount; i < all.length; i++) {
      const e: CountingTruthEntry = all[i];
      const c: string[] = [];
      const contra = (e as unknown as { contradictions?: Record<string, boolean> }).contradictions;
      if (contra) {
        for (const [k, v] of Object.entries(contra)) if (v) c.push(k);
      }
      recordCribbageWartime(
        'counting',
        'bridge_counting_truth',
        `bridge:countingTruth:${e.source}`,
        { source: e.source, entry: e },
        { eventReason: e.source, contradictions: c },
      );
    }
    lastCountingCount = all.length;
  });
}

// ─── Serialisation ────────────────────────────────────────────────────

export function serializeCribbageWartime(
  filter: WartimeGroup | 'all' = 'all',
): string {
  const list = entries; // export always includes everything
  const shown = filter === 'all' ? list : list.filter((e) => e.group === filter);
  const lines: string[] = [];
  const contradictionCounts: Record<string, number> = {};
  for (const e of list) {
    for (const c of e.contradictions) contradictionCounts[c] = (contradictionCounts[c] ?? 0) + 1;
  }

  lines.push('# Cribbage Wartime Truth — export');
  lines.push(`totalEntries: ${list.length}`);
  lines.push(`firstEventAt: ${list[0] ? new Date(list[0].ts).toISOString() : 'n/a'}`);
  lines.push(`lastEventAt: ${list.length ? new Date(list[list.length - 1].ts).toISOString() : 'n/a'}`);
  lines.push(`roundId: ${currentIdentity.roundId ?? 'null'}`);
  lines.push(`handNumber: ${currentIdentity.handNumber ?? 'null'}`);
  lines.push(`playerId: ${currentIdentity.playerId ?? 'null'}`);
  lines.push(`filter: ${filter} (export always includes all groups: ${shown.length}/${list.length} shown)`);
  lines.push('contradictionCountsByType:');
  const keys = Object.keys(contradictionCounts).sort();
  if (keys.length === 0) lines.push('  (none)');
  for (const k of keys) lines.push(`  ${k}: ${contradictionCounts[k]}`);
  lines.push('---');

  for (const e of list) {
    lines.push(
      `#${e.seq} ${new Date(e.ts).toISOString()} [${e.group}] ${e.kind}` +
        ` src=${e.eventSource}${e.eventReason ? ` reason="${e.eventReason}"` : ''}`,
    );
    lines.push(`  identity: ${JSON.stringify(e.identity)}`);
    if (Object.keys(e.payload).length) lines.push(`  payload: ${JSON.stringify(e.payload)}`);
    if (e.contradictions.length) lines.push(`  contradictions: ${e.contradictions.join(', ')}`);
  }
  return lines.join('\n');
}

export function getCribbageWartimeContradictionCount(): number {
  let n = 0;
  for (const e of entries) n += e.contradictions.length;
  return n;
}
