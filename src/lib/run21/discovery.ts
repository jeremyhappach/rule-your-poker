/** Lobby classification only. Production shared discovery wiring waits for the baseline. */
export const RUN21_DISCOVERY = {id:'run21',family:'Other',label:'Run21',players:2,stakeMode:'match',roundWager:false} as const;
export const RUN21_PREVIEW_FAMILIES = ['Cards','Dice','Other'] as const;
export function run21Setup(stake: number, playerIds: string[]) {
  if (playerIds.length!==RUN21_DISCOVERY.players || new Set(playerIds).size!==2 || !Number.isSafeInteger(stake) || stake<0) throw new Error('invalid_run21_setup');
  return {gameType:RUN21_DISCOVERY.id,stake,playerIds:[...playerIds]};
}
