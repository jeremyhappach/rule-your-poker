import { useEffect, useState } from 'react';
import { run21Request, type Run21HistoryRecord } from '@/lib/run21/localClient';
import type { ReplayPackageV1 } from '@/lib/replay/contractV1';
import { MiniCardRow } from '../hand-history/MiniPlayingCard';

/** The History tab reads the same persisted events as playback, already privacy-filtered. */
export function Run21History({gameId, onReplay}: {gameId: string; onReplay?: (replay: ReplayPackageV1) => void}) {
  const [rows, setRows] = useState<Run21HistoryRecord[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { let live = true;
    void run21Request<Run21HistoryRecord[]>(gameId, 'history').then(r => {if (live) setRows(r);}).catch(e => {if (live) setError(e.message);});
    return () => {live = false;};
  }, [gameId]);
  if (error) return <p role="alert">{error}</p>;
  if (!rows) return <p>Loading history…</p>;
  return <div className="h-full overflow-auto p-2 space-y-2" data-run21-history>{rows.map(row => <details key={row.dealerGameId} open>
    <summary>Run21 match · {row.events.filter(e => e.type === 'round_revealed').length} rounds completed</summary>
    {row.replay && onReplay && <button className="underline" onClick={() => onReplay(row.replay!)}>Replay recorded match</button>}
    {row.events.filter(e => ['round_revealed', 'settlement_recorded'].includes(e.type)).map(event => <div key={event.sequence} className="rounded border p-2 text-xs">
      {event.type === 'settlement_recorded' ? <p>Isolated match stake: {event.frame.settlement?.amount}. Receipt {event.frame.settlement?.resultId}</p> : <>
        <strong>Round {event.frame.roundNumber}</strong>
        {event.frame.players.map(p => {const board = event.frame.boards[p.id]; return <div key={p.id}>
          <p>{p.name}: {board?.result?.score ?? 0} · {board?.result?.reason}</p>
          {board?.columns.map((cards, index) => <MiniCardRow key={index} cards={cards} label={`Column ${index + 1}`} />)}
        </div>;})}
      </>}
    </div>)}
  </details>)}</div>;
}
