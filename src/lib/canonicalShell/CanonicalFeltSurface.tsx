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

import { useEffect, useRef } from "react";
import { useVisualPreferences } from "@/hooks/useVisualPreferences";
import { recordFeltRenderDebug, type FeltRenderTraceContext } from "./feltDebugStore";
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
  /** Diagnostic values from the host path, paired with the literal rendered plate. */
  renderTraceContext?: FeltRenderTraceContext;
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
  renderTraceContext,
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
  const plateRef = useRef<HTMLDivElement | null>(null);
  const renderFrameRef = useRef(0);
  renderFrameRef.current += 1;
  const renderedGame = showBrandPlate
    ? 'P-TOWN POKER'
    : showGamePlate && gameKind
      ? GAME_NAME_LABEL[gameKind]
      : 'none';
  const renderedStakes = showGamePlate && gameKind ? `$${anteAmount}` : 'none';

  // Geometry selection. When geometryVariant === 'ellipse' we force the
  // shared canonical ellipse for every family (Phase 3.1b' shell-owned
  // path). 'auto' preserves the legacy per-game geometry so flag-OFF
  // production renders identically to today.
  const useEllipseGeometry = geometryVariant === 'ellipse' || !isCribbage;

  const feltClass = useEllipseGeometry
    ? "absolute inset-0 rounded-[50%] border-2 border-amber-900 shadow-inner overflow-hidden"
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

  useEffect(() => {
    const plateNode = plateRef.current;
    const renderedPlate = plateNode?.getAttribute('data-canonical-felt-plate-mode') ?? resolvedPlate;
    recordFeltRenderDebug({
      publisher: renderTraceContext?.publisher ?? 'none',
      publisherTable: renderTraceContext?.publisherTable ?? 'none',
      renderedPlate,
      renderedGame: plateNode?.getAttribute('data-canonical-felt-rendered-game') ?? renderedGame,
      renderedStakes: plateNode?.getAttribute('data-canonical-felt-rendered-stakes') ?? renderedStakes,
      renderSource: renderTraceContext?.renderSource ?? 'direct-surface',
      renderFrame: renderFrameRef.current,
      publishedGame: renderTraceContext?.publishedGame ?? 'none',
      publishedStakes: renderTraceContext?.publishedStakes ?? 'none',
      publishedPlate: renderTraceContext?.publishedPlate ?? 'none',
      stickyGame: renderTraceContext?.stickyGame ?? 'none',
      stickyStakes: renderTraceContext?.stickyStakes ?? 'none',
      stickyPlate: renderTraceContext?.stickyPlate ?? 'none',
    });
  }, [resolvedPlate, renderedGame, renderedStakes, renderTraceContext]);

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
        {/* Canonical bottom-center deal origin. Static 1×1 anchor directly
            in front of the local viewer (HOME). Consumed via
            CardEndpoint { kind: 'feltDealOrigin' } as the single source
            for every deal flight when the local viewer is the dealer.
            Snapshot stability: the anchor's DOM position never moves
            within a deal batch, so resolveCardEndpoint returns the same
            rect for every intent in the batch. */}
        <div
          aria-hidden="true"
          data-card-anchor="felt-deal-origin"
          data-anchor-owner="CanonicalFeltSurface.feltDealOrigin"
          style={{
            position: 'absolute',
            left: '50%',
            bottom: 0,
            width: 1,
            height: 1,
            transform: 'translate(-50%, 50%)',
            pointerEvents: 'none',
          }}
        />
        {/* Canonical felt COORDINATE FRAME for gameplay artifacts.
            Rect-equal sibling of the felt paint (absolute inset:0 inside
            [data-canonical-felt-surface]). Every anchored gameplay slot
            (Gin/Holm/357/Yahtzee/Dice/Wave4 cribbage family) portals
            its absolutely-positioned wrapper into this frame so that
            artifact coordinates (resolved against the felt surface)
            and rendered DOM coordinates share one positioned ancestor.
            Container is pointer-events:none; individual artifact
            wrappers re-enable pointer-events:auto for clickables. */}
        <div
          data-canonical-felt-coord-frame=""
          aria-hidden="true"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        />
      </div>

      {/* Canonical felt OVERFLOW frame — rect-equal sibling of the felt
          surface, but rendered OUTSIDE the surface's `overflow:hidden`
          ellipse. Consumers that need to render card-hand overhang
          beyond the rail/felt boundary (e.g. wide pegging fans) portal
          into this frame instead of the coord frame. Same coordinate
          origin — anchored placements resolved against the felt rect
          apply unchanged. Vertical clipping to the play region is
          still enforced by the shell felt host (clip-path inset).
          Pointer-events off by default; individual artifacts re-enable
          on their own wrappers. Z-index sits above the felt paint but
          below HUD/modals. */}
      <div
        data-canonical-felt-overflow-frame=""
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 21,
          overflow: 'visible',
        }}
      />


      {/* Waiting-phase plate — permanent "P-Town Poker" branding on
          the felt while no game is in progress. Uses the same plate
          chrome as gameplay so the visual treatment is consistent. */}
      {showBrandPlate && (
        <div
          ref={plateRef}
          data-canonical-felt-plate=""
          data-canonical-felt-plate-mode="BRAND"
          data-canonical-felt-plate-variant="waiting"
          data-canonical-felt-rendered-game="P-TOWN POKER"
          data-canonical-felt-rendered-stakes="none"
          className="absolute top-3 inset-x-0 z-20 flex justify-center pointer-events-none px-3"
          style={{ containerType: 'inline-size' } as React.CSSProperties}
        >
          <span
            className="text-white/30 font-bold uppercase tracking-wider text-center text-balance"
            style={{
              fontSize: 'clamp(0.875rem, 7cqw, 1.125rem)',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
            // Fallback: at container widths where even the minimum font
            // cannot fit one line, allow a balanced two-line wrap.
            data-brand-plate-title=""
          >
            P-Town Poker
          </span>
        </div>
      )}

      {/* Game-name plate — shared chrome */}
      {showGamePlate && gameKind && (
        <div
          ref={plateRef}
          data-canonical-felt-plate=""
          data-canonical-felt-plate-mode="GAME"
          data-canonical-felt-rendered-game={GAME_NAME_LABEL[gameKind]}
          data-canonical-felt-rendered-stakes={`$${anteAmount}`}
          data-canonical-felt-plate-variant={
            isDicePlate ? "dice" : isCribbage ? "cribbage" : "card"
          }
          className="absolute top-3 inset-x-0 px-4 z-20 flex flex-col items-center pointer-events-none"
          style={{ containerType: 'inline-size' } as React.CSSProperties}
        >
          {isDicePlate ? (
            <span data-canonical-felt-plate-title="" className="canonical-felt-plate-title block w-full text-center text-white/30 font-bold uppercase tracking-wider">
              ${anteAmount} {GAME_NAME_LABEL[gameKind]}
            </span>
          ) : isCribbage ? (
            <>
              <span data-canonical-felt-plate-title="" className="canonical-felt-plate-title block w-full text-center text-white/30 font-bold uppercase tracking-wider">
                ${anteAmount} {GAME_NAME_LABEL[gameKind]}
              </span>
              <span data-canonical-felt-plate-sub="" className="canonical-felt-plate-sub block w-full text-center text-white/40 text-xs font-medium">
                {pointsToWin !== undefined ? `${pointsToWin} to win` : null}
                {cribbageSkunk?.skunkEnabled && cribbageSkunk?.skunkThreshold !== undefined &&
                  ` • Skunk <${cribbageSkunk.skunkThreshold} (2x)`}
                {cribbageSkunk?.doubleSkunkEnabled && cribbageSkunk?.doubleSkunkThreshold !== undefined &&
                  ` • Double <${cribbageSkunk.doubleSkunkThreshold} (3x)`}
              </span>
            </>
          ) : gameKind === "gin-rummy" ? (
            <>
              <span data-canonical-felt-plate-title="" className="canonical-felt-plate-title block w-full text-center text-white/30 font-bold uppercase tracking-wider">
                ${anteAmount} {GAME_NAME_LABEL[gameKind]}
              </span>
              {pointsToWin !== undefined && (
                <span data-canonical-felt-plate-sub="" className="canonical-felt-plate-sub block w-full text-center text-white/40 text-xs font-medium">
                  {pointsToWin} pts to win
                </span>
              )}
            </>
          ) : (
            <>
              <span data-canonical-felt-plate-title="" className="canonical-felt-plate-title block w-full text-center text-white/30 font-bold uppercase tracking-wider">
                {GAME_NAME_LABEL[gameKind]}
              </span>
              <span data-canonical-felt-plate-sub="" className="canonical-felt-plate-sub block w-full text-center text-white/40 text-xs font-medium">
                {potMaxEnabled ? `$${potMaxValue} max` : "No Limit"}
              </span>
              {gameKind === "three-five-seven" && legsToWin !== undefined && (
                <span data-canonical-felt-plate-sub="" className="canonical-felt-plate-sub block w-full text-center text-white/40 text-xs font-medium">
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
