export interface ThreeFiveSevenLegPosition {
  playerId: string;
  position: number;
  legCount: number;
}

export const selectTransferableThreeFiveSevenLegs = (
  positions: ThreeFiveSevenLegPosition[],
  winnerPosition: number,
  legsToWin: number,
): ThreeFiveSevenLegPosition[] => positions
  .filter((playerLeg) => playerLeg.position !== winnerPosition)
  .map((playerLeg) => ({
    ...playerLeg,
    legCount: Math.max(0, Math.min(playerLeg.legCount, legsToWin)),
  }))
  .filter((playerLeg) => playerLeg.legCount > 0);
