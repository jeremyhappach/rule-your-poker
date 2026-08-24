type AuthoritativeGameState = {
  id?: string;
  updated_at?: string | null;
  rounds?: unknown;
};

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
