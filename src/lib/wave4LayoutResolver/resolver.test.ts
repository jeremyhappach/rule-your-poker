/**
 * Wave 4 — Phase 3
 * Resolver fixture tests. Pure in → pure out. No mocks, no renderers.
 */

import { describe, expect, it } from "vitest";
import { resolveLayout } from "./resolver";
import type {
  ArtifactDescriptor,
  GeometryConstraints,
  ResolvedPlacement,
} from "./types";
import { rectVmin, vmin } from "./units";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeGeometry(overrides: Partial<GeometryConstraints> = {}): GeometryConstraints {
  return {
    feltBounds: rectVmin(0, 0, 100, 100),
    outerRailReserve: rectVmin(0, 0, 100, 3),
    seatRing: {
      center: { x: vmin(50), y: vmin(50) },
      radiusX: vmin(40),
      radiusY: vmin(30),
      seatCount: 4,
      seatAnchors: [
        {
          position: 0,
          anchor: { x: vmin(50), y: vmin(90) },
          chipCenter: { x: vmin(50), y: vmin(80) },
          namePlate: rectVmin(40, 85, 20, 8),
          facing: "bottom",
        },
        {
          position: 1,
          anchor: { x: vmin(10), y: vmin(50) },
          chipCenter: { x: vmin(20), y: vmin(50) },
          namePlate: rectVmin(2, 46, 20, 8),
          facing: "left",
        },
      ],
    },
    announcementBand: rectVmin(0, 10, 100, 8),
    playBand: rectVmin(10, 25, 80, 40),
    bottomHudReserve: rectVmin(0, 88, 100, 10),
    topHudReserve: rectVmin(0, 3, 100, 7),
    viewerSeatPosition: 0,
    ...overrides,
  };
}

function flow(
  id: string,
  band: ArtifactDescriptor["band"],
  priority: number,
  collapsePriority: ArtifactDescriptor["collapsePriority"],
  preferred: { w: number; h: number },
  minimum?: { w: number; h: number },
  extras: Partial<ArtifactDescriptor> = {},
): ArtifactDescriptor {
  return {
    id,
    owner: "test",
    band,
    composeMode: "flow",
    preferredSize: { width: vmin(preferred.w), height: vmin(preferred.h) },
    minimumSize: {
      width: vmin(minimum?.w ?? preferred.w / 2),
      height: vmin(minimum?.h ?? preferred.h / 2),
    },
    priority,
    collapsePriority,
    ...extras,
  };
}

function byId(layout: { placements: ReadonlyArray<ResolvedPlacement> }, id: string) {
  const p = layout.placements.find((x) => x.id === id);
  if (!p) throw new Error(`placement ${id} not found`);
  return p;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveLayout — determinism", () => {
  it("produces identical output for identical inputs", () => {
    const ds = [flow("a", "play", 80, "mid", { w: 20, h: 10 })];
    const g = makeGeometry();
    const a = resolveLayout(ds, g);
    const b = resolveLayout(ds, g);
    expect(a).toEqual(b);
  });

  it("ignores input descriptor order (sorted by id in output)", () => {
    const a = flow("a", "play", 80, "mid", { w: 20, h: 10 });
    const b = flow("b", "play", 80, "mid", { w: 20, h: 10 });
    const out1 = resolveLayout([a, b], makeGeometry());
    const out2 = resolveLayout([b, a], makeGeometry());
    expect(out1.placements.map((p) => p.id)).toEqual(out2.placements.map((p) => p.id));
  });
});

describe("resolveLayout — preferred fits", () => {
  it("places all descriptors at preferred when band has slack", () => {
    const ds = [
      flow("a", "play", 80, "mid", { w: 20, h: 10 }),
      flow("b", "play", 80, "mid", { w: 20, h: 10 }),
    ];
    const out = resolveLayout(ds, makeGeometry());
    expect(out.faults).toEqual([]);
    expect(byId(out, "a").visible).toBe(true);
    expect(byId(out, "b").visible).toBe(true);
  });
});

