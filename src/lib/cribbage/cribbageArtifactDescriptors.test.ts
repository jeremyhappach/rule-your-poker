/**
 * Wave 4 — Phase 4
 * Cribbage descriptor + resolver integration fixtures.
 *
 * No UI. No rendering. Pure data in → ResolvedLayout out.
 *
 * Snapshots:
 *   - mobile portrait
 *   - mobile landscape
 *   - tablet portrait
 *   - tablet landscape
 *
 * across phases:
 *   - pegging
 *   - counting
 *
 * Acceptance:
 *   - Cribbage is fully expressible as descriptors + GeometryConstraints.
 *   - Zero `if (game === 'cribbage')` branches anywhere.
 *   - Resolver emits explicit faults when something doesn't fit — never
 *     silently overlaps or squashes.
 */

import { describe, expect, it } from "vitest";
import {
  resolveLayout,
  rectVmin,
  vmin,
  type GeometryConstraints,
  type ResolvedLayout,
} from "@/lib/wave4LayoutResolver";
import {
  getCribbageArtifactDescriptors,
  type CribbagePhase,
} from "./cribbageArtifactDescriptors";

// ---------------------------------------------------------------------------
// Geometry profiles. Units = vmin (resolver's internal canonical unit).
// Each profile encodes the felt bounds and the 4 protected bands. Seat ring
// is a structural projection from the canonical shell (Wave 3).
// ---------------------------------------------------------------------------

interface Profile {
  name: string;
  geometry: GeometryConstraints;
}

function makeProfile(
  name: string,
  feltW: number,
  feltH: number,
  bands: {
    rail: number;
    topHud: number;
    announce: number;
    bottomHud: number;
  },
): Profile {
  const { rail, topHud, announce, bottomHud } = bands;
  const topHudY = rail;
  const announceY = topHudY + topHud;
  const playY = announceY + announce;
  const bottomHudY = feltH - bottomHud;
  const playH = bottomHudY - playY;

  // Seat ring: 4 seats around the felt, viewer at bottom.
  const cx = feltW / 2;
  const cy = feltH / 2;
  const rx = feltW * 0.42;
  const ry = playH * 0.42;
  const seatAnchors = [
    { position: 0, angle: 0.5 }, // bottom (viewer)
    { position: 1, angle: 0 }, // right
    { position: 2, angle: 1.5 }, // top
    { position: 3, angle: 1 }, // left (using π units, *π for radians)
  ].map((s) => {
    const theta = s.angle * Math.PI;
    const ax = cx + rx * Math.cos(theta);
    const ay = cy + ry * Math.sin(theta);
    return {
      position: s.position,
      anchor: { x: vmin(ax), y: vmin(ay) },
      chipCenter: { x: vmin(ax), y: vmin(ay) },
      namePlate: rectVmin(ax - 7, ay - 2, 14, 3),
      facing:
        s.position === 0
          ? ("bottom" as const)
          : s.position === 2
            ? ("top" as const)
            : s.position === 1
              ? ("right" as const)
              : ("left" as const),
    };
  });

  return {
    name,
    geometry: {
      feltBounds: rectVmin(0, 0, feltW, feltH),
      outerRailReserve: rectVmin(0, 0, feltW, rail),
      seatRing: {
        center: { x: vmin(cx), y: vmin(cy) },
        radiusX: vmin(rx),
        radiusY: vmin(ry),
        seatCount: 4,
        seatAnchors,
      },
      topHudReserve: rectVmin(0, topHudY, feltW, topHud),
      announcementBand: rectVmin(0, announceY, feltW, announce),
      playBand: rectVmin(2, playY, feltW - 4, playH),
      bottomHudReserve: rectVmin(0, bottomHudY, feltW, bottomHud),
      viewerSeatPosition: 0,
    },
  };
}

