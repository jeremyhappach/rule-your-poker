/**
 * Wave 5D — 3-5-7 Artifact Descriptors.
 *
 * Single central anchored stage for 3-5-7:
 *
 *   - threeFiveSeven.winnerTabledCardsStage
 *       Owns the winner's tabled cards through the entire win
 *       lifecycle (winner determined → cards table → reveal → pot
 *       animations → leg animations → round complete → teardown).
 *       The stage stays mounted across all phases; presentation
 *       changes, geometry does not.
 *
 * NOT migrated (intentionally — seat-projected / lifecycle / shell):
 *   - render357CanonicalSeat per-seat cards (CanonicalSeatCluster owns)
 *   - LegIndicator (seat cluster overlay)
 *   - LegEarnedAnimation / LegsToPlayerAnimation / PotToPlayerAnimation
 *   - SweepTheLegsAnimation / SweepsPotAnimation
 *   - Lifecycle announcements
 *   - CanonicalPotZone
 */

import type { ArtifactDescriptor } from "@/lib/wave4LayoutResolver";
import { vmin } from "@/lib/wave4LayoutResolver";

const OWNER = { table: "MobileGameTable" } as const;

export interface ThreeFiveSevenDescriptorOptions {
  winnerTabledCardsVisible: boolean;
}

function winnerTabledCardsStage(): ArtifactDescriptor {
  return {
    id: "threeFiveSeven.winnerTabledCardsStage",
    owner: OWNER.table,
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 92,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.33,
    anchorOrigin: "center",
    widthPct: 0.75,
    heightPct: 0.18,
  };
}

export function getThreeFiveSevenArtifactDescriptors(
  opts: ThreeFiveSevenDescriptorOptions,
): ArtifactDescriptor[] {
  const ds: ArtifactDescriptor[] = [];
  if (opts.winnerTabledCardsVisible) ds.push(winnerTabledCardsStage());
  return ds;
}
