// Deterministic sequence numbers for Cribbage event logging.
//
// Why: sequence_number is part of the DB-level dedupe key. If we generate it
// locally via an incrementing counter, multiple clients will produce different
// values and the "ignoreDuplicates" guard won't help.

export function seqCutCard(): number {
  return 10;
}

export function seqHisHeels(): number {
  return 11;
}

/**
 * Pegging play sequence number.
 * @param playIndex 1-based index after the card is added to playedCards
 */
export function seqPeggingPlay(playIndex: number): number {
  return 100 + Math.max(0, playIndex) * 2;
}

/**
 * "Go" point sequence number.
 * We log it immediately *after* the most recent play index.
 */
export function seqGoAfterPlay(playIndex: number): number {
  return seqPeggingPlay(playIndex) + 1;
}

export function seqHandScoring(playerOrderIndex: number, comboIndex: number): number {
  return 10_000 + Math.max(0, playerOrderIndex) * 100 + Math.max(0, comboIndex);
}

/**
 * Crib reveal sequence number - logged once before crib scoring combos.
 */
export function seqCribReveal(): number {
  return 19_999;
}

export function seqCribScoring(comboIndex: number): number {
  return 20_000 + Math.max(0, comboIndex);
}
