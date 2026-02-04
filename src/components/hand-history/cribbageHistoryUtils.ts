import type { CribbageEventRecord } from "./types";

/**
 * Stable chronological sort for hand history.
 *
 * We primarily respect the server-assigned (hand_number, sequence_number), but
 * include created_at as a final tie-breaker to avoid weird ordering when events
 * share a sequence number or arrive slightly out of order.
 */
export function sortCribbageEventsForHistory(events: CribbageEventRecord[]): CribbageEventRecord[] {
  return [...events].sort((a, b) => {
    if (a.hand_number !== b.hand_number) return a.hand_number - b.hand_number;
    if (a.sequence_number !== b.sequence_number) return a.sequence_number - b.sequence_number;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
}

/**
 * Truncate a cribbage event stream once a player reaches the win threshold.
 * The winning event itself is included.
 */
export function truncateCribbageEventsAtWin(
  events: CribbageEventRecord[],
  pointsToWin: number,
): CribbageEventRecord[] {
  const sorted = sortCribbageEventsForHistory(events);

  const running: Record<string, number> = {};
  const result: CribbageEventRecord[] = [];

  for (const ev of sorted) {
    if (ev.points > 0) {
      running[ev.player_id] = (running[ev.player_id] ?? 0) + ev.points;
    }
    result.push(ev);

    // Stop once *any* player has hit the threshold (covers rare attribution quirks).
    if (Object.values(running).some((s) => s >= pointsToWin)) {
      break;
    }
  }

  return result;
}