describe("resolveLayout — shrink to minimum", () => {
  it("shrinks lower-priority artifacts first when over capacity", () => {
    // play band is y-dominant: height 40. Sum preferred = 50 → over by 10.
    const high = flow("high", "play", 95, "late", { w: 30, h: 30 }, { w: 20, h: 20 });
    const low = flow("low", "play", 50, "late", { w: 30, h: 20 }, { w: 30, h: 5 });
    const out = resolveLayout([high, low], makeGeometry());
    expect(out.faults).toEqual([]);
    expect(byId(out, "high").visible).toBe(true);
    expect(byId(out, "low").visible).toBe(true);
    // low got shrunk; high retained preferred or close to it.
    expect(byId(out, "low").rect.height.value).toBeLessThan(20);
  });
});

describe("resolveLayout — collapse order", () => {
  it("collapses 'first' before 'last'", () => {
    // play band height 40. Three artifacts at 30 each.
    const ds = [
      flow("title", "play", 40, "first", { w: 30, h: 30 }, { w: 30, h: 30 }),
      flow("mid", "play", 60, "mid", { w: 30, h: 30 }, { w: 30, h: 30 }),
      flow("keep", "play", 80, "last", { w: 30, h: 30 }, { w: 30, h: 30 }),
    ];
    const out = resolveLayout(ds, makeGeometry());
    expect(byId(out, "title").visible).toBe(false);
    expect(byId(out, "title").collapsedReason).toBe("pressure");
    // Either keep alone fits or both mid+keep — but title must fall first.
    expect(byId(out, "keep").visible).toBe(true);
  });
});

describe("resolveLayout — never_min_exceeds_band fault", () => {
  it("emits never_min_exceeds_band when 'never' minimums overflow", () => {
    const ds = [
      flow("a", "play", 95, "never", { w: 50, h: 30 }, { w: 50, h: 30 }),
      flow("b", "play", 95, "never", { w: 50, h: 30 }, { w: 50, h: 30 }),
    ];
    const out = resolveLayout(ds, makeGeometry());
    expect(out.faults.some((f) => f.code === "never_min_exceeds_band")).toBe(true);
  });
});

describe("resolveLayout — aspect ratio", () => {
  it("emits aspect_unhonorable when aspect cannot be honored within band cross-axis", () => {
    // play band 80 wide × 40 tall. Force aspect 0.05 (very tall/thin) with min 30.
    const ds = [
      flow("card", "play", 90, "never", { w: 30, h: 30 }, { w: 30, h: 30 }, {
        aspectRatio: 0.05, // requires huge cross extent
      }),
    ];
    const out = resolveLayout(ds, makeGeometry());
    expect(out.faults.some((f) => f.code === "aspect_unhonorable")).toBe(true);
  });
});

describe("resolveLayout — protected area faults", () => {
  it("emits protected_area_outside_band when reserved rect escapes its band", () => {
    const ds = [
      flow("p", "play", 80, "mid", { w: 10, h: 10 }, undefined, {
        protectedArea: rectVmin(0, 0, 10, 10), // outside play band (which starts at y=25)
      }),
    ];
    const out = resolveLayout(ds, makeGeometry());
    expect(out.faults.some((f) => f.code === "protected_area_outside_band")).toBe(true);
  });

  it("emits protected_area_overlap when two reserved rects collide", () => {
    const ds = [
      flow("a", "play", 80, "mid", { w: 10, h: 10 }, undefined, {
        protectedArea: rectVmin(20, 30, 20, 10),
      }),
      flow("b", "play", 80, "mid", { w: 10, h: 10 }, undefined, {
        protectedArea: rectVmin(25, 32, 20, 10),
      }),
    ];
    const out = resolveLayout(ds, makeGeometry());
    expect(out.faults.some((f) => f.code === "protected_area_overlap")).toBe(true);
  });
});

