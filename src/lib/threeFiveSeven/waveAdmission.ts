export type ThreeFiveSevenWaveAdmission =
  | 'dispatch'
  | 'already-admitted'
  | 'already-settled';

function cumulativeCardsPerPlayer(roundNumber: number): number {
  if (roundNumber === 1) return 3;
  if (roundNumber === 2) return 5;
  if (roundNumber === 3) return 7;
  return 0;
}

/**
 * Admit one exact 3-5-7 wave at most once. Historical reconstruction seeds
 * the cumulative expected/settled target; a live dispatch seeds the same
 * expected target before transport starts. Either fact is sufficient to
 * reject a later duplicate effect run.
 */
export function classifyThreeFiveSevenWaveAdmission({
  roundNumber,
  activePlayerIds,
  expectedCount,
  settledCountForPlayer,
}: {
  roundNumber: number;
  activePlayerIds: ReadonlyArray<string>;
  expectedCount: number;
  settledCountForPlayer: (playerId: string) => number;
}): ThreeFiveSevenWaveAdmission {
  const cumulativePerPlayer = cumulativeCardsPerPlayer(roundNumber);
  const targetExpectedCount = cumulativePerPlayer * activePlayerIds.length;
  if (cumulativePerPlayer <= 0 || targetExpectedCount <= 0) return 'dispatch';
  if (activePlayerIds.every(
    (playerId) => settledCountForPlayer(playerId) >= cumulativePerPlayer,
  )) {
    return 'already-settled';
  }
  return expectedCount >= targetExpectedCount ? 'already-admitted' : 'dispatch';
}
