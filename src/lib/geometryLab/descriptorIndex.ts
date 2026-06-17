/**
 * Wave 6 — Geometry Lab descriptor index (single-source refactor).
 *
 * The platform's anchored gameplay geometry lives EXCLUSIVELY in the
 * per-game pure-data descriptor factories:
 *
 *   getCribbageArtifactDescriptors(ctx)
 *   getHolmArtifactDescriptors(ctx)
 *   getThreeFiveSevenArtifactDescriptors(ctx)
 *   getGinRummyArtifactDescriptors(ctx)
 *   getYahtzeeArtifactDescriptors(ctx)
 *   getDiceArtifactDescriptors(ctx)        // horses + ship-captain-crew
 *
 * Geometry Lab MUST NOT mirror their geometry values. Instead it
 * enumerates artifacts through this index by invoking each factory with
 * a deterministic "canonical lab context" tuned to expose every
 * conditional artifact (e.g. cribbage pegging XOR counting, holm chucky,
 * gin knock display) at least once. The descriptor returned is the
 * ground truth — anchorX/Y, anchorOrigin, widthPct, heightPct,
 * aspectRatio all read straight from it.
 *
 * Adding a new anchored artifact:
 *   1. Add it to the per-game factory.
 *   2. If it requires a context flag not already covered, add a new
 *      context entry to LAB_CONTEXTS for that game (or extend an
 *      existing one).
 *   3. Done — the Lab discovers it automatically.
 */

import type { ArtifactDescriptor } from "@/lib/wave4LayoutResolver/types";

import {
  getCribbageArtifactDescriptors,
  type CribbageDescriptorOptions,
} from "@/lib/cribbage/cribbageArtifactDescriptors";
import {
  getHolmArtifactDescriptors,
  type HolmDescriptorOptions,
} from "@/lib/holm/holmArtifactDescriptors";
import {
  getThreeFiveSevenArtifactDescriptors,
  type ThreeFiveSevenDescriptorOptions,
} from "@/lib/threeFiveSeven/threeFiveSevenArtifactDescriptors";
import {
  getGinRummyArtifactDescriptors,
  type GinRummyDescriptorOptions,
} from "@/lib/ginRummy/ginRummyArtifactDescriptors";
import {
  getYahtzeeArtifactDescriptors,
  type YahtzeeDescriptorOptions,
} from "@/lib/yahtzee/yahtzeeArtifactDescriptors";
import {
  getDiceArtifactDescriptors,
  type DiceDescriptorOptions,
} from "@/lib/dice/diceArtifactDescriptors";

import type { SizeMode } from "./store";

// ---------------------------------------------------------------------------
// GameKey + per-game label
// ---------------------------------------------------------------------------

export type GameKey =
  | "cribbage"
  | "holm"
  | "threeFiveSeven"
  | "ginRummy"
  | "yahtzee"
  | "horses"
  | "ship-captain-crew";

export const GAME_LABELS: Record<GameKey, string> = {
  cribbage: "Cribbage",
  holm: "Holm",
  threeFiveSeven: "3-5-7",
  ginRummy: "Gin Rummy",
  yahtzee: "Yahtzee",
  horses: "Horses",
  "ship-captain-crew": "Ship Captain Crew",
};

// ---------------------------------------------------------------------------
// Canonical lab contexts — chosen to expose every anchored artifact a game
// can emit. When a game's artifacts are XOR-gated (e.g. cribbage pegging vs
// counting), we list multiple contexts and dedupe by descriptor id.
//
// The exact context values are intentionally neutral / deterministic so the
// Lab enumeration is stable across renders.
// ---------------------------------------------------------------------------

const CRIBBAGE_CONTEXTS: CribbageDescriptorOptions[] = [
  {
    phase: "pegging",
    viewerSeatPosition: 0,
    opponentSeatPositions: [1],
    cutCardRevealed: true,
    cribVisible: true,
  },
  {
    phase: "counting",
    viewerSeatPosition: 0,
    opponentSeatPositions: [1],
    cutCardRevealed: true,
    cribVisible: true,
  },
];

const HOLM_CONTEXTS: HolmDescriptorOptions[] = [
  {
    communityCardsVisible: true,
    lonePlayerTabledCardsVisible: true,
    chuckyVisible: true,
  },
];

const THREE_FIVE_SEVEN_CONTEXTS: ThreeFiveSevenDescriptorOptions[] = [
  { winnerTabledCardsVisible: true },
];

const GIN_RUMMY_CONTEXTS: GinRummyDescriptorOptions[] = [
  { phase: "playing", hidePiles: false, knockDisplayVisible: false },
  { phase: "knocking", hidePiles: true, knockDisplayVisible: true },
];

const YAHTZEE_CONTEXTS: YahtzeeDescriptorOptions[] = [
  { opponentDiceVisible: true, scorecardVisible: true },
];

