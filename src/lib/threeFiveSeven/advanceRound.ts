/**
 * 3-5-7 Atomic Round Advancement
 * ------------------------------
 *
 * Round-boundary transitions for 3-5-7 are non-atomic in the legacy
 * `startRound` path: the destination round row, the eligible-player state
 * reset, and the per-player `player_cards` inserts happen in three
 * separate round trips. A disconnect between (a) the round insert and
 * (c) the card batch insert leaves a stuck partial shell — the client
 * reconnects to a `betting` round with a `cards_dealt` count but no
 * hand for one or more players, and no valid decision UI.
 *
 * This module wraps every round-boundary write in the server-side RPC
 * `advance_357_round`, which performs the roster lookup, the reset,
 * the round insert, the ante charge (R1 only), and the `player_cards`
 * inserts inside a single locked transaction.
 *
 * ROUND-ONLY FOLD SEMANTICS
 * -------------------------
 * A fold is scoped to the round it was declared in. Every seam
 * (R1 → R2, R2 → R3, R3 → next-hand R1) uses the same destination
 * roster rule:
 *
 *   game_id matches
 *   AND status NOT IN ('left', 'observer')
 *   AND sitting_out = false
 *
 * Prior-round `current_decision = 'fold'` does NOT exclude a player
 * from the destination round. A folded player receives the full
 * destination card set (including carried-forward cards for R2/R3)
 * and normal Drop/Stay controls in the next round.
 */

import type { Card } from "../cardUtils";

export type EligiblePlayer = {
  id: string;
  position: number | null;
  // fold/stay from previous round is intentionally NOT consulted;
  // callers include every non-left / non-observer / non-sitting_out player.
};

export type PreviousRoundCards = ReadonlyMap<string, Card[]>;

export type Advance357Seam =
  | { kind: "r1_to_r2"; previousRoundNumber: 1 }
  | { kind: "r2_to_r3"; previousRoundNumber: 2 }
  | { kind: "r3_to_next_hand_r1"; previousRoundNumber: 3 };

export function seamForNextRound(nextRoundNumber: 1 | 2 | 3): Advance357Seam {
  if (nextRoundNumber === 2) return { kind: "r1_to_r2", previousRoundNumber: 1 };
  if (nextRoundNumber === 3) return { kind: "r2_to_r3", previousRoundNumber: 2 };
  return { kind: "r3_to_next_hand_r1", previousRoundNumber: 3 };
}

/** Cards dealt for each 3-5-7 round. Contract: R1=3, R2=5, R3=7. */
export function cardsDealtForRound(nextRoundNumber: 1 | 2 | 3): 3 | 5 | 7 {
  return nextRoundNumber === 1 ? 3 : nextRoundNumber === 2 ? 5 : 7;
}

/** Count of newly dealt cards on top of any carry-forward. */
export function newCardsPerPlayerForRound(nextRoundNumber: 1 | 2 | 3): number {
  return nextRoundNumber === 1 ? 3 : 2;
}

export type CardAssignment = {
  player_id: string;
  cards: Card[];
};

export type BuildAssignmentsInput = {
  nextRoundNumber: 1 | 2 | 3;
  eligiblePlayers: readonly EligiblePlayer[];
  /**
   * For R2/R3 transitions: the prior-round cards, keyed by player id.
   * At the R3 → next-hand R1 seam this MUST be empty — new hand, no
   * carryforward, fold-in-previous-hand's-R3 is irrelevant.
   */
  previousRoundCards: PreviousRoundCards;
  /**
   * Freshly-shuffled deck with any cards already known to be in the
   * previous round's hands filtered out by the caller. The helper
   * consumes cards sequentially in eligible-player position order.
   */
  deck: readonly Card[];
  /**
   * Optional per-player forced cards (harness override). Only applied
   * when the player has no carryforward and `nextRoundNumber === 1`.
   */
  forcedCardsByPlayer?: ReadonlyMap<string, Card[]>;
};

/**
 * Build the exact `player_card_assignments` payload the RPC requires.
 *
 * Invariants enforced here (mirrored by the RPC for defense in depth):
 *   1. Every eligible player receives exactly `cardsDealtForRound`
 *      cards, regardless of prior-round decision.
 *   2. R2 = 3 carryforward + 2 new. R3 = 5 carryforward + 2 new.
 *      R3 → new-hand R1 = 0 carryforward + 3 fresh.
 *   3. A folded player is treated the same as a stayed player.
 */
export function buildAdvance357CardAssignments(
  input: BuildAssignmentsInput,
): CardAssignment[] {
  const { nextRoundNumber, eligiblePlayers, previousRoundCards, deck, forcedCardsByPlayer } = input;
  const seam = seamForNextRound(nextRoundNumber);
  const expectedCount = cardsDealtForRound(nextRoundNumber);
  const newPerPlayer = newCardsPerPlayerForRound(nextRoundNumber);

  // Deterministic order: eligible players by ascending position, then id.
  const ordered = [...eligiblePlayers].sort((a, b) => {
    const pa = a.position ?? Number.POSITIVE_INFINITY;
    const pb = b.position ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const totalNewNeeded = ordered.length * newPerPlayer;
  if (deck.length < totalNewNeeded) {
    throw new Error(
      `advance357:deck_underflow needed=${totalNewNeeded} available=${deck.length} round=${nextRoundNumber}`,
    );
  }

  const assignments: CardAssignment[] = [];
  let cursor = 0;

  for (const player of ordered) {
    let carry: Card[] = [];
    if (seam.kind !== "r3_to_next_hand_r1") {
      carry = previousRoundCards.get(player.id) ?? [];
      if (carry.length !== (nextRoundNumber === 2 ? 3 : 5)) {
        throw new Error(
          `advance357:carryforward_length_mismatch player=${player.id} ` +
            `expected=${nextRoundNumber === 2 ? 3 : 5} got=${carry.length}`,
        );
      }
    }
    // Harness override only applies to Round 1 with no carryforward.
    const forced =
      nextRoundNumber === 1 && carry.length === 0
        ? forcedCardsByPlayer?.get(player.id)
        : undefined;

    let newCards: Card[];
    if (forced && forced.length === newPerPlayer) {
      newCards = forced;
    } else {
      newCards = deck.slice(cursor, cursor + newPerPlayer);
      cursor += newPerPlayer;
    }

    const cards = [...carry, ...newCards];
    if (cards.length !== expectedCount) {
      throw new Error(
        `advance357:assignment_length_mismatch player=${player.id} ` +
          `expected=${expectedCount} got=${cards.length}`,
      );
    }
    assignments.push({ player_id: player.id, cards });
  }

  return assignments;
}
