/**
 * CanonicalFeltSurface — P9.1 (first visible canonical shell wave).
 *
 * Shell-defined felt chrome shared by Holm + 3-5-7. Renders the table
 * ellipse, bridge overlay, and game-name plate. Physically mounted inside
 * the gameplay slot's table container (MobileGameTable) but the component
 * itself is owned by `canonicalShell/` — meaning the visual definition of
 * "what a unified table looks like" lives in one place.
 *
 * Pure presentation. No gameplay layout assumptions. Reads visual prefs
 * directly so callers don't need to thread theme data.
 */

import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";

export type CanonicalFeltGameKind =
  | "holm-game"
  | "three-five-seven"
  | "horses"
  | "ship-captain-crew"
  | "yahtzee"
  | "gin-rummy";

export interface CanonicalFeltSurfaceProps {
  gameKind: CanonicalFeltGameKind;
  anteAmount: number | string;
  potMaxEnabled?: boolean;
  potMaxValue?: number | string;
  legsToWin?: number;
  /** Additive: points-to-win subtitle for points-based games (Gin Rummy). */
  pointsToWin?: number;
  isWaitingPhase?: boolean;
  isTablet?: boolean;
  isDesktop?: boolean;
}

const GAME_NAME_LABEL: Record<CanonicalFeltGameKind, string> = {
  "holm-game": "Holm",
  "three-five-seven": "3-5-7",
  "horses": "HORSES",
  "ship-captain-crew": "SHIP",
  "yahtzee": "YAHTZEE",
  "gin-rummy": "GIN RUMMY",
};

// Dice-family games use a compact single-line plate (legacy parity).
const DICE_PLATE_KINDS: ReadonlySet<CanonicalFeltGameKind> = new Set([
  "horses",
  "ship-captain-crew",
  "yahtzee",
]);


export function CanonicalFeltSurface({
  gameKind,
  anteAmount,
  potMaxEnabled,
  potMaxValue,
  legsToWin,
  isWaitingPhase = false,
  isTablet = false,
  isDesktop = false,
}: CanonicalFeltSurfaceProps) {
  const { getTableColors } = useVisualPreferences();
  const tableColors = getTableColors();
  const isDicePlate = DICE_PLATE_KINDS.has(gameKind);

  return (
    <>
      {/* Table felt — shared ellipse + rail + bridge overlay */}
      <div
        data-canonical-felt-surface=""
        data-canonical-felt-game={gameKind}
        className="absolute inset-x-0 inset-y-2 rounded-[50%/45%] border-2 border-amber-900 shadow-inner overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
          boxShadow: "inset 0 0 30px rgba(0,0,0,0.4)",
        }}
      >
        {tableColors.showBridge && (
          <img
            src={peoriaBridgeMobile}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none w-full h-full object-cover"
            style={{
              objectPosition: isTablet || isDesktop ? "center 60%" : "center 38%",
              opacity: isWaitingPhase
                ? 0.45
                : isTablet || isDesktop
                ? 0.36
                : 0.28,
            }}
          />
        )}
      </div>

      {/* Game-name plate — shared chrome */}
      {!isWaitingPhase && (
        <div
          data-canonical-felt-plate=""
          data-canonical-felt-plate-variant={isDicePlate ? "dice" : "card"}
          className="absolute top-3 left-1/2 transform -translate-x-1/2 z-10 flex flex-col items-center pointer-events-none"
        >
          {isDicePlate ? (
            <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
              ${anteAmount} {GAME_NAME_LABEL[gameKind]}
            </span>
          ) : gameKind === "gin-rummy" ? (
            <>
              <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
                ${anteAmount} {GAME_NAME_LABEL[gameKind]}
              </span>
              {pointsToWin !== undefined && (
                <span className="text-white/40 text-xs font-medium">
                  {pointsToWin} pts to win
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
                {GAME_NAME_LABEL[gameKind]}
              </span>
              <span className="text-white/40 text-xs font-medium">
                {potMaxEnabled ? `$${potMaxValue} max` : "No Limit"}
              </span>
              {gameKind === "three-five-seven" && legsToWin !== undefined && (
                <span className="text-white/40 text-xs font-medium">
                  {legsToWin} legs to win
                </span>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
