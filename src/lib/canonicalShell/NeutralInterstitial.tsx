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
import type { CanonicalFeltGameKind } from './ShellOwnedFeltHost';
import { useGeometryTokensOptional } from './ResponsiveGeometryProvider';
import { useLifecycleMount } from './lifecycleDebug';
import { ginTrace } from '@/lib/ginStartupTrace';
import { usePublishShellFelt } from './ShellOwnedFeltHost';
import { ShellAnnouncementRail } from './ShellHudChrome';
import { ShellTabBar } from './ShellTabBar';
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
  // No fake-default game kind. If the caller did not supply one (truly
  // pre-game, no committed gameType yet), we still need a kind to satisfy
  // the felt-surface type — but the plate is gated by `isWaitingPhase`
  // (true here), so no game-name branding ever paints. Use the first
  // dice-plate kind purely as a structural placeholder; nothing visible
  // depends on it while waiting.
  const resolvedGameKind: CanonicalFeltGameKind = gameKind ?? 'yahtzee';
  const tableSurfaceMaxHeight = geometry?.tableSurfaceMaxHeight ?? '55vh';
  useLifecycleMount('NeutralInterstitial', { reason, gameKind });

  usePublishShellFelt({
    gameKind: resolvedGameKind,
    anteAmount,
    isWaitingPhase: true,
    publisherLabel: `NeutralInterstitial:${reason ?? 'unknown'}`,
  });

  // Lifecycle continuity baseline: while between gameplay surfaces
  // (between-games rollover, dealer config, pre-game bootstrap) no
  // gameplay component has registered ShellTabBar state, so the tab
  // bar would render nothing and the shell chrome would visually
  // disappear. Publish a minimal neutral baseline (lobby/history
  // toggleable, cards/chat inert) so the canonical bottom chrome
  // remains structurally and visually continuous. The moment a real
  // gameplay surface mounts and calls useShellTabBar(...), its
  // registration supersedes this baseline ("most recent wins").
  const [neutralTab, setNeutralTab] = useState<ShellTabId>('lobby');
  const handleSetNeutralTab = useCallback((t: ShellTabId) => {
    setNeutralTab(t);
  }, []);
  const baselineTabState = useMemo(
    () => ({
      cardsIcon: 'spade' as const,
      activeTab: neutralTab,
      setActiveTab: handleSetNeutralTab,
    }),
    [neutralTab, handleSetNeutralTab],
  );
  useShellTabBar(baselineTabState);



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
  //      canonical felt (absolute-positioned colored ellipse)
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
      className="h-full flex flex-col bg-transparent relative"
    >
      <div className="flex-1 relative overflow-hidden min-h-0" style={{ maxHeight: tableSurfaceMaxHeight }}>
        {/* Shell owns the felt unconditionally — no local mount. */}
      </div>
      {/* Geometry-parity bottom-panel reservation: mirrors the active
          gameplay layout so the felt region resolves against the same
          vertical share. Transparent to avoid occluding the shell ellipse. */}
      <div
        data-canonical-shell-neutral-bottom-panel=""
        className="flex-1 flex flex-col min-h-0 bg-transparent border-t border-transparent"
      >
        <div className="mt-auto">
          <ShellHudChrome />
        </div>
      </div>
    </div>
  );

}
