import type {Board, Config, Projection} from './model.js';

export const ROUND_INTRO_MS = 2500;

/** Uses the persisted, pause-shifted first-placement deadline; no client release RPC. */
export function turnReleaseAt(board: Board | null | undefined, config: Config): number | null {
  if (!config.roundIntroMs || !config.firstPlacementSeconds || !board || board.result ||
      board.startedAt !== null || board.cardIndex !== 0 || board.firstPlacementDeadline == null) return null;
  return board.firstPlacementDeadline - config.firstPlacementSeconds * 1000;
}

export function roundIntro(view: Projection, now: number) {
  if (!view.roundId || !view.active_player_id || view.revealed || view.settlement || view.scorePresentation) return null;
  const releaseAt = turnReleaseAt(view.boards[view.active_player_id], view.config);
  const at = view.pausedAt ?? now;
  if (releaseAt === null || at < releaseAt - view.config.roundIntroMs! || at >= releaseAt) return null;
  const player = view.players.find(p => p.id === view.active_player_id);
  if (!player) return null;
  return {key: `${view.identity.sessionId}:${view.identity.dealerGameId}:${view.identity.handNumber}:${view.roundId}:${player.id}`,
    round: view.roundNumber, label: player.id === view.viewerId ? 'YOUR TURN' : `${player.name.toLocaleUpperCase()} IS UP`,
    remaining: releaseAt - (view.pausedAt ?? now)};
}
