/**
 * Wave 5D — Yahtzee Artifact Descriptors.
 *
 * Pure data factory mirroring `ginRummyArtifactDescriptors`. Every
 * gameplay artifact migrated in Wave 5D is `composeMode: "anchored"`
 * — no flow, no group, no min/preferred negotiation. The stage owns
 * position + size; contents adapt.
 *
 * Migrated this wave:
 *   - yahtzee.opponentDiceStage   (visible: rolling / opponent_turn)
 *   - yahtzee.scorecardStage      (visible: category_select / my turn)
 *
 * NOT migrated (intentionally — shell / lifecycle / seat-projected):
 *   - seat clusters, turn spotlight, dealer indicators,
 *     HUD, tabs, announcements, player dice tray (bottom pane).
 */

import type { ArtifactDescriptor } from "@/lib/wave4LayoutResolver";
import { vmin } from "@/lib/wave4LayoutResolver";

const OWNER = {
  table: "YahtzeeGameTable",
} as const;

export interface YahtzeeDescriptorOptions {
  /** Show the opponent-dice stage (rolling / opponent_turn). */
  opponentDiceVisible: boolean;
  /** Show the interactive scorecard stage (my-turn category select). */
  scorecardVisible: boolean;
}

function opponentDiceStage(): ArtifactDescriptor {
  return {
    id: "yahtzee.opponentDiceStage",
    owner: OWNER.table,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 90,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.42,
    anchorOrigin: "center",
    widthPct: 0.75,
    heightPct: 0.22,
  };
}

function scorecardStage(): ArtifactDescriptor {
  return {
    id: "yahtzee.scorecardStage",
    owner: OWNER.table,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 92,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.58,
    anchorOrigin: "center",
    widthPct: 0.8,
    heightPct: 0.32,
  };
}

export function getYahtzeeArtifactDescriptors(
  opts: YahtzeeDescriptorOptions,
): ArtifactDescriptor[] {
  const ds: ArtifactDescriptor[] = [];
  if (opts.opponentDiceVisible) ds.push(opponentDiceStage());
  if (opts.scorecardVisible) ds.push(scorecardStage());
  return ds;
}
