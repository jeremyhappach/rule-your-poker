export interface ThreeFiveSevenLegAwardPresentation {
  gameId: string;
  dealerGameId: string;
  roundId: string;
  handNumber: number;
  roundNumber: number;
  playerId: string;
  legNumber: number;
}

export function getThreeFiveSevenLegAwardPresentationKey(
  presentation: ThreeFiveSevenLegAwardPresentation,
): string {
  return [
    presentation.gameId,
    presentation.dealerGameId,
    presentation.roundId,
    presentation.handNumber,
    presentation.roundNumber,
    presentation.playerId,
    presentation.legNumber,
  ].join('|');
}

/**
 * The nonterminal leg result formats emitted by the authoritative 3-5-7
 * resolver. This identifies presentation ownership only; the exact round
 * identity still travels with the completion receipt.
 */
export function isThreeFiveSevenOrdinaryLegAwardResult(
  lastRoundResult: string | null | undefined,
): boolean {
  const displayText = lastRoundResult?.split('|||')[0] ?? '';
  return /\bwon a leg\b/i.test(displayText)
    || /\bstayed alone and (?:earned|won) leg \d+\b/i.test(displayText);
}