const HORSES_CONTEXTS: DiceDescriptorOptions[] = [
  { gameType: "horses", opponentDiceVisible: true, beatBadgeVisible: true },
];

const SCC_CONTEXTS: DiceDescriptorOptions[] = [
  {
    gameType: "ship-captain-crew",
    opponentDiceVisible: true,
    beatBadgeVisible: true,
  },
];

// ---------------------------------------------------------------------------
// Platform descriptor factory index
// ---------------------------------------------------------------------------

type FactoryEntry = {
  game: GameKey;
  enumerate: () => ArtifactDescriptor[];
};

function dedupeById(lists: ArtifactDescriptor[][]): ArtifactDescriptor[] {
  const seen = new Map<string, ArtifactDescriptor>();
  for (const list of lists) {
    for (const d of list) {
      if (!seen.has(d.id)) seen.set(d.id, d);
    }
  }
  return Array.from(seen.values());
}

export const ARTIFACT_DESCRIPTOR_FACTORIES: Record<GameKey, FactoryEntry> = {
  cribbage: {
    game: "cribbage",
    enumerate: () =>
      dedupeById(CRIBBAGE_CONTEXTS.map((c) => getCribbageArtifactDescriptors(c))),
  },
  holm: {
    game: "holm",
    enumerate: () =>
      dedupeById(HOLM_CONTEXTS.map((c) => getHolmArtifactDescriptors(c))),
  },
  threeFiveSeven: {
    game: "threeFiveSeven",
    enumerate: () =>
      dedupeById(
        THREE_FIVE_SEVEN_CONTEXTS.map((c) =>
          getThreeFiveSevenArtifactDescriptors(c),
        ),
      ),
  },
  ginRummy: {
    game: "ginRummy",
    enumerate: () =>
      dedupeById(
        GIN_RUMMY_CONTEXTS.map((c) => getGinRummyArtifactDescriptors(c)),
      ),
  },
  yahtzee: {
    game: "yahtzee",
    enumerate: () =>
      dedupeById(YAHTZEE_CONTEXTS.map((c) => getYahtzeeArtifactDescriptors(c))),
  },
  horses: {
    game: "horses",
    enumerate: () =>
      dedupeById(HORSES_CONTEXTS.map((c) => getDiceArtifactDescriptors(c))),
  },
  "ship-captain-crew": {
    game: "ship-captain-crew",
    enumerate: () =>
      dedupeById(SCC_CONTEXTS.map((c) => getDiceArtifactDescriptors(c))),
  },
};

export const GAME_KEYS: GameKey[] = Object.keys(
  ARTIFACT_DESCRIPTOR_FACTORIES,
) as GameKey[];

// ---------------------------------------------------------------------------
// Public enumeration + adapter helpers consumed by the Lab UI
// ---------------------------------------------------------------------------

/**
 * Enumerate every anchored descriptor for a game by running the factory
 * across its canonical lab contexts and filtering to `composeMode === "anchored"`.
 *
 * The returned descriptors are the ground truth — never mirrored.
 */
export function enumerateAnchoredArtifacts(game: GameKey): ArtifactDescriptor[] {
  const entry = ARTIFACT_DESCRIPTOR_FACTORIES[game];
  if (!entry) return [];
  return entry.enumerate().filter((d) => d.composeMode === "anchored");
}

/**
 * Find the canonical descriptor for an artifact id across all games.
 * Returns the descriptor as the factory would emit it (pre-override).
 */
export function findCanonicalDescriptor(
  artifactId: string,
): { game: GameKey; descriptor: ArtifactDescriptor } | null {
  for (const game of GAME_KEYS) {
    const ds = enumerateAnchoredArtifacts(game);
    const d = ds.find((x) => x.id === artifactId);
    if (d) return { game, descriptor: d };
  }
  return null;
}

/**
 * Derive a SizeMode label from an anchored descriptor. The descriptor is
 * the source of truth; the Lab's three-way sizeMode picker is a
 * presentation of which two of {widthPct, heightPct, aspectRatio} are
 * currently meaningful.
 *
 * Rules:
 *   - widthPct + aspectRatio  → widthDriven  (height derived = width/aspect)
 *   - heightPct + aspectRatio → heightDriven (width derived = height*aspect)
 *   - widthPct + heightPct    → rect
 *   - widthPct only           → widthDriven (aspect unset)
 *   - heightPct only          → heightDriven (aspect unset)
 *   - none                    → widthDriven (default; nothing to show)
 */
export function deriveSizeMode(d: ArtifactDescriptor): SizeMode {
  const hasW = d.widthPct != null;
  const hasH = d.heightPct != null;
  const hasA = d.aspectRatio != null;
  if (hasW && hasA) return "widthDriven";
  if (hasH && hasA) return "heightDriven";
  if (hasW && hasH) return "rect";
  if (hasH) return "heightDriven";
  return "widthDriven";
}
