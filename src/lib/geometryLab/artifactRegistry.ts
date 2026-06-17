/**
 * Wave 6 — Geometry Lab artifact registry (MVP).
 *
 * Catalogues every anchored gameplay artifact known to the platform so the
 * Lab can present a Game→Artifact picker without each provider needing to
 * register itself at runtime. Defaults mirror the canonical descriptor
 * source so the Lab UI can show "what would render with no override".
 *
 * When a new anchored descriptor ships, add it here.
 */

import type { AnchorOrigin } from "@/lib/wave4LayoutResolver/types";

export interface LabArtifactDefault {
  artifactId: string;
  label: string;
  anchorX: number;
  anchorY: number;
  anchorOrigin: AnchorOrigin;
  widthPct?: number;
  heightPct?: number;
  aspectRatio?: number;
}

export interface LabGameEntry {
  game: string;
  label: string;
  artifacts: LabArtifactDefault[];
}

export const GEOMETRY_LAB_REGISTRY: LabGameEntry[] = [
  {
    game: "cribbage",
    label: "Cribbage",
    artifacts: [
      { artifactId: "cribbage.pegboard", label: "Pegboard", anchorX: 0.5, anchorY: 0.5, anchorOrigin: "center", widthPct: 0.9, heightPct: 0.18 },
      { artifactId: "cribbage.cribCutGroup", label: "Crib + Cut Group", anchorX: 0.5, anchorY: 0.5, anchorOrigin: "center", widthPct: 0.6, heightPct: 0.18 },
      { artifactId: "cribbage.peggingRow", label: "Pegging Row", anchorX: 0.5, anchorY: 0.5, anchorOrigin: "center", widthPct: 0.8, heightPct: 0.12 },
    ],
  },
  {
    game: "holm",
    label: "Holm",
    artifacts: [
      { artifactId: "holm.communityCardsStage", label: "Community Cards Stage", anchorX: 0.5, anchorY: 0.48, anchorOrigin: "center", widthPct: 0.8, heightPct: 0.16 },
      { artifactId: "holm.lonePlayerTabledCardsStage", label: "Lone Player Tabled Cards", anchorX: 0.5, anchorY: 0.18, anchorOrigin: "center", widthPct: 0.75, heightPct: 0.16 },
      { artifactId: "holm.chuckyStage", label: "Chucky Stage", anchorX: 0.5, anchorY: 0.72, anchorOrigin: "center", widthPct: 0.8, heightPct: 0.18 },
    ],
  },
  {
    game: "threeFiveSeven",
    label: "3-5-7",
    artifacts: [
      { artifactId: "threeFiveSeven.winnerTabledCardsStage", label: "Winner Tabled Cards", anchorX: 0.5, anchorY: 0.33, anchorOrigin: "center", widthPct: 0.75, heightPct: 0.18 },
    ],
  },
  {
    game: "gin",
    label: "Gin Rummy",
    artifacts: [
      { artifactId: "gin.pegboard", label: "Pegboard", anchorX: 0.5, anchorY: 0.08, anchorOrigin: "center", widthPct: 0.9, heightPct: 0.1 },
      { artifactId: "gin.deckDiscard", label: "Deck + Discard", anchorX: 0.5, anchorY: 0.5, anchorOrigin: "center", widthPct: 0.45, heightPct: 0.22 },
      { artifactId: "gin.turnIndicator", label: "Turn Indicator", anchorX: 0.5, anchorY: 0.3, anchorOrigin: "center", widthPct: 0.4, heightPct: 0.06 },
    ],
  },
  {
    game: "yahtzee",
    label: "Yahtzee",
    artifacts: [
      { artifactId: "yahtzee.opponentDiceStage", label: "Opponent Dice Stage", anchorX: 0.5, anchorY: 0.3, anchorOrigin: "center", widthPct: 0.8, heightPct: 0.18 },
      { artifactId: "yahtzee.scorecardStage", label: "Scorecard Stage", anchorX: 0.5, anchorY: 0.55, anchorOrigin: "center", widthPct: 0.9, heightPct: 0.35 },
    ],
  },
  {
    game: "dice",
    label: "Horses / SCC",
    artifacts: [
      { artifactId: "scc.opponentDiceStage", label: "SCC Opponent Dice", anchorX: 0.5, anchorY: 0.32, anchorOrigin: "center", widthPct: 0.85, heightPct: 0.2 },
      { artifactId: "horses.opponentDiceStage", label: "Horses Opponent Dice", anchorX: 0.5, anchorY: 0.32, anchorOrigin: "center", widthPct: 0.85, heightPct: 0.2 },
    ],
  },
];

export function findArtifactDefault(artifactId: string): LabArtifactDefault | undefined {
  for (const g of GEOMETRY_LAB_REGISTRY) {
    const a = g.artifacts.find((x) => x.artifactId === artifactId);
    if (a) return a;
  }
  return undefined;
}
