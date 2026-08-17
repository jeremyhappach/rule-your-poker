import type { YahtzeeState } from './yahtzeeTypes';
import { UPPER_CATEGORIES } from './yahtzeeTypes';

type ScoreAction = NonNullable<YahtzeeState['lastAction']>;

export interface YahtzeeRemoteScorePresentation {
  active: boolean;
  action: ScoreAction | null;
}

/**
 * Hold the scorer's presentation through the atomic score/turn commit.
 *
 * The first render recognizes an unseen latest score synchronously, before the
 * effect-driven highlight state is installed. Later renders remain active while
 * that highlight is visible. A later durable action or a completed highlight
 * releases the new turn without changing authoritative action ownership.
 */
export function resolveYahtzeeRemoteScorePresentation(
  state: Pick<YahtzeeState, 'actionSequence' | 'lastAction'> | null | undefined,
  viewerPlayerId: string | null | undefined,
  scoringInProgress: boolean,
  presentedScoreSequence: number | null,
  presentationHydrated: boolean,
): YahtzeeRemoteScorePresentation {
  const action = state?.lastAction;
  if (!presentationHydrated || !action || action.type !== 'score' || action.playerId === viewerPlayerId) {
    return { active: false, action: null };
  }
  if (state?.actionSequence !== action.sequence) {
    return { active: false, action: null };
  }
  const active = scoringInProgress || presentedScoreSequence !== action.sequence;
  return { active, action: active ? action : null };
}

/** Formats the scorer's durable action for the canonical announcement rail. */
export function describeYahtzeeScore(action: ScoreAction): string {
  const upperIndex = UPPER_CATEGORIES.indexOf(action.category);
  if (upperIndex >= 0) {
    const face = upperIndex + 1;
    const matchingDice = action.dice.filter(die => die.value === face).length;
    return `${matchingDice} x ${face}s`;
  }

  switch (action.category) {
    case 'three_of_a_kind': return action.score === 0 ? '0 for three of a kind' : 'a three of a kind';
    case 'four_of_a_kind': return action.score === 0 ? '0 for four of a kind' : 'a four of a kind';
    case 'full_house': return action.score === 0 ? '0 for a full house' : 'a full house';
    case 'small_straight': return action.score === 0 ? '0 for a small straight' : 'a small straight';
    case 'large_straight': return action.score === 0 ? '0 for a large straight' : 'a large straight';
    case 'yahtzee': return action.score === 0 ? '0 for a Yahtzee' : 'a Yahtzee';
    case 'chance': return `${action.score} on chance`;
  }

  return String(action.score);
}
