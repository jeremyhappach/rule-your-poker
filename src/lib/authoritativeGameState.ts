type AuthoritativeGameState = {
  id?: string;
  status?: string | null;
  game_type?: string | null;
  current_game_uuid?: string | null;
  updated_at?: string | null;
  rounds?: unknown;
};

const THREE_FIVE_SEVEN_GAME_TYPES = new Set(['3-5-7', '3-5-7-game', '357']);
const THREE_FIVE_SEVEN_ATOMIC_FRAME_STATUSES = new Set([
  'in_progress',
  'game_over',
  'session_ended',
]);
const THREE_FIVE_SEVEN_PREGAME_STATUSES = new Set([
  'waiting',
  'dealer_selection',
  'dealer_announcement',
  'game_selection',
  'configuring',
  'ante_decision',
]);

function timestampValue(value: unknown): number | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Merge one authoritative games-row image without discarding joined relations
 * that are absent from Realtime payloads. A strictly older games-row image is
 * rejected so a slow full snapshot cannot overwrite a newer Realtime receipt.
 */
export function mergeAuthoritativeGameState<T extends AuthoritativeGameState>(
  current: T | null,
  incoming: Partial<T> | null | undefined,
): T | null {
  if (!current || !incoming) return current;
  if (incoming.id && current.id && incoming.id !== current.id) return current;

  const currentTimestamp = timestampValue(current.updated_at);
  const incomingTimestamp = timestampValue(incoming.updated_at);
  if (
    currentTimestamp !== null
    && incomingTimestamp !== null
    && incomingTimestamp < currentTimestamp
  ) {
    return current;
  }

  const definedIncoming = Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
  return { ...current, ...definedIncoming } as T;
}

/**
 * 3-5-7 gameplay is published only from its exact atomic current-frame RPC.
 * A bare `games` Realtime row remains safe during pre-game lifecycle phases,
 * where it carries the shared dealer draw/configuration receipt and no round
 * projection exists yet. Every other game family retains complete-row merge.
 */
export function shouldPublishGamesRealtimeRowDirectly(
  incoming: Pick<AuthoritativeGameState, 'game_type' | 'status' | 'current_game_uuid'> | null | undefined,
  current?: Pick<AuthoritativeGameState, 'game_type' | 'status' | 'current_game_uuid'> | null,
): boolean {
  if (!incoming) return false;
  const incomingIsThreeFiveSeven = !!incoming.game_type
    && THREE_FIVE_SEVEN_GAME_TYPES.has(incoming.game_type);
  if (!incomingIsThreeFiveSeven) return true;

  if (incoming.status && THREE_FIVE_SEVEN_ATOMIC_FRAME_STATUSES.has(incoming.status)) {
    return false;
  }

  const currentIsActiveThreeFiveSeven = !!current?.game_type
    && THREE_FIVE_SEVEN_GAME_TYPES.has(current.game_type)
    && !!current.status
    && THREE_FIVE_SEVEN_ATOMIC_FRAME_STATUSES.has(current.status)
    && !!current.current_game_uuid;
  const incomingIsPregame = !!incoming.status
    && THREE_FIVE_SEVEN_PREGAME_STATUSES.has(incoming.status);
  if (currentIsActiveThreeFiveSeven && incomingIsPregame) {
    // A same/null dealer-game identity is a delayed image from the dealer game
    // already published by the exact frame. The atomic setup handoff mints a
    // new UUID before entering ante_decision, so only that explicit boundary
    // may return an active client to a pregame phase.
    return !!incoming.current_game_uuid
      && incoming.current_game_uuid !== current.current_game_uuid;
  }

  return true;
}
