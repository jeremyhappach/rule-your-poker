/**
 * Wave 5D — Dice (Horses + Ship-Captain-Crew) Artifact Descriptors.
 *
 * Pure data factory mirroring the Yahtzee/Gin patterns. Every gameplay
 * artifact migrated in this wave is `composeMode: "anchored"` — the
 * stage owns position + size; contents adapt.
 *
 * Migrated this wave (per game-type):
 *   - {gameType}.opponentDiceStage  (visible: opponent rolling)
 *   - {gameType}.beatBadge          (visible: local rolling)
 *
 * NOT migrated (intentionally — shell / lifecycle / seat-projected):
 *   - seat clusters, score badges, HUD, tabs, announcements,
 *     turn spotlight, dice tray.
 */

import type { ArtifactDescriptor } from "@/lib/wave4LayoutResolver";
import { vmin } from "@/lib/wave4LayoutResolver";

export type DiceGameType = "horses" | "ship-captain-crew";

const PREFIX_BY_GAME: Record<DiceGameType, string> = {
  horses: "horses",
  "ship-captain-crew": "scc",
};

export function diceOpponentDiceStageId(gameType: DiceGameType): string {
  return `${PREFIX_BY_GAME[gameType]}.opponentDiceStage`;
}

export function diceBeatBadgeId(gameType: DiceGameType): string {
  return `${PREFIX_BY_GAME[gameType]}.beatBadge`;
}

export interface DiceDescriptorOptions {
  gameType: DiceGameType;
  /** Show opponent dice stage (observer view, opponent currently rolling). */
  opponentDiceVisible: boolean;
  /** Show beat badge (local player rolling, what-to-beat indicator). */
  beatBadgeVisible: boolean;
}

function opponentDiceStage(gameType: DiceGameType): ArtifactDescriptor {
  return {
    id: diceOpponentDiceStageId(gameType),
    owner: "MobileGameTable",
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

function beatBadge(gameType: DiceGameType): ArtifactDescriptor {
  return {
    id: diceBeatBadgeId(gameType),
    owner: "MobileGameTable",
    composeMode: "anchored",
    preferredSize: { width: vmin(0), height: vmin(0) },
    minimumSize: { width: vmin(0), height: vmin(0) },
    priority: 92,
    collapsePriority: "never",
    anchorX: 0.5,
    anchorY: 0.72,
    anchorOrigin: "center",
    widthPct: 0.45,
    heightPct: 0.1,
  };
}

export function getDiceArtifactDescriptors(
  opts: DiceDescriptorOptions,
): ArtifactDescriptor[] {
  const ds: ArtifactDescriptor[] = [];
  if (opts.opponentDiceVisible) ds.push(opponentDiceStage(opts.gameType));
  if (opts.beatBadgeVisible) ds.push(beatBadge(opts.gameType));
  return ds;
}
