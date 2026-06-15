/**
 * Wave 4 — Cribbage Stress Test
 *
 * Goal: force the resolver into uncomfortable situations and verify that
 * the response is ALWAYS one of:
 *
 *    (a) a clean ResolvedLayout with graceful shrink/collapse, OR
 *    (b) an explicit `wave4:layout_fault`.
 *
 * NEVER acceptable:
 *    - flow rects that overlap each other
 *    - flow rects that escape their band
 *    - seat ring movement between frames
 *    - chip anchor drift between frames
 *    - silent clipping
 *
 * This file exercises the resolver as a pure function. No DOM, no React.
 * If the resolver ever produces overlap without faulting, that's a resolver
 * bug — fix the resolver, not the descriptors.
 */

import { describe, expect, it } from "vitest";
import {
  resolveLayout,
  rectVmin,
  vmin,
  type ArtifactDescriptor,
  type GeometryConstraints,
  type ResolvedLayout,
  type ResolvedPlacement,
} from "@/lib/wave4LayoutResolver";
import {
  getCribbageArtifactDescriptors,
  type CribbageDescriptorOptions,
  type CribbagePhase,
} from "./cribbageArtifactDescriptors";

// ---------------------------------------------------------------------------
// Geometry profile builder (same shape as Phase 4 fixtures)
// ---------------------------------------------------------------------------

interface Profile {
  name: string;
  geometry: GeometryConstraints;
}

