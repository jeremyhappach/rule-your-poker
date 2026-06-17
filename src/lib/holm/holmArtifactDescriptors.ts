/**
 * Wave 5D — Holm Artifact Descriptors.
 *
 * Three central anchored stages. The stage owns geometry; contents adapt.
 *
 *   - holm.communityCardsStage         (shared community cards + rabbit hunt anchor)
 *   - holm.lonePlayerTabledCardsStage  (persistent solo-vs-Chucky tabled cards)
 *   - holm.chuckyStage                 (devil avatar + Chucky cards in ONE stage)
 *
 * NOT migrated (intentionally — seat-projected / lifecycle / shell):
 *   - multiplayerShowdownCards (CanonicalSeatCluster + PlayerHand tightOverlap)
 *   - knockOverlay / ginOverlay equivalents
 *   - HUD, tabs, chrome, announcements
 */

import type { ArtifactDescriptor } from "@/lib/wave4LayoutResolver";
import { vmin } from "@/lib/wave4LayoutResolver";

const OWNER = { table: "MobileGameTable" } as const;

export interface HolmDescriptorOptions {
  communityCardsVisible: boolean;
  lonePlayerTabledCardsVisible: boolean;
  chuckyVisible: boolean;
}

function communityCardsStage(): ArtifactDescriptor {
  return {
    id: "holm.communityCardsStage",
    owner: OWNER.table,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 92,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.48,
    anchorOrigin: "center",
    widthPct: 0.8,
    aspectRatio: 0.8 / 0.16,
  };
}

function lonePlayerTabledCardsStage(): ArtifactDescriptor {
  return {
    id: "holm.lonePlayerTabledCardsStage",
    owner: OWNER.table,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 90,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.18,
    anchorOrigin: "center",
    widthPct: 0.75,
    aspectRatio: 0.75 / 0.16,
  };
}

function chuckyStage(): ArtifactDescriptor {
  return {
    id: "holm.chuckyStage",
    owner: OWNER.table,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 91,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.72,
    anchorOrigin: "center",
    widthPct: 0.8,
    aspectRatio: 0.8 / 0.18,
  };
}

export function getHolmArtifactDescriptors(
  opts: HolmDescriptorOptions,
): ArtifactDescriptor[] {
  const ds: ArtifactDescriptor[] = [];
  if (opts.communityCardsVisible) ds.push(communityCardsStage());
  if (opts.lonePlayerTabledCardsVisible) ds.push(lonePlayerTabledCardsStage());
  if (opts.chuckyVisible) ds.push(chuckyStage());
  return ds;
}
