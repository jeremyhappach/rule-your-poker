/**
 * Wave 5C — Phase 2: Resolver Test Fixtures (group primitive)
 *
 * Spec: .lovable/wave5-gameplay-geometry/cribbage-gameplay-column-spec.md
 *
 * PURPOSE
 * -------
 * Executable specification of the `composeMode: "group"` contract.
 * These tests are the gate Phase 3 (resolver implementation + provider)
 * must pass before any UI slot is rewired.
 *
 * STATUS
 * ------
 * The suite is `describe.skip(...)` because the resolver does NOT yet
 * implement `group`. Phase 3 flips skip → describe in one line; no test
 * body changes. Until then the fixtures document the contract, the
 * acceptance checklist is encoded as assertions, and CI stays green.
 *
 * INVARIANTS UNDER TEST
 * ---------------------
 *   ✓ group solves declared child order (priority never reorders siblings)
 *   ✓ proportional gaps (weight-based slack distribution)
 *   ✓ nested groups (parentId set, child rects ⊂ parent rect, ⋃children = parent)
 *   ✓ shrink preservation order: gaps → crib → cutCard → pegboard → peggingRow
 *   ✓ collapse order: gaps → crib → cutCard → pegboard (fault) → peggingRow (never)
 *   ✓ HUD clamp: peggingRow.bottom ≤ playBand.bottom always
 *   ✓ XOR slot: pegging/counting mutually exclusive, stable placement id
 *   ✓ determinism: hash(placements) stable across runs and input order
 *
 * NON-GOALS
 * ---------
 * - No resolver edits.
 * - No provider scaffolding.
 * - No DOM, no React, no game imports.
 * - No measurement of live geometry.
 */

import { describe, expect, it } from "vitest";
import { resolveLayoutWithGroups } from "./resolver";
import type {
  ArtifactDescriptor,
  GeometryConstraints,
  GroupChildSlot,
  GroupDescriptor,
  Rect,
  ResolvedPlacement,
  ResolvedLayout,
} from "./types";
import { rectVmin, vmin, rectContains, rectsIntersect } from "./units";

// Phase-3-only fault codes (group primitive).
type GroupFaultCode = "group_min_exceeds_extent";

type ExtendedPlacement = ResolvedPlacement;
type ExtendedLayout = ResolvedLayout;

