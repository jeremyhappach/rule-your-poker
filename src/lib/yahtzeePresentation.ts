import type { YahtzeeState } from './yahtzeeTypes';

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
): YahtzeeRemoteScorePresentation {
  const action = state?.lastAction;
  if (!action || action.type !== 'score' || action.playerId === viewerPlayerId) {
    return { active: false, action: null };
  }
  if (state?.actionSequence !== action.sequence) {
    return { active: false, action: null };
  }
  const active = scoringInProgress || presentedScoreSequence !== action.sequence;
  return { active, action: active ? action : null };
}
