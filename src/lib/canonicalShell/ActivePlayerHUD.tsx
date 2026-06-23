/**
 * ActivePlayerHUD — canonical shell HUD wrapper (Phase 2).
 *
 * Owns the per-seat HUD presentation (timer ring + active glow) that
 * appears around the current player's chip stack during their turn.
 *
 * Phase 2 scope: thin canonical wrapper that delegates rendering to
 * the existing MobilePlayerTimer component. This establishes the
 * shell-owned API surface and a single point of consumption for the
 * "active player HUD" concept across game bodies, with zero
 * behavioral drift — output is byte-identical to the prior inline
 * MobilePlayerTimer usage.
 *
 * In later phases, this module becomes the only path through which
 * games request HUD presentation; the underlying MobilePlayerTimer
 * implementation can then be replaced/upgraded in one place without
 * touching call sites.
 */

import { MobilePlayerTimer } from '@/components/MobilePlayerTimer';
import { useDealRuntime } from '@/lib/canonicalShell/cardTransport/DealRuntime';
import { getCanonicalTimerEligibility } from '@/lib/canonicalShell/timerEligibility';
import {
  recordThreeFiveSevenTimerOwner,
  unregisterThreeFiveSevenTimerOwner,
} from '@/lib/canonicalShell/cardTransport/threeFiveSevenForensicsStore';
import { recordHolmFull, setHolmFullIdentity } from '@/lib/canonicalShell/cardTransport/holmFullForensics';
import { recordShellEvent } from './diagnostics';
import { useEffect, useRef, type ReactNode } from 'react';
import { useLifecycleMount } from './lifecycleDebug';
import { useUnmountSnapshot } from './shellLifecycleLog';
import { useStartupMountTrace, useStartupRenderTrace } from '@/lib/startupFlightRecorder';


export interface ActivePlayerHUDProps {
  /** Seconds remaining for this player's decision; null when not active. */
  timeLeft: number | null;
  /** Max seconds for the active turn (for ring progress). */
  maxTime: number;
  /** True when this seat currently has the active turn HUD. */
  isActive: boolean;
  /**
   * Authoritative server `decision_deadline` as epoch ms (or null when
   * no actionable deadline exists). Forwarded to MobilePlayerTimer so
   * the segment seed binds to the server clock, not the client-derived
   * `timeLeft`. Ensures the visible label is `ceil((deadlineMs-now)/1000)`
   * — full under sub-second propagation, honest under longer propagation.
   */
  deadlineMs?: number | null;
  /** Outer ring size in px. Defaults to 48 (matches MobilePlayerTimer). */
  size?: number;
  /** Optional diagnostic identifiers — telemetry only, no behavior. */
  seatPosition?: number;
  gameId?: string;
  gameType?: string;
  activePlayerId?: string | null;
  /** The content this HUD frames (typically the player's chip stack).
   *  Optional so the cluster (Wave 3C.3a chipHUD slot) can mount this
   *  as a wrapper element and inject the chip body via cloneElement. */
  children?: ReactNode;
}

/**
 * Canonical active-player HUD. Currently a transparent delegate to
 * MobilePlayerTimer so behavior matches existing rendering exactly.
 */
