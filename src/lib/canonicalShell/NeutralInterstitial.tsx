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

  useEffect(() => {
    recordShellEvent('slot-entered-neutral', {
      gameId: gameId ?? null,
      detail: { reason: reason ?? null },
    });
    return () => {
      recordShellEvent('slot-left-neutral', {
        gameId: gameId ?? null,
        detail: { reason: reason ?? null },
      });
    };
    // Single mount/unmount lifecycle — telemetry must not churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-canonical-shell-neutral=""
      aria-hidden="true"
      className="w-full h-full min-h-0 flex flex-col bg-shell-neutral"
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
