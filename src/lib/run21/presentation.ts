import type {Projection} from './model';

/** One public board on the canonical felt, including its terminal presentation. */
export function displayedPlayerId(view: Projection): string {
  if (!view.liveBoards) return view.viewerId ?? view.players[0].id;
  return view.scorePresentation?.playerId ?? view.active_player_id ??
    view.players.filter(p => view.boards[p.id]?.result).sort((a,b) =>
      view.boards[b.id]!.result!.at - view.boards[a.id]!.result!.at)[0]?.id ?? view.players[0].id;
}

/** Presentation only: authoritative totals and money balances are never rewritten. */
export function displayedScore(view: Projection, playerId: string, at: number): number {
  const phase = view.scorePresentation;
  if (!phase || phase.playerId !== playerId) return view.cumulative[playerId];
  const progress = Math.max(0, Math.min(1, (at - phase.startedAt) / (phase.endsAt - phase.startedAt)));
  return Math.round(phase.from + (phase.to - phase.from) * progress);
}
