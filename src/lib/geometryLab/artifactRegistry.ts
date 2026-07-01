/**
 * Wave 6 — Geometry Lab presentation registry (post single-source refactor).
 *
 * This file used to mirror geometry defaults (widthPct, anchorX, etc.) for
 * every editable artifact. Those values DRIFTED from the canonical
 * descriptors (e.g. cribbage.pegboard real widthPct=0.8/aspectRatio=6,
 * registry said widthPct=0.9/heightPct=0.18). To make that drift
 * structurally impossible, geometry now lives ONLY in the per-game
 * descriptor factories. The Lab enumerates artifacts via
 * `descriptorIndex.ts` and reads geometry straight off the descriptor.
 *
 * What remains here:
 *   - artifactId       (identity)
 *   - label            (display name)
 *   - category         (optional grouping)
 *   - sortOrder        (optional display ordering)
 *
 * No geometry values. Ever.
 */

export type ArtifactCategory = "central" | "seat-projected" | "overlay";

export interface ArtifactPresentationEntry {
  artifactId: string;
  label: string;
  category?: ArtifactCategory;
  sortOrder?: number;
}

const ENTRIES: ArtifactPresentationEntry[] = [
  // Cribbage
  { artifactId: "cribbage.pegboard", label: "Pegboard", category: "central", sortOrder: 10 },
  { artifactId: "cribbage.cribCutGroup", label: "Crib + Cut Group", category: "central", sortOrder: 20 },
  { artifactId: "cribbage.peggingRow", label: "Pegging Row", category: "central", sortOrder: 30 },
  { artifactId: "cribbage.countingRow", label: "Counting Row", category: "central", sortOrder: 31 },

  // Holm
  { artifactId: "holm.communityCardsStage", label: "Community Cards Stage", category: "central", sortOrder: 10 },
  { artifactId: "holm.lonePlayerTabledCardsStage", label: "Lone Player Tabled Cards", category: "central", sortOrder: 20 },
  { artifactId: "holm.chuckyStage", label: "Chucky Stage", category: "central", sortOrder: 30 },

  // 3-5-7
  { artifactId: "threeFiveSeven.winnerTabledCardsStage", label: "Winner Tabled Cards", category: "central", sortOrder: 10 },

  // Gin Rummy
  { artifactId: "gin.pegboard", label: "Pegboard", category: "central", sortOrder: 10 },
  { artifactId: "gin.stockDiscardGroup", label: "Stock + Discard", category: "central", sortOrder: 20 },
  // gin.turnIndicator retired — helper text is coupled to gin.stockDiscardGroup.
  { artifactId: "gin.knockDisplay", label: "Knock Display", category: "overlay", sortOrder: 40 },

  // Yahtzee
  { artifactId: "yahtzee.opponentDiceStage", label: "Opponent Dice Stage", category: "central", sortOrder: 10 },
  { artifactId: "yahtzee.scorecardStage", label: "Scorecard Stage", category: "central", sortOrder: 20 },

  // Dice — Horses
  { artifactId: "horses.opponentDiceStage", label: "Opponent Dice Stage", category: "central", sortOrder: 10 },
  { artifactId: "horses.beatBadge", label: "Beat Badge", category: "overlay", sortOrder: 20 },

  // Dice — Ship Captain Crew
  { artifactId: "scc.opponentDiceStage", label: "Opponent Dice Stage", category: "central", sortOrder: 10 },
  { artifactId: "scc.beatBadge", label: "Beat Badge", category: "overlay", sortOrder: 20 },
];

const BY_ID = new Map(ENTRIES.map((e) => [e.artifactId, e] as const));

export function getArtifactPresentation(
  artifactId: string,
): ArtifactPresentationEntry {
  return (
    BY_ID.get(artifactId) ?? {
      artifactId,
      label: artifactId,
    }
  );
}
