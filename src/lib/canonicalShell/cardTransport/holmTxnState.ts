// ──────────────────────────────────────────────────────────────────────
// Holm v3 — hand-boundary transaction state (generation-aware).
//
// Single source of truth for:
//   • active { handContextId, handGeneration } transaction
//   • teardown / new-hand-init completion latches
//   • per-(handContextId, handGeneration) visual-reveal committed card IDs
//   • outcome transaction key + latch
//   • legacy-writer firewall (allowlist while a Holm txn is active)
//
// This module is intentionally framework-free: pure state + listener set.
// MobileGameTable owns the React glue; this owns the contract.
//
// Landing 1 scope (deadlock fix):
//   - sequencer + commit recorder + outcome gate use this module
//   - runOutcomeTeardown / runNewHandInit envelopes land in landing 2;
//     until then the sequencer auto-establishes a txn for each fresh
//     handContextId (beginNewHand + auto markNewHandInitComplete) so the
//     fence is live without waiting on the envelope.
// ──────────────────────────────────────────────────────────────────────
import {
  holmDealDbgRecordEvent,
  holmDealDbgRecordTxn,
} from './holmDealDbg';

export interface ActiveTxn {
  handContextId: string;
  handGeneration: number;
  teardownComplete: boolean;
  newHandInitComplete: boolean;
  presentationHandContextId: string | null;
  outcomeTxnKey: string | null;
  outcomeReleased: boolean;
  createdAt: number;
}

type Listener = () => void;

const listeners = new Set<Listener>();
let activeTxn: ActiveTxn | null = null;
// committed set keyed by `${handContextId}::${handGeneration}`
const committedByKey = new Map<string, Set<string>>();
// monotonic generation counter — increments on every beginNewHand
let nextGeneration = 1;

function key(handContextId: string, handGeneration: number): string {
  return `${handContextId}::${handGeneration}`;
}

function publish(): void {
  if (activeTxn) {
    const committed = committedByKey.get(key(activeTxn.handContextId, activeTxn.handGeneration));
    holmDealDbgRecordTxn({
      handGeneration: activeTxn.handGeneration,
      txnTeardownComplete: activeTxn.teardownComplete,
      txnNewHandInitComplete: activeTxn.newHandInitComplete,
      presentationHandContextId: activeTxn.presentationHandContextId,
      outcomeTxnKey: activeTxn.outcomeTxnKey,
      visualChuckyFlipCommittedIds: committed ? Array.from(committed) : [],
    });
  }
  listeners.forEach((l) => { try { l(); } catch { /* noop */ } });
}

