/**
 * Cribbage deal-transport idempotency ledger.
 *
 * Persistent, exportable audit trail of every visible deal-transport
 * dispatch during a Cribbage hand. Enforces the invariant:
 *
 *   One logical card-to-destination deal identity
 *   may create at most one visible transport per hand.
 *
 * This module records — it does not repair. Consumers may read
 * `computeSuppressionDecision()` to decide whether a candidate
 * transport would violate the invariant; wiring that decision into
 * dispatch is the caller's choice.
 *
 * Storage is in-memory with an in-tab persistence bridge to
 * localStorage so a page reload keeps the current hand's ledger for
 * post-mortem export.
 */

export type DealOrigin = 'authoritative' | 'optimistic' | 'presentation';
export type PrecedingEventKind =
  | 'none'
  | 'remount'
  | 'reconnect'
  | 'realtime'
  | 'snapshot';

export interface LogicalCardKey {
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  cardId: string;
  recipientPlayerId: string;
  destination: string;
}

export interface DealTransportLedgerEntry extends LogicalCardKey {
  transportInstanceId: string;
  ts: number;
  source: string;
  reason: string;
  origin: DealOrigin;
  priorStatus: 'none' | 'in_flight' | 'settled';
  precedingEvent: PrecedingEventKind;
  suppressionDecision: 'allowed' | 'suppressed_duplicate' | 'replayed_after_settled';
  notes?: string;
}

const LEDGER_CAP = 500;
const STORAGE_KEY = 'ptp_cribbage_deal_ledger_v1';

let ledger: DealTransportLedgerEntry[] = loadFromStorage();

// Live status by logical identity — updated as transports flip between
// dispatched (in_flight) and settled. Callers own the settle callback.
type LogicalStatus = 'in_flight' | 'settled';
const statusByLogical = new Map<string, LogicalStatus>();

function logicalKey(k: LogicalCardKey): string {
  return [
    k.dealerGameId,
    k.roundId,
    k.handNumber,
    k.cardId,
    k.recipientPlayerId,
    k.destination,
  ].join('|');
}

function loadFromStorage(): DealTransportLedgerEntry[] {
  try {
    if (typeof window === 'undefined') return [];
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-LEDGER_CAP) : [];
  } catch { return []; }
}

function persist(): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ledger));
  } catch { /* best-effort */ }
}

// ── Public API ────────────────────────────────────────────────────

export interface CandidateDispatch extends LogicalCardKey {
  transportInstanceId: string;
  source: string;
  reason: string;
  origin: DealOrigin;
  precedingEvent?: PrecedingEventKind;
  notes?: string;
}

export interface SuppressionDecision {
  decision: DealTransportLedgerEntry['suppressionDecision'];
  priorStatus: DealTransportLedgerEntry['priorStatus'];
  priorEntry: DealTransportLedgerEntry | null;
}

/**
 * Compute (but do not record) whether a candidate dispatch is a
 * duplicate for its logical identity.
 */
export function computeSuppressionDecision(candidate: LogicalCardKey): SuppressionDecision {
  const key = logicalKey(candidate);
  const prior = [...ledger].reverse().find((e) => logicalKey(e) === key) ?? null;
  const status = statusByLogical.get(key) ?? 'in_flight';
  if (!prior) {
    return { decision: 'allowed', priorStatus: 'none', priorEntry: null };
  }
  if (status === 'settled') {
    return { decision: 'replayed_after_settled', priorStatus: 'settled', priorEntry: prior };
  }
  return { decision: 'suppressed_duplicate', priorStatus: 'in_flight', priorEntry: prior };
}

/** Record a dispatch. Returns the resolved decision for the caller. */
export function recordDealTransportDispatch(candidate: CandidateDispatch): SuppressionDecision {
  const decision = computeSuppressionDecision(candidate);
  const entry: DealTransportLedgerEntry = {
    dealerGameId: candidate.dealerGameId,
    roundId: candidate.roundId,
    handNumber: candidate.handNumber,
    cardId: candidate.cardId,
    recipientPlayerId: candidate.recipientPlayerId,
    destination: candidate.destination,
    transportInstanceId: candidate.transportInstanceId,
    ts: Date.now(),
    source: candidate.source,
    reason: candidate.reason,
    origin: candidate.origin,
    priorStatus: decision.priorStatus,
    precedingEvent: candidate.precedingEvent ?? 'none',
    suppressionDecision: decision.decision,
    notes: candidate.notes,
  };
  ledger.push(entry);
  if (ledger.length > LEDGER_CAP) ledger = ledger.slice(-LEDGER_CAP);
  if (decision.decision === 'allowed' || decision.decision === 'replayed_after_settled') {
    statusByLogical.set(logicalKey(candidate), 'in_flight');
  }
  persist();
  return decision;
}

/** Called when the visible transport for a logical identity has settled. */
export function markDealTransportSettled(key: LogicalCardKey): void {
  statusByLogical.set(logicalKey(key), 'settled');
}

export function getDealTransportLedger(): DealTransportLedgerEntry[] {
  return ledger.slice();
}

export function clearDealTransportLedger(): void {
  ledger = [];
  statusByLogical.clear();
  persist();
}

export function exportDealTransportLedgerJson(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      entryCount: ledger.length,
      entries: ledger,
    },
    null,
    2,
  );
}
