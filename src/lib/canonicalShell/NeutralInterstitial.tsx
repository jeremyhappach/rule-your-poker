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

export interface NeutralInterstitialProps {
  gameId?: string | null;
  /** Optional label visible only in dev for diagnostics. */
  reason?: string;
}

export function NeutralInterstitial({ gameId, reason }: NeutralInterstitialProps) {
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
      // Intrinsic size: the slot region must not collapse to 0px during
      // the dwell, otherwise overlays/backdrops show through as a
      // full-screen black/blank flash. The neutral surface fills its
      // slot container and renders as an idle felt table — NOT a page
      // background flash. Keep this neutral chrome, not felt: the actual
      // gameplay surface owns table felt so transition dwell cannot paint
      // a full-screen green field above the slot.
      className="w-full h-full min-h-0 flex-1 bg-background"
    />
  );
}
