/**
 * PlayfieldSlotController — Phase 7 canonical slot mount controller.
 *
 * Owns the gameplay slot inside PersistentTableShell. Drives the
 * explicit transition through NeutralInterstitial when slot identity
 * changes between two non-null identities, so INV-shell-3
 * (neutral-passthrough) is enforced in production, not just observed.
 *
 * State machine:
 *   active(A) ── desiredIdentity → B ──▶ neutral(dwell) ──▶ active(B)
 *   active(A) ── desiredIdentity → null ──▶ neutral (held until non-null)
 *   null      ── desiredIdentity → A ──▶ active(A)  (direct cold mount)
 *
 * Readiness gate (Phase 7 polish):
 *   The dwell is a minimum visible hold, not a sufficient mount signal.
 *   When `readyToMount` is false, the controller stays in neutral past
 *   the dwell expiry until readiness flips true — at which point it
 *   mounts the latest desired identity. Cold-start mount also respects
 *   readiness. This eliminates the white-flash class of bugs where the
 *   slot flips to active faster than the gameplay subtree can paint.
 *
 *   Predicate scope (per approved Phase 7 guardrail): readiness MUST
 *   only answer "is the intended game surface ready enough to mount
 *   without flashing?" — not a generic lifecycle framework.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLifecycleMount, setLifecycleFact } from './lifecycleDebug';
import { recordShellLifecycleEvent, recordRenderDecision, useChangeTracker, logIfChanged } from './shellLifecycleLog';

import { NeutralInterstitial } from './NeutralInterstitial';
import {
  describeSlotIdentity,
  slotIdentityEquals,
  type PlayfieldSlotIdentity,
} from './PlayfieldSlot';
import { useSlotIdentityTracker } from './useSlotIdentityTracker';
import { SLOT_CHOREOGRAPHY } from './slotChoreography';
import type { CanonicalFeltGameKind } from './ShellOwnedFeltHost';
import { useSurfaceReadiness } from './SurfaceReadinessContract';
import { ginTrace } from '@/lib/ginStartupTrace';
import { recordStartupFlight, useStartupMountTrace, useStartupRenderTrace } from '@/lib/startupFlightRecorder';
import { useWaitingMount, recordWaitingLifecycle } from './waitingTableFlight';
import {
  useWartimeSurface,
  useWartimeState,
} from '@/lib/wartimeDebug/surfaces';

export interface PlayfieldSlotControllerProps {
  desiredIdentity: PlayfieldSlotIdentity;
  /** Override the default dwell (tests). */
  interstitialDwellMs?: number;
  /** Optional gameId for telemetry payload correlation. */
  gameId?: string | null;
  /**
   * Readiness gate. When false, the controller holds neutral past the
   * dwell expiry until this flips true. Defaults to true (backwards
   * compatible). Narrow scope: only answers "is the intended game
   * surface ready to paint a stable first frame?".
   *
   * The effective readiness ANDs this prop with any value reported
   * through SurfaceReadinessContract for `desiredIdentity` (scoped by
   * the optional `readinessScope`, e.g. roundId). Surfaces that don't
   * register a probe default to true and behave as today.
   */
  readyToMount?: boolean;
  /**
   * Optional sub-scope key for surface readiness lookups (e.g. roundId).
   * Combined with desiredIdentity.dealerGameId to consume reports from
   * SurfaceReadinessContract.
   */
  readinessScope?: string | null;
  neutralGameKind?: CanonicalFeltGameKind | null;
  neutralAnteAmount?: number | string;
  /**
   * Persistent-children mode. When provided, `children` are rendered
   * continuously at a stable React position keyed by this string —
   * even when mountedIdentity is null. The pre-game overlay (or, as
   * fallback, NeutralInterstitial) is rendered ON TOP of children
   * instead of replacing them. This is what gives the poker-shell
   * family ONE persistent MobileGameTable instance across the entire
   * lifecycle (dealer_selection → game_selection → ante_decision →
   * in_progress → game_over). Without this prop, the legacy
   * behaviour (children swapped with NeutralInterstitial when
   * mountedIdentity===null, children re-keyed by slot identity)
   * is preserved.
   */
  persistentChildrenKey?: string | null;
  /**
   * Pre-game overlay rendered above persistent children when
   * mountedIdentity===null. Typically contains DealerGameSetup /
   * HighCardDealerSelection. When persistentChildrenKey is unset,
   * this prop is ignored and NeutralInterstitial is rendered as
   * before.
   */
  preGameOverlay?: ReactNode;
  /**
   * Externally-owned shell tab state. Forwarded to NeutralInterstitial
   * so the user's selected tab survives dealer-game rollovers and
   * setup-phase interstitials. When omitted, NeutralInterstitial falls
   * back to its internal default (legacy behavior).
   */
  neutralActiveTab?: import('./ShellTabBar').ShellTabId;
  onNeutralActiveTabChange?: (tab: import('./ShellTabBar').ShellTabId) => void;
  /**
   * Optional seated roster + viewer identity passed through to
   * NeutralInterstitial so observers see canonical seat/chip chrome
   * across waiting → setup → interstitial → gameplay. See
   * NeutralInterstitialProps.participants for the contract.
   */
  neutralParticipants?: import('./NeutralInterstitial').InterstitialParticipant[];
  neutralCurrentUserId?: string | null;
  neutralParticipantGameType?: string | null;
  /** The active gameplay slot subtree. Re-keyed by mounted identity. */
  children: ReactNode;
}

