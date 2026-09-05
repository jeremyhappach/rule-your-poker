import { jsonEqual } from './gameStateSync/stateProgress';

type AuthoritativeGameState = {
  id?: string;
  status?: string | null;
  game_type?: string | null;
  current_game_uuid?: string | null;
  updated_at?: string | null;
  rounds?: unknown;
  authority_revision?: number;
};

const ATOMIC_FRAME_STATUSES = new Set([
  'in_progress',
  'game_over',
  'session_ended',
]);
const PREGAME_STATUSES = new Set([
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
  const bothVersioned = Number.isSafeInteger(current.authority_revision)
    && Number.isSafeInteger(incoming.authority_revision);
  if (bothVersioned && incoming.authority_revision! < current.authority_revision!) return current;
  if (!bothVersioned && (
    currentTimestamp !== null
    && incomingTimestamp !== null
    && incomingTimestamp < currentTimestamp
  )) {
    return current;
  }

  const sameRevision = bothVersioned
    ? current.authority_revision === incoming.authority_revision
    : currentTimestamp !== null && currentTimestamp === incomingTimestamp;
  if (sameRevision && Object.entries(incoming).some(([key, value]) =>
    key !== 'rounds' && key !== '_authorityRevision' && value !== undefined
    && key in current && !jsonEqual(current[key as keyof T], value))) return current;

  const definedIncoming = Object.fromEntries(
    Object.entries(incoming).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
  return { ...current, ...definedIncoming } as T;
}

/**
 * Gameplay is published only from a coherent current-frame RPC.
 * A bare `games` Realtime row remains safe during pre-game lifecycle phases,
 * where it carries the shared dealer draw/configuration receipt and no round
 * projection exists yet.
 */
export function shouldPublishGamesRealtimeRowDirectly(
  incoming: Pick<AuthoritativeGameState, 'game_type' | 'status' | 'current_game_uuid'> | null | undefined,
  current?: Pick<AuthoritativeGameState, 'game_type' | 'status' | 'current_game_uuid'> | null,
): boolean {
  if (!incoming) return false;
  if (incoming.status && ATOMIC_FRAME_STATUSES.has(incoming.status)) {
    return false;
  }

  const currentIsActive = !!current?.status
    && ATOMIC_FRAME_STATUSES.has(current.status)
    && !!current.current_game_uuid;
  const incomingIsPregame = !!incoming.status
    && PREGAME_STATUSES.has(incoming.status);
  if (currentIsActive && incomingIsPregame) {
    // A same/null dealer-game identity is a delayed image from the dealer game
    // already published by the exact frame. The atomic setup handoff mints a
    // new UUID before entering ante_decision, so only that explicit boundary
    // may return an active client to a pregame phase.
    return !!incoming.current_game_uuid
      && incoming.current_game_uuid !== current.current_game_uuid;
  }

  return true;
}
