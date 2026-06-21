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
  /** Outer ring size in px. Defaults to 48 (matches MobilePlayerTimer). */
  size?: number;
  /** Optional diagnostic identifiers — telemetry only, no behavior. */
  seatPosition?: number;
  gameId?: string;
  gameType?: string;
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
  size = 48,
  seatPosition,
  gameId,
  gameType,
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

  return (
    <MobilePlayerTimer
      timeLeft={timeLeft}
      maxTime={maxTime}
      isActive={isActive}
      size={size}
    >
      {children}
    </MobilePlayerTimer>
  );
}
