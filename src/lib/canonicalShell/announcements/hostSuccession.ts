/** A presentation cursor, never a host election or permission source. */
export type HostCursor = { gameId: string; seen: number; announced: number };
export function observeHost(cursor: HostCursor | null, gameId: string, version: number,
  hostUserId: string | null | undefined, safeToAnnounce: boolean) {
  if (!Number.isSafeInteger(version) || version < 0) return { cursor, announce: false };
  // Fresh mounts/reconnects establish a baseline, without replaying old handoffs.
  if (!cursor || cursor.gameId !== gameId) {
    return { cursor: { gameId, seen: version, announced: version }, announce: false };
  }
  if (version < cursor.seen) return { cursor, announce: false };
  const next = { ...cursor, seen: version };
  const announce = Boolean(hostUserId && safeToAnnounce && version > cursor.announced);
  if (announce) next.announced = version;
  return { cursor: next, announce };
}
