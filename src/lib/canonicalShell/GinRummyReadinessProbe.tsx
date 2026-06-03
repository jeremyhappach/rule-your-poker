/**
 * GinRummyReadinessProbe — declares Gin's renderable-frame readiness
 * to the canonical SurfaceReadinessContract.
 *
 * Instrumentation (investigation-only):
 *  - Counts identity binds within a single startup window.
 *  - Times the initial DB fetch (start → response).
 *  - Logs whether parent already has gin_rummy_state available in
 *    currentRound (so we can tell whether the probe is re-fetching
 *    data the parent already holds).
 *  - Emits a summary on first ready=true with: bind count, fetch
 *    duration, whether parent had the frame at mount, and which source
 *    (fetch vs realtime vs parent-hint) provided the frame first.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  useReportSurfaceReady,
  type SurfaceReadinessIdentity,
} from './SurfaceReadinessContract';
import { ginTrace } from '@/lib/ginStartupTrace';
import { recordShellLifecycleEvent } from './shellLifecycleLog';

interface Props {
  dealerGameId: string | null;
  roundId: string | null;
  /** Investigation-only: truthy iff parent's currentRound.gin_rummy_state is already populated. */
  parentHasGinState?: boolean;
}

export function GinRummyReadinessProbe({ dealerGameId, roundId, parentHasGinState }: Props) {
  const [hasFrame, setHasFrame] = useState(Boolean(parentHasGinState));

  const identity: SurfaceReadinessIdentity | null =
    dealerGameId && roundId ? { dealerGameId, scope: roundId } : null;

  useReportSurfaceReady(identity, hasFrame);

  // ─── Instrumentation refs ───
  const bindCountRef = useRef(0);
  const firstBindAtRef = useRef<number | null>(null);
  const lastIdentityRef = useRef<string | null>(null);
  const fetchStartAtRef = useRef<number | null>(null);
  const parentHadFrameAtMountRef = useRef<boolean | null>(null);
  const readySourceRef = useRef<string | null>(null);

  useEffect(() => {
    if (hasFrame) {
      const t = performance.now();
      const summary = {
        roundId: roundId?.slice(0, 8) ?? null,
        dealerGameId: dealerGameId?.slice(0, 8) ?? null,
        identityBindCount: bindCountRef.current,
        msSinceFirstBind: firstBindAtRef.current != null ? Math.round(t - firstBindAtRef.current) : null,
        parentHadFrameAtMount: parentHadFrameAtMountRef.current,
        parentHasGinStateNow: Boolean(parentHasGinState),
        readySource: readySourceRef.current,
      };
      ginTrace('readiness probe: SUMMARY ready=true', summary);
      recordShellLifecycleEvent(
        'gin-ready',
        `binds=${summary.identityBindCount} src=${summary.readySource} ms=${summary.msSinceFirstBind} parentHad=${summary.parentHadFrameAtMount}`,
        summary,
      );
    }
  }, [hasFrame, roundId, dealerGameId, parentHasGinState]);

  // Identity bind — reset readiness + count binds.
  useEffect(() => {
    const key = `${dealerGameId ?? '-'}::${roundId ?? '-'}`;
    const isRebind = lastIdentityRef.current !== null && lastIdentityRef.current !== key;
    lastIdentityRef.current = key;
    bindCountRef.current += 1;
    if (firstBindAtRef.current == null) {
      firstBindAtRef.current = performance.now();
      parentHadFrameAtMountRef.current = Boolean(parentHasGinState);
    }
    setHasFrame(false);
    const detail = {
      dealerGameId: dealerGameId?.slice(0, 8) ?? null,
      roundId: roundId?.slice(0, 8) ?? null,
      bindCount: bindCountRef.current,
      isRebind,
      parentHasGinState: Boolean(parentHasGinState),
    };
    ginTrace('readiness probe: identity bound', detail);
    recordShellLifecycleEvent(
      'gin-identity',
      `bind#${bindCountRef.current} ${isRebind ? 'REBIND' : 'first'} round=${roundId?.slice(0, 8) ?? '-'} parentHad=${Boolean(parentHasGinState)}`,
      { ...detail, reason: 'identity-bind (resets hasFrame=false)' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealerGameId, roundId]);

  // Track parent-hint transitions (does parent already have gin state, and when?)
  useEffect(() => {
    if (parentHasGinState && !hasFrame && readySourceRef.current == null) {
      ginTrace('readiness probe: parent-hint indicates gin_rummy_state present', {
        roundId: roundId?.slice(0, 8) ?? null,
        msSinceFirstBind:
          firstBindAtRef.current != null ? Math.round(performance.now() - firstBindAtRef.current) : null,
        bindCount: bindCountRef.current,
      });
    }
  }, [parentHasGinState, hasFrame, roundId]);

  // Initial fetch — with timing.
  useEffect(() => {
    if (!roundId) return;
    let cancelled = false;
    const startedAt = performance.now();
    fetchStartAtRef.current = startedAt;
    ginTrace('readiness probe: initial fetch dispatched', {
      roundId: roundId.slice(0, 8),
      bindCount: bindCountRef.current,
      parentHasGinStateAtFetch: Boolean(parentHasGinState),
    });
    (async () => {
      const { data, error } = await supabase
        .from('rounds')
        .select('gin_rummy_state')
        .eq('id', roundId)
        .maybeSingle();
      const durationMs = Math.round(performance.now() - startedAt);
      if (cancelled) {
        ginTrace('readiness probe: initial fetch CANCELLED', {
          roundId: roundId.slice(0, 8),
          durationMs,
        });
        return;
      }
      ginTrace('readiness probe: initial fetch returned', {
        roundId: roundId.slice(0, 8),
        durationMs,
        hasState: Boolean(data?.gin_rummy_state),
        errored: Boolean(error),
        errorMsg: error?.message ?? null,
      });
      recordShellLifecycleEvent(
        'gin-fetch',
        `dur=${durationMs}ms hasState=${Boolean(data?.gin_rummy_state)}`,
        { roundId: roundId.slice(0, 8), durationMs, hasState: Boolean(data?.gin_rummy_state) },
      );
      if (data?.gin_rummy_state) {
        if (readySourceRef.current == null) readySourceRef.current = 'fetch';
        setHasFrame(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const dtSinceFetchStart =
            fetchStartAtRef.current != null
              ? Math.round(performance.now() - fetchStartAtRef.current)
              : null;
          ginTrace('readiness probe: realtime event', {
            roundId: roundId.slice(0, 8),
            hasState: Boolean(row?.gin_rummy_state),
            msSinceFetchStart: dtSinceFetchStart,
          });
          if (row?.gin_rummy_state) {
            if (readySourceRef.current == null) readySourceRef.current = 'realtime';
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
