/**
 * Wave 5D Phase 2 — anchored composeMode resolver tests.
 *
 * Pure fixture tests. No DOM, no React, no mocks.
 */

import { describe, expect, it } from "vitest";
import { resolveLayout } from "./resolver";
import type { ArtifactDescriptor, GeometryConstraints } from "./types";
import { rectVmin, vmin } from "./units";

function makeGeometry(): GeometryConstraints {
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
    topHudReserve: rectVmin(0, 3, 100, 5),
    announcementBand: rectVmin(0, 10, 100, 6),
    playBand: rectVmin(0, 16, 100, 60),
    bottomHudReserve: rectVmin(0, 80, 100, 20),
    viewerSeatPosition: null,
  };
}

function anchored(
  id: string,
  overrides: Partial<ArtifactDescriptor> = {},
): ArtifactDescriptor {
  return {
    id,
    owner: "test",
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 0,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.5,
    anchorOrigin: "center",
    widthPct: 0.4,
    heightPct: 0.2,
    ...overrides,
  };
}

describe("Wave 5D anchored composeMode", () => {
  it("places anchored descriptor at viewport center with declared size", () => {
    const geo = makeGeometry();
    const layout = resolveLayout([anchored("a")], geo);
    const vp = layout.availableGameplayViewport.rect;
    const p = layout.placements.find((x) => x.id === "a")!;
    expect(p.visible).toBe(true);
    const expectedW = 0.4 * vp.width.value;
    const expectedH = 0.2 * vp.height.value;
    expect(p.rect.width.value).toBeCloseTo(expectedW, 4);
    expect(p.rect.height.value).toBeCloseTo(expectedH, 4);
    const centerX = p.rect.x.value + p.rect.width.value / 2;
    const centerY = p.rect.y.value + p.rect.height.value / 2;
    expect(centerX).toBeCloseTo(vp.x.value + 0.5 * vp.width.value, 4);
    expect(centerY).toBeCloseTo(vp.y.value + 0.5 * vp.height.value, 4);
    expect(layout.faults).toEqual([]);
  });

  it("moves position independently of size (anchorY change does not resize)", () => {
    const geo = makeGeometry();
    const a1 = resolveLayout([anchored("a", { anchorY: 0.42 })], geo)
      .placements[0];
    const a2 = resolveLayout([anchored("a", { anchorY: 0.37 })], geo)
      .placements[0];
    expect(a1.rect.width.value).toBeCloseTo(a2.rect.width.value, 4);
    expect(a1.rect.height.value).toBeCloseTo(a2.rect.height.value, 4);
    expect(a1.rect.y.value).not.toBeCloseTo(a2.rect.y.value, 4);
  });

  it("aspectRatio + widthPct derives height", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [
        anchored("a", {
          widthPct: 0.6,
          heightPct: undefined,
          aspectRatio: 3,
        }),
      ],
      geo,
    );
    const p = layout.placements[0];
    const vp = layout.availableGameplayViewport.rect;
    expect(p.rect.width.value).toBeCloseTo(0.6 * vp.width.value, 4);
    expect(p.rect.height.value).toBeCloseTo(
      (0.6 * vp.width.value) / 3,
      4,
    );
    expect(p.appliedAspectRatio).toBe(true);
  });

  it("faults under-specified size", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [anchored("a", { widthPct: 0.5, heightPct: undefined })],
      geo,
    );
    expect(
      layout.faults.some((f) => f.code === "anchored_size_underspecified"),
    ).toBe(true);
  });

  it("faults over-specified size", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [
        anchored("a", {
          widthPct: 0.5,
          heightPct: 0.3,
          aspectRatio: 2,
        }),
      ],
      geo,
    );
    expect(
      layout.faults.some((f) => f.code === "anchored_size_overspecified"),
    ).toBe(true);
  });

  it("faults anchored descriptor that illegally declares a band", () => {
    const geo = makeGeometry();
    const layout = resolveLayout([anchored("a", { band: "play" })], geo);
    expect(
      layout.faults.some(
        (f) => f.code === "anchored_descriptor_declared_band",
      ),
    ).toBe(true);
  });

  it("emits anchored_outside_viewport when resolved rect leaves the viewport", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [
        anchored("a", {
          anchorX: 0.95,
          anchorY: 0.5,
          widthPct: 0.4,
          heightPct: 0.2,
          anchorOrigin: "leftCenter",
        }),
      ],
      geo,
    );
    expect(
      layout.faults.some((f) => f.code === "anchored_outside_viewport"),
    ).toBe(true);
  });

  it("resolves anchorParent: child rect is computed against parent rect", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [
        anchored("parent", {
          anchorX: 0.5,
          anchorY: 0.5,
          widthPct: 0.6,
          heightPct: 0.6,
        }),
        anchored("child", {
          anchorParent: "parent",
          anchorX: 0.5,
          anchorY: 0.5,
          widthPct: 0.5,
          heightPct: 0.5,
        }),
      ],
      geo,
    );
    const parent = layout.placements.find((p) => p.id === "parent")!;
    const child = layout.placements.find((p) => p.id === "child")!;
    expect(child.rect.width.value).toBeCloseTo(
      0.5 * parent.rect.width.value,
      4,
    );
    expect(child.rect.height.value).toBeCloseTo(
      0.5 * parent.rect.height.value,
      4,
    );
  });

  it("detects anchorParent cycles", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [
        anchored("a", { anchorParent: "b" }),
        anchored("b", { anchorParent: "a" }),
      ],
      geo,
    );
    expect(
      layout.faults.some((f) => f.code === "anchored_parent_cycle"),
    ).toBe(true);
  });

  it("flags missing anchorParent", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [anchored("a", { anchorParent: "ghost" })],
      geo,
    );
    expect(
      layout.faults.some((f) => f.code === "anchored_parent_missing"),
    ).toBe(true);
  });

  it("emits advisory anchored_siblings_overlap (does not move either rect)", () => {
    const geo = makeGeometry();
    const layout = resolveLayout(
      [
        anchored("a", { anchorX: 0.5, anchorY: 0.5, widthPct: 0.5, heightPct: 0.5 }),
        anchored("b", { anchorX: 0.5, anchorY: 0.5, widthPct: 0.4, heightPct: 0.4 }),
      ],
      geo,
    );
    expect(
      layout.faults.some((f) => f.code === "anchored_siblings_overlap"),
    ).toBe(true);
    expect(layout.placements.every((p) => p.visible)).toBe(true);
  });
});