type SlotPhase = 'cold' | 'active' | 'neutral';

export function PlayfieldSlotController({
  desiredIdentity,
  interstitialDwellMs = SLOT_CHOREOGRAPHY.interstitialDwellMs,
  gameId,
  readyToMount: readyToMountProp = true,
  readinessScope = null,
  neutralGameKind = null,
  neutralAnteAmount = 0,
  persistentChildrenKey = null,
  preGameOverlay = null,
  neutralActiveTab,
  onNeutralActiveTabChange,
  neutralParticipants,
  neutralCurrentUserId,
  neutralParticipantGameType,
  children,
}: PlayfieldSlotControllerProps) {
  useLifecycleMount('PlayfieldSlotController');
  useStartupMountTrace('PlayfieldSlotController', { gameId: gameId ?? null });
  useWaitingMount('PlayfieldSlotController', { gameId: gameId ?? null });
  useChangeTracker('PlayfieldSlotController', 'persistentChildrenKey', persistentChildrenKey ?? '(none)');
  useChangeTracker('PlayfieldSlotController', 'desiredIdentity', describeSlotIdentity(desiredIdentity));
  // Hook-free input-prop transition logging (no new hooks; safe at render).
  // Hook-free input-prop transition logging (no new hooks; safe at render).
  logIfChanged('PSC.input.persistentChildrenKey', persistentChildrenKey ?? '(none)', { gameId });
  logIfChanged('PSC.input.desiredIdentity', describeSlotIdentity(desiredIdentity), { gameId });

  // === Wartime Phase 2 — framework coverage =====================
  useWartimeSurface('PlayfieldSlotController', {
    gameId: gameId ?? null,
    desiredIdentity: describeSlotIdentity(desiredIdentity),
    persistentChildrenKey: persistentChildrenKey ?? null,
  });
  useWartimeState('PlayfieldSlotController', 'desiredIdentity', describeSlotIdentity(desiredIdentity));
  useWartimeState('PlayfieldSlotController', 'readyToMountProp', readyToMountProp);
  // =============================================================




  const surfaceReady = useSurfaceReadiness(
    desiredIdentity ? { dealerGameId: desiredIdentity.dealerGameId, scope: readinessScope } : null,
  );
  const readyToMount = readyToMountProp && surfaceReady;
  const [mountedIdentity, setMountedIdentity] =
    useState<PlayfieldSlotIdentity>(
      // Cold start: only mount immediately if also ready. Otherwise
      // start in neutral and wait for readiness.
      desiredIdentity !== null && readyToMount ? desiredIdentity : null,
    );
  const [phase, setPhase] = useState<SlotPhase>(
    desiredIdentity === null || !readyToMount ? 'cold' : 'active',
  );
  const [neutralReason, setNeutralReason] = useState<string>(
    desiredIdentity === null
      ? 'pre-session'
      : (!readyToMount ? 'awaiting-surface-ready' : 'pre-session'),
  );
  useStartupRenderTrace('PlayfieldSlotController', {
    desiredIdentity: describeSlotIdentity(desiredIdentity),
    mountedIdentity: describeSlotIdentity(mountedIdentity),
    phase,
    neutralReason,
    readyToMountProp,
    surfaceReady,
    readyToMount,
    readinessScope: readinessScope ?? null,
    persistentChildrenKey: persistentChildrenKey ?? null,
  }, { file: 'src/lib/canonicalShell/PlayfieldSlotController.tsx', gameId: gameId ?? null });
  logIfChanged('PSC.state.mountedIdentity', describeSlotIdentity(mountedIdentity), { gameId });



  // Dwell-elapsed latch: once the visible dwell minimum has passed
  // for the current neutral interval, we are free to mount as soon as
  // readiness allows. Reset whenever we leave neutral.
  const dwellElapsedRef = useRef<boolean>(false);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest desired non-null identity awaiting mount (used when
  // readiness flips true after the dwell has already elapsed, or when
  // the user changes targets mid-dwell).
  const pendingIdentityRef = useRef<PlayfieldSlotIdentity>(null);

  useSlotIdentityTracker({
    enabled: true,
    gameId: gameId ?? null,
    gameType: mountedIdentity?.gameType ?? null,
    dealerGameId: mountedIdentity?.dealerGameId ?? null,
  });

  useEffect(() => {
    const snapshot = {
      gameId: gameId ?? null,
      phase,
      desiredIdentity: describeSlotIdentity(desiredIdentity),
      mountedIdentity: describeSlotIdentity(mountedIdentity),
      readyToMount,
      surfaceReady,
      readyToMountProp,
      readinessScope: readinessScope ?? null,
      dealerGameId: desiredIdentity?.dealerGameId ?? null,
      dwellElapsed: dwellElapsedRef.current,
      pendingIdentity: describeSlotIdentity(pendingIdentityRef.current),
    };
    console.log('[GIN_RUNTIME_TIMELINE] slot controller state', snapshot);
    recordStartupFlight('READINESS TIMELINE', 'PlayfieldSlotController state snapshot', {
      file: 'src/lib/canonicalShell/PlayfieldSlotController.tsx',
      oldValue: null,
      newValue: snapshot,
    });
    ginTrace('slot.state', snapshot);
  }, [gameId, phase, desiredIdentity, mountedIdentity, readyToMount, surfaceReady, readyToMountProp, readinessScope]);

  // ShellLifecyclePanel: phase transitions, mount-identity changes,
  // and readiness flips — emitted only when the relevant slice changes
  // (notify-on-change), so the panel is not flooded.
  const lastPhaseRef = useRef<string | null>(null);
  const lastMountedRef = useRef<string | null>(null);
  const lastReadyRef = useRef<boolean | null>(null);
  const lastReasonRef = useRef<string | null>(null);
  useEffect(() => {
    const mounted = describeSlotIdentity(mountedIdentity);
    const desired = describeSlotIdentity(desiredIdentity);
    if (lastPhaseRef.current !== phase) {
      recordShellLifecycleEvent('slot-phase', `${lastPhaseRef.current ?? '(init)'} → ${phase}`, {
        mounted, desired, neutralReason, readyToMount, surfaceReady, readyToMountProp,
        dealerGameId: desiredIdentity?.dealerGameId?.slice(0, 8) ?? null,
        readinessScope: readinessScope?.slice(0, 8) ?? null,
      });
      recordWaitingLifecycle('PSC phase change', {
        from: lastPhaseRef.current ?? '(init)', to: phase,
        mounted, desired, neutralReason, readyToMount, surfaceReady,
        gameId: gameId ?? null,
      });
      if (phase === 'neutral' && lastPhaseRef.current !== 'neutral') {
        recordShellLifecycleEvent('neutral-shown', `reason=${neutralReason}`, {
          from: lastPhaseRef.current, mounted, desired,
        });
      } else if (phase !== 'neutral' && lastPhaseRef.current === 'neutral') {
        recordShellLifecycleEvent('neutral-hidden', `phase=${phase}`, {
          mounted, desired, neutralReason,
        });
      }
      lastPhaseRef.current = phase;
    }
    if (lastMountedRef.current !== mounted) {
      recordShellLifecycleEvent('slot-phase', `mountedIdentity ${lastMountedRef.current ?? '(init)'} → ${mounted}`, {
        phase, desired,
      });
      recordWaitingLifecycle('PSC mountedIdentity change', {
        from: lastMountedRef.current ?? '(init)', to: mounted, phase, desired,
        gameId: gameId ?? null,
      });
      lastMountedRef.current = mounted;
    }
    if (lastReadyRef.current !== readyToMount) {
      recordShellLifecycleEvent('gating', `readyToMount ${lastReadyRef.current} → ${readyToMount}`, {
        owner: 'PlayfieldSlotController',
        readyToMountProp, surfaceReady, phase, desired, mounted,
      });
      lastReadyRef.current = readyToMount;
    }
    if (phase === 'neutral' && lastReasonRef.current !== neutralReason) {
      recordShellLifecycleEvent('gating', `neutralReason → ${neutralReason}`, {
        owner: 'PlayfieldSlotController', mounted, desired,
      });
      lastReasonRef.current = neutralReason;
    }
  }, [phase, mountedIdentity, desiredIdentity, readyToMount, surfaceReady, readyToMountProp, neutralReason, readinessScope, gameId]);


  // Helper: attempt to promote neutral → active iff dwell elapsed AND
  // readiness is satisfied AND we have a non-null target.
  const tryPromote = (target: PlayfieldSlotIdentity, ready: boolean) => {
    if (target === null) return;
    if (!dwellElapsedRef.current) {
      ginTrace('slot.tryPromote blocked (dwell not elapsed)', {
        target: describeSlotIdentity(target),
        ready,
      });
      return;
    }
    if (!ready) {
      ginTrace('slot.tryPromote blocked (not ready)', {
        target: describeSlotIdentity(target),
      });
      return;
    }
    ginTrace('slot.MOUNT active', { target: describeSlotIdentity(target) });
    setMountedIdentity(target);
    setPhase('active');
    dwellElapsedRef.current = false;
    pendingIdentityRef.current = null;
  };

  useEffect(() => {
    // Same identity, same phase → no-op.
    if (
      slotIdentityEquals(mountedIdentity, desiredIdentity) &&
      phase !== 'neutral'
    ) {
      return;
    }

    // Cold start: null/cold → identity. Direct mount IFF ready;
    // otherwise hold neutral with readiness gate.
    if (
      mountedIdentity === null &&
      desiredIdentity !== null &&
      phase !== 'neutral'
    ) {
      if (readyToMount) {
        ginTrace('slot.cold-start direct mount (ready)', {
          target: describeSlotIdentity(desiredIdentity),
        });
        setMountedIdentity(desiredIdentity);
        setPhase('active');
      } else {
        ginTrace('slot.cold-start hold neutral (awaiting-surface-ready)', {
          target: describeSlotIdentity(desiredIdentity),
        });
        // Treat as cold-start neutral; no dwell required, just wait
        // on readiness.
        dwellElapsedRef.current = true;
        pendingIdentityRef.current = desiredIdentity;
        setNeutralReason('awaiting-surface-ready');
        setPhase('neutral');
      }
      return;
    }

    // Active → null: hold neutral indefinitely.
    if (mountedIdentity !== null && desiredIdentity === null) {
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      dwellElapsedRef.current = false;
      pendingIdentityRef.current = null;
      setMountedIdentity(null);
      setNeutralReason('session-end');
      setPhase('neutral');
      return;
    }

    // Active(A) → desired(B), different non-null identity: enter
    // neutral, run dwell, then (subject to readiness) mount B.
    if (
      mountedIdentity !== null &&
      desiredIdentity !== null &&
      !slotIdentityEquals(mountedIdentity, desiredIdentity) &&
      phase === 'active'
    ) {
      ginTrace('slot.enter neutral (active→active rollover)', {
        from: describeSlotIdentity(mountedIdentity),
        to: describeSlotIdentity(desiredIdentity),
        dwellMs: interstitialDwellMs,
      });
      setMountedIdentity(null);
      setNeutralReason('dealer-game-rollover');
      setPhase('neutral');
      dwellElapsedRef.current = false;
      pendingIdentityRef.current = desiredIdentity;

      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null;
        dwellElapsedRef.current = true;
        ginTrace('slot.dwell elapsed (rollover)', { ready: readyToMount });
        tryPromote(pendingIdentityRef.current, readyToMount);
      }, interstitialDwellMs);
      return;
    }

    // In neutral with a non-null desired: refresh pending target. If
    // dwell already elapsed and ready, mount immediately; otherwise
    // ensure a dwell timer is in flight.
    if (phase === 'neutral' && desiredIdentity !== null) {
      pendingIdentityRef.current = desiredIdentity;
      if (dwellElapsedRef.current) {
        tryPromote(desiredIdentity, readyToMount);
      } else if (!dwellTimerRef.current) {
        ginTrace('slot.dwell timer armed (neutral hold)', {
          dwellMs: interstitialDwellMs,
        });
        dwellTimerRef.current = setTimeout(() => {
          dwellTimerRef.current = null;
          dwellElapsedRef.current = true;
          ginTrace('slot.dwell elapsed (neutral hold)', { ready: readyToMount });
          tryPromote(pendingIdentityRef.current, readyToMount);
        }, interstitialDwellMs);
      }
    }
  }, [desiredIdentity, mountedIdentity, phase, interstitialDwellMs, readyToMount]);

  // Readiness flipped true while we're holding neutral past the dwell:
  // promote immediately.
  useEffect(() => {
    if (
      phase === 'neutral' &&
      readyToMount &&
      dwellElapsedRef.current &&
      pendingIdentityRef.current !== null
    ) {
      tryPromote(pendingIdentityRef.current, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyToMount, phase]);

  useEffect(() => {
    return () => {
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
    };
  }, []);

  // Unified slot frame: identical outer container for neutral and
  // active so the transition is pixel-continuous. Only slot content
  // swaps. Background continuity lives at the shell-root above.
  //
  // Two render modes:
  //
  //   (a) Legacy (default): children are mounted only when
  //       mountedIdentity is non-null, keyed by slot identity so the
  //       gameplay subtree gets a fresh lifecycle per dealer game.
  //       NeutralInterstitial replaces children at null identity.
  //
  //   (b) Persistent children (persistentChildrenKey set): children
  //       are mounted continuously at a stable React position keyed
  //       by `persistentChildrenKey` (typically session gameId). The
  //       pre-game overlay (preGameOverlay) is rendered on TOP of
  //       children when mountedIdentity===null, instead of replacing
  //       them. This enforces the "ONE persistent MobileGameTable
  //       instance across the entire poker-shell lifecycle"
  //       contract from the persistent-poker-shell refactor.
  if (persistentChildrenKey) {
    recordRenderDecision('PlayfieldSlotController', mountedIdentity === null ? 'neutral+persistent-children' : 'gameplay+persistent-children', {
      mode: 'persistent-children',
      persistentChildrenKey,
      mountedIdentity: describeSlotIdentity(mountedIdentity),
      desiredIdentity: describeSlotIdentity(desiredIdentity),
      phase, readyToMount, surfaceReady, readyToMountProp, neutralReason,
    });
    return (
      <div
        data-canonical-shell-slot=""
        data-slot-phase={phase}
        data-slot-identity={describeSlotIdentity(mountedIdentity)}
        data-slot-mode="persistent-children"
        className="w-full h-full min-h-0 flex flex-col relative"
      >
        {/* Felt continuity during pre-game: when no active gameplay
            surface is mounted (mountedIdentity===null), the persistent
            children render nothing for poker-variant families whose
            gameType is still null. Without a felt publisher, the shell
            background is blank. Mount NeutralInterstitial as the BASE
            layer so its canonical felt (local) OR its
            usePublishShellFelt call (shell-owned) paints the felt
            beneath the pre-game overlay. It unmounts the moment the
            slot becomes active, at which point the gameplay tree owns
            the felt directly. */}
        {/* PR-B.2: in persistent-children mode, the underlying
            MobileGameTable (children below) is the canonical seat
            renderer and stays mounted across pre-game / interstitial.
            If we ALSO feed participants here, NeutralInterstitial
            mounts a SECOND CanonicalSeatCluster layer at the same
            anchors → two chipstacks render simultaneously. Suppress
            the interstitial seat layer when children own seats. */}
        {mountedIdentity === null && (
          <div className="absolute inset-0 flex flex-col z-0">
            <NeutralInterstitial
              gameId={gameId ?? null}
              reason={`poker-shell-pregame:${neutralReason}`}
              gameKind={neutralGameKind}
              anteAmount={neutralAnteAmount}
              activeTab={neutralActiveTab}
              onActiveTabChange={onNeutralActiveTabChange}
            />
          </div>
        )}
        <div
          key={persistentChildrenKey}
          className="flex-1 min-h-0 flex flex-col relative z-10"
        >
          {children}
        </div>
        {mountedIdentity === null && (
          <div
            data-canonical-shell-pregame-overlay=""
            className="absolute inset-0 flex flex-col pointer-events-none z-20"
          >
            <div className="flex-1 min-h-0 relative pointer-events-auto">
              {preGameOverlay}
            </div>
          </div>
        )}
      </div>
    );
  }

  recordRenderDecision('PlayfieldSlotController', mountedIdentity === null ? 'neutral' : 'gameplay', {
    mode: 'legacy',
    mountedIdentity: describeSlotIdentity(mountedIdentity),
    desiredIdentity: describeSlotIdentity(desiredIdentity),
    phase, readyToMount, surfaceReady, readyToMountProp, neutralReason,
    childrenKey: mountedIdentity !== null ? describeSlotIdentity(mountedIdentity) : null,
  });

  return (
    <div
      data-canonical-shell-slot=""
      data-slot-phase={phase}
      data-slot-identity={describeSlotIdentity(mountedIdentity)}
      className="w-full h-full min-h-0 flex flex-col"
    >
      {mountedIdentity === null ? (
        <NeutralInterstitial
          gameId={gameId ?? null}
          reason={neutralReason}
          gameKind={neutralGameKind}
          anteAmount={neutralAnteAmount}
          activeTab={neutralActiveTab}
          onActiveTabChange={onNeutralActiveTabChange}
          participants={neutralParticipants}
          currentUserId={neutralCurrentUserId ?? null}
          participantGameType={neutralParticipantGameType ?? null}
        />
      ) : (
        <div
          key={describeSlotIdentity(mountedIdentity)}
          className="flex-1 min-h-0 flex flex-col"
        >
          {children}
        </div>
      )}
    </div>
  );
}
