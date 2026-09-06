import { determineWinners, type HorsesHandResult } from './horsesGameLogic';
import { determineSCCWinners, type SCCHandResult } from './sccGameLogic';
import type { HorsesStateFromDB } from '@/hooks/useHorsesMobileController';

/** Presentation destination only; PostgreSQL already owns the award. */
export function horsesSccTerminalWinner(state: HorsesStateFromDB | null, gameType: string): string | null {
  if (state?.gamePhase !== 'complete') return null;
  const completed = Object.entries(state.playerStates).filter(([, player]) => player.isComplete && player.result);
  if (!completed.length || completed.length !== Object.keys(state.playerStates).length) return null;
  const winners = gameType === 'ship-captain-crew'
    ? determineSCCWinners(completed.map(([, player]) => player.result as SCCHandResult))
    : determineWinners(completed.map(([, player]) => player.result as HorsesHandResult));
  return winners.length === 1 ? completed[winners[0]][0] : null;
}
