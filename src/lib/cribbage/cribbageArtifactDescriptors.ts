/**
 * Wave 4 — Phase 4
 * Cribbage Artifact Descriptors (pure data).
 *
 * Sources:
 *   - .lovable/wave4-artifact-layout-engine/phase1-contract-v2-and-inventory.md
 *   - .lovable/wave4-artifact-layout-engine/phase2-resolver-spec.md
 *
 * Discipline:
 *   - Pure data factory. No React, no DOM, no geometry math, no viewport reads.
 *   - No special casing. If the resolver cannot satisfy Cribbage, the resolver
 *     emits `wave4:layout_fault` and the resolver gets improved — not Cribbage.
 *   - PeggingRow XOR CountingRow: mutual exclusion is enforced by emitting
 *     exactly one of the two based on `opts.phase`. Neither holds a ghost
 *     reservation when the other is active.
 *   - Seat ring is a GeometryConstraint (Wave 3). It is never emitted as a
 *     descriptor. Seat-projected artifacts publish `seatBound` / `chipBound`
 *     descriptors that read seat anchors at resolve time.
 */

import type { ArtifactDescriptor } from "@/lib/wave4LayoutResolver";
import { vmin } from "@/lib/wave4LayoutResolver";

export type CribbagePhase =
  | "idle" // pre-deal, post-game, etc.
  | "discard"
  | "cut"
  | "pegging"
  | "counting";

export interface CribbageDescriptorOptions {
  /** Phase drives PeggingRow XOR CountingRow selection. */
  phase: CribbagePhase;
  /** Viewer's seat — used for `chipBound: 'self'` resolution by the resolver. */
  viewerSeatPosition: number | null;
  /** Opponent seat positions in the canonical seat ring (Wave 3). */
  opponentSeatPositions: ReadonlyArray<number>;
  /**
   * True while the cut card is revealed and the crib has not been turned in.
   * When false, the cut card descriptor is omitted (not ghost-reserved).
   */
  cutCardRevealed: boolean;
  /**
   * True once the crib pile exists (post-discard) and not yet returned to dealer.
   */
  cribVisible: boolean;
}

// ---------------------------------------------------------------------------
// Per-artifact descriptor builders. Each builder returns a single descriptor
// (or null when the artifact is not active in this frame).
//
// All sizes come straight from Phase 1 inventory v2 — they are stated as the
// game wants to be displayed, not as the resolver demands.
// ---------------------------------------------------------------------------

const OWNER = {
  shellChrome: "ShellHudChrome",
  cribbageHeader: "CribbageMobileGameTable.header",
  cribbageTable: "CribbageMobileGameTable",
  cribbageFelt: "CribbageFeltContent",
  cribbageCut: "CribbageCutCardReveal",
  cribbageCards: "CribbageMobileCardsTab",
  cribbageCounting: "CribbageCountingPhase",
  cribbageOpponent: "CanonicalOpponentSeat",
  lifecycle: "LifecycleAnnouncement",
  turnSpotlight: "TurnSpotlight",
} as const;

function announcement(): ArtifactDescriptor {
  return {
    id: "cribbage.announcement",
    owner: OWNER.lifecycle,
    band: "announcement",
    composeMode: "flow",
    preferredSize: { width: vmin(80), height: vmin(8) },
    minimumSize: { width: vmin(70), height: vmin(7) },
    priority: 98,
    collapsePriority: "never",
    safeAreaDependencies: ["announcement"],
  };
}

function topHud(): ArtifactDescriptor {
  return {
    id: "cribbage.topHud",
    owner: OWNER.shellChrome,
    band: "topHud",
    composeMode: "flow",
    preferredSize: { width: vmin(100), height: vmin(7) },
    minimumSize: { width: vmin(100), height: vmin(6) },
    priority: 80,
    collapsePriority: "late",
    safeAreaDependencies: ["topHud"],
  };
}

function gameTitle(): ArtifactDescriptor {
  return {
    id: "cribbage.gameTitle",
    owner: OWNER.cribbageHeader,
    band: "topHud",
    composeMode: "flow",
    preferredSize: { width: vmin(24), height: vmin(5) },
    minimumSize: { width: vmin(16), height: vmin(4) },
    priority: 40,
    collapsePriority: "first",
    safeAreaDependencies: ["topHud"],
  };
}

