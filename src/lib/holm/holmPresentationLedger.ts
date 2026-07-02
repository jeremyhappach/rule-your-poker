/**
 * HOLM_PRESENTATION_LEDGER — investigation-only, single append-only
 * ring buffer of Holm presentation events.
 *
 * Contract:
 *   - Recording is OFF unless ARMed via `HolmPresentationLedgerPill`.
 *   - Availability is bound to Holm-table mount via `setHolmLedgerActive`.
 *   - No React subscriptions to gameplay state. The only listener fanout
 *     is availability (for the pill) and armed toggle (for the pill).
 *   - Every event carries a monotonic sequence number and identity
 *     scope `{dealerGameId, roundId, handNumber, handContextId, playerId}`.
 *   - Callers pass fully-normalised payloads. This module never reads
 *     DOM, never subscribes to observers, never allocates timers.
 *
 * Six event families, per repair requirement:
 *   1. ACTIVE_SELF_LIFECYCLE
 *   2. ACTIVE_HAND_LAYOUT
 *   3. FOLD_PRESENTATION
 *   4. TABLED_CARD_OWNERSHIP
 *   5. WIN_CHIP_LAYER
 *   6. SOLO_CHUCKY_SNAPSHOT
 *
 * A generic `VIOLATION` sub-tag piggybacks on the same buffer so
 * downstream inspection can grep for e.g. `TABLED_CARD_OWNERSHIP`
 * violations without a second store.
 */

export type HolmLedgerFamily =
  | 'ACTIVE_SELF_LIFECYCLE'
  | 'ACTIVE_HAND_LAYOUT'
  | 'FOLD_PRESENTATION'
  | 'TABLED_CARD_OWNERSHIP'
  | 'WIN_CHIP_LAYER'
  | 'WINNER_CARD_PRESENTATION_SELECT'
  | 'SOLO_CHUCKY_SNAPSHOT'
  | 'VIOLATION';

export interface HolmLedgerIdentity {
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  handContextId?: string | null;
  playerId?: string | null;
}

export interface HolmLedgerEvent {
  seq: number;
  tMs: number;
  family: HolmLedgerFamily;
  tag: string;
  identity: HolmLedgerIdentity;
  payload?: Record<string, unknown>;
}

const MAX_EVENTS = 1000;
const buffer: HolmLedgerEvent[] = [];
let seq = 0;
const t0 =
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

let _available = false;
let _armed = false;
const availabilityListeners = new Set<(available: boolean) => void>();
const armedListeners = new Set<(armed: boolean) => void>();

function nowMs(): number {
  const t =
    typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
  return Math.round(t - t0);
}

function push(ev: HolmLedgerEvent) {
  buffer.push(ev);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
}

/** Availability — Holm table mounted. Does NOT enable recording. */
export function setHolmLedgerActive(available: boolean): void {
  const changed = _available !== available;
  _available = available;
  if (!available) {
    // Leaving Holm — disarm and clear so the next session starts fresh.
    if (_armed) {
      _armed = false;
      armedListeners.forEach((l) => {
        try { l(false); } catch { /* noop */ }
      });
    }
    buffer.length = 0;
    seq = 0;
  }
  if (changed) {
    availabilityListeners.forEach((l) => {
      try { l(_available); } catch { /* noop */ }
    });
  }
}

export function isHolmLedgerActive(): boolean {
  return _available;
}

export function subscribeHolmLedgerAvailability(
  listener: (available: boolean) => void,
): () => void {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
}

export function setHolmLedgerArmed(armed: boolean): void {
  if (_armed === armed) return;
  _armed = armed;
  if (armed) {
    buffer.length = 0;
    seq = 0;
    push({
      seq: seq++,
      tMs: 0,
      family: 'ACTIVE_SELF_LIFECYCLE',
      tag: 'ledger-arm',
      identity: {},
      payload: { reason: 'user-arm' },
    });
  }
  armedListeners.forEach((l) => {
    try { l(_armed); } catch { /* noop */ }
  });
}

export function isHolmLedgerArmed(): boolean {
  return _armed;
}

export function subscribeHolmLedgerArmed(
  listener: (armed: boolean) => void,
): () => void {
  armedListeners.add(listener);
  return () => armedListeners.delete(listener);
}

export function clearHolmLedger(): void {
  buffer.length = 0;
  seq = 0;
}

export function snapshotHolmLedger(): HolmLedgerEvent[] {
  return buffer.slice();
}

export function getHolmLedgerEventCount(): number {
  return buffer.length;
}

/**
 * Core record entry. All family-specific helpers below funnel here.
 * No-op unless armed. Callers may call from any render/effect/handler.
 */
export function recordHolmLedger(
  family: HolmLedgerFamily,
  tag: string,
  identity: HolmLedgerIdentity,
  payload?: Record<string, unknown>,
): void {
  if (!_armed) return;
  push({
    seq: seq++,
    tMs: nowMs(),
    family,
    tag,
    identity: {
      dealerGameId: identity.dealerGameId ?? null,
      roundId: identity.roundId ?? null,
      handNumber: identity.handNumber ?? null,
      handContextId: identity.handContextId ?? null,
      playerId: identity.playerId ?? null,
    },
    payload,
  });
}

/**
 * Emit a family-tagged violation on the same buffer so consumers can
 * grep for `family=VIOLATION` across the export.
 */
