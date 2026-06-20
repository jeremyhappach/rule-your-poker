/**
 * Canonical Settlement Phase — types.
 *
 * Wave 1 architecture (state-only, no callbacks). Games emit a single
 * SettlementIntent; the shell drives a state machine through
 * PRELUDE → SETTLEMENT (economy ∥ celebration) → SETTLEMENT_COMPLETE.
 * Consumers observe phase. There is no onComplete callback.
 *
 * destinationReaction belongs to Economy (TransferIntent), not
 * Celebration: the winner bounce when chips arrive is "chip arrives →
 * destination reacts", which is economy.
 */

export type SettlementEndpoint =
  | { kind: 'seat'; position: number }
  | { kind: 'pot' };

export interface DestinationReaction {
  bounce?: boolean;
  pulse?: boolean;
  scale?: number;
}

export interface TransferIntent {
  id: string;
  from: SettlementEndpoint;
  to: SettlementEndpoint;
  amount: number;
  variant?: 'default' | 'sweep' | 'skunk';
  destinationReaction?: DestinationReaction;
  reason: string;
}

export type PreludeType = 'sweep_legs' | 'skunk' | 'double_skunk';

export interface PreludeIntent {
  type: PreludeType;
  /**
   * Minimum visible dwell for the prelude before SETTLEMENT begins.
   * Runtime defaults if omitted.
   */
  minDurationMs?: number;
}

export interface CelebrationIntent {
  winners: string[];
  announcement: string;
  confetti?: boolean;
  spotlight?: boolean;
  /** Floor for celebration phase before celebrationComplete may flip. */
  minDurationMs?: number;
}

export interface SettlementIntent {
  gameId: string;
  handNumber: number;
  prelude?: PreludeIntent;
  transfers: TransferIntent[];
  celebration: CelebrationIntent;
}

export type SettlementPhase =
  | 'IDLE'
  | 'PRELUDE'
  | 'SETTLEMENT'
  | 'SETTLEMENT_COMPLETE';