function parameterChips(): ArtifactDescriptor {
  return {
    id: "cribbage.parameterChips",
    owner: OWNER.shellChrome,
    band: "topHud",
    composeMode: "flow",
    preferredSize: { width: vmin(30), height: vmin(4) },
    minimumSize: { width: vmin(22), height: vmin(3) },
    priority: 35,
    collapsePriority: "first",
    safeAreaDependencies: ["topHud"],
  };
}

function bottomHud(): ArtifactDescriptor {
  return {
    id: "cribbage.bottomHud",
    owner: OWNER.shellChrome,
    band: "bottomHud",
    composeMode: "flow",
    preferredSize: { width: vmin(100), height: vmin(12) },
    minimumSize: { width: vmin(100), height: vmin(10) },
    priority: 80,
    collapsePriority: "late",
    safeAreaDependencies: ["bottomHud"],
  };
}

function tabs(): ArtifactDescriptor {
  return {
    id: "cribbage.tabs",
    owner: OWNER.cribbageTable,
    band: "bottomHud",
    composeMode: "flow",
    preferredSize: { width: vmin(60), height: vmin(5) },
    minimumSize: { width: vmin(48), height: vmin(4) },
    priority: 55,
    collapsePriority: "early",
    safeAreaDependencies: ["bottomHud"],
  };
}

function myHand(): ArtifactDescriptor {
  return {
    id: "cribbage.myHand",
    owner: OWNER.cribbageCards,
    band: "bottomHud",
    composeMode: "flow",
    preferredSize: { width: vmin(70), height: vmin(14) },
    minimumSize: { width: vmin(56), height: vmin(11) },
    // per-card 3:4 but the row aspect averages out — leave unconstrained.
    priority: 95,
    collapsePriority: "never",
    safeAreaDependencies: ["bottomHud"],
  };
}

/**
 * Wave 5D — Pegboard Graduation. The pegboard is positioned entirely
 * from `availableGameplayViewport` + anchor + size. No band, no preferred
 * size, no shrink/collapse, no group participation.
 */
function pegboard(): ArtifactDescriptor {
  return {
    id: "cribbage.pegboard",
    owner: OWNER.cribbageTable,
    composeMode: "anchored",
    // Required by the type but ignored by the anchored stage:
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 92,
    collapsePriority: "never",
    // Anchored fields:
    anchorX: 0.5,
    anchorY: 0.5,
    anchorOrigin: "center",
    widthPct: 0.8,
    aspectRatio: 6,
  };
}

function crib(): ArtifactDescriptor {
  return {
    id: "cribbage.crib",
    owner: OWNER.cribbageFelt,
    band: "play",
    composeMode: "flow",
    preferredSize: { width: vmin(6), height: vmin(8) },
    minimumSize: { width: vmin(5), height: vmin(7) },
    aspectRatio: 3 / 4,
    priority: 60,
    collapsePriority: "mid",
    safeAreaDependencies: ["play", "announcement"],
  };
}

function cutCard(): ArtifactDescriptor {
  return {
    id: "cribbage.cutCard",
    owner: OWNER.cribbageCut,
    band: "play",
    composeMode: "flow",
    preferredSize: { width: vmin(6), height: vmin(8) },
    minimumSize: { width: vmin(5), height: vmin(7) },
    aspectRatio: 3 / 4,
    priority: 75,
    collapsePriority: "mid",
    safeAreaDependencies: ["play"],
  };
}

/**
 * Wave 5D — CribCutGroup Migration.
 *
 * The crib pile + cut-card row is positioned as a single anchored artifact.
 * The group owns the anchor (anchorY = 0.30, anchorOrigin = center). Its
 * children (crib pile, cut card) render at intrinsic size, vertically
 * centered inside the assigned rect, so that their visual centers all lie
 * on the y = 0.30 gridline of availableGameplayViewport.
 *
 * Dimensions: widthPct + aspectRatio approximate the existing rendered
 * footprint (~16vmin × ~15vmin in portrait). They are NOT tuned beyond
 * "preserve current footprint".
 */
function cribCutGroup(): ArtifactDescriptor {
  return {
    id: "cribbage.cribCutGroup",
    owner: OWNER.cribbageFelt,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 80,
    collapsePriority: "mid",
    anchorX: 0.5,
    anchorY: 0.3,
    anchorOrigin: "center",
    widthPct: 0.2,
    aspectRatio: 1.2,
  };
}

