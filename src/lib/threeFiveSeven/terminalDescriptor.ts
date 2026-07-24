/**
 * 3-5-7 Terminal Presentation Descriptor
 *
 * Immutable value object built by Game.tsx at authoritative terminal
 * detection (final-leg win OR instant 3-5-7 sweep). Passed down into
 * MobileGameTable → ThreeFiveSevenTerminalController, which sequences
 * the shared terminal path.
 *
 * The descriptor is the ONLY input to the new terminal controller.
 * Nothing about the descriptor may be recomputed downstream; consumers
 * treat it as read-only for its full lifetime.
 *
 * Identity is deterministic across the six identity fields — consecutive
 * dealer games producing identical sentinel text (e.g. `357_SWEEP:Hap:6`)
 * still produce distinct terminalGenerationIds because dealerGameId /
 * roundId / handNumber / handContextId differ.
 *
 * Slice 1: inert. This module is imported by Game.tsx (builder) and
 * ThreeFiveSevenTerminalController.tsx (consumer). No presentation
 * side-effects yet.
 */

import type { Card as CardType } from "@/lib/cardUtils";

export type Terminal357Source = "normal-win" | "instant-357";

export interface Terminal357PlayerLegsSnapshot {
  playerId: string;
  position: number;
  legs: number;
}

export interface Terminal357Descriptor {
  /** Full identity — never key ownership on sentinel text alone. */
  gameId: string;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  terminalResultIdentity: string;
  terminalGenerationId: string;

  /** Which prelude to run before entering the shared terminal path. */
  source: Terminal357Source;

  /** Winner identity — pot destination, confetti, and proof-card seat
   *  geometry must resolve from these, never from the local viewer. */
  winnerId: string;
  winnerName: string;
  winnerPosition: number;

  /** Normal-win only. Displayed in the persistent announcement. */
  targetLegs: number | null;

  /** Instant-357 only. Authoritative 3, 5, 7 faces the proof-card overlay
   *  will render. Consumers MUST animate copies of these — never the
   *  actual hand-card DOM. INVARIANT: when `source === 'instant-357'`,
   *  `proofCards.length === 3` (read from the authoritative playerCards
   *  row for winnerId at descriptor construction, scoped to the current
   *  dealerGameId/roundId/handNumber). The builder refuses to finalize
   *  an instant-357 descriptor without exactly three proof cards. */
  proofCards: CardType[] | null;

  /** Immutable pre-settlement legs snapshot, sourced directly from the
   *  authoritative realtime `players` rows at detection. No cache
   *  fallback, no reconstruction. `hadAuthoritativeLegs` below is
   *  derived from this snapshot and consumed by BOTH terminal sources
   *  to gate the shared SweepTheLegsAnimation step. */
  playersAtDetection: Terminal357PlayerLegsSnapshot[];

  /** Derived from playersAtDetection. Consumed by BOTH sources to gate
   *  the shared SweepTheLegsAnimation step. */
  hadAuthoritativeLegs: boolean;
}

/**
 * Build the deterministic generation id from the immutable identity
 * tuple. Not cryptographic — just stable across renders for the same
 * terminal event. Consecutive dealer games with identical sentinel text
 * differ on dealerGameId / handContextId / roundId, so their generation
 * ids differ.
 */
export function buildTerminal357GenerationId(input: {
  gameId: string;
  dealerGameId: string | null;
  roundId: string | null;
  handNumber: number | null;
  handContextId: string | null;
  terminalResultIdentity: string;
}): string {
  const parts = [
    input.gameId,
    input.dealerGameId ?? "-",
    input.roundId ?? "-",
    input.handNumber == null ? "-" : String(input.handNumber),
    input.handContextId ?? "-",
    input.terminalResultIdentity,
  ];
  return `t357:${parts.join("|")}`;
}

/**
 * True iff two descriptors refer to the same terminal event.
 * Consumers use this to detect stale descriptor references without
 * relying on object identity across renders.
 */
export function isSameTerminal357Descriptor(
  a: Terminal357Descriptor | null,
  b: Terminal357Descriptor | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.terminalGenerationId === b.terminalGenerationId;
}
