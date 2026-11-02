import type {ApprovedSound} from './approvedSounds';
import type {YahtzeeState} from '@/lib/yahtzeeTypes';

/** Selection only: these helpers consume results; they never award anything. */
export function isFiveOnes(dice: readonly {value:number}[]) {
  return dice.length === 5 && dice.every(die => die.value === 1);
}

export function yahtzeePostedSound(state: YahtzeeState): ApprovedSound {
  const action = state.lastAction;
  if (!action) return 'scorePost';
  const five = action.dice.length === 5 && action.dice[0].value > 0 && action.dice.every(d => d.value === action.dice[0].value);
  const card = state.playerStates[action.playerId]?.scorecard;
  // The accepted action and committed card establish initial 50 or a legal repeat.
  return five && (action.category === 'yahtzee' ? action.score === 50 : card?.scores.yahtzee === 50)
    ? 'yahtzee' : 'scorePost';
}

export function legAwardSound(recipientId: string, localPlayerId: string | null | undefined): ApprovedSound {
  return recipientId === localPlayerId ? 'myLeg' : 'opponentLeg';
}

export function sweepOwnsCelebration(descriptor: {hadAuthoritativeLegs:boolean} | null | undefined) {
  return descriptor?.hadAuthoritativeLegs === true;
}