/**
 * Wave 5D — PeggingRow Anchored Migration.
 *
 * The pegging row is positioned entirely from
 *   availableGameplayViewport + anchor + size.
 * No band, no preferred size, no shrink/collapse, no group participation.
 * Row rect is authoritative; cards adapt to fit.
 */
function peggingRow(): ArtifactDescriptor {
  return {
    id: "cribbage.peggingRow",
    owner: OWNER.cribbageFelt,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 90,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.74,
    anchorOrigin: "center",
    widthPct: 0.85,
    aspectRatio: 0.85 / 0.18,
  };
}

/**
 * Wave 6 — Counting Row graduated from `flow` to `anchored` so the Geometry
 * Lab can expose the full anchored artifact contract (anchorX/Y, origin,
 * width/aspect). Defaults seeded from the previously resolved flow rect
 * (~60vmin × 10vmin, centered in the play band, see test snapshots in
 * `cribbageArtifactDescriptors.test.ts.snap` — w∈{60, 64.35}, h≈10,
 * y∈{43.5, 45} which projects to anchorY ≈ 0.5 of availableGameplayViewport
 * with anchorOrigin=center). Aspect 60/10 = 6 mirrors the prior preferredSize.
 *
 * No DOM today consumes the resolved counting-row rect (the renderer flows
 * inline inside CribbageCountingPhase). Migrating composeMode therefore has
 * no visible effect on the running table; the change exists to surface
 * counting-row geometry in the Lab on the standard anchored editor.
 */
function countingRow(): ArtifactDescriptor {
  return {
    id: "cribbage.countingRow",
    owner: OWNER.cribbageCounting,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 92,
    collapsePriority: "late",
    anchorX: 0.5,
    anchorY: 0.5,
    anchorOrigin: "center",
    widthPct: 0.6,
    aspectRatio: 6,
  };
}

// --- Seat-projected (resolver reads seat anchors from GeometryConstraints) ---

function opponentCardBacks(seatPosition: number): ArtifactDescriptor {
  return {
    id: `cribbage.opponentCardBacks.${seatPosition}`,
    owner: OWNER.cribbageOpponent,
    band: "seatProjected",
    composeMode: "chipBound",
    chipAnchorRef: seatPosition,
    preferredSize: { width: vmin(14), height: vmin(8) },
    minimumSize: { width: vmin(10), height: vmin(6) },
    priority: 70,
    collapsePriority: "mid",
  };
}

function spotlight(viewerSeat: number): ArtifactDescriptor {
  return {
    id: "cribbage.spotlight",
    owner: OWNER.turnSpotlight,
    band: "seatProjected",
    composeMode: "chipBound",
    chipAnchorRef: "self",
    // viewerSeat is encoded via viewerSeatPosition in GeometryConstraints —
    // recorded here only to make the descriptor self-describing in fixtures.
    seatPosition: viewerSeat,
    preferredSize: { width: vmin(18), height: vmin(18) },
    minimumSize: { width: vmin(12), height: vmin(12) },
    priority: 88,
    collapsePriority: "last",
  };
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function getCribbageArtifactDescriptors(
  opts: CribbageDescriptorOptions,
): ArtifactDescriptor[] {
  const ds: ArtifactDescriptor[] = [];

  // Always-on chrome.
  ds.push(announcement());
  ds.push(topHud());
  ds.push(gameTitle());
  ds.push(parameterChips());
  ds.push(bottomHud());
  ds.push(tabs());
  ds.push(myHand());

  // Play band — Pegboard is always present (anchored).
  ds.push(pegboard());

  // Mutual exclusion: PeggingRow XOR CountingRow. The non-active one is not
  // emitted — no ghost reservation in the play band.
  if (opts.phase === "counting") {
    ds.push(countingRow());
  } else if (opts.phase === "pegging") {
    ds.push(peggingRow());
  }

  // Crib & cut card are gated on game state, not on phase.
  if (opts.cribVisible) ds.push(crib());
  if (opts.cutCardRevealed) ds.push(cutCard());

  // Wave 5D — CribCutGroup anchored artifact (owns positioning of the
  // crib/cut row). Emitted whenever either child would be visible.
  if (opts.cribVisible || opts.cutCardRevealed) ds.push(cribCutGroup());

  // Seat-projected artifacts. Seat ring itself is structural — never emitted.
  for (const seat of opts.opponentSeatPositions) {
    ds.push(opponentCardBacks(seat));
  }
  if (opts.viewerSeatPosition !== null) {
    ds.push(spotlight(opts.viewerSeatPosition));
  }

  return ds;
}
