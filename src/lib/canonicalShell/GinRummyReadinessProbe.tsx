/**
 * GinRummyReadinessProbe — declares Gin's renderable-frame readiness
 * to the canonical SurfaceReadinessContract.
 *
 * Mounted as a sibling of the gameplay slot (outside PlayfieldSlotController),
 * so it can observe Gin's authoritative first frame BEFORE the slot
 * controller decides to mount the Gin surface. Reports:
 *
 *   ready = the round identified by `roundId` has a non-empty
 *           `gin_rummy_state` JSON payload in the DB (i.e. the deal has
 *           been persisted and a real frame can be rendered).
 *
 * This component renders nothing. It only reports through
 * `useReportSurfaceReady`. The shell remains game-agnostic; Gin is just
 * the first surface family that opts into nontrivial readiness.
 *
 * Realtime is preferred; an initial fetch covers the cold-start window
 * where realtime hasn't delivered the row yet.
 */

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  useReportSurfaceReady,
  type SurfaceReadinessIdentity,
} from './SurfaceReadinessContract';
import { ginTrace } from '@/lib/ginStartupTrace';

interface Props {
  dealerGameId: string | null;
  roundId: string | null;
}

export function GinRummyReadinessProbe({ dealerGameId, roundId }: Props) {
  const [hasFrame, setHasFrame] = useState(false);

  const identity: SurfaceReadinessIdentity | null =
    dealerGameId && roundId ? { dealerGameId, scope: roundId } : null;

  useReportSurfaceReady(identity, hasFrame);

  useEffect(() => {
    if (hasFrame) {
      ginTrace('readiness probe: reporting ready=true', {
        roundId: roundId?.slice(0, 8) ?? null,
      });
    }
  }, [hasFrame, roundId]);

  // Reset readiness when identity changes.
  useEffect(() => {
    setHasFrame(false);
    ginTrace('readiness probe: identity bound', {
      dealerGameId: dealerGameId?.slice(0, 8) ?? null,
      roundId: roundId?.slice(0, 8) ?? null,
    });
  }, [dealerGameId, roundId]);

  // Initial fetch.
  useEffect(() => {
    if (!roundId) return;
    let cancelled = false;
    ginTrace('readiness probe: initial fetch dispatched', {
      roundId: roundId.slice(0, 8),
    });
    (async () => {
      const { data } = await supabase
        .from('rounds')
        .select('gin_rummy_state')
        .eq('id', roundId)
        .maybeSingle();
      if (cancelled) return;
      ginTrace('readiness probe: initial fetch returned', {
        roundId: roundId.slice(0, 8),
        hasState: Boolean(data?.gin_rummy_state),
      });
      if (data?.gin_rummy_state) {
        console.log('[GIN_RUNTIME_TIMELINE] readiness probe: frame available (fetch)', {
          roundId: roundId.slice(0, 8),
        });
        setHasFrame(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roundId]);

  // Realtime: flip ready as soon as the row gains gin_rummy_state.
  useEffect(() => {
    if (!roundId) return;
    const channel = supabase
      .channel(`gin-readiness-${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rounds',
          filter: `id=eq.${roundId}`,
        },
        (payload: any) => {
          const row = payload.new ?? payload.record;
          ginTrace('readiness probe: realtime event', {
            roundId: roundId.slice(0, 8),
            hasState: Boolean(row?.gin_rummy_state),
          });
          if (row?.gin_rummy_state) {
            console.log('[GIN_RUNTIME_TIMELINE] readiness probe: frame available (realtime)', {
              roundId: roundId.slice(0, 8),
            });
            setHasFrame(true);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roundId]);

  return null;
}
