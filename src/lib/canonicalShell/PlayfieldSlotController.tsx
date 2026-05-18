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
 * Phase 7 contract notes:
 *   - Teardown is synchronous (SLOT_CHOREOGRAPHY.teardownGraceMs === 0).
 *     Upstream guarantees end-of-game closure has completed before
 *     `desiredIdentity` changes; closure overlays live outside the slot.
 *   - Children re-mount on identity change because the controller
 *     keys its rendered child by the active identity descriptor.
 *   - Telemetry: this controller owns the single
 *     `slot-identity-changed` source (via useSlotIdentityTracker).
 *     The Game.tsx-level tracker is disabled when this controller is
 *     mounted to avoid duplicate events.
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
  /** The active gameplay slot subtree. Re-keyed by mounted identity. */
  children: ReactNode;
}

type SlotPhase = 'cold' | 'active' | 'neutral';

export function PlayfieldSlotController({
  desiredIdentity,
  interstitialDwellMs = SLOT_CHOREOGRAPHY.interstitialDwellMs,
  gameId,
  children,
}: PlayfieldSlotControllerProps) {
  // mountedIdentity is what's currently rendered. desiredIdentity is
  // the goal. They diverge during the neutral dwell.
  const [mountedIdentity, setMountedIdentity] =
    useState<PlayfieldSlotIdentity>(desiredIdentity);
  const [phase, setPhase] = useState<SlotPhase>(
    desiredIdentity === null ? 'cold' : 'active',
  );
  const [neutralReason, setNeutralReason] = useState<string>('pre-session');

  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drive single-source identity telemetry from the controller.
  useSlotIdentityTracker({
    enabled: true,
    gameId: gameId ?? null,
    gameType: mountedIdentity?.gameType ?? null,
    dealerGameId: mountedIdentity?.dealerGameId ?? null,
  });

  useEffect(() => {
    // No change → no-op.
    if (slotIdentityEquals(mountedIdentity, desiredIdentity) && phase !== 'neutral') {
      return;
    }

    // Cold start: null → identity, direct mount, no neutral.
    if (mountedIdentity === null && desiredIdentity !== null && phase !== 'neutral') {
      setMountedIdentity(desiredIdentity);
      setPhase('active');
      return;
    }

    // Active → null: hold neutral indefinitely (session end / pre-next).
    if (mountedIdentity !== null && desiredIdentity === null) {
      // Clear any pending dwell — we're not going anywhere.
      if (dwellTimerRef.current) {
        clearTimeout(dwellTimerRef.current);
        dwellTimerRef.current = null;
      }
      setMountedIdentity(null);
      setNeutralReason('session-end');
      setPhase('neutral');
      return;
    }

    // Active(A) → desired(B), different non-null identity: enter neutral,
    // dwell, then mount B.
    if (
      mountedIdentity !== null &&
      desiredIdentity !== null &&
      !slotIdentityEquals(mountedIdentity, desiredIdentity) &&
      phase === 'active'
    ) {
      setMountedIdentity(null);
      setNeutralReason('dealer-game-rollover');
      setPhase('neutral');

      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      const targetIdentity = desiredIdentity;
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null;
        setMountedIdentity(targetIdentity);
        setPhase('active');
      }, interstitialDwellMs);
      return;
    }

    // We are in neutral and desired has resolved to a non-null identity.
    // The dwell timer (if still pending) will mount it; if the user
    // changed targets mid-dwell, restart the timer to the latest target.
    if (phase === 'neutral' && desiredIdentity !== null) {
      // Only reschedule if the pending target differs.
      if (dwellTimerRef.current) clearTimeout(dwellTimerRef.current);
      const targetIdentity = desiredIdentity;
      dwellTimerRef.current = setTimeout(() => {
        dwellTimerRef.current = null;
        setMountedIdentity(targetIdentity);
        setPhase('active');
      }, interstitialDwellMs);
    }
  }, [desiredIdentity, mountedIdentity, phase, interstitialDwellMs]);

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
  return (
    <div
      data-canonical-shell-slot=""
      data-slot-identity={describeSlotIdentity(mountedIdentity)}
      key={describeSlotIdentity(mountedIdentity)}
    >
      {children}
    </div>
  );
}