export function recordHolmLedgerViolation(
  originatingFamily: HolmLedgerFamily,
  tag: string,
  identity: HolmLedgerIdentity,
  payload?: Record<string, unknown>,
): void {
  if (!_armed) return;
  push({
    seq: seq++,
    tMs: nowMs(),
    family: 'VIOLATION',
    tag: `${originatingFamily}:${tag}`,
    identity: {
      dealerGameId: identity.dealerGameId ?? null,
      roundId: identity.roundId ?? null,
      handNumber: identity.handNumber ?? null,
      handContextId: identity.handContextId ?? null,
      playerId: identity.playerId ?? null,
    },
    payload,
  });
}

// ── Tabled-card duplicate detector ────────────────────────────────
//
// Records logical tabled-card identity per hand so the third and
// fourth cards from a second mount trigger a VIOLATION rather than
// silently duplicating on the felt.
const tabledLogicalKeys = new Map<string, Set<string>>();

function tabledScopeKey(id: HolmLedgerIdentity): string {
  return `${id.handContextId ?? '?'}`;
}

export function noteTabledCardOwnership(
  action:
    | 'create'
    | 'render'
    | 'suppress'
    | 'animate'
    | 'unmount',
  identity: HolmLedgerIdentity,
  payload: {
    ownerPlayerId: string | null;
    cardId: string;
    destination?: string | null;
    sourceBranch: string;
    component: string;
    gameTypeGuardOk?: boolean;
    transportType?: string | null;
    extra?: Record<string, unknown>;
  },
): void {
  if (!_armed) return;
  const scope = tabledScopeKey(identity);
  let seen = tabledLogicalKeys.get(scope);
  if (!seen) {
    seen = new Set();
    tabledLogicalKeys.set(scope, seen);
  }
  const logical = `${payload.ownerPlayerId ?? '?'}::${payload.cardId}::${payload.destination ?? ''}`;

  let duplicate = false;
  if (action === 'create') {
    if (seen.has(logical)) {
      duplicate = true;
    } else {
      seen.add(logical);
    }
  }

  recordHolmLedger('TABLED_CARD_OWNERSHIP', action, identity, {
    logical,
    ownerPlayerId: payload.ownerPlayerId,
    cardId: payload.cardId,
    destination: payload.destination ?? null,
    sourceBranch: payload.sourceBranch,
    component: payload.component,
    gameTypeGuardOk: payload.gameTypeGuardOk ?? null,
    transportType: payload.transportType ?? null,
    duplicate,
    ...payload.extra,
  });

  if (duplicate) {
    recordHolmLedgerViolation('TABLED_CARD_OWNERSHIP', 'duplicate-create', identity, {
      logical,
      ownerPlayerId: payload.ownerPlayerId,
      cardId: payload.cardId,
      sourceBranch: payload.sourceBranch,
      component: payload.component,
    });
  }
}

// Reset tabled logical-key tracking when hand identity changes.
// Callers pass the new handContextId; if it differs from the last
// seen scope, prior scope is cleared.
let lastTabledScope: string | null = null;
export function markHolmHandBoundary(handContextId: string | null): void {
  const scope = handContextId ?? '?';
  if (lastTabledScope && lastTabledScope !== scope) {
    tabledLogicalKeys.delete(lastTabledScope);
  }
  lastTabledScope = scope;
}

// ── Fold-presentation invariant ───────────────────────────────────
export interface FoldPresentationSample {
  authoritativeDecision: string | null;
  optimisticDecision: string | null;
  latchValue: string | null;
  activeRenderBranch: string;
  appliedDimClass: string | null;
  appliedDimValue: number | null;
  precedenceOrder: string[];
}

export function recordFoldPresentation(
  identity: HolmLedgerIdentity,
  sample: FoldPresentationSample,
): void {
  if (!_armed) return;
  recordHolmLedger('FOLD_PRESENTATION', 'derive', identity, sample as unknown as Record<string, unknown>);
  const authoritativeFold = sample.authoritativeDecision === 'fold' || sample.latchValue === 'fold';
  const rendered = (sample.appliedDimValue ?? 1) < 1 || (sample.appliedDimClass ?? '').includes('opacity-40');
  if (authoritativeFold && !rendered) {
    recordHolmLedgerViolation('FOLD_PRESENTATION', 'authoritative-fold-not-dimmed', identity, sample as unknown as Record<string, unknown>);
  }
}

// ── Format / export ───────────────────────────────────────────────
export function formatHolmLedgerAsText(): string {
  const events = buffer.slice();
  const head = `HOLM PRESENTATION LEDGER
events: ${events.length} (cap ${MAX_EVENTS})
exported: ${new Date().toISOString()}
ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}
viewport: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'n/a'}
─────────────────────────────────────────────────────────`;
  const lines = events.map((e) => {
    const t = String(e.tMs).padStart(6, ' ');
    const fam = e.family.padEnd(24, ' ');
    const id = safeStringify(e.identity);
    const payload = e.payload ? ` ${safeStringify(e.payload)}` : '';
    return `+${t}ms #${e.seq} ${fam} ${e.tag} id=${id}${payload}`;
  });
  return [head, ...lines].join('\n');
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === 'number') return Number.isFinite(val) ? Math.round(val * 100) / 100 : null;
      return val;
    });
  } catch {
    return '[unserializable]';
  }
}
