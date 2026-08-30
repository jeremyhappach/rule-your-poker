import type { GinRummyCard, GinRummyState } from '@/lib/ginRummyTypes';
import { isGinMaskedCard } from './presentationIdentity';

type GinDiscardSelectionState = Pick<
  GinRummyState,
  'phase' | 'turnPhase' | 'currentTurnPlayerId' | 'drawSource' | 'lastAction'
>;

/**
 * The card taken from the discard pile cannot be discarded in the same turn.
 * Derive that lock from authoritative turn state so it survives reload/rejoin;
 * local drawn-card presentation state is deliberately not consulted.
 */
export const getGinForbiddenRediscardCard = (
  state: GinDiscardSelectionState,
  playerId: string,
): GinRummyCard | null => {
  const action = state.lastAction;
  if (
    state.phase !== 'playing' ||
    state.turnPhase !== 'discard' ||
    state.currentTurnPlayerId !== playerId ||
    state.drawSource !== 'discard' ||
    action?.type !== 'draw_discard' ||
    action.playerId !== playerId ||
    !action.card ||
    isGinMaskedCard(action.card)
  ) {
    return null;
  }

  return action.card;
};

export const isGinForbiddenRediscard = (
  state: GinDiscardSelectionState,
  playerId: string,
  card: Pick<GinRummyCard, 'rank' | 'suit'> | null | undefined,
): boolean => {
  if (!card) return false;
  const forbiddenCard = getGinForbiddenRediscardCard(state, playerId);
  return !!forbiddenCard && forbiddenCard.rank === card.rank && forbiddenCard.suit === card.suit;
};
