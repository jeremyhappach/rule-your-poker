import type { CribbageCard, CribbageEvent, CribbagePhase } from "@/lib/cribbageTypes";

/**
 * A Go/31 event can block the action row only if at least one authoritative
 * pegging action exists in the current hand. Fresh hands start at sequence 0;
 * any retained lastEvent at that boundary is stale presentation data.
 */
export function getCurrentPeggingBoundaryEventId(input: {
  phase: CribbagePhase | null | undefined;
  eventSequence: number | null | undefined;
  lastEvent: CribbageEvent | null | undefined;
}): string | null {
  if (input.phase !== "pegging" || (input.eventSequence ?? 0) <= 0 || !input.lastEvent) {
    return null;
  }
  if (input.lastEvent.type === "go_point") return input.lastEvent.id;
  if (input.lastEvent.type === "pegging_points" && input.lastEvent.count === 31) {
    return input.lastEvent.id;
  }
  return null;
}

/** Primitive identity for the local auto-Go effect. */
export function buildCribbageAutoGoIdentity(input: {
  roundId: string | null | undefined;
  handNumber: number | null | undefined;
  phase: CribbagePhase | null | undefined;
  eventSequence: number | null | undefined;
  currentTurnPlayerId: string | null | undefined;
  viewerPlayerId: string | null | undefined;
  currentCount: number | null | undefined;
  goCalledBy: string[] | null | undefined;
  hand: CribbageCard[] | null | undefined;
}): string {
  const handIdentity = (input.hand ?? [])
    .map((card) => `${card.rank}:${card.suit}`)
    .join(",");
  return [
    input.roundId ?? "-",
    input.handNumber ?? "-",
    input.phase ?? "-",
    input.eventSequence ?? "-",
    input.currentTurnPlayerId ?? "-",
    input.viewerPlayerId ?? "-",
    input.currentCount ?? "-",
    (input.goCalledBy ?? []).join(","),
    handIdentity,
  ].join("|");
}
