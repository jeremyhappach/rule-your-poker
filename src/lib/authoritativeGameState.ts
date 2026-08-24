type AuthoritativeGameState = {
  id?: string;
  status?: string | null;
  game_type?: string | null;
  updated_at?: string | null;
  rounds?: unknown;
};

const THREE_FIVE_SEVEN_GAME_TYPES = new Set(['3-5-7', '3-5-7-game', '357']);
const THREE_FIVE_SEVEN_ATOMIC_FRAME_STATUSES = new Set([
  'in_progress',
  'game_over',
  'session_ended',
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
  incoming: Pick<AuthoritativeGameState, 'game_type' | 'status'> | null | undefined,
): boolean {
  if (!incoming) return false;
  return !(
    !!incoming.game_type
    && THREE_FIVE_SEVEN_GAME_TYPES.has(incoming.game_type)
    && !!incoming.status
    && THREE_FIVE_SEVEN_ATOMIC_FRAME_STATUSES.has(incoming.status)
  );
}
