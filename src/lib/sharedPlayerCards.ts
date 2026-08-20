import { isThreeFiveSevenGameType } from './threeFiveSeven/currentFrame';

/**
 * Games whose active private hands are published through public.player_cards.
 *
 * Cribbage and Gin own cards in their dedicated authoritative state. Dice
 * games intentionally have no player_cards rows, so an empty projection is
 * never evidence that those games are stuck.
 */
export function expectsSharedPlayerCards(gameType: unknown): boolean {
  return gameType === 'holm-game' || gameType === 'holm' || isThreeFiveSevenGameType(gameType);
}
