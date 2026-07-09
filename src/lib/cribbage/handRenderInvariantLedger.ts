/**
 * Bounded in-memory ledger of Cribbage self-hand render decisions.
 *
 * Purpose: back the P0 invariant
 *
 *   "If authoritative Cribbage state contains the local player's
 *    current-hand cards, the client MUST render them without refresh."
 *
 * Constraints:
 *   - Pure in-memory, capped at 50 entries
 *   - No localStorage / sessionStorage / IndexedDB
 *   - No console output
 *   - No backend / edge function / persistSyncDebugEvent
 *   - No auto-export
 *
 * Consumers may call `exportCribbageHandRenderLedgerJson()` from a
 * user-visible surface only after `hasCribbageHandRenderInvariantFailed()`
 * returns true.
 */

export type CribbageHandRenderDecisionKind =
  | 'render-authoritative'
  | 'render-presentation'
  | 'render-clipped-partial'
  | 'render-empty-pre-deal'
  | 'render-empty-blocked'
  | 'self-heal-fallback-to-authoritative';

export interface CribbageHandRenderLedgerEntry {
  ts: number;
  clientId: string;
  gameId: string;
  handNumber: number | null;
  phase: string;
  decision: CribbageHandRenderDecisionKind;
  authoritativeHandCount: number;
  presentationHandCount: number;
  renderedHandCount: number;
  activeHandBlocked: boolean;
  dealPhase: string | null;
  identityMismatch: boolean;
  reason: string;
}

const CAP = 50;
let ledger: CribbageHandRenderLedgerEntry[] = [];
let invariantFailed = false;

export function recordCribbageHandRenderDecision(
  entry: Omit<CribbageHandRenderLedgerEntry, 'ts'>,
): void {
  ledger.push({ ...entry, ts: Date.now() });
  if (ledger.length > CAP) ledger = ledger.slice(-CAP);
  // Invariant failure: authoritative non-empty AND rendered empty.
  if (entry.authoritativeHandCount > 0 && entry.renderedHandCount === 0) {
    invariantFailed = true;
  }
}

export function hasCribbageHandRenderInvariantFailed(): boolean {
  return invariantFailed;
}

export function getCribbageHandRenderLedger(): CribbageHandRenderLedgerEntry[] {
  return ledger.slice();
}

export function clearCribbageHandRenderLedger(): void {
  ledger = [];
  invariantFailed = false;
}

export function exportCribbageHandRenderLedgerJson(): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      invariantFailed,
      entryCount: ledger.length,
      entries: ledger,
    },
    null,
    2,
  );
}
