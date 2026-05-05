/**
 * Visual Contract — central presentation lock for animation/reveal sequences.
 *
 * A "visual contract" is a bounded UI animation (cut-card reveal, dice fly-in,
 * chip transfer, win celebration, hand-over animation) during which the
 * presentation layer MUST NOT be replaced by newer authoritative state, even
 * if a phase/winner/complete transition arrives mid-animation.
 *
 * Authoritative state continues to flow into the authoritative layer, but
 * presentation is locked at the snapshot taken when the contract began.
 * On completion (or identity drift / timeout), the latest effective state
 * is flushed into presentation.
 *
 * Identity uniquely scopes a contract; delayed callbacks must validate
 * identity before mutating presentation.
 *
 * All lifecycle events are emitted to debug_events / debug_sync_events.
 */

export interface VisualContractIdentity {
  gameId: string;
  /** Optional but strongly preferred — round/hand boundary scoping. */
  roundId?: string | null;
  handNumber?: number | null;
  /** For per-turn contracts (dice rolls, individual reveals). */
  turnId?: string | null;
  /** Snapshot of authoritative phase at contract start. */
  phase?: string | null;
  /** Discriminator (e.g. 'cut-card-reveal', 'dice-roll', 'win-animation'). */
  contractType: string;
}

export interface VisualContractOptions {
  type: string;
  identity: Omit<VisualContractIdentity, 'contractType'>;
  /** Optional safety timeout (ms). Default: 10000. */
  timeoutMs?: number;
  /** Optional expected step count, recorded for diagnostics. */
  expectedSteps?: number;
}

/**
 * Returns true if two identities refer to the same contract instance.
 * gameId + contractType + (roundId | handNumber | turnId) must all match
 * when present on either side.
 */
export function identityEquals(
  a: VisualContractIdentity | null,
  b: VisualContractIdentity | null,
): boolean {
  if (!a || !b) return false;
  if (a.gameId !== b.gameId) return false;
  if (a.contractType !== b.contractType) return false;
  if ((a.roundId ?? null) !== (b.roundId ?? null)) return false;
  if ((a.handNumber ?? null) !== (b.handNumber ?? null)) return false;
  if ((a.turnId ?? null) !== (b.turnId ?? null)) return false;
  return true;
}

export type VisualContractEventName =
  | 'visual-contract-started'
  | 'visual-contract-buffered-authoritative'
  | 'visual-contract-completed'
  | 'visual-contract-aborted-identity-drift'
  | 'visual-contract-timeout'
  | 'visual-contract-flushed-buffer';

export interface VisualContractEvent {
  name: VisualContractEventName;
  identity: VisualContractIdentity;
  details?: Record<string, unknown>;
}
