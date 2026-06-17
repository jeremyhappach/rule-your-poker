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
  /**
   * Wave 5D — Phase 4. When true, `cribbage.pegboard` is emitted as a
   * `composeMode: 'anchored'` descriptor positioned off
   * `availableGameplayViewport` instead of as a play-band centerpiece.
   * Default false (legacy behavior). Other artifacts are unaffected.
   */
  anchoredPegboard?: boolean;
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

function pegboard(): ArtifactDescriptor {
  return {
    id: "cribbage.pegboard",
    owner: OWNER.cribbageTable,
    band: "play",
    // Centerpiece: felt-anchored, fixed-aspect, reserves space BEFORE flow
    // descriptors in the play band negotiate. The resolver clips against
    // structural safe areas (announcement / topHud / bottomHud / outerRail)
    // and emits `aspect_unhonorable` rather than silently distorting if the
    // 6:1 strip cannot fit.
    composeMode: "centerpiece",
    preferredSize: { width: vmin(60), height: vmin(10) },
    minimumSize: { width: vmin(50), height: vmin(8) },
    aspectRatio: 6, // 6:1 horizontal pegboard
    priority: 92,
    collapsePriority: "last",
    safeAreaDependencies: ["play"],
  };
}

/**
 * Wave 5D — Phase 4. Anchored pegboard descriptor. Positioned entirely
 * from `availableGameplayViewport` + anchor + size. No band, no preferred
 * size, no shrink/collapse, no group participation.
 */
function pegboardAnchored(): ArtifactDescriptor {
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
    anchorY: 0.4,
    anchorOrigin: "center",
    widthPct: 0.72,
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

function peggingRow(): ArtifactDescriptor {
  return {
    id: "cribbage.peggingRow",
    owner: OWNER.cribbageFelt,
    band: "play",
    composeMode: "flow",
    preferredSize: { width: vmin(50), height: vmin(9) },
    minimumSize: { width: vmin(40), height: vmin(7) },
    priority: 90,
    collapsePriority: "late",
    safeAreaDependencies: ["play", "bottomHud"],
  };
}

function countingRow(): ArtifactDescriptor {
  return {
    id: "cribbage.countingRow",
    owner: OWNER.cribbageCounting,
    band: "play",
    composeMode: "flow",
    preferredSize: { width: vmin(60), height: vmin(10) },
    minimumSize: { width: vmin(48), height: vmin(8) },
    priority: 92,
    collapsePriority: "late",
    safeAreaDependencies: ["play", "bottomHud"],
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

  // Play band — Pegboard is always present.
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

  // Seat-projected artifacts. Seat ring itself is structural — never emitted.
  for (const seat of opts.opponentSeatPositions) {
    ds.push(opponentCardBacks(seat));
  }
  if (opts.viewerSeatPosition !== null) {
    ds.push(spotlight(opts.viewerSeatPosition));
  }

  return ds;
}
