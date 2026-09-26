/** Ante labels belong to the configured dealer game, never the outgoing table. */
export function resolveAnteGameType(
  sessionId: string,
  dealerGameId: string,
  current: { id: string; session_id: string; game_type: string | null } | null,
): string | null {
  return current?.id === dealerGameId && current.session_id === sessionId
    ? current.game_type
    : null;
}