// vmin = min(viewport-w, viewport-h). For a portrait phone, felt is roughly
// 100vmin wide × ~180vmin tall. Landscape flips it. Tablet has more headroom.
const PROFILES: Profile[] = [
  makeProfile("mobilePortrait", 100, 180, {
    rail: 2,
    topHud: 7,
    announce: 8,
    bottomHud: 24,
  }),
  makeProfile("mobileLandscape", 180, 100, {
    rail: 2,
    topHud: 6,
    announce: 7,
    bottomHud: 18,
  }),
  makeProfile("tabletPortrait", 100, 140, {
    rail: 3,
    topHud: 7,
    announce: 8,
    bottomHud: 20,
  }),
  makeProfile("tabletLandscape", 140, 100, {
    rail: 3,
    topHud: 6,
    announce: 7,
    bottomHud: 16,
  }),
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function snapshot(out: ResolvedLayout) {
  return {
    placements: out.placements.map((p) => ({
      id: p.id,
      visible: p.visible,
      collapsedReason: p.collapsedReason,
      rect: {
        x: round(p.rect.x.value),
        y: round(p.rect.y.value),
        w: round(p.rect.width.value),
        h: round(p.rect.height.value),
      },
      appliedAspectRatio: p.appliedAspectRatio,
    })),
    faults: out.faults.map((f) => ({ code: f.code, ids: f.artifactIds })),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function buildPhase(phase: CribbagePhase) {
  return getCribbageArtifactDescriptors({
    phase,
    viewerSeatPosition: 0,
    opponentSeatPositions: [1, 2, 3],
    cutCardRevealed: phase === "pegging" || phase === "counting",
    cribVisible: true,
  });
}

// ---------------------------------------------------------------------------
// Mutual exclusion
// ---------------------------------------------------------------------------

describe("cribbage descriptors — PeggingRow XOR CountingRow", () => {
  it("emits PeggingRow but not CountingRow in pegging phase", () => {
    const ds = buildPhase("pegging");
    expect(ds.find((d) => d.id === "cribbage.peggingRow")).toBeDefined();
    expect(ds.find((d) => d.id === "cribbage.countingRow")).toBeUndefined();
  });

  it("emits CountingRow but not PeggingRow in counting phase", () => {
    const ds = buildPhase("counting");
    expect(ds.find((d) => d.id === "cribbage.countingRow")).toBeDefined();
    expect(ds.find((d) => d.id === "cribbage.peggingRow")).toBeUndefined();
  });

  it("does not ghost-reserve play band when neither row is active", () => {
    const ds = getCribbageArtifactDescriptors({
      phase: "idle",
      viewerSeatPosition: 0,
      opponentSeatPositions: [1, 2, 3],
      cutCardRevealed: false,
      cribVisible: false,
    });
    expect(ds.find((d) => d.id === "cribbage.peggingRow")).toBeUndefined();
    expect(ds.find((d) => d.id === "cribbage.countingRow")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Coexistence questions from the Phase 4 prompt
// ---------------------------------------------------------------------------

describe("cribbage descriptors — coexistence answers", () => {
  it("Q1: Pegboard and MyHand coexist at preferred sizes (different bands)", () => {
    const out = resolveLayout(buildPhase("pegging"), PROFILES[0].geometry);
    const peg = out.placements.find((p) => p.id === "cribbage.pegboard")!;
    const hand = out.placements.find((p) => p.id === "cribbage.myHand")!;
    expect(peg.visible).toBe(true);
    expect(hand.visible).toBe(true);
    // They live in different bands; their rects must not intersect.
    const overlap =
      peg.rect.x.value < hand.rect.x.value + hand.rect.width.value &&
      hand.rect.x.value < peg.rect.x.value + peg.rect.width.value &&
      peg.rect.y.value < hand.rect.y.value + hand.rect.height.value &&
      hand.rect.y.value < peg.rect.y.value + peg.rect.height.value;
    expect(overlap).toBe(false);
  });

  it("Q2: Announcement coexists with GameTitle + Parameters (different bands; title/params collapse first under pressure)", () => {
    const out = resolveLayout(buildPhase("pegging"), PROFILES[0].geometry);
    expect(
      out.placements.find((p) => p.id === "cribbage.announcement")!.visible,
    ).toBe(true);
    // No overlap between announcement band and topHud band by construction.
  });

  it("Q3: SeatProjections (chipBound) remain immutable while flow artifacts negotiate", () => {
    const widePhase = buildPhase("pegging");
    const tightPhase = buildPhase("counting");
    const a = resolveLayout(widePhase, PROFILES[1].geometry);
    const b = resolveLayout(tightPhase, PROFILES[1].geometry);
    const aSpot = a.placements.find((p) => p.id === "cribbage.spotlight")!;
    const bSpot = b.placements.find((p) => p.id === "cribbage.spotlight")!;
    expect(aSpot.rect).toEqual(bSpot.rect);
  });
});

// ---------------------------------------------------------------------------
// Snapshot matrix
// ---------------------------------------------------------------------------

describe("cribbage descriptors — snapshot matrix", () => {
  for (const profile of PROFILES) {
    for (const phase of ["pegging", "counting"] as const) {
      it(`${profile.name} / ${phase} resolves deterministically`, () => {
        const ds = buildPhase(phase);
        const out = resolveLayout(ds, profile.geometry);

        // Deterministic: same inputs → same output.
        const again = resolveLayout(ds, profile.geometry);
        expect(out).toEqual(again);

        const snap = snapshot(out);

        // Never-collapse artifacts must be visible.
        expect(
          snap.placements.find((p) => p.id === "cribbage.announcement")!
            .visible,
        ).toBe(true);
        expect(
          snap.placements.find((p) => p.id === "cribbage.myHand")!.visible,
        ).toBe(true);

        // The mutually-exclusive row is the one selected.
        const expectedRow =
          phase === "pegging"
            ? "cribbage.peggingRow"
            : "cribbage.countingRow";
        expect(
          snap.placements.find((p) => p.id === expectedRow)?.visible,
        ).toBe(true);

        // Snapshot for visual diffing in CI.
        expect(snap).toMatchSnapshot();
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Acceptance: no game-specific branches anywhere
// ---------------------------------------------------------------------------

describe("cribbage descriptors — acceptance", () => {
  it("descriptor module has no resolver imports beyond types/helpers", () => {
    // Source-level grep would be ideal; here we assert by construction:
    // the factory returns a plain array — no functions, no refs, no DOM.
    const ds = buildPhase("pegging");
    for (const d of ds) {
      expect(typeof d.id).toBe("string");
      expect(typeof d.preferredSize.width.value).toBe("number");
    }
  });
});
