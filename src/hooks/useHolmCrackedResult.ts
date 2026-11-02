import {useEffect, useRef, useState} from 'react';
import {supabase} from '@/integrations/supabase/client';

export interface HolmCrackedResult {
  id: string; game_id: string; dealer_game_id: string | null; hand_number: number;
  event_kind: string | null; player_chip_changes: unknown;
}
export function isHolmCrackedResult(row: HolmCrackedResult, gameId: string, dealerGameId: string, hand: number, playerId: string) {
  if (row.game_id !== gameId || row.dealer_game_id !== dealerGameId || row.hand_number !== hand || !row.id) return false;
  if (row.event_kind !== 'chucky_loss_pot_match' && row.event_kind !== 'chucky_tiebreak_pot_match') return false;
  const deltas = row.player_chip_changes;
  return !!deltas && typeof deltas === 'object' && !Array.isArray(deltas)
    && typeof (deltas as Record<string, unknown>)[playerId] === 'number'
    && Number((deltas as Record<string, unknown>)[playerId]) < 0;
}

/** Only an observed live hand can admit its immutable, atomically settled result.
 * No display names/text, polling, client outcomes, or historical result playback. */
export function useHolmCrackedResult(gameId: string | undefined, dealerGameId: string | null | undefined,
  hand: number | null | undefined, playerId: string | undefined, status: string | undefined, enabled: boolean) {
  const scope = `${gameId}:${dealerGameId}:${hand}:${playerId}`;
  const live = useRef<string | null>(null);
  const [result, setResult] = useState<{scope: string; id: string} | null>(null);
  useEffect(() => {
    const retire = () => { live.current = null; setResult(null); };
    const hidden = () => { if (document.hidden) retire(); };
    document.addEventListener('visibilitychange', hidden); window.addEventListener('offline', retire);
    return () => { document.removeEventListener('visibilitychange', hidden); window.removeEventListener('offline', retire); };
  }, []);
  useEffect(() => {
    if (!enabled || document.hidden || !navigator.onLine) { live.current = null; return; }
    if (status === 'betting' || status === 'active') { live.current = scope; return; }
    if (status !== 'completed' || live.current !== scope || !gameId || !dealerGameId || hand == null || !playerId) return;
    const abort = new AbortController();
    void (async () => {
      const {data, error} = await supabase.from('game_results')
        .select('id,game_id,dealer_game_id,hand_number,event_kind,player_chip_changes')
        .eq('game_id', gameId).eq('dealer_game_id', dealerGameId).eq('hand_number', hand)
        .in('event_kind', ['chucky_loss_pot_match', 'chucky_tiebreak_pot_match'])
        .abortSignal(abort.signal).maybeSingle();
      if (!abort.signal.aborted && live.current === scope && !error && data && isHolmCrackedResult(data, gameId, dealerGameId, hand, playerId))
        setResult({scope, id: data.id});
    })().catch(() => {});
    return () => abort.abort();
  }, [scope, status, enabled]);
  return enabled && result?.scope === scope ? result.id : null;
}