export function subscribeHolmTxn(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function getActiveTxn(): ActiveTxn | null {
  return activeTxn;
}

/**
 * Ordered hand-boundary transition. Establishes a new active txn for
 * (handContextId, freshGeneration). Resets per-hand committed set.
 *
 * Idempotent for the same handContextId already active — no-op if already
 * the active txn (sequencer may call repeatedly on re-runs).
 *
 * Returns the active txn after the call.
 */
export function beginNewHand(handContextId: string): ActiveTxn {
  if (activeTxn && activeTxn.handContextId === handContextId) {
    return activeTxn;
  }
  const generation = nextGeneration++;
  activeTxn = {
    handContextId,
    handGeneration: generation,
    teardownComplete: false,
    newHandInitComplete: false,
    presentationHandContextId: handContextId,
    outcomeTxnKey: null,
    outcomeReleased: false,
    createdAt: Date.now(),
  };
  // Drop committed sets for prior hand identities. We keep only the current.
  for (const k of Array.from(committedByKey.keys())) {
    if (k !== key(handContextId, generation)) committedByKey.delete(k);
  }
  committedByKey.set(key(handContextId, generation), new Set());
  publish();
  return activeTxn;
}

export function markTeardownComplete(handContextId: string, handGeneration: number): boolean {
  if (!activeTxn) return false;
  if (activeTxn.handContextId !== handContextId || activeTxn.handGeneration !== handGeneration) return false;
  if (activeTxn.teardownComplete) return true;
  activeTxn = { ...activeTxn, teardownComplete: true };
  holmDealDbgRecordEvent({
    type: 'HOLM_OUTCOME_TEARDOWN_COMPLETE',
    handContextId,
    handGeneration,
    outcomeTxnKey: activeTxn.outcomeTxnKey,
  });
  publish();
  return true;
}

export function markNewHandInitComplete(handContextId: string, handGeneration: number): boolean {
  if (!activeTxn) return false;
  if (activeTxn.handContextId !== handContextId || activeTxn.handGeneration !== handGeneration) return false;
  if (activeTxn.newHandInitComplete) return true;
  activeTxn = { ...activeTxn, newHandInitComplete: true };
  holmDealDbgRecordEvent({
    type: 'HOLM_NEW_HAND_INIT_COMPLETE',
    handContextId,
    handGeneration,
  });
  publish();
  return true;
}

/**
 * Latch a pending outcome on the active txn. Rejects unless identity
 * matches AND no outcome already latched. Returns true on accept.
 */
export function tryLatchOutcomeTxn(args: {
  handContextId: string;
  handGeneration: number;
  outcomeTxnKey: string;
}): boolean {
  if (!activeTxn) return false;
  if (activeTxn.handContextId !== args.handContextId) return false;
  if (activeTxn.handGeneration !== args.handGeneration) return false;
  if (activeTxn.outcomeTxnKey === args.outcomeTxnKey) return true;
  if (activeTxn.outcomeTxnKey != null) return false;
  activeTxn = { ...activeTxn, outcomeTxnKey: args.outcomeTxnKey };
  holmDealDbgRecordEvent({
    type: 'HOLM_PENDING_OUTCOME_LATCHED' as any,
    handContextId: args.handContextId,
    handGeneration: args.handGeneration,
    outcomeTxnKey: args.outcomeTxnKey,
  });
  publish();
  return true;
}

/**
 * Release outcome presentation. Caller must already have verified that
 * (a) every required reveal ID is committed and (b) final-card dwell elapsed.
 * Identity must match the active txn.
 */
export function releaseOutcomePresentation(args: {
  handContextId: string;
  handGeneration: number;
}): boolean {
  if (!activeTxn) return false;
  if (activeTxn.handContextId !== args.handContextId) return false;
  if (activeTxn.handGeneration !== args.handGeneration) return false;
  if (activeTxn.outcomeReleased) return true;
  activeTxn = { ...activeTxn, outcomeReleased: true };
  holmDealDbgRecordEvent({
    type: 'HOLM_OUTCOME_PRESENTATION_COMPLETE',
    handContextId: args.handContextId,
    handGeneration: args.handGeneration,
    outcomeTxnKey: activeTxn.outcomeTxnKey,
  });
  holmDealDbgRecordEvent({
    type: 'HOLM_OUTCOME_RELEASED' as any,
    handContextId: args.handContextId,
    handGeneration: args.handGeneration,
    outcomeTxnKey: activeTxn.outcomeTxnKey,
  });
  publish();
  return true;
}

/**
 * Record a renderer paint-commit for an exact card ID. Generation-fenced.
 * Rejected (observational) when txn missing/mismatched.
 */
export function recordVisualChuckyRevealCommitted(args: {
  cardId: string;
  handContextId: string;
  handGeneration: number;
}): boolean {
  if (!activeTxn) {
    holmDealDbgRecordEvent({
      type: 'HOLM_STALE_CALLBACK_REJECTED',
      handContextId: args.handContextId,
      handGeneration: args.handGeneration,
      cardId: args.cardId,
      detail: { reason: 'no active txn at recordVisualChuckyRevealCommitted' },
    });
    return false;
  }
  if (
    activeTxn.handContextId !== args.handContextId ||
    activeTxn.handGeneration !== args.handGeneration
  ) {
    holmDealDbgRecordEvent({
      type: 'HOLM_STALE_CALLBACK_REJECTED',
      handContextId: args.handContextId,
      handGeneration: args.handGeneration,
      cardId: args.cardId,
      detail: {
        reason: 'identity mismatch',
        activeHandContextId: activeTxn.handContextId,
        activeHandGeneration: activeTxn.handGeneration,
      },
    });
    return false;
  }
  const k = key(args.handContextId, args.handGeneration);
  let set = committedByKey.get(k);
  if (!set) {
    set = new Set();
    committedByKey.set(k, set);
  }
  if (set.has(args.cardId)) return true; // dedupe
  set.add(args.cardId);
  holmDealDbgRecordEvent({
    type: 'VISUAL_CHUCKY_REVEAL_COMMITTED' as any,
    handContextId: args.handContextId,
    handGeneration: args.handGeneration,
    cardId: args.cardId,
    detail: { committedSize: set.size },
  });
  publish();
  return true;
}

export function getVisualChuckyRevealCommittedIds(
  handContextId: string | null,
  handGeneration: number | null,
): ReadonlySet<string> {
  if (!handContextId || handGeneration == null) return EMPTY_SET;
  return committedByKey.get(key(handContextId, handGeneration)) ?? EMPTY_SET;
}
const EMPTY_SET: ReadonlySet<string> = new Set();

// ──────────────────────────────────────────────────────────────────────
// Legacy-writer firewall.
//
// Allowlist of writer tags that may mutate Chucky-related state while a
// Holm transaction is active. All other writers are rejected and logged
// as HOLM_LEGACY_CHUCKY_WRITER_REJECTED (observational).
// ──────────────────────────────────────────────────────────────────────
const LEGACY_ALLOWLIST = new Set<string>([
  'holm.sequencer.reveal',
  'holm.sequencer.init',
  'holm.outcome.release',
  'holm.txn.teardown',
  'holm.txn.newHandInit',
  'cacheEffect.cachePath',         // initial cache write — required for sequencer to ever start
  'stepper.setTimeout',             // legacy stepper — retired but writes will be intercepted; logged-and-ignored when txn active and writer not in primary allowlist (kept for compat; sequencer reveal advances now go through 'holm.sequencer.reveal')
]);

/**
 * Decide whether a legacy chucky-state write is allowed.
 * - If no active txn: allowed (no fence yet).
 * - If active txn + allowlisted writer: allowed.
 * - Otherwise: rejected; observational event recorded.
 */
export function isHolmChuckyWriteAllowed(args: {
  writer: string | undefined;
  field: 'cachedChuckyCards' | 'cachedChuckyActive' | 'cachedChuckyCardsRevealed' | 'outcomeTrigger';
  reason?: string | null;
}): boolean {
  if (!activeTxn) return true;
  const writer = args.writer ?? 'unknown';
  if (LEGACY_ALLOWLIST.has(writer)) return true;
  holmDealDbgRecordEvent({
    type: 'HOLM_LEGACY_CHUCKY_WRITER_REJECTED' as any,
    handContextId: activeTxn.handContextId,
    handGeneration: activeTxn.handGeneration,
    detail: {
      writer,
      field: args.field,
      reason: args.reason ?? null,
      txn: {
        teardownComplete: activeTxn.teardownComplete,
        newHandInitComplete: activeTxn.newHandInitComplete,
        outcomeTxnKey: activeTxn.outcomeTxnKey,
      },
    },
  });
  return false;
}

export function recordSequencerEvent(
  type:
    | 'HOLM_SEQUENCER_MOUNT'
    | 'HOLM_SEQUENCER_CANCEL'
    | 'HOLM_SEQUENCER_REVEAL_ADVANCED'
    | 'HOLM_SEQUENCER_OUTCOME_RELEASE_SCHEDULED',
  detail: Record<string, unknown>,
): void {
  holmDealDbgRecordEvent({
    type: type as any,
    handContextId: activeTxn?.handContextId ?? null,
    handGeneration: activeTxn?.handGeneration ?? null,
    detail,
  });
}
