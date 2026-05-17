import { useEffect } from 'react';
import { logDebugEvent } from '@/lib/debugEventLogger';

/**
 * Phase 0 instrumentation for the Unified Game Table initiative.
 *
 * Drops a structured mount/unmount event into `debug_events` for whichever
 * top-level surface mounted it. Fire-and-forget, gated by `?debug_events=1`,
 * never blocks rendering, never affects sync.
 *
 * Usage:
 *   <MountChurnLogger gameId={gameId!} label="MobileGameTable:status-keyed"
 *     context={{ status: game.status }} />
 *
 * The component renders nothing. Place it as a sibling of the surface whose
 * lifecycle you want to measure.
 */
interface Props {
  gameId: string;
  label: string;
  context?: Record<string, unknown>;
}

export const MountChurnLogger = ({ gameId, label, context }: Props) => {
  useEffect(() => {
    logDebugEvent({
      gameId,
      eventType: 'unified_shell:mount',
      payload: { label, ...(context ?? {}) },
    });
    return () => {
      logDebugEvent({
        gameId,
        eventType: 'unified_shell:unmount',
        payload: { label, ...(context ?? {}) },
      });
    };
    // Intentionally mount/unmount only — context is informational, not a re-run trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
};