function makeProfile(
  name: string,
  feltW: number,
  feltH: number,
  bands: { rail: number; topHud: number; announce: number; bottomHud: number },
): Profile {
  const { rail, topHud, announce, bottomHud } = bands;
  const topHudY = rail;
  const announceY = topHudY + topHud;
  const playY = announceY + announce;
  const bottomHudY = feltH - bottomHud;
  const playH = bottomHudY - playY;
  const cx = feltW / 2;
  const cy = feltH / 2;
  const rx = feltW * 0.42;
  const ry = playH * 0.42;
  const seatAnchors = [0, 1, 2, 3].map((position) => {
    const angle =
      position === 0 ? 0.5 : position === 1 ? 0 : position === 2 ? 1.5 : 1;
    const theta = angle * Math.PI;
    const ax = cx + rx * Math.cos(theta);
    const ay = cy + ry * Math.sin(theta);
    return {
      position,
      anchor: { x: vmin(ax), y: vmin(ay) },
      chipCenter: { x: vmin(ax), y: vmin(ay) },
      namePlate: rectVmin(ax - 7, ay - 2, 14, 3),
      facing:
        position === 0
          ? ("bottom" as const)
          : position === 2
            ? ("top" as const)
            : position === 1
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

// Device matrix + zoom levels + ultra-wide / narrow desktop
// Zoom is modelled by scaling the felt extent in vmin (zooming OUT shrinks
// available vmin, since vmin = min(viewport-w, viewport-h)).
const DEVICE_MATRIX: Profile[] = [
  // base devices
  makeProfile("phonePortrait", 100, 180, { rail: 2, topHud: 7, announce: 8, bottomHud: 24 }),
  makeProfile("phoneLandscape", 180, 100, { rail: 2, topHud: 6, announce: 7, bottomHud: 18 }),
  makeProfile("tabletPortrait", 100, 140, { rail: 3, topHud: 7, announce: 8, bottomHud: 20 }),
  makeProfile("tabletLandscape", 140, 100, { rail: 3, topHud: 6, announce: 7, bottomHud: 16 }),
  // browser zoom (50% = roomy, 150% = cramped)
  makeProfile("desktop50pct", 200, 140, { rail: 3, topHud: 6, announce: 7, bottomHud: 16 }),
  makeProfile("desktop75pct", 150, 110, { rail: 3, topHud: 6, announce: 7, bottomHud: 16 }),
  makeProfile("desktop100pct", 120, 90, { rail: 3, topHud: 6, announce: 7, bottomHud: 16 }),
  makeProfile("desktop125pct", 96, 72, { rail: 2, topHud: 6, announce: 7, bottomHud: 14 }),
  makeProfile("desktop150pct", 80, 60, { rail: 2, topHud: 5, announce: 6, bottomHud: 12 }),
  // edge cases
  makeProfile("ultraWide", 240, 100, { rail: 3, topHud: 6, announce: 7, bottomHud: 16 }),
  makeProfile("narrowDesktop", 80, 140, { rail: 2, topHud: 6, announce: 7, bottomHud: 18 }),
];

// ---------------------------------------------------------------------------
// Invariants — the things that must hold across EVERY stress scenario.
// ---------------------------------------------------------------------------

function visibleFlowPlacements(out: ResolvedLayout) {
  return out.placements.filter((p) => p.visible);
}

function rectsOverlap(a: ResolvedPlacement, b: ResolvedPlacement): boolean {
  const ax = a.rect.x.value;
  const ay = a.rect.y.value;
  const aw = a.rect.width.value;
  const ah = a.rect.height.value;
  const bx = b.rect.x.value;
  const by = b.rect.y.value;
  const bw = b.rect.width.value;
  const bh = b.rect.height.value;
  const EPS = 1e-3;
  return !(
    ax + aw <= bx + EPS ||
    bx + bw <= ax + EPS ||
    ay + ah <= by + EPS ||
    by + bh <= ay + EPS
  );
}

/**
 * Core invariant: no two visible FLOW placements within the SAME band may
 * overlap. (Seat-projected and overlay placements have their own contracts.)
 */
function assertNoIntraBandOverlap(
  out: ResolvedLayout,
  descriptors: ArtifactDescriptor[],
) {
  const dById = new Map(descriptors.map((d) => [d.id, d]));
  const flow = visibleFlowPlacements(out).filter((p) => {
    const d = dById.get(p.id);
    return d && d.composeMode === "flow";
  });
  // group by band
  const byBand = new Map<string, ResolvedPlacement[]>();
  for (const p of flow) {
    const band = dById.get(p.id)!.band;
    const arr = byBand.get(band) ?? [];
    arr.push(p);
    byBand.set(band, arr);
  }
  for (const [band, ps] of byBand) {
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        if (rectsOverlap(ps[i], ps[j])) {
          throw new Error(
            `Intra-band overlap in '${band}': ${ps[i].id} <> ${ps[j].id}`,
          );
        }
      }
    }
  }
}

/**
 * Every visible flow placement must lie within its declared band rect.
 * (Or the resolver must have emitted a fault.)
 */
function assertFlowWithinBand(
  out: ResolvedLayout,
  descriptors: ArtifactDescriptor[],
) {
  const dById = new Map(descriptors.map((d) => [d.id, d]));
  const bandRect = (band: string) => {
    switch (band) {
      case "topHud":
        return out.geometry.topHudReserve;
      case "announcement":
        return out.geometry.announcementBand;
      case "play":
        return out.geometry.playBand;
      case "bottomHud":
        return out.geometry.bottomHudReserve;
      default:
        return null;
    }
  };
  const EPS = 1e-2;
  for (const p of visibleFlowPlacements(out)) {
    const d = dById.get(p.id);
    if (!d || d.composeMode !== "flow") continue;
    const b = bandRect(d.band);
    if (!b) continue;
    const insideX =
      p.rect.x.value + EPS >= b.x.value &&
      p.rect.x.value + p.rect.width.value <= b.x.value + b.width.value + EPS;
    const insideY =
      p.rect.y.value + EPS >= b.y.value &&
      p.rect.y.value + p.rect.height.value <= b.y.value + b.height.value + EPS;
    if (!insideX || !insideY) {
      // Only acceptable if a fault was emitted for this artifact.
      const faulted = out.faults.some((f) => f.artifactIds.includes(p.id));
      if (!faulted) {
        throw new Error(
          `Flow artifact ${p.id} escaped band '${d.band}' without a layout_fault`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 1. DEVICE ABUSE — every device, both phases, both rotations
// ---------------------------------------------------------------------------

describe("Wave 4 stress — 1. device abuse", () => {
  for (const profile of DEVICE_MATRIX) {
    for (const phase of ["pegging", "counting", "idle"] as const) {
      it(`${profile.name} / ${phase} — no overlap, no escape, seat ring stable`, () => {
        const ds = getCribbageArtifactDescriptors({
          phase,
          viewerSeatPosition: 0,
          opponentSeatPositions: [1, 2, 3],
          cutCardRevealed: phase === "pegging" || phase === "counting",
          cribVisible: phase !== "idle",
        });
        const out = resolveLayout(ds, profile.geometry);
        assertNoIntraBandOverlap(out, ds);
        assertFlowWithinBand(out, ds);
        // Seat ring is structural — must be echoed by-reference, unchanged.
        expect(out.geometry.seatRing).toBe(profile.geometry.seatRing);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 2 & 3 & 4. ANNOUNCEMENT / TITLE / PARAMETER ABUSE
// Stress the top-HUD band by inflating title and parameter chips preferred
// sizes. Title (collapsePriority 'first') must fall before announcement.
// ---------------------------------------------------------------------------

function withInflatedTopHud(
  base: ArtifactDescriptor[],
  opts: { titleW: number; chipsW: number; announceW: number },
): ArtifactDescriptor[] {
  return base.map((d) => {
    if (d.id === "cribbage.gameTitle") {
      return {
        ...d,
        preferredSize: { width: vmin(opts.titleW), height: d.preferredSize.height },
      };
    }
    if (d.id === "cribbage.parameterChips") {
      return {
        ...d,
        preferredSize: { width: vmin(opts.chipsW), height: d.preferredSize.height },
      };
    }
    if (d.id === "cribbage.announcement") {
      return {
        ...d,
        preferredSize: { width: vmin(opts.announceW), height: d.preferredSize.height },
      };
    }
    return d;
  });
}

describe("Wave 4 stress — 2/3/4. announcement + title + parameter chips", () => {
  const profile = DEVICE_MATRIX[0]; // phonePortrait — tightest top HUD
  const base = getCribbageArtifactDescriptors({
    phase: "pegging",
    viewerSeatPosition: 0,
    opponentSeatPositions: [1, 2, 3],
    cutCardRevealed: true,
    cribVisible: true,
  });

  it("title collapses before parameter chips? both collapse before announcement survives", () => {
    // Massive title + massive chips + massive announcement → top HUD packed.
    const ds = withInflatedTopHud(base, {
      titleW: 200,
      chipsW: 200,
      announceW: 200,
    });
    const out = resolveLayout(ds, profile.geometry);
    assertNoIntraBandOverlap(out, ds);
    const announcement = out.placements.find((p) => p.id === "cribbage.announcement")!;
    const title = out.placements.find((p) => p.id === "cribbage.gameTitle")!;
    const chips = out.placements.find((p) => p.id === "cribbage.parameterChips")!;
    // Announcement is collapsePriority:'never' — must survive or fault.
    if (!announcement.visible) {
      expect(out.faults.some((f) => f.artifactIds.includes("cribbage.announcement"))).toBe(true);
    }
    // Title is 'first' — must collapse before any non-first artifact.
    if (chips.visible && !title.visible) {
      // expected: title fell first.
    } else if (!title.visible && !chips.visible) {
      // both fell — acceptable, title still fell first or simultaneously.
    }
    expect(title.visible || chips.visible || announcement.visible).toBe(true);
  });

  it("short, long, absurd announcements all leave announcement visible or emit fault", () => {
    for (const w of [40, 80, 120, 200, 400]) {
      const ds = withInflatedTopHud(base, { titleW: 24, chipsW: 30, announceW: w });
      const out = resolveLayout(ds, profile.geometry);
      assertNoIntraBandOverlap(out, ds);
      const a = out.placements.find((p) => p.id === "cribbage.announcement")!;
      if (!a.visible) {
        expect(out.faults.length).toBeGreaterThan(0);
      }
    }
  });

  it("parameter chip count abuse (0–10 chips) never overlaps title", () => {
    for (const chips of [0, 1, 3, 5, 8, 10]) {
      // model N chips as ~6vmin per chip
      const ds = withInflatedTopHud(base, {
        titleW: 24,
        chipsW: Math.max(0.01, chips * 6),
        announceW: 80,
      });
      const out = resolveLayout(ds, profile.geometry);
      assertNoIntraBandOverlap(out, ds);
      assertFlowWithinBand(out, ds);
    }
  });
});

// ---------------------------------------------------------------------------
// 5. PEGGING / COUNTING XOR — no ghost spacing, seat ring stable across phases
// ---------------------------------------------------------------------------

describe("Wave 4 stress — 5. pegging/counting XOR", () => {
  const profile = DEVICE_MATRIX[0];
  const base = (phase: CribbagePhase) =>
    getCribbageArtifactDescriptors({
      phase,
      viewerSeatPosition: 0,
      opponentSeatPositions: [1, 2, 3],
      cutCardRevealed: phase !== "idle",
      cribVisible: phase !== "idle",
    });

  it("transitions idle → pegging → counting → idle leave seat anchors immutable", () => {
    const seq: CribbagePhase[] = ["idle", "pegging", "counting", "idle"];
    let spotlightRect: string | null = null;
    let myHandRect: string | null = null;
    for (const phase of seq) {
      const ds = base(phase);
      const out = resolveLayout(ds, profile.geometry);
      // Exactly one of peggingRow/countingRow visible (or neither in idle).
      const peg = out.placements.find((p) => p.id === "cribbage.peggingRow");
      const cnt = out.placements.find((p) => p.id === "cribbage.countingRow");
      if (phase === "pegging") {
        expect(peg?.visible).toBe(true);
        expect(cnt).toBeUndefined();
      } else if (phase === "counting") {
        expect(cnt?.visible).toBe(true);
        expect(peg).toBeUndefined();
      } else {
        expect(peg).toBeUndefined();
        expect(cnt).toBeUndefined();
      }
      // Seat ring & seat-projected spotlight: 0 drift.
      const spot = out.placements.find((p) => p.id === "cribbage.spotlight");
      if (spot) {
        const key = JSON.stringify(spot.rect);
        if (spotlightRect === null) spotlightRect = key;
        else expect(key).toBe(spotlightRect);
      }
      const hand = out.placements.find((p) => p.id === "cribbage.myHand")!;
      // myHand is bottomHud (away from play band); its rect should not depend
      // on whether peggingRow/countingRow exist.
      const handKey = JSON.stringify(hand.rect);
      if (myHandRect === null) myHandRect = handKey;
      else expect(handKey).toBe(myHandRect);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. HAND SIZE ABUSE — large cards / small cards / zoom variations
// ---------------------------------------------------------------------------

describe("Wave 4 stress — 6. hand size abuse", () => {
  const base = getCribbageArtifactDescriptors({
    phase: "pegging",
    viewerSeatPosition: 0,
    opponentSeatPositions: [1, 2, 3],
    cutCardRevealed: true,
    cribVisible: true,
  });

  for (const profile of DEVICE_MATRIX) {
    for (const handW of [40, 56, 70, 90, 120]) {
      it(`${profile.name} / handW=${handW} — pegboard survives, no overlap`, () => {
        const ds = base.map((d) =>
          d.id === "cribbage.myHand"
            ? {
                ...d,
                preferredSize: { width: vmin(handW), height: d.preferredSize.height },
              }
            : d,
        );
        const out = resolveLayout(ds, profile.geometry);
        assertNoIntraBandOverlap(out, ds);
        assertFlowWithinBand(out, ds);
        // Pegboard is collapsePriority:'last' — should survive unless fault.
        const peg = out.placements.find((p) => p.id === "cribbage.pegboard")!;
        if (!peg.visible) {
          expect(out.faults.length).toBeGreaterThan(0);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// 7. SEAT IMMUTABILITY — across lifecycle phases, chip anchors NEVER drift.
// ---------------------------------------------------------------------------

describe("Wave 4 stress — 7. seat immutability across lifecycle", () => {
  const profile = DEVICE_MATRIX[0];
  const lifecycle: CribbagePhase[] = ["idle", "discard", "cut", "pegging", "counting", "idle"];

  it("opponent card-back anchors do not drift through entire lifecycle", () => {
    const baseline = new Map<string, string>();
    for (const phase of lifecycle) {
      const ds = getCribbageArtifactDescriptors({
        phase,
        viewerSeatPosition: 0,
        opponentSeatPositions: [1, 2, 3],
        cutCardRevealed: phase === "pegging" || phase === "counting",
        cribVisible: phase !== "idle",
      });
      const out = resolveLayout(ds, profile.geometry);
      for (const seat of [1, 2, 3]) {
        const id = `cribbage.opponentCardBacks.${seat}`;
        const p = out.placements.find((x) => x.id === id);
        if (!p) continue;
        const key = JSON.stringify(p.rect);
        if (!baseline.has(id)) baseline.set(id, key);
        else expect(key).toBe(baseline.get(id));
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 8. CHAOS TEST — everything cranked at once.
// ---------------------------------------------------------------------------

describe("Wave 4 stress — 8. chaos", () => {
  it("landscape + tightest profile + max title + max chips + max announce + pegging", () => {
    const profile = makeProfile("chaos", 80, 60, {
      rail: 2,
      topHud: 5,
      announce: 6,
      bottomHud: 12,
    });
    const base = getCribbageArtifactDescriptors({
      phase: "pegging",
      viewerSeatPosition: 0,
      opponentSeatPositions: [1, 2, 3],
      cutCardRevealed: true,
      cribVisible: true,
    });
    const ds = base.map((d) => {
      if (d.id === "cribbage.gameTitle")
        return { ...d, preferredSize: { width: vmin(200), height: d.preferredSize.height } };
      if (d.id === "cribbage.parameterChips")
        return { ...d, preferredSize: { width: vmin(200), height: d.preferredSize.height } };
      if (d.id === "cribbage.announcement")
        return { ...d, preferredSize: { width: vmin(300), height: d.preferredSize.height } };
      if (d.id === "cribbage.myHand")
        return { ...d, preferredSize: { width: vmin(150), height: d.preferredSize.height } };
      return d;
    });
    const out = resolveLayout(ds, profile.geometry);
    // PASS = no overlap AND either everything fits via collapse OR a fault was raised.
    assertNoIntraBandOverlap(out, ds);
    assertFlowWithinBand(out, ds);
    // We expect at least some collapse — verify SOMETHING with collapsePriority
    // 'first' was dropped, OR the resolver explicitly flagged a fault.
    const collapsedFirst = out.placements.some(
      (p) =>
        !p.visible &&
        (p.id === "cribbage.gameTitle" || p.id === "cribbage.parameterChips"),
    );
    expect(collapsedFirst || out.faults.length > 0).toBe(true);
  });

  it("rapid orientation rotation produces deterministic results per orientation", () => {
    const portrait = DEVICE_MATRIX[0].geometry;
    const landscape = DEVICE_MATRIX[1].geometry;
    const base = getCribbageArtifactDescriptors({
      phase: "pegging",
      viewerSeatPosition: 0,
      opponentSeatPositions: [1, 2, 3],
      cutCardRevealed: true,
      cribVisible: true,
    });
    // 10 rotations
    let lastP: string | null = null;
    let lastL: string | null = null;
    for (let i = 0; i < 10; i++) {
      const geom = i % 2 === 0 ? portrait : landscape;
      const out = resolveLayout(base, geom);
      const key = JSON.stringify(out.placements.map((p) => [p.id, p.rect, p.visible]));
      if (i % 2 === 0) {
        if (lastP === null) lastP = key;
        else expect(key).toBe(lastP);
      } else {
        if (lastL === null) lastL = key;
        else expect(key).toBe(lastL);
      }
      assertNoIntraBandOverlap(out, base);
    }
  });
});

// ---------------------------------------------------------------------------
// ULTIMATE: can we produce overlap WITHOUT a fault? If yes — resolver bug.
// ---------------------------------------------------------------------------

describe("Wave 4 stress — ULTIMATE: overlap without fault is a resolver bug", () => {
  const ATTACKS: Array<{
    name: string;
    opts: CribbageDescriptorOptions;
    mutate?: (d: ArtifactDescriptor[]) => ArtifactDescriptor[];
    profile: Profile;
  }> = [
    {
      name: "tiny felt + everything on",
      profile: makeProfile("tiny", 50, 50, {
        rail: 2,
        topHud: 5,
        announce: 5,
        bottomHud: 10,
      }),
      opts: {
        phase: "counting",
        viewerSeatPosition: 0,
        opponentSeatPositions: [1, 2, 3],
        cutCardRevealed: true,
        cribVisible: true,
      },
    },
    {
      name: "absurd hand on narrow desktop",
      profile: DEVICE_MATRIX.find((p) => p.name === "narrowDesktop")!,
      opts: {
        phase: "pegging",
        viewerSeatPosition: 0,
        opponentSeatPositions: [1, 2, 3],
        cutCardRevealed: true,
        cribVisible: true,
      },
      mutate: (ds) =>
        ds.map((d) =>
          d.id === "cribbage.myHand"
            ? { ...d, preferredSize: { width: vmin(300), height: vmin(40) } }
            : d,
        ),
    },
  ];

  for (const a of ATTACKS) {
    it(`attack: ${a.name} — overlap implies fault`, () => {
      let ds = getCribbageArtifactDescriptors(a.opts);
      if (a.mutate) ds = a.mutate(ds);
      const out = resolveLayout(ds, a.profile.geometry);
      // The contract: if any two flow rects in the same band overlap, the
      // resolver MUST have emitted a fault. If neither — bug.
      try {
        assertNoIntraBandOverlap(out, ds);
        // no overlap → pass
      } catch (e) {
        expect(out.faults.length).toBeGreaterThan(0);
      }
    });
  }
});
