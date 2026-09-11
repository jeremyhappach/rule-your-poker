import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchLobbyGames, LobbyFetchAbortedError, type LobbyGame } from '@/lib/lobbyFetch';
import { PerfSession } from '@/lib/perf';
import { useToast } from '@/hooks/use-toast';

const FETCH_TIMEOUT_MS = 12_000;
const HEALTHY_REFRESH_MS = 60_000;
const RECOVERY_REFRESH_MS = 10_000;

/** One mounted lobby owns its reads; realtime only invalidates the DB projection. */
export function useLobbyGames(userId: string) {
  const [games, setGames] = useState<LobbyGame[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const refreshRef = useRef<() => void>(() => {});
  const refresh = useCallback(() => refreshRef.current(), []);

  useEffect(() => {
    let disposed = false;
    let subscribed = false;
    let readFailed = false;
    let active: AbortController | null = null;
    let queued = false;
    let scheduled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastErrorKey: string | null = null;
    const visible = () => document.visibilityState !== 'hidden';
    setGames([]);
    setLoading(true);

    const scheduleReconciliation = () => {
      clearTimeout(timer);
      if (disposed || !visible()) return;
      // Keep a bounded reconciliation for missed events. Fast retries remain
      // available during subscription or HTTP failures, with no hidden polling.
      timer = setTimeout(requestRefresh,
        subscribed && !readFailed ? HEALTHY_REFRESH_MS : RECOVERY_REFRESH_MS);
    };

    const fetchGames = async () => {
      if (disposed || !visible()) return;
      if (active) {
        queued = true;
        return;
      }
      clearTimeout(timer);
      const controller = new AbortController();
      active = controller;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, FETCH_TIMEOUT_MS);
      const perf = new PerfSession('GameLobby.fetchGames', 300);
      try {
        const result = await perf.step('lobby.fetch', () =>
          fetchLobbyGames({ userId, signal: controller.signal }));
        if (disposed) return;
        setGames(result);
        readFailed = false;
        lastErrorKey = null;
        perf.done({ gameCount: result.length });
      } catch (error) {
        if (disposed) return;
        if (!timedOut && (error instanceof LobbyFetchAbortedError || controller.signal.aborted)) return;
        readFailed = true;
        const detail = error as { code?: string; message?: string };
        const key = timedOut ? 'lobby-fetch-timeout' : detail?.code || detail?.message || 'unknown';
        if (lastErrorKey !== key) {
          lastErrorKey = key;
          toast({
            title: timedOut ? 'Lobby connection timed out' : 'Error',
            description: timedOut ? 'Trying to refresh games again shortly.' : 'Failed to fetch games',
            variant: 'destructive',
          });
        }
        perf.done({ error: String(detail?.message ?? error), timedOut });
      } finally {
        clearTimeout(timeout);
        if (disposed) return;
        active = null;
        setLoading(false);
        if (queued) {
          queued = false;
          requestRefresh();
        } else {
          scheduleReconciliation();
        }
      }
    };

    function requestRefresh() {
      if (disposed || !visible() || scheduled) return;
      // Collapse synchronous signals, but preserve one follow-up if a write
      // arrives during a read. Never cancel an initial read to start another.
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        void fetchGames();
      });
    }
    refreshRef.current = requestRefresh;
    requestRefresh();

    // Watch every table contributing to the list, including completed-session
    // counts and display names, so their freshness does not depend on polling.
    const channel = supabase.channel('games-lobby-channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, requestRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, requestRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'session_player_snapshots' }, requestRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, requestRefresh)
      .subscribe(status => {
        if (disposed) return;
        subscribed = status === 'SUBSCRIBED';
        // Includes cold subscribe and rejoin: close the fetch/subscribe gap.
        if (subscribed) requestRefresh();
        else scheduleReconciliation();
      });
    const handleVisibility = () => {
      if (visible()) requestRefresh();
      else clearTimeout(timer);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', requestRefresh);
    window.addEventListener('online', requestRefresh);

    return () => {
      disposed = true;
      refreshRef.current = () => {};
      clearTimeout(timer);
      active?.abort();
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', requestRefresh);
      window.removeEventListener('online', requestRefresh);
      void supabase.removeChannel(channel);
    };
  }, [userId, toast]);

  return { games, loading, refresh };
}
