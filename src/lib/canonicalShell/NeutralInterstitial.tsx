/**
 * NeutralInterstitial — canonical between-slots placeholder (Phase 6).
 *
 * Phase 6 ships this component as a tested, ready-to-mount module.
 * Production code does NOT mount it in this phase; Phase 7 will wire
 * it into the slot transition flow. Mounting fires
 * slot-entered-neutral / slot-left-neutral telemetry.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { recordShellEvent } from './diagnostics';
import type { CanonicalFeltGameKind } from './ShellOwnedFeltHost';
import { useGeometryTokensOptional } from './ResponsiveGeometryProvider';
import { useLifecycleMount } from './lifecycleDebug';
import { ginTrace } from '@/lib/ginStartupTrace';
import { usePublishShellFelt } from './ShellOwnedFeltHost';
import { ShellHudGrid } from './ShellHudGrid';
import { useShellTabBar, type ShellTabId } from './ShellTabBar';

import { useSeatAnchorsOptional } from './SeatAnchorLayer';
import { usePreSessionSeatOwned } from './PreSessionSeatLayer';
import { recordWartime } from '@/lib/wartimeDebug/core';
import {
  markRenderBoundary,
  tickRenderLoopGuard,
  useEffectProbe,
} from '@/lib/wartimeDebug/postCommitStallTrace';


import { CanonicalSeatCluster } from './CanonicalSeatCluster';
import { derivePlayerStatus } from './participantStatus';
import { getDisplayName } from '@/lib/botAlias';
import { formatChipValue } from '@/lib/utils';
import { useStartupMountTrace, useStartupRenderTrace } from '@/lib/startupFlightRecorder';
import {
  useWaitingMount,
  recordSurfaceOwnership,
  recordWaitingLifecycle,
  recordWaitingLifecycleIfChanged,
} from './waitingTableFlight';
import {
  useWartimeSurface,
  useWartimeState,
  useWartimeRender,
  useWartimeOwnership,
  recordPlayerVisualSnapshot,
  probeChipDom,
  probeChipDomAncestry,
} from '@/lib/wartimeDebug/surfaces';

/**
 * Roster shape consumed by the optional interstitial seat layer.
 * Intentionally narrow — only the fields the canonical waiting
 * surface already feeds CanonicalSeatCluster. Callers pass the same
 * `players` array they use for waiting / gameplay so the projection
 * is byte-identical with the rest of the lifecycle.
 */
export interface InterstitialParticipant {
  id: string;
  position: number;
  user_id?: string | null;
  chips?: number | null;
  is_bot?: boolean | null;
  waiting?: boolean | null;
  auto_fold?: boolean | null;
  profiles?: { username?: string };
}

export interface NeutralInterstitialProps {
  gameId?: string | null;
  /** Optional label visible only in dev for diagnostics. */
  reason?: string;
  gameKind?: CanonicalFeltGameKind | null;
  anteAmount?: number | string;
  /**
   * Externally-owned tab state. When provided, NeutralInterstitial
   * registers THIS state with ShellTabBar instead of its own internal
   * default — so the user's selected tab survives dealer-game
   * rollovers / setup phases / interstitial mounts. The parent
   * (Game.tsx) holds the persistent `mobileActiveTab` state and
   * passes it here so the tab bar reads the same source-of-truth
   * across active gameplay and neutral interstitials.
   */
  activeTab?: ShellTabId;
  onActiveTabChange?: (tab: ShellTabId) => void;
  /**
   * Optional seated roster + viewer identity. When provided,
   * NeutralInterstitial mounts a local <SeatAnchorLayer> and renders
   * each occupied seat through <CanonicalSeatCluster> — the same
   * primitive CanonicalShellWaitingSurface and MobileGameTable use.
   * Projection mode mirrors the rest of the lifecycle: viewer seated
   * → active-canonical (HOME suppressed); viewer not seated →
   * observer-absolute. This is the seat-continuity surface for
   * observers across waiting → setup → interstitial → gameplay.
   *
   * When `participants` is omitted, no seat layer is mounted (legacy
   * behaviour, used by callers that don't yet thread a roster).
   *
   * Intentionally LIMITED to identity + chip bubble — no dealer pip,
   * no gameplay decorators, no chip-transport endpoints. Gameplay
   * artifacts must NOT leak into the interstitial.
   */
  participants?: InterstitialParticipant[];
  currentUserId?: string | null;
  participantGameType?: string | null;
}


