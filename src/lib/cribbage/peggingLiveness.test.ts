import { describe, expect, it } from "vitest";
import {
  buildCribbageAutoGoIdentity,
  getCurrentPeggingBoundaryEventId,
} from "./peggingLiveness";

const staleGo = {
  id: "old-go",
  type: "go_point" as const,
  playerId: "player-1",
  points: 1,
  label: "Go",
  createdAt: "2026-08-26T00:00:00.000Z",
  count: 28,
};

describe("Cribbage pegging liveness identities", () => {
  it("does not let a prior hand Go event block a fresh sequence-zero hand", () => {
    expect(getCurrentPeggingBoundaryEventId({
      phase: "pegging",
      eventSequence: 0,
      lastEvent: staleGo,
    })).toBeNull();
  });

  it("admits a Go event from the current authoritative pegging sequence", () => {
    expect(getCurrentPeggingBoundaryEventId({
      phase: "pegging",
      eventSequence: 4,
      lastEvent: staleGo,
    })).toBe("old-go");
  });

  it("re-arms auto-Go when the authoritative hand or action sequence changes", () => {
    const base = {
      roundId: "round-1",
      handNumber: 1,
      phase: "pegging" as const,
      eventSequence: 3,
      currentTurnPlayerId: "player-1",
      viewerPlayerId: "player-1",
      currentCount: 27,
      goCalledBy: [] as string[],
      hand: [{ rank: "5", suit: "clubs" as const, value: 5 }],
    };
    const before = buildCribbageAutoGoIdentity(base);
    expect(buildCribbageAutoGoIdentity({ ...base, eventSequence: 4 })).not.toBe(before);
    expect(buildCribbageAutoGoIdentity({
      ...base,
      hand: [{ rank: "K", suit: "hearts", value: 10 }],
    })).not.toBe(before);
  });
});
