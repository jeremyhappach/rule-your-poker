import type {CSSProperties} from 'react';
import type {Projection} from '@/lib/run21/model';
import {displayedScore} from '@/lib/run21/presentation';
import {Bot} from 'lucide-react';

export function Run21Scoreboard({view,now,transportBalances}:{view:Projection;now:number;transportBalances?:Record<string,number>}) {
  const active=view.scorePresentation?.playerId??view.active_player_id;
  return <div className="run21-scoreboard" role="table" aria-label="Run21 match scores" style={{'--run21-players':view.players.length} as CSSProperties}>
    {view.players.map(player=><div role="row" key={player.id} data-run21-score-player={player.id} data-active={player.id===active}>
      <span role="cell">{player.name}{view.automaticPlayers?.includes(player.id) && <span className="ml-1 inline-flex" role="img" aria-label={`${player.name} is auto-completing`} title="Auto-completing this match; sitting out next hand"><Bot size={16} aria-hidden="true"/></span>}</span>
      <strong role="cell" data-run21-score={view.cumulative[player.id]}>{(view.settlement?view.cumulative[player.id]:displayedScore(view,player.id,now)).toLocaleString()}</strong>
      {transportBalances && <small role="cell" className="run21-balance" data-chip-center={player.seat} data-chip-reaction-target={player.seat}
        aria-label={`${player.name} balance ${transportBalances[player.id] ?? 0}`}>{transportBalances[player.id] ?? 0}</small>}
    </div>)}
  </div>;
}
