/**
 * NeutralInterstitial — canonical between-slots placeholder (Phase 6).
 *
 * Phase 6 ships this component as a tested, ready-to-mount module.
 * Production code does NOT mount it in this phase; Phase 7 will wire
 * it into the slot transition flow. Mounting fires
 * slot-entered-neutral / slot-left-neutral telemetry.
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import { recordShellEvent } from './diagnostics';
import { CanonicalFeltSurface, type CanonicalFeltGameKind } from './CanonicalFeltSurface';
import { useGeometryTokensOptional } from './ResponsiveGeometryProvider';
import { useLifecycleMount } from './lifecycleDebug';
import { ginTrace } from '@/lib/ginStartupTrace';
import { usePublishShellFelt, useShellFeltContext } from './ShellOwnedFeltHost';
import { ShellHudChrome } from './ShellHudChrome';
import { useShellTabBar, type ShellTabId } from './ShellTabBar';


export interface NeutralInterstitialProps {
  gameId?: string | null;
  /** Optional label visible only in dev for diagnostics. */
  reason?: string;
  gameKind?: CanonicalFeltGameKind | null;
  anteAmount?: number | string;
}

export function NeutralInterstitial({ gameId, reason, gameKind, anteAmount = 0 }: NeutralInterstitialProps) {
  const geometry = useGeometryTokensOptional();
  const { shellOwnsFelt } = useShellFeltContext();
  const resolvedGameKind = gameKind ?? 'holm-game';
  const tableSurfaceMaxHeight = geometry?.tableSurfaceMaxHeight ?? '55vh';
  useLifecycleMount('NeutralInterstitial', { reason, gameKind });

  usePublishShellFelt(
    shellOwnsFelt
      ? {
          gameKind: resolvedGameKind,
          anteAmount,
          isWaitingPhase: true,
          publisherLabel: `NeutralInterstitial:${reason ?? 'unknown'}`,
        }
      : null,
  );


  useEffect(() => {
    ginTrace('NeutralInterstitial mounted', { reason: reason ?? null, gameKind: gameKind ?? null });
    recordShellEvent('slot-entered-neutral', {
      gameId: gameId ?? null,
      detail: { reason: reason ?? null },
    });
    return () => {
      ginTrace('NeutralInterstitial unmounted', { reason: reason ?? null });
      recordShellEvent('slot-left-neutral', {
        gameId: gameId ?? null,
        detail: { reason: reason ?? null },
      });
    };
    // Single mount/unmount lifecycle — telemetry must not churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slot frame ownership: PlayfieldSlotController owns the outer
  // w-full/h-full/flex-col envelope so neutral and active share
  // identical frame constraints. Background continuity is owned by
  // the canonical shell root. NeutralInterstitial contributes only
  // its felt-region content.
  // First-frame paint atomicity: this wrapper MUST paint the full
  // canonical waiting skeleton on the SAME frame as the bg-background
  // chrome — otherwise the bg-background paints first and the felt
  // resolves a frame later, producing a brief full-white flash.
  //
  // Two guarantees keep paint atomic:
  //   1. Use `h-full` (not `flex-1 min-h-0`) so the wrapper resolves
  //      its height directly from the slot frame on first layout pass,
  //      identical to GinRummyGameTable's placeholder branch. `flex-1`
  //      under a flex-column parent can resolve to 0 on the first
  //      layout pass when the parent's own height has not yet been
  //      committed, causing the felt area to be invisible while the
  //      wrapper's bg-background still fills the viewport.
  //   2. Render the felt-region container UNCONDITIONALLY so the
  //      CanonicalFeltSurface (absolute-positioned colored ellipse)
  //      paints in the same frame as the wrapper. Previously the
  //      `gameKind ? ... : null` gate could leave the wrapper as a
  //      pure white box for any frame in which `gameKind` was falsy.
  //
  // Background continuity is owned by the canonical shell root.
  // NeutralInterstitial contributes only its felt-region content +
  // bottom-panel reservation, geometrically identical to the active
  // GinRummyGameTable placeholder branch.
  return (
    <div
      data-canonical-shell-neutral=""
      aria-hidden="true"
      className={`h-full flex flex-col ${shellOwnsFelt ? 'bg-transparent' : 'bg-background'} relative`}
    >
      <div className="flex-1 relative overflow-hidden min-h-0" style={{ maxHeight: tableSurfaceMaxHeight }}>
        {/* Configuring/cold neutral: render felt unconditionally so the
            canonical waiting table sits beneath the dealer setup modal
            from first frame. Pass `isWaitingPhase` so no game-name plate
            is shown when the family is a fallback default — preventing
            an incorrect label during pre-submit configuring. */}
        {!shellOwnsFelt && (
          <CanonicalFeltSurface
            gameKind={resolvedGameKind}
            anteAmount={anteAmount}
            isWaitingPhase={true}
          />
        )}
      </div>
      {/* Geometry-parity bottom-panel reservation: mirrors the
          active gameplay layout (felt + bottom panel) so the felt
          region resolves against the same vertical share in
          neutral and active. When the shell owns the felt, this
          reservation must not paint an opaque HUD/backdrop over the
          shared ellipse during ante-decision neutral frames.

          Lifecycle continuity: mount the canonical ShellHudChrome
          (announcement rail + tab bar) inside the reservation so the
          shell chrome remains visible during DealerGameSetup and
          other transitional states where no gameplay surface has
          mounted yet. Without this, the rail/tab bar disappear
          between dealer games, which manifested as the "missing
          shell chrome during DealerGameSetup" lifecycle regression. */}
      <div
        data-canonical-shell-neutral-bottom-panel=""
        className={`flex-1 flex flex-col min-h-0 ${shellOwnsFelt ? 'bg-transparent border-t border-transparent' : 'bg-gradient-to-t from-background via-background to-background/95 border-t border-border'}`}
      >
        <div className="mt-auto">
          <ShellHudChrome />
        </div>
      </div>
    </div>
  );

}
