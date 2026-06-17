/**
 * Wave 5D — Gin Rummy Artifact Descriptors.
 *
 * Pure data factory mirroring `cribbageArtifactDescriptors`. Every
 * gameplay artifact migrated in Wave 5D is `composeMode: "anchored"`
 * — no flow, no group, no minimum/preferred negotiation. Position
 * and size are independent; contents adapt to the assigned rect.
 *
 * Migrated this wave:
 *   - gin.pegboard
 *   - gin.stockDiscardGroup
 *   - gin.turnIndicator
 *   - gin.knockDisplay
 *
 * NOT migrated (intentionally — shell / lifecycle / seat-projected):
 *   - gin.turnSpotlight
 *   - gin.knockOverlay / gin.ginOverlay
 *   - gin.opponentCardBacksCluster
 *   - gin.opponentDrawAnimation
 */

import type { ArtifactDescriptor } from "@/lib/wave4LayoutResolver";
import { vmin } from "@/lib/wave4LayoutResolver";

export type GinRummyPhase =
  | "first_draw"
  | "playing"
  | "knocking"
  | "laying_off"
  | "scoring"
  | "complete"
  | "idle";

export interface GinRummyDescriptorOptions {
  phase: GinRummyPhase;
  /** True for any phase that hides the stock/discard piles. */
  hidePiles: boolean;
  /** True while a knock/laying-off/scoring/complete sequence is on screen. */
  knockDisplayVisible: boolean;
}

const OWNER = {
  felt: "GinRummyFeltContent",
  knock: "GinRummyKnockDisplay",
} as const;

function pegboard(): ArtifactDescriptor {
  return {
    id: "gin.pegboard",
    owner: OWNER.felt,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 80,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.2,
    anchorOrigin: "center",
    widthPct: 0.7,
    aspectRatio: 8,
  };
}

function stockDiscardGroup(): ArtifactDescriptor {
  return {
    id: "gin.stockDiscardGroup",
    owner: OWNER.felt,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 90,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.46,
    anchorOrigin: "center",
    widthPct: 0.36,
    aspectRatio: 1.4,
  };
}

function turnIndicator(): ArtifactDescriptor {
  return {
    id: "gin.turnIndicator",
    owner: OWNER.felt,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 70,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.72,
    anchorOrigin: "center",
    widthPct: 0.8,
    aspectRatio: 0.8 / 0.06,
  };
}

function knockDisplay(): ArtifactDescriptor {
  return {
    id: "gin.knockDisplay",
    owner: OWNER.knock,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 85,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.55,
    anchorOrigin: "center",
    widthPct: 0.95,
    heightPct: 0.7,
  };
}

export function getGinRummyArtifactDescriptors(
  opts: GinRummyDescriptorOptions,
): ArtifactDescriptor[] {
  const ds: ArtifactDescriptor[] = [];
  ds.push(pegboard());
  if (!opts.hidePiles) {
    ds.push(stockDiscardGroup());
    ds.push(turnIndicator());
  }
  if (opts.knockDisplayVisible) {
    ds.push(knockDisplay());
  }
  return ds;
}
