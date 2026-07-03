/**
 * GIN_ACTIVE_HAND_LEDGER — investigation-only, single append-only ring
 * buffer of Gin Rummy active-self hand presentation events.
 *
 * Contract (mirrors HOLM_PRESENTATION_LEDGER):
 *   - Availability is bound to Gin table mount via `setGinLedgerActive`.
 *   - Recording is OFF unless ARMed via `GinActiveHandLedgerPill`.
 *   - No React subscriptions to gameplay state. Only the pill listens
 *     for availability + armed toggles.
 *   - Every event carries a monotonic sequence number and stable
 *     identity `{gameId, dealerGameId, roundId, handNumber,
 *     handContextId, localPlayerId, viewerId, phase}`.
 *   - Callers pass fully-normalised payloads. This module never reads
 *     DOM by itself, never subscribes to observers, never schedules
 *     timers.
 *
 * Six event families requested by the wartime instrumentation pass:
 *   A. AUTHORITATIVE_PROJECTION_OWNER
 *   B. DEAL_VISIBILITY_FACE
 *   C. TRANSPORT_OWNERSHIP
 *   D. GEOMETRY_DISAPPEARANCE
 *   E. POST_DEAL_INVARIANT
 *   F. LINEAGE_MARKER
 *
 * A generic `VIOLATION` family piggybacks on the same buffer so
 * exports can grep e.g. `GIN_ACTIVE_PROMPT_ZERO_HAND_VIOLATION`
 * without a second store.
 *
 * This module is instrumentation ONLY — it never influences cache
 * behavior, layout, transport, timing, fallbacks, or cleanup.
 */

export type GinLedgerFamily =
  | 'AUTHORITATIVE_PROJECTION_OWNER'
  | 'DEAL_VISIBILITY_FACE'
  | 'TRANSPORT_OWNERSHIP'
  | 'GEOMETRY_DISAPPEARANCE'
  | 'POST_DEAL_INVARIANT'
  | 'LINEAGE_MARKER'
  | 'VIOLATION';

export interface GinLedgerIdentity {
  gameId?: string | null;
  dealerGameId?: string | null;
  roundId?: string | null;
  handNumber?: number | null;
  handContextId?: string | null;
  localPlayerId?: string | null;
  viewerId?: string | null;
  phase?: string | null;
}

export interface GinLedgerEvent {
  seq: number;
  tMs: number;
  family: GinLedgerFamily;
  tag: string;
  identity: GinLedgerIdentity;
  payload?: Record<string, unknown>;
}

const MAX_EVENTS = 2000;
const buffer: GinLedgerEvent[] = [];
let seq = 0;
const t0 =
  typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();

/**
 * Build/revision marker per LINEAGE_MARKER (F). Stamped into every
 * event so exports can distinguish this ownership branch from prior
 * known-good branches. Bump when the active-hand owner ownership
 * lineage materially changes.
 */
export const GIN_LEDGER_BUILD_MARKER =
  'gin-active-hand-owner@v2.sticky-cache+readiness-gate';

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

function push(ev: GinLedgerEvent) {
  buffer.push(ev);
  if (buffer.length > MAX_EVENTS) buffer.splice(0, buffer.length - MAX_EVENTS);
}

/** Availability — Gin table mounted. Does NOT enable recording. */
export function setGinLedgerActive(available: boolean): void {
  const changed = _available !== available;
  _available = available;
  if (!available) {
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

export function isGinLedgerActive(): boolean {
  return _available;
}

export function subscribeGinLedgerAvailability(
  listener: (available: boolean) => void,
): () => void {
  availabilityListeners.add(listener);
  return () => availabilityListeners.delete(listener);
}

export function setGinLedgerArmed(armed: boolean): void {
  if (_armed === armed) return;
  _armed = armed;
  if (armed) {
    buffer.length = 0;
    seq = 0;
    push({
      seq: seq++,
      tMs: 0,
      family: 'LINEAGE_MARKER',
      tag: 'ledger-arm',
      identity: {},
      payload: {
        reason: 'user-arm',
        buildMarker: GIN_LEDGER_BUILD_MARKER,
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        viewport:
          typeof window !== 'undefined'
            ? { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio }
            : null,
      },
    });
  }
  armedListeners.forEach((l) => {
    try { l(_armed); } catch { /* noop */ }
  });
}

export function isGinLedgerArmed(): boolean {
  return _armed;
}

export function subscribeGinLedgerArmed(
  listener: (armed: boolean) => void,
): () => void {
  armedListeners.add(listener);
  return () => armedListeners.delete(listener);
}

export function clearGinLedger(): void {
  buffer.length = 0;
  seq = 0;
}

export function snapshotGinLedger(): GinLedgerEvent[] {
  return buffer.slice();
}

export function getGinLedgerEventCount(): number {
  return buffer.length;
}

/** No-op unless armed. Safe to call from render/effect/handler. */
export function recordGinLedger(
  family: GinLedgerFamily,
  tag: string,
  identity: GinLedgerIdentity,
  payload?: Record<string, unknown>,
): void {
  if (!_armed) return;
  push({
    seq: seq++,
    tMs: nowMs(),
    family,
    tag,
    identity: {
      gameId: identity.gameId ?? null,
      dealerGameId: identity.dealerGameId ?? null,
      roundId: identity.roundId ?? null,
      handNumber: identity.handNumber ?? null,
      handContextId: identity.handContextId ?? null,
      localPlayerId: identity.localPlayerId ?? null,
      viewerId: identity.viewerId ?? null,
      phase: identity.phase ?? null,
    },
    payload: payload ? { ...payload, _build: GIN_LEDGER_BUILD_MARKER } : { _build: GIN_LEDGER_BUILD_MARKER },
  });
}

export function recordGinLedgerViolation(
  originatingFamily: GinLedgerFamily,
  tag: string,
  identity: GinLedgerIdentity,
  payload?: Record<string, unknown>,
): void {
  if (!_armed) return;
  recordGinLedger('VIOLATION', `${originatingFamily}:${tag}`, identity, payload);
}

// ── Export ────────────────────────────────────────────────────────
export function formatGinLedgerAsText(): string {
  const events = buffer.slice();
  const head = `GIN ACTIVE HAND PRESENTATION LEDGER
build: ${GIN_LEDGER_BUILD_MARKER}
events: ${events.length} (cap ${MAX_EVENTS})
exported: ${new Date().toISOString()}
ua: ${typeof navigator !== 'undefined' ? navigator.userAgent : 'n/a'}
viewport: ${typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}` : 'n/a'}
─────────────────────────────────────────────────────────`;
  const lines = events.map((e) => {
    const t = String(e.tMs).padStart(6, ' ');
    const fam = e.family.padEnd(30, ' ');
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
