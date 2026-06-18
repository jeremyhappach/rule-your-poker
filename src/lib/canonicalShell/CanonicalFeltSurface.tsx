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
import type { FeltPlateMode } from "./feltPlateMode";
import peoriaBridgeMobile from "@/assets/peoria-bridge-mobile.jpg";

export type CanonicalFeltGameKind =
  | "holm-game"
  | "three-five-seven"
  | "horses"
  | "ship-captain-crew"
  | "yahtzee"
  | "gin-rummy"
  | "cribbage";

export interface CanonicalFeltSurfaceProps {
  gameKind: CanonicalFeltGameKind | null;
  anteAmount: number | string;
  potMaxEnabled?: boolean;
  potMaxValue?: number | string;
  legsToWin?: number;
  /** Additive: points-to-win subtitle for points-based games (Gin Rummy, Cribbage). */
  pointsToWin?: number;
  /**
   * Legacy hint. Retained for callers that have not yet adopted
   * `feltPlateMode`. When `feltPlateMode` is provided it OVERRIDES
   * this — `isWaitingPhase` has NO influence on plate selection.
   */
  isWaitingPhase?: boolean;
  /**
   * Explicit, single-source plate contract. Publishers declare which
   * plate to paint via this field; the felt no longer interprets
   * gameplay/HUD booleans like `isWaitingPhase`. See feltPlateMode.ts.
   */
  feltPlateMode?: FeltPlateMode;
  isTablet?: boolean;
  isDesktop?: boolean;
  /**
   * Phase 3.1b' — geometry override. 'auto' (default) preserves legacy
   * per-game geometry (Cribbage = circle, others = ellipse). 'ellipse'
   * forces the shared canonical ellipse regardless of gameKind. Used by
   * the shell-owned felt host (flag ON) to render all families against
   * the same canonical geometry. Flag-OFF callers omit this prop and
   * keep production-identical behavior.
   */
  geometryVariant?: 'auto' | 'ellipse';
  /** Diagnostic ownership marker stamped onto the actual felt node. */
  feltOwner?: string;
  /** Cribbage-only — appended to the plate subtitle line. */
  cribbageSkunk?: {
    skunkEnabled?: boolean;
    skunkThreshold?: number;
    doubleSkunkEnabled?: boolean;
    doubleSkunkThreshold?: number;
  };
}


const GAME_NAME_LABEL: Record<CanonicalFeltGameKind, string> = {
  "holm-game": "Holm",
  "three-five-seven": "3-5-7",
  "horses": "HORSES",
  "ship-captain-crew": "SHIP",
  "yahtzee": "YAHTZEE",
  "gin-rummy": "GIN RUMMY",
  "cribbage": "CRIBBAGE",
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
  pointsToWin,
  isWaitingPhase = false,
  feltPlateMode,
  isTablet = false,
  isDesktop = false,
  geometryVariant = 'auto',
  feltOwner,
  cribbageSkunk,
}: CanonicalFeltSurfaceProps) {
  const { getTableColors } = useVisualPreferences();
  const tableColors = getTableColors();
  const isDicePlate = gameKind != null && DICE_PLATE_KINDS.has(gameKind);
  const isCribbage = gameKind === "cribbage";
  // Plate selection — EXPLICIT contract.
  // 1. If `feltPlateMode` is provided, it is the SOLE authority.
  // 2. Otherwise (legacy callers) fall back to the old `isWaitingPhase`
  //    + `gameKind == null` heuristic so unmigrated paths render as before.
  const isNeutralKind = gameKind == null;
  const resolvedPlate: 'BRAND' | 'GAME' | 'NEUTRAL' =
    feltPlateMode === 'BRAND'
      ? 'BRAND'
      : feltPlateMode === 'GAME'
        ? (isNeutralKind ? 'NEUTRAL' : 'GAME')
        : isWaitingPhase
          ? 'BRAND'
          : isNeutralKind
            ? 'NEUTRAL'
            : 'GAME';
  const showBrandPlate = resolvedPlate === 'BRAND';
  const showGamePlate = resolvedPlate === 'GAME';

  // Geometry selection. When geometryVariant === 'ellipse' we force the
  // shared canonical ellipse for every family (Phase 3.1b' shell-owned
  // path). 'auto' preserves the legacy per-game geometry so flag-OFF
  // production renders identically to today.
  const useEllipseGeometry = geometryVariant === 'ellipse' || !isCribbage;

  const feltClass = useEllipseGeometry
    ? "absolute inset-0 rounded-[50%/45%] border-2 border-amber-900 shadow-inner overflow-hidden"
    : "absolute inset-0 rounded-full border-2 border-white/80 overflow-hidden";

  const feltStyle: React.CSSProperties = useEllipseGeometry
    ? {
        background: `linear-gradient(135deg, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
        boxShadow: "inset 0 0 30px rgba(0,0,0,0.4)",
      }
    : {
        background: `radial-gradient(ellipse at center, ${tableColors.color} 0%, ${tableColors.darkColor} 100%)`,
        filter: tableColors.showBridge ? undefined : "brightness(0.7)",
      };

  return (
    <>
      {/* Table felt — shared ellipse/circle + bridge overlay */}
      <div
        data-canonical-felt-surface=""
        data-canonical-felt-owner={feltOwner ?? 'local-felt-surface'}
        data-canonical-felt-game={gameKind ?? 'neutral'}
        data-canonical-felt-geometry={useEllipseGeometry ? 'ellipse' : 'circle'}
        className={feltClass}
        style={feltStyle}
      >
        {tableColors.showBridge && (
          <img
            src={peoriaBridgeMobile}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none w-full h-full object-cover"
            style={
              useEllipseGeometry
                ? {
                    objectPosition:
                      isTablet || isDesktop ? "center 60%" : "center 38%",
                    opacity: isTablet || isDesktop ? 0.36 : 0.28,
                  }
                : { objectFit: "cover", filter: "brightness(0.5)" }
            }
          />
        )}
      </div>


      {/* Waiting-phase plate — permanent "P-Town Poker" branding on
          the felt while no game is in progress. Uses the same plate
          chrome as gameplay so the visual treatment is consistent. */}
      {showBrandPlate && (
        <div
          data-canonical-felt-plate=""
          data-canonical-felt-plate-variant="waiting"
          className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
        >
          <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
            P-Town Poker
          </span>
        </div>
      )}

      {/* Game-name plate — shared chrome */}
      {showGamePlate && gameKind && (
        <div
          data-canonical-felt-plate=""
          data-canonical-felt-plate-variant={
            isDicePlate ? "dice" : isCribbage ? "cribbage" : "card"
          }
          className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none"
        >
          {isDicePlate ? (
            <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
              ${anteAmount} {GAME_NAME_LABEL[gameKind]}
            </span>
          ) : isCribbage ? (
            <>
              <span className="text-white/30 font-bold text-lg uppercase tracking-wider">
                ${anteAmount} {GAME_NAME_LABEL[gameKind]}
              </span>
              <span className="text-white/40 text-xs font-medium whitespace-nowrap">
                {pointsToWin !== undefined ? `${pointsToWin} to win` : null}
                {cribbageSkunk?.skunkEnabled && cribbageSkunk?.skunkThreshold !== undefined &&
                  ` • Skunk <${cribbageSkunk.skunkThreshold} (2x)`}
                {cribbageSkunk?.doubleSkunkEnabled && cribbageSkunk?.doubleSkunkThreshold !== undefined &&
                  ` • Double <${cribbageSkunk.doubleSkunkThreshold} (3x)`}
              </span>
            </>
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
