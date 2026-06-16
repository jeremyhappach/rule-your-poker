/**
 * Wave 5C — Phase 3: parentId invariants.
 *
 * Focused on the new `parentId?: string` field added to ResolvedPlacement.
 * Group resolver behavior is exercised by groupResolver.test.ts.
 */

import { describe, expect, it } from "vitest";
import { resolveLayoutWithGroups } from "./resolver";
import type { ArtifactDescriptor, GroupDescriptor } from "./types";
import { rectVmin, vmin } from "./units";

function geom() {
  return {
    feltBounds: rectVmin(0, 0, 100, 100),
    outerRailReserve: rectVmin(0, 0, 100, 3),
    seatRing: {
      center: { x: vmin(50), y: vmin(50) },
      radiusX: vmin(40),
      radiusY: vmin(30),
      seatCount: 0,
      seatAnchors: [],
    },
    announcementBand: rectVmin(0, 10, 100, 8),
    playBand: rectVmin(10, 20, 80, 60),
    bottomHudReserve: rectVmin(0, 88, 100, 10),
    topHudReserve: rectVmin(0, 3, 100, 7),
    viewerSeatPosition: null,
  };
}

function leaf(id: string): ArtifactDescriptor {
  return {
    id,
    owner: "t",
    band: "play",
    composeMode: "flow",
    preferredSize: { width: vmin(20), height: vmin(10) },
    minimumSize: { width: vmin(10), height: vmin(5) },
    priority: 80,
    collapsePriority: "mid",
  };
}

describe("Wave 5C — ResolvedPlacement.parentId", () => {
  it("is undefined on top-level group placements", () => {
    const inner: GroupDescriptor = {
      id: "outer",
      owner: "t",
      band: "play",
      composeMode: "group",
      axis: "y",
      children: [{ id: "leafA", kind: "leaf", leafRef: "L1" }],
    };
    const out = resolveLayoutWithGroups([leaf("L1")], [inner], geom());
    const top = out.placements.find((p) => p.id === "outer");
    expect(top?.parentId).toBeUndefined();
  });

  it("matches the containing group's descriptor id on nested children", () => {
    const innerGroup: GroupDescriptor = {
      id: "inner",
      owner: "t",
      band: "play",
      composeMode: "group",
      axis: "x",
      children: [{ id: "innerLeaf", kind: "leaf", leafRef: "L2" }],
    };
    const outer: GroupDescriptor = {
      id: "outer",
      owner: "t",
      band: "play",
      composeMode: "group",
      axis: "y",
      children: [
        { id: "rowA", kind: "leaf", leafRef: "L1" },
        { id: "nested", kind: "group", group: innerGroup },
      ],
    };
    const out = resolveLayoutWithGroups([leaf("L1"), leaf("L2")], [outer], geom());

    const rowA = out.placements.find((p) => p.id === "rowA");
    const nested = out.placements.find((p) => p.id === "nested");
    const innerLeaf = out.placements.find((p) => p.id === "innerLeaf");

    expect(rowA?.parentId).toBe("outer");
    expect(nested?.parentId).toBe("outer");
    expect(innerLeaf?.parentId).toBe("inner");
  });
});
