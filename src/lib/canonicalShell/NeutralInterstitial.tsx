/**
 * NeutralInterstitial — canonical between-slots placeholder (Phase 6).
 *
 * Phase 6 ships this component as a tested, ready-to-mount module.
 * Production code does NOT mount it in this phase; Phase 7 will wire
 * it into the slot transition flow. Mounting fires
 * slot-entered-neutral / slot-left-neutral telemetry.
 */

import { useEffect } from 'react';
import { recordShellEvent } from './diagnostics';
import { CanonicalFeltSurface, type CanonicalFeltGameKind } from './CanonicalFeltSurface';
import { useGeometryTokensOptional } from './ResponsiveGeometryProvider';
import { useLifecycleMount } from './lifecycleDebug';
import { ginTrace } from '@/lib/ginStartupTrace';


export interface NeutralInterstitialProps {
  gameId?: string | null;
  /** Optional label visible only in dev for diagnostics. */
  reason?: string;
  gameKind?: CanonicalFeltGameKind | null;
  anteAmount?: number | string;
}

export function NeutralInterstitial({ gameId, reason, gameKind, anteAmount = 0 }: NeutralInterstitialProps) {
  const geometry = useGeometryTokensOptional();
  const tableSurfaceMaxHeight = geometry?.tableSurfaceMaxHeight ?? '55vh';
  useLifecycleMount('NeutralInterstitial', { reason, gameKind });


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
  return (
    <div
      data-canonical-shell-neutral=""
      aria-hidden="true"
      className="flex-1 min-h-0 flex flex-col"
    >
      {gameKind ? (
        <div className="flex-1 relative overflow-hidden min-h-0" style={{ maxHeight: tableSurfaceMaxHeight }}>
          <CanonicalFeltSurface
            gameKind={gameKind}
            anteAmount={anteAmount}
            isWaitingPhase={false}
          />
        </div>
      ) : null}
    </div>
  );
}
