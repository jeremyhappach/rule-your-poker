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
import { NeutralInterstitial } from './NeutralInterstitial';
import {
  describeSlotIdentity,
  slotIdentityEquals,
  type PlayfieldSlotIdentity,
} from './PlayfieldSlot';
import { useSlotIdentityTracker } from './useSlotIdentityTracker';
import { SLOT_CHOREOGRAPHY } from './slotChoreography';

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
   */
  readyToMount?: boolean;
  /** The active gameplay slot subtree. Re-keyed by mounted identity. */
  children: ReactNode;
}

type SlotPhase = 'cold' | 'active' | 'neutral';

export function PlayfieldSlotController({
  desiredIdentity,
  interstitialDwellMs = SLOT_CHOREOGRAPHY.interstitialDwellMs,
  gameId,
  readyToMount = true,
  children,
}: PlayfieldSlotControllerProps) {
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

  // Helper: attempt to promote neutral → active iff dwell elapsed AND
  // readiness is satisfied AND we have a non-null target.
  const tryPromote = (target: PlayfieldSlotIdentity, ready: boolean) => {
    if (target === null) return;
    if (!dwellElapsedRef.current) return;
    if (!ready) return;
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
        setMountedIdentity(desiredIdentity);
        setPhase('active');
      } else {
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
      setMountedIdentity(null);
      setNeutralReason('dealer-game-rollover');
      setPhase('neutral');
      dwellElapsedRef.current = false;
      pendingIdentityRef.current = desiredIdentity;

      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null;
        dwellElapsedRef.current = true;
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
        dwellTimerRef.current = setTimeout(() => {
          dwellTimerRef.current = null;
          dwellElapsedRef.current = true;
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

  if (mountedIdentity === null) {
    return (
      <NeutralInterstitial gameId={gameId ?? null} reason={neutralReason} />
    );
  }

  // Re-key children by identity so the gameplay subtree gets a fresh
  // lifecycle for each dealer game.
  //
  // bg-poker-felt-dark (Phase 7 safety net): if children take a frame
  // to paint after promotion, the slot wrapper itself reads as idle
  // felt — matching NeutralInterstitial — so neither page-white nor a
  // background-token flash can bleed through. Pure presentation.
  return (
    <div
      data-canonical-shell-slot=""
      data-slot-identity={describeSlotIdentity(mountedIdentity)}
      className="w-full h-full min-h-0 bg-poker-felt-dark"
      key={describeSlotIdentity(mountedIdentity)}
    >
      {children}
    </div>
  );
}
