import { describe, expect, it } from "vitest";
import { shouldRetainTerminal357Presentation } from "./terminalDescriptor";

describe("3-5-7 terminal presentation authority boundary", () => {
  it("retains the active presentation on its authoritative terminal frame", () => {
    expect(shouldRetainTerminal357Presentation({
      active: true,
      gameStatus: "game_over",
      currentDealerGameId: "dealer-1",
      descriptorDealerGameId: "dealer-1",
    })).toBe(true);
  });

  it("releases a missed callback when authority enters dealer setup", () => {
    expect(shouldRetainTerminal357Presentation({
      active: true,
      gameStatus: "game_selection",
      currentDealerGameId: null,
      descriptorDealerGameId: "dealer-1",
    })).toBe(false);
  });

  it("rejects an active latch from a different dealer game", () => {
    expect(shouldRetainTerminal357Presentation({
      active: true,
      gameStatus: "game_over",
      currentDealerGameId: "dealer-2",
      descriptorDealerGameId: "dealer-1",
    })).toBe(false);
  });
});
