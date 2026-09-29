/** Presentation of begin_session_dealer_selection's election; the RPC rechecks under lock. */
export interface WaitingStartPlayer {
  id?: string;
  user_id: string;
  position: number | null;
  status?: string;
  is_bot: boolean;
  sitting_out: boolean;
  waiting?: boolean | null;
  created_at?: string;
}

export interface WaitingStartBoundary {
  status: string;
  current_game_uuid?: string | null;
  pot: number | null;
  is_paused?: boolean | null;
  pending_session_end?: boolean | null;
  session_ended_at?: string | null;
}

export function deriveWaitingRoomStartAuthority(
  players: readonly WaitingStartPlayer[],
  currentHost: string | null | undefined,
  boundary: WaitingStartBoundary,
) {
  const seated = players.filter(p => p.position != null && p.status !== 'observer' && p.status !== 'left');
  const eligible = seated.filter(p => p.waiting === true || !p.sitting_out);
  const byJoin = (a: WaitingStartPlayer, b: WaitingStartPlayer) =>
    (a.created_at ? Date.parse(a.created_at) : Infinity) -
      (b.created_at ? Date.parse(b.created_at) : Infinity) ||
    (a.id ?? '').localeCompare(b.id ?? '');
  const humans = eligible.filter(p => !p.is_bot).sort((a, b) =>
    Number(b.user_id === currentHost) - Number(a.user_id === currentHost) || byJoin(a, b));
  const starter = humans[0] ?? [...eligible].sort(byJoin)[0];
  const idle = boundary.status === 'waiting' && !boundary.current_game_uuid &&
    boundary.pot === 0 && !boundary.is_paused &&
    !boundary.pending_session_end && !boundary.session_ended_at;
  return {
    seatedPlayerCount: seated.length,
    eligiblePlayerCount: eligible.length,
    startAuthorityUserId: starter?.user_id ?? null,
    readyToStart: idle && eligible.length >= 2 && !!starter,
  };
}
