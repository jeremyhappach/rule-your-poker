export type SnapshotRevision = { scope: string; value: number };

export function snapshotRevision(state: unknown): SnapshotRevision | null {
  if (!state || typeof state !== "object") return null;
  const value = (state as Record<string, unknown>)._authorityRevision;
  const scope = (state as Record<string, unknown>)._authorityScope;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && typeof scope === "string"
    ? { scope, value } : null;
}

// Gameplay progress is not a revision of deadlines, participants or metadata.
export function snapshotRevisionRejection(current: unknown, incoming: unknown, progress: -1 | 0 | 1): string | null {
  const before = snapshotRevision(current);
  const after = snapshotRevision(incoming);
  if (before && after && before.scope === after.scope && after.value < before.value) return "regressive_revision";
  if (progress !== 0 || current == null) return null;
  if (after && (!before || (after.scope === before.scope && after.value > before.value))) return null;
  return "conflicting_equal_progress";
}