export function ActivePlayerHUD({
  timeLeft,
  maxTime,
  isActive,
  deadlineMs,
  size = 48,
  seatPosition,
  gameId,
  gameType,
  activePlayerId,
  children,
}: ActivePlayerHUDProps) {
  useLifecycleMount('ActivePlayerHUD');
  useStartupMountTrace('ActivePlayerHUD', { gameId: gameId ?? null, gameType: gameType ?? null, seatPosition: seatPosition ?? null });
  useStartupRenderTrace('ActivePlayerHUD', {
    timeLeft,
    maxTime,
    isActive,
    size,
    seatPosition: seatPosition ?? null,
    gameId: gameId ?? null,
    gameType: gameType ?? null,
  }, { file: 'src/lib/canonicalShell/ActivePlayerHUD.tsx' });
  useUnmountSnapshot('ActivePlayerHUD', {
    parent: 'MobileGameTable seat render (chip stack wrapper)',
    seatPosition: seatPosition ?? null,
    gameId: gameId ?? null,
    gameType: gameType ?? null,
    isActive,
    timeLeft,
    maxTime,
  });
  // Diagnostic: record active-handoff transitions per seat for the
  // canonical-shell telemetry stream. No-op outside dev.
  const wasActiveRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    if (isActive !== wasActiveRef.current) {
      recordShellEvent(isActive ? 'overlay-enter' : 'overlay-exit', {
        gameId: gameId ?? null,
        gameType: gameType ?? null,
        detail: {
          surface: 'active-player-hud',
          seatPosition: seatPosition ?? null,
        },
      });
      wasActiveRef.current = isActive;
    }
  }, [isActive, seatPosition, gameId, gameType]);

  // Timer ownership rule: while a DealRuntime is in DEALING phase the
  // turn timer is suppressed everywhere on this felt — cards are still
  // flying, GAMEPLAY hasn't begun. Once the runtime advances to
  // READY/GAMEPLAY (or no runtime is mounted) the timer resumes from
  // the authoritative props. Holm runs through the SAME canonical
  // eligibility path — the prior Holm bypass is removed. The Holm
  // branch of getCanonicalTimerEligibility already requires
  // dealSettled && readyReleased, which is the only Holm-specific
  // visual/running condition. (Card actionability — canPlayerAct — is
  // already AND-ed into `isActive` by the caller.)
  const deal = useDealRuntime();
  const isHolm = gameType === 'holm-game';
  const eligibility = deal
    ? getCanonicalTimerEligibility({
        gameType,
        dealPhase: deal.phase,
        dealSettled: deal.dealSettled,
        readyReleased: deal.readyReleased,
        activePlayerId: activePlayerId ?? (isActive ? String(seatPosition ?? '') : null),
      })
    : { visible: isActive, running: isActive && timeLeft !== null && timeLeft > 0 };
  const effectiveIsActive = eligibility.visible;
  const effectiveTimeLeft = eligibility.running ? timeLeft : null;
  const renderCountRef = useRef(0);
  renderCountRef.current += 1;
  const timerOwnerId = `ActivePlayerHUD:${gameId ?? 'game'}:${seatPosition ?? 'seat'}:${gameType ?? 'unknown'}`;
  useEffect(() => {
    recordThreeFiveSevenTimerOwner(timerOwnerId, {
      componentName: 'ActivePlayerHUD→MobilePlayerTimer',
      gameType: gameType ?? null,
      handContextId: deal?.handContextId ?? null,
      waveContextId: deal?.handContextId ?? null,
      dealRuntimeId: deal?.handContextId?.replace(/#r\d+$/, '') ?? null,
      phase: deal?.phase ?? 'NO_RUNTIME',
      visible: !!effectiveIsActive,
      running: !!effectiveIsActive && effectiveTimeLeft !== null && effectiveTimeLeft > 0,
      timeLeft: effectiveTimeLeft,
      usesDealRuntime: !!deal,
      suppressedLegacySource: deal?.phase === 'DEALING' && isActive ? 'ActivePlayerHUD props' : null,
      attemptedRunning: !!isActive && timeLeft !== null && timeLeft > 0,
      reactKey: `${gameType ?? 'unknown'}:${seatPosition ?? 'seat'}`,
      renderCount: renderCountRef.current,
    });
  }, [timerOwnerId, gameType, seatPosition, deal?.handContextId, deal?.phase, deal?.dealSettled, deal?.readyReleased, effectiveIsActive, effectiveTimeLeft, isActive, timeLeft, gameId]);
  useEffect(() => () => unregisterThreeFiveSevenTimerOwner(timerOwnerId), [timerOwnerId]);

  // ── HOLM FULL FORENSICS: parent-derivation per render ─────────────
  // Records the exact authoritative inputs and derived MobilePlayerTimer
  // props every commit. Pure instrumentation, Holm only, no behavior.
  if (isHolm) {
    try {
      setHolmFullIdentity({
        gameId: gameId ?? null,
        gameType: gameType ?? null,
        handContextId: deal?.handContextId ?? null,
        activePlayerId: activePlayerId ?? null,
      });
      recordHolmFull({
        category: 'TIMER_PROP_DERIVATION',
        event: 'ACTIVE_PLAYER_HUD_RENDER',
        source: 'ActivePlayerHUD',
        sourceCategory: 'PARENT_DERIVATION',
        callsite: 'src/lib/canonicalShell/ActivePlayerHUD.tsx',
        commitId: renderCountRef.current,
        payload: {
          propsIn: { timeLeft, maxTime, isActive, size, seatPosition, activePlayerId },
          dealRuntime: deal ? { phase: deal.phase, dealSettled: deal.dealSettled, readyReleased: deal.readyReleased, handContextId: deal.handContextId, gameType: deal.gameType } : null,
          isHolmBypass: isHolm,
          effectiveIsActive,
          effectiveTimeLeft,
          eligibility,
          derivationFormula: 'Holm: effectiveIsActive=isActive; effectiveTimeLeft = isActive && timeLeft>0 ? timeLeft : null',
        },
      });
    } catch { /* never throw from instrumentation */ }
  }


  // Canonical timer activation key. STABLE for one uninterrupted turn
  // segment. Composed of canonical turn identity tokens:
  //   handContextId (turn-of-hand identity)
  //   activePlayerId (turn-actor identity)
  //   gameId (cross-dealer-game disambiguator)
  // No clock, no rAF, no timeLeft, no render counter. Pause-resume
  // generation reserved for future explicit pause semantics; absent
  // today.
  const activationKey = effectiveIsActive
    ? `gid:${gameId ?? '∅'}|hci:${deal?.handContextId ?? '∅'}|actor:${activePlayerId ?? `seat${seatPosition ?? '?'}`}|gen:0`
    : null;

  return (
    <MobilePlayerTimer
      timeLeft={effectiveTimeLeft}
      maxTime={maxTime}
      isActive={effectiveIsActive}
      size={size}
      activationKey={activationKey}
      deadlineMs={effectiveIsActive ? (deadlineMs ?? null) : null}
    >
      {children}
    </MobilePlayerTimer>
  );
}

