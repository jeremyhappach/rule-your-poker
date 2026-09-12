import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { HistoryGame, HistoryResponse } from './canonicalHistory';

export function useCanonicalHistory(gameId: string, currentUserId?: string, currentRound?: number | null) {
  const [games, setGames] = useState<HistoryGame[]>([]);
  const [viewerId, setViewerId] = useState(currentUserId);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedRef = useRef<string | null>(null);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let retired = false;
    let busy = false;
    let dirty = false;
    setGames([]);
    setSelected(null);
    selectedRef.current = null;
    setLoading(true);
    setError(null);
    const read = async (dealerId: string | null) => {
      const { data, error: rpcError } = await supabase.rpc('get_hand_history' as never, {
        p_game_id: gameId, p_dealer_game_id: dealerId,
      } as never);
      if (rpcError) throw rpcError;
      const response = data as unknown as HistoryResponse;
      if (response?.version !== 1 || !Array.isArray(response.games)) throw new Error('Invalid history response');
      return response.games;
    };
    const refresh = async () => {
      dirty = true;
      if (busy || retired) return;
      busy = true;
      try {
        do {
          dirty = false;
          const session = await supabase.auth.getSession();
          const uid = session.data.session?.user.id;
          if (retired) return;
          setViewerId(uid);
          const index = await read(null);
          const dealerId = selectedRef.current;
          const details = dealerId ? await read(dealerId) : [];
          if (retired) return;
          if (selectedRef.current !== dealerId) { dirty = true; continue; }
          setGames(index.map(g => details.find(d => d.id === g.id) ?? g));
          setError(null);
        } while (dirty && !retired);
      } catch {
        if (!retired) setError('History could not be loaded. Please retry.');
      } finally {
        busy = false;
        if (!retired) setLoading(false);
      }
    };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    const channel = supabase.channel(`canonical-history:${gameId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_results', filter: `game_id=eq.${gameId}` }, () => { void refresh(); })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rounds', filter: `game_id=eq.${gameId}` }, () => { void refresh(); })
      .subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    const onResume = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('focus', onResume);
    document.addEventListener('visibilitychange', onResume);
    return () => {
      retired = true;
      refreshRef.current = () => {};
      void supabase.removeChannel(channel);
      window.removeEventListener('focus', onResume);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [gameId, currentUserId]);

  useEffect(() => { refreshRef.current(); }, [currentRound]);
  const selectGame = useCallback((id: string | null) => {
    selectedRef.current = id;
    setSelected(id);
    refreshRef.current();
  }, []);
  return { games, viewerId, selected, selectGame, loading, error, retry: () => refreshRef.current() };
}
