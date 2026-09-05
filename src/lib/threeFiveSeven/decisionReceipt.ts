import { mergeAuthoritativeGameState } from '../authoritativeGameState';

type GameWithRounds = {
  id?: string;
  current_game_uuid?: string | null;
  authority_revision?: number;
  rounds?: Array<{ id?: string; authority_revision?: number }>;
};

const GAME_RECEIPT_FIELDS = [
  'authority_revision',
  'status',
  'current_game_uuid',
  'total_hands',
  'current_round',
  'awaiting_next_round',
  'last_round_result',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Apply the exact state returned by three_five_seven_submit_decision. The
 * receipt is database authority, not an optimistic reconstruction. Realtime
 * and the subsequent full snapshot remain reconciliation paths.
 */
export function applyThreeFiveSevenDecisionReceipt<T extends GameWithRounds>(
  current: T | null,
  gameId: string,
  result: unknown,
): T | null {
  if (!current || !isRecord(result)) return current;
  const gameReceipt = isRecord(result.game) ? result.game : null;
  if (!gameReceipt || gameReceipt.id !== gameId || current.id !== gameId) return current;
  if (current.current_game_uuid && gameReceipt.current_game_uuid
      && current.current_game_uuid !== gameReceipt.current_game_uuid) return current;
  // Delayed action responses obey the same revision rules as refreshed frames.
  if (mergeAuthoritativeGameState(current, gameReceipt as Partial<T>) === current) return current;

  const gamePatch: Record<string, unknown> = {};
  for (const field of GAME_RECEIPT_FIELDS) {
    if (field in gameReceipt && gameReceipt[field] !== undefined) {
      gamePatch[field] = gameReceipt[field];
    }
  }

  const roundReceipt = isRecord(result.round) && typeof result.round.id === 'string'
    ? result.round
    : null;
  if (!roundReceipt || !Array.isArray(current.rounds)) {
    return { ...current, ...gamePatch } as T;
  }

  const roundIndex = current.rounds.findIndex((round) => round.id === roundReceipt.id);
  if (roundIndex >= 0
      && mergeAuthoritativeGameState(current.rounds[roundIndex], roundReceipt) === current.rounds[roundIndex]) {
    return current;
  }
  const nextRounds = [...current.rounds];
  if (roundIndex === -1) {
    nextRounds.push({ ...roundReceipt, id: roundReceipt.id as string });
  } else {
    nextRounds[roundIndex] = { ...nextRounds[roundIndex], ...roundReceipt };
  }

  return { ...current, ...gamePatch, rounds: nextRounds } as T;
}