describe("resolveLayout — overlay demotion", () => {
  it("demotes overlay rather than pushing priority ≥95 flow artifact", () => {
    const hand: ArtifactDescriptor = flow("hand", "play", 95, "never", { w: 60, h: 20 });
    const overlay: ArtifactDescriptor = {
      id: "overlay",
      owner: "test",
      band: "play",
      composeMode: "overlay",
      preferredSize: { width: vmin(60), height: vmin(20) },
      minimumSize: { width: vmin(30), height: vmin(10) },
      priority: 70,
      collapsePriority: "mid",
    };
    const out = resolveLayout([hand, overlay], makeGeometry());
    expect(byId(out, "hand").visible).toBe(true);
    expect(byId(out, "overlay").visible).toBe(false);
    expect(byId(out, "overlay").collapsedReason).toBe("overlayDemoted");
  });

  it("keeps overlay when it does not collide with high-priority flow", () => {
    const low: ArtifactDescriptor = flow("low", "play", 50, "mid", { w: 10, h: 10 });
    const overlay: ArtifactDescriptor = {
      id: "overlay",
      owner: "test",
      band: "announcement",
      composeMode: "overlay",
      preferredSize: { width: vmin(50), height: vmin(6) },
      minimumSize: { width: vmin(30), height: vmin(6) },
      priority: 70,
      collapsePriority: "mid",
    };
    const out = resolveLayout([low, overlay], makeGeometry());
    expect(byId(out, "overlay").visible).toBe(true);
  });
});

describe("resolveLayout — structural band rejection", () => {
  it("rejects descriptors targeting outerRail", () => {
    const ds: ArtifactDescriptor[] = [
      {
        id: "bad",
        owner: "test",
        band: "outerRail",
        composeMode: "flow",
        preferredSize: { width: vmin(10), height: vmin(2) },
        minimumSize: { width: vmin(10), height: vmin(2) },
        priority: 50,
        collapsePriority: "mid",
      },
    ];
    const out = resolveLayout(ds, makeGeometry());
    expect(out.faults.some((f) => f.code === "descriptor_targets_structural_band")).toBe(true);
    expect(out.placements.find((p) => p.id === "bad")).toBeUndefined();
  });
});

describe("resolveLayout — seat ring as GeometryConstraint", () => {
  it("places seatBound at seat anchor, faults on safe-area collision", () => {
    const namePlate: ArtifactDescriptor = {
      id: "namePlate",
      owner: "test",
      band: "seatProjected",
      composeMode: "seatBound",
      seatPosition: 0,
      preferredSize: { width: vmin(20), height: vmin(8) },
      minimumSize: { width: vmin(15), height: vmin(6) },
      priority: 70,
      collapsePriority: "mid",
    };
    const out = resolveLayout([namePlate], makeGeometry());
    // Seat 0 anchor is at (50, 90); name plate centered there is at y=86..94,
    // which overlaps bottomHudReserve (y=88..98).
    expect(out.faults.some((f) => f.code === "safe_area_collision")).toBe(true);
  });

  it("places seatBound cleanly when no safe area collision occurs", () => {
    const geom = makeGeometry({
      bottomHudReserve: rectVmin(0, 95, 100, 5),
    });
    const namePlate: ArtifactDescriptor = {
      id: "namePlate",
      owner: "test",
      band: "seatProjected",
      composeMode: "seatBound",
      seatPosition: 1,
      preferredSize: { width: vmin(15), height: vmin(6) },
      minimumSize: { width: vmin(10), height: vmin(5) },
      priority: 70,
      collapsePriority: "mid",
    };
    const out = resolveLayout([namePlate], geom);
    expect(out.faults).toEqual([]);
    expect(byId(out, "namePlate").visible).toBe(true);
  });

  it("does not treat seatRing as a descriptor — caller never publishes it", () => {
    // Confirm geometry is echoed and untouched.
    const g = makeGeometry();
    const out = resolveLayout([], g);
    expect(out.geometry.seatRing).toBe(g.seatRing);
  });
});