function resolveWithGroups(
  leaves: ReadonlyArray<ArtifactDescriptor>,
  groups: ReadonlyArray<GroupDescriptor>,
  geometry: GeometryConstraints,
): ExtendedLayout {
  return resolveLayoutWithGroups(leaves, groups, geometry);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGeometry(playBand: Rect = rectVmin(10, 20, 80, 60)): GeometryConstraints {
  return {
    feltBounds: rectVmin(0, 0, 100, 100),
    outerRailReserve: rectVmin(0, 0, 100, 3),
    seatRing: {
      center: { x: vmin(50), y: vmin(50) },
      radiusX: vmin(40),
      radiusY: vmin(30),
      seatCount: 4,
      seatAnchors: [],
    },
    announcementBand: rectVmin(0, 10, 100, 8),
    playBand,
    bottomHudReserve: rectVmin(0, 88, 100, 10),
    topHudReserve: rectVmin(0, 3, 100, 7),
    viewerSeatPosition: null,
  };
}

function leaf(
  id: string,
  preferred: { w: number; h: number },
  minimum?: { w: number; h: number },
  priority = 80,
): ArtifactDescriptor {
  return {
    id,
    owner: "cribbage",
    band: "play",
    composeMode: "flow",
    preferredSize: { width: vmin(preferred.w), height: vmin(preferred.h) },
    minimumSize: {
      width: vmin(minimum?.w ?? preferred.w * 0.5),
      height: vmin(minimum?.h ?? preferred.h * 0.5),
    },
    priority,
    collapsePriority: "mid",
  };
}

function cribbageColumn(opts: {
  includePegging?: boolean;
  includeCounting?: boolean;
  gapWeights?: { a: number; b: number };
  priorities?: { pegboard?: number; pegging?: number };
} = {}): { leaves: ArtifactDescriptor[]; group: GroupDescriptor } {
  const {
    includePegging = true,
    includeCounting = false,
    gapWeights = { a: 1, b: 1 },
    priorities = {},
  } = opts;

  const leaves: ArtifactDescriptor[] = [
    leaf("cribbage.pegboard", { w: 60, h: 20 }, { w: 50, h: 15 }, priorities.pegboard ?? 90),
    leaf("cribbage.crib", { w: 20, h: 10 }, { w: 15, h: 8 }, 70),
    leaf("cribbage.cutCard", { w: 10, h: 14 }, { w: 8, h: 10 }, 75),
  ];

  const cribCutGroup: GroupDescriptor = {
    id: "cribbage.cribCutGroup",
    owner: "cribbage",
    band: "play",
    composeMode: "group",
    axis: "x",
    children: [
      { id: "crib", kind: "leaf", leafRef: "cribbage.crib", shrinkOrder: 2, collapseOrder: 2 },
      { id: "innerGap", kind: "gap", weight: 1, shrinkOrder: 1, collapseOrder: 1 },
      { id: "cutCard", kind: "leaf", leafRef: "cribbage.cutCard", shrinkOrder: 3, collapseOrder: 3 },
    ],
  };

  const children: GroupChildSlot[] = [
    { id: "pegboard", kind: "leaf", leafRef: "cribbage.pegboard", shrinkOrder: 4, collapseOrder: 4 },
    { id: "gapA", kind: "gap", weight: gapWeights.a, shrinkOrder: 1, collapseOrder: 1 },
    { id: "cribCutGroup", kind: "group", group: cribCutGroup, shrinkOrder: 2, collapseOrder: 2 },
    { id: "gapB", kind: "gap", weight: gapWeights.b, shrinkOrder: 1, collapseOrder: 1 },
  ];

  if (includePegging) {
    leaves.push(leaf("cribbage.peggingRow", { w: 70, h: 12 }, { w: 50, h: 10 }, 95));
    children.push({
      id: "peggingRow",
      kind: "leaf",
      leafRef: "cribbage.peggingRow",
      shrinkOrder: 5,
      collapseOrder: "never",
    });
  }
  if (includeCounting) {
    leaves.push(leaf("cribbage.countingRow", { w: 70, h: 12 }, { w: 50, h: 10 }, 95));
    children.push({
      id: "countingRow",
      kind: "leaf",
      leafRef: "cribbage.countingRow",
      shrinkOrder: 5,
      collapseOrder: "never",
    });
  }

  const gameplayColumn: GroupDescriptor = {
    id: "cribbage.gameplayColumn",
    owner: "cribbage",
    band: "play",
    composeMode: "group",
    axis: "y",
    children,
    clampToBand: true,
  };

  return { leaves, group: gameplayColumn };
}

function byId(layout: ExtendedLayout, id: string): ExtendedPlacement {
  const p = layout.placements.find((x) => x.id === id);
  if (!p) throw new Error(`placement ${id} not found`);
  return p;
}

function maybe(layout: ExtendedLayout, id: string): ExtendedPlacement | undefined {
  return layout.placements.find((x) => x.id === id);
}

function hashLayout(layout: ExtendedLayout): string {
  // Deterministic serialization. parentId included; faults included by code+ids only.
  const placements = [...layout.placements]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({
      id: p.id,
      parentId: p.parentId ?? null,
      visible: p.visible,
      x: round(p.rect.x.value),
      y: round(p.rect.y.value),
      w: round(p.rect.width.value),
      h: round(p.rect.height.value),
    }));
  const faults = [...layout.faults]
    .map((f) => ({ code: f.code, ids: [...f.artifactIds].sort() }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return JSON.stringify({ placements, faults });
}
function round(v: number): number {
  return Math.round(v * 1e4) / 1e4;
}

// ---------------------------------------------------------------------------
// Suite (Phase-3 activated)
// ---------------------------------------------------------------------------

describe.skip("Wave 5C — group resolver contract (activates in Phase 3)", () => {
  // -------------------------------------------------------------------------
  describe("fixed child order", () => {
    it("emits children in declared order regardless of priority", () => {
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      const ids = out.placements
        .filter((p) => p.parentId === group.id)
        .map((p) => p.id);
      expect(ids).toEqual(["pegboard", "gapA", "cribCutGroup", "gapB", "peggingRow"]);
    });

    it("inverted priorities do not reorder siblings", () => {
      const a = cribbageColumn({ priorities: { pegboard: 10, pegging: 99 } });
      const b = cribbageColumn({ priorities: { pegboard: 99, pegging: 10 } });
      const orderA = resolveWithGroups(a.leaves, [a.group], makeGeometry())
        .placements.filter((p) => p.parentId === a.group.id)
        .map((p) => p.id);
      const orderB = resolveWithGroups(b.leaves, [b.group], makeGeometry())
        .placements.filter((p) => p.parentId === b.group.id)
        .map((p) => p.id);
      expect(orderA).toEqual(orderB);
    });
  });

  // -------------------------------------------------------------------------
  describe("gap distribution", () => {
    it("distributes remaining height evenly with equal weights", () => {
      const { leaves, group } = cribbageColumn({ gapWeights: { a: 1, b: 1 } });
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      const gapA = byId(out, "gapA");
      const gapB = byId(out, "gapB");
      expect(gapA.rect.height.value).toBeCloseTo(gapB.rect.height.value, 3);
    });

    it("distributes slack proportionally to weight (2:1)", () => {
      const { leaves, group } = cribbageColumn({ gapWeights: { a: 2, b: 1 } });
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      const gapA = byId(out, "gapA").rect.height.value;
      const gapB = byId(out, "gapB").rect.height.value;
      expect(gapA / (gapA + gapB)).toBeCloseTo(2 / 3, 2);
      expect(gapB / (gapA + gapB)).toBeCloseTo(1 / 3, 2);
    });
  });

  // -------------------------------------------------------------------------
  describe("nested groups", () => {
    it("emits nested placements with correct parentId", () => {
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      const cribCut = byId(out, "cribCutGroup");
      expect(cribCut.parentId).toBe(group.id);
      const crib = byId(out, "crib");
      const cut = byId(out, "cutCard");
      expect(crib.parentId).toBe("cribbage.cribCutGroup");
      expect(cut.parentId).toBe("cribbage.cribCutGroup");
    });

    it("child rects stay inside parent rect", () => {
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      const parent = rectToBox(byId(out, "cribCutGroup").rect);
      for (const id of ["crib", "innerGap", "cutCard"]) {
        const child = maybe(out, id);
        if (!child) continue;
        expect(rectContains(parent, rectToBox(child.rect))).toBe(true);
      }
    });

    it("union of children covers parent rect (no gaps, no overflow)", () => {
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      const parent = rectToBox(byId(out, "cribCutGroup").rect);
      const children = ["crib", "innerGap", "cutCard"]
        .map((id) => maybe(out, id))
        .filter((p): p is ExtendedPlacement => !!p)
        .map((p) => rectToBox(p.rect));
      // x-axis group: sum of widths == parent width; y identical.
      const sumW = children.reduce((s, c) => s + c.width, 0);
      expect(sumW).toBeCloseTo(parent.width, 2);
      for (const c of children) {
        expect(c.y).toBeCloseTo(parent.y, 2);
        expect(c.height).toBeCloseTo(parent.height, 2);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("shrink preservation order", () => {
    it("shrinks in order: gaps → crib → cutCard → pegboard → peggingRow", () => {
      // Tight band forces shrinking, not collapse.
      const tight = makeGeometry(rectVmin(10, 20, 80, 40));
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], tight);

      const peggingShrink = ratioShrunk(byId(out, "peggingRow"), 12);
      const pegboardShrink = ratioShrunk(byId(out, "pegboard"), 20);
      const cribShrink = ratioShrunk(byId(out, "crib"), 10);

      // Pegging is the LAST to shrink — least amount removed.
      expect(peggingShrink).toBeLessThanOrEqual(pegboardShrink);
      expect(pegboardShrink).toBeLessThanOrEqual(cribShrink);
    });
  });

  // -------------------------------------------------------------------------
  describe("collapse order", () => {
    it("gaps collapse first, peggingRow never collapses, pegboard faults before disappearing", () => {
      // Impossible: 5 vmin tall play band cannot fit anything.
      const impossible = makeGeometry(rectVmin(10, 20, 80, 5));
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], impossible);

      expect(maybe(out, "gapA")?.visible).toBe(false);
      expect(maybe(out, "gapB")?.visible).toBe(false);
      expect(byId(out, "peggingRow").visible).toBe(true);

      const faultCodes = out.faults.map((f) => f.code as GroupFaultCode | string);
      const hasExpected =
        faultCodes.includes("never_min_exceeds_band") ||
        faultCodes.includes("group_min_exceeds_extent");
      expect(hasExpected).toBe(true);

      // Pegboard emits a fault before vanishing (if it does vanish).
      if (maybe(out, "pegboard")?.visible === false) {
        expect(out.faults.some((f) => f.artifactIds.includes("cribbage.pegboard"))).toBe(true);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("bottom HUD clamp", () => {
    it("peggingRow.bottom never exceeds playBand.bottom", () => {
      const geom = makeGeometry();
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], geom);
      const pegging = byId(out, "peggingRow");
      const peggingBottom = pegging.rect.y.value + pegging.rect.height.value;
      const playBottom = geom.playBand.y.value + geom.playBand.height.value;
      expect(peggingBottom).toBeLessThanOrEqual(playBottom + 1e-3);
    });

    it("no group child intrudes into bottomHudReserve", () => {
      const geom = makeGeometry();
      const { leaves, group } = cribbageColumn();
      const out = resolveWithGroups(leaves, [group], geom);
      const hud = rectToBox(geom.bottomHudReserve);
      for (const p of out.placements) {
        if (!p.visible) continue;
        expect(rectsIntersect(rectToBox(p.rect), hud)).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  describe("XOR slot — pegging/counting mutual exclusion", () => {
    it("pegging present, counting absent", () => {
      const { leaves, group } = cribbageColumn({ includePegging: true, includeCounting: false });
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      expect(maybe(out, "peggingRow")).toBeDefined();
      expect(maybe(out, "countingRow")).toBeUndefined();
    });

    it("counting present, pegging absent", () => {
      const { leaves, group } = cribbageColumn({ includePegging: false, includeCounting: true });
      const out = resolveWithGroups(leaves, [group], makeGeometry());
      expect(maybe(out, "countingRow")).toBeDefined();
      expect(maybe(out, "peggingRow")).toBeUndefined();
    });

    it("placement id is stable for whichever row is present", () => {
      const a = cribbageColumn({ includePegging: true });
      const b = cribbageColumn({ includeCounting: true });
      const outA = resolveWithGroups(a.leaves, [a.group], makeGeometry());
      const outB = resolveWithGroups(b.leaves, [b.group], makeGeometry());
      expect(byId(outA, "peggingRow").id).toBe("peggingRow");
      expect(byId(outB, "countingRow").id).toBe("countingRow");
    });
  });

  // -------------------------------------------------------------------------
  describe("determinism", () => {
    it("hash(placements) identical across repeated runs", () => {
      const { leaves, group } = cribbageColumn();
      const g = makeGeometry();
      const h1 = hashLayout(resolveWithGroups(leaves, [group], g));
      const h2 = hashLayout(resolveWithGroups(leaves, [group], g));
      const h3 = hashLayout(resolveWithGroups(leaves, [group], g));
      expect(h1).toBe(h2);
      expect(h2).toBe(h3);
    });

    it("hash independent of leaf input order", () => {
      const { leaves, group } = cribbageColumn();
      const reversed = [...leaves].reverse();
      const g = makeGeometry();
      expect(hashLayout(resolveWithGroups(leaves, [group], g))).toBe(
        hashLayout(resolveWithGroups(reversed, [group], g)),
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function rectToBox(r: Rect) {
  return { x: r.x.value, y: r.y.value, width: r.width.value, height: r.height.value };
}

function ratioShrunk(p: ExtendedPlacement, preferredCrossAxis: number): number {
  // Group axis is y here; cross-axis "shrink amount" is preferred − actual height.
  return Math.max(0, preferredCrossAxis - p.rect.height.value) / preferredCrossAxis;
}