export function NeutralInterstitial({
  gameId,
  reason,
  gameKind,
  anteAmount = 0,
  activeTab: externalActiveTab,
  onActiveTabChange,
  participants,
  currentUserId,
  participantGameType,
}: NeutralInterstitialProps) {
  const geometry = useGeometryTokensOptional();
  // No fake-default game kind. If the caller did not supply one (truly
  // pre-game, no committed gameType yet), we still need a kind to satisfy
  // the felt-surface type — but the plate is gated by `isWaitingPhase`
  // (true here), so no game-name branding ever paints. Use the first
  // dice-plate kind purely as a structural placeholder; nothing visible
  // depends on it while waiting.
  const hasCommittedGameKind = gameKind != null;
  const resolvedGameKind: CanonicalFeltGameKind = gameKind ?? 'yahtzee';
  const tableSurfaceMaxHeight = geometry?.tableSurfaceMaxHeight ?? '55vh';
  useLifecycleMount('NeutralInterstitial', { reason, gameKind });
  useStartupMountTrace('NeutralInterstitial', { gameId: gameId ?? null, reason: reason ?? null, gameKind: gameKind ?? null });
  useStartupRenderTrace('NeutralInterstitial', {
    gameId: gameId ?? null,
    reason: reason ?? null,
    gameKind: gameKind ?? null,
    resolvedGameKind,
    hasCommittedGameKind,
    participantCount: participants?.length ?? 0,
    activeTab: externalActiveTab ?? null,
  }, { file: 'src/lib/canonicalShell/NeutralInterstitial.tsx' });

  // === Wartime Phase 2 — framework coverage =====================
  useWartimeSurface('NeutralInterstitial', {
    gameId: gameId ?? null,
    reason: reason ?? null,
    gameKind: gameKind ?? null,
  });
  useWartimeOwnership('NeutralInterstitial', {
    HUDOwner: 'NeutralInterstitial.ShellHudGrid',
    SeatOwner: 'NeutralInterstitial.CanonicalSeatCluster',
    FeltOwner: 'NeutralInterstitial.usePublishShellFelt',
  });
  useWartimeState('NeutralInterstitial', 'reason', reason ?? null);
  useWartimeState('NeutralInterstitial', 'hasCommittedGameKind', hasCommittedGameKind);
  useWartimeState('NeutralInterstitial', 'participantCount', participants?.length ?? 0);
  useWartimeRender('NeutralInterstitial', `reason:${reason ?? 'unknown'}`);
  // =============================================================


  usePublishShellFelt({
    gameKind: resolvedGameKind,
    anteAmount,
    // 2026-06-01: ALWAYS suppress the game-name plate during
    // interstitial states (ante_decision, dealer_selection,
    // configuring). Showing the previous game's plate ("$10 CRIBBAGE")
    // on the "Dealer configuring next game" surface reads as stale
    // branding. The interstitial is conceptually between games — no
    // plate is the correct neutral state, regardless of whether the
    // dealer-game's game_type has been committed.
    isWaitingPhase: true,
    publisherLabel: `NeutralInterstitial:${reason ?? 'unknown'}`,
  });

  // Lifecycle continuity baseline: while between gameplay surfaces
  // (between-games rollover, dealer config, pre-game bootstrap) no
  // gameplay component has registered ShellTabBar state, so the tab
  // bar would render nothing and the shell chrome would visually
  // disappear. Publish a minimal neutral baseline so the canonical
  // bottom chrome remains structurally and visually continuous. The
  // moment a real gameplay surface mounts and calls useShellTabBar(...),
  // its registration supersedes this baseline ("most recent wins").
  //
  // Tab selection is user-persistent shell state, NOT gameplay-lifecycle
  // state. When the parent (Game.tsx) supplies `activeTab` /
  // `onActiveTabChange`, we register THAT — the same persistent state
  // the active gameplay surface uses — so the selected tab survives
  // every dealer-game rollover and setup-phase interstitial. We only
  // fall back to local state for stand-alone usages (tests, callers
  // that don't own a persistent tab store).
  const [internalNeutralTab, setInternalNeutralTab] = useState<ShellTabId>('lobby');
  const neutralTab = externalActiveTab ?? internalNeutralTab;
  const handleSetNeutralTab = useCallback((t: ShellTabId) => {
    if (onActiveTabChange) onActiveTabChange(t);
    else setInternalNeutralTab(t);
  }, [onActiveTabChange]);
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

  // ── Waiting-table flight recorder (instrumentation only) ────────
  useWaitingMount('NeutralInterstitial', {
    gameId: gameId ?? null,
    reason: reason ?? null,
    gameKind: gameKind ?? null,
    hasCommittedGameKind,
    participantCount: participants?.length ?? 0,
  });
  useEffect(() => {
    recordWaitingLifecycle('Interstitial ready', {
      gameId: gameId ?? null,
      reason: reason ?? null,
      gameKind: gameKind ?? null,
      resolvedGameKind,
      participantCount: participants?.length ?? 0,
    });
    recordSurfaceOwnership('NeutralInterstitial', {
      SeatOwner: participants?.length
        ? 'Shell:PersistentTableShell.SeatAnchorLayer → CanonicalSeatClusterDeferred'
        : '(none — no participants prop)',
      ChipOwner: participants?.length ? 'CanonicalSeatCluster.chipValue' : '(none)',
      ControlOwner: '(none — neutral interstitial owns no controls)',
      AnnouncementOwner: 'Shell:CanonicalAnnouncementProvider rail',
      HUDOwner: 'Shell:ShellHudGrid (structure only)',
    }, { reason });
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
  // Observer/interstitial seat continuity: when a roster is supplied,
  // mount the canonical seat layer using the SAME projection rules as
  // CanonicalShellWaitingSurface so observers see seat/chip chrome
  // continuously across waiting → setup → interstitial → gameplay.
  // Identity + chip bubble only — no dealer pip, no gameplay
  // decorators, no chip-transport endpoints. Gameplay artifacts must
  // not leak into the interstitial.
  const hasParticipants = !!(participants && participants.length > 0);
  const viewer = hasParticipants
    ? participants!.find(p => p.user_id === currentUserId)
    : undefined;
  const isViewerSeated = !!viewer;
  // P0 (chip-continuity fix): consume the SHELL-OWNED SeatAnchorLayer
  // mounted in PersistentTableShell via Game.tsx. The previous local
  // SeatAnchorLayer wrap forked seat identity from WaitingTable so
  // every slot transition remounted the provider and reinitialized
  // CanonicalSeatCluster — read as a visible chip jump. No local
  // fallback: missing ambient provider is a wiring contract violation
  // and is recorded for diagnosis.
  const ambient = useSeatAnchorsOptional();
  useEffect(() => {
    if (hasParticipants && !ambient) {
      recordWartime('SEATING', 'contract-violation.missing-seat-anchor-provider', {
        surface: 'NeutralInterstitial',
        gameId: gameId ?? null,
        gameType: participantGameType ?? null,
        hint: 'shell SeatAnchorLayer not mounted above this surface',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasParticipants, ambient == null]);
  const projectionMode = ambient?.projectionMode ?? (isViewerSeated ? 'active-canonical' : 'observer-absolute');
  const viewerPosition = ambient?.viewerPosition ?? (isViewerSeated ? viewer!.position : null);
  // Runtime provider probe — replaces hard-coded 'SHELL' literal so
  // traces report actual ambient-provider presence.
  const seatAnchorSourceLabel = ambient == null
    ? 'NONE (no ambient SeatAnchorLayer)'
    : 'SHELL (PersistentTableShell.SeatAnchorLayer)';



  // P-WAIT.B3: per-participant chip-glyph render trace (Interstitial).
  useEffect(() => {
    if (!participants || participants.length === 0) return;
    const viewerPos = participants.find(p => p.user_id === currentUserId)?.position ?? null;
    for (const p of participants) {
      recordWaitingLifecycleIfChanged(
        `chipglyph:NeutralInterstitial:${p.id}`,
        'chip-glyph render',
        {
          surface: 'NeutralInterstitial',
          renderer: 'CanonicalSeatCluster.chipValue',
          position: p.position,
          playerId: p.id,
          userId: p.user_id,
          name: p.profiles?.username ?? (p.is_bot ? 'Bot' : 'Player'),
          chipValue: `$${formatChipValue(p.chips ?? 0)}`,
          seatAnchorSource: seatAnchorSourceLabel,
          chipAnchorSource: 'CanonicalSeatCluster (slot-derived)',
          chipStyleSource: 'derivePlayerStatus → status palette',
          projectionMode,
          viewerPosition: viewerPos,
          instanceLabel: 'NeutralInterstitial',
        },
      );
      // Wartime: cross-surface visual snapshot (auto-diffs vs WaitingTable
      // / DealerSelection snapshots for the same playerId).
      const _pos = p.position;
      const _baseSnap = {
        surface: 'NeutralInterstitial' as const,
        playerId: p.id,
        userId: p.user_id,
        position: p.position,
        viewerPosition: viewerPos,
        logicalSeat: p.position,
        renderedSeatSlot: null,
        seatAnchorSource: seatAnchorSourceLabel,
        anchorProviderInstanceId: ambient?.providerInstanceId ?? null,
        chipAnchorSource: 'CanonicalSeatCluster (slot-derived)',
        chipRenderer: 'CanonicalSeatClusterDeferred',
        chipStyleSource: 'derivePlayerStatus → status palette',
        chipVariant: 'interstitial',
        chipValue: `$${formatChipValue(p.chips ?? 0)}`,
        status: null,
        projectionMode,
        isViewerSelf: p.user_id === currentUserId,
        isSuppressed: p.user_id === currentUserId,
        suppressionReason: p.user_id === currentUserId ? 'self-HOME' : null,
      };
      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          recordPlayerVisualSnapshot({
            ..._baseSnap,
            ...probeChipDom(_pos),
            domAncestry: probeChipDomAncestry(_pos),
          });
        });
      } else {
        recordPlayerVisualSnapshot(_baseSnap);
      }
    }
  }, [participants, projectionMode, currentUserId]);



  const preSessionSeatOwned = usePreSessionSeatOwned();
  const seatLayer = hasParticipants && !preSessionSeatOwned ? (
    <div
      data-canonical-shell-interstitial-seats=""
      data-projection-mode={projectionMode}
      className="absolute inset-0 z-20 pointer-events-none"
    >
      {participants!.map(player => {
        const actualUsername =
          player.profiles?.username ?? (player.is_bot ? 'Bot' : 'Player');
        const label = getDisplayName(participants as any, player as any, actualUsername);
        const status = derivePlayerStatus(player as any, null, {
          hasStayDecision: false,
        });
        return (
          <CanonicalSeatClusterDeferred
            key={player.id}
            position={player.position}
            name={label}
            chipValue={`$${formatChipValue(player.chips ?? 0)}`}
            status={status}
            playerId={player.id}
          />
        );
      })}
    </div>
  ) : null;


  return (
    <div
      data-canonical-shell-neutral=""
      aria-hidden={hasParticipants ? undefined : 'true'}
      className="h-full flex flex-col bg-transparent relative"
    >
      <div
        className="relative overflow-hidden"
        style={{ height: 'var(--shell-felt-h)', flex: '0 0 var(--shell-felt-h)' }}
      >
        {/* Shell owns the felt unconditionally — no local mount. */}
        {seatLayer}
      </div>
      {/* HUD region — shell-owned 5-row proportional grid (Phase 2).
          Interstitial has no timer / pane / identity content; the rows
          still render at their token heights so composition matches
          gameplay surfaces. */}
      <ShellHudGrid />
    </div>

  );

}

/**
 * Small adapter that reads the canonical seat anchor for `position`
 * and renders a CanonicalSeatCluster at the resolved slot. Lives here
 * (not as a shared primitive) because the interstitial is the only
 * non-game consumer that needs roster→slot lookup without owning its
 * own SeatAnchorLayer host. Identical projection semantics to
 * CanonicalShellWaitingSurface.
 */
let _csd_seq = 0;
function CanonicalSeatClusterDeferred(props: {
  position: number;
  name: string;
  chipValue: string;
  status: ReturnType<typeof derivePlayerStatus>;
  playerId?: string | null;
}) {
  const ambient = useSeatAnchorsOptional();
  // CHIP_RUNTIME_CONTINUITY — capture wrapper mount/unmount so we can
  // detect the second-level remount seam introduced by this adapter.
  const wrapperIdRef = useRef<string>('');
  if (!wrapperIdRef.current) wrapperIdRef.current = `csd-p${props.position}-${++_csd_seq}`;
  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    recordWartime('OWNERSHIP', 'CHIP_RUNTIME_CONTINUITY.deferred-wrapper.mount', {
      position: props.position,
      deferredWrapperInstanceId: wrapperIdRef.current,
      providerInstanceId: ambient?.providerInstanceId ?? null,
      surface: 'NeutralInterstitial.CanonicalSeatClusterDeferred',
    });
    return () => {
      recordWartime('OWNERSHIP', 'CHIP_RUNTIME_CONTINUITY.deferred-wrapper.unmount', {
        position: props.position,
        deferredWrapperInstanceId: wrapperIdRef.current,
        providerInstanceId: ambient?.providerInstanceId ?? null,
        surface: 'NeutralInterstitial.CanonicalSeatClusterDeferred',
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const byPosition = ambient?.byPosition;
  if (!byPosition) return null;

  const anchor = byPosition.get(props.position);
  if (!anchor) return null;
  return (
    <CanonicalSeatCluster
      slot={anchor.slot}
      position={props.position}
      name={props.name}
      chipValue={props.chipValue}
      status={props.status}
      ownerLabel="Shell:NeutralInterstitial"
      playerId={props.playerId ?? null}
    />
  );
}

