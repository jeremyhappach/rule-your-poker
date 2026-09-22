import type {Intent, Projection} from '@/lib/run21/model';
import {aggregate, canCollect, duration} from '@/lib/run21/rules';

export function Run21PassStatus({used}:{used:boolean}) {
  return used?null:<span className="run21-pass-status" data-run21-pass-available aria-label="Pass available" title="Pass available">P</span>;
}

/** The shell owns the active pane; only the viewing player can issue intents. */
export function Run21PlayerPane({view,now,onIntent,pending=false}:{view:Projection;now:number;onIntent?:(intent:Intent)=>void;pending?:boolean}) {
  const board=view.viewerId?view.boards[view.viewerId]:null;
  if(!board)return null;
  if(!view.revealed&&view.active_player_id!==view.viewerId) return <div role="status">{view.players.find(p=>p.id===view.active_player_id)?.name??'Opponent'} is playing</div>;
  const active=!view.revealed&&!board.result&&!!board.current&&(board.deadline===null||now<board.deadline)&&!pending&&!!onIntent;
  return <div className="run21-player-actions" data-run21-player-actions>
    <button className="run21-pass-button" type="button" disabled={!active||board.passesUsed>=view.config.passes} onClick={()=>onIntent?.({type:'pass'})}>
      {board.passesUsed>=view.config.passes?'Pass used':'Pass'}
    </button>
    <button className="run21-collect-button" type="button" disabled={!active||!canCollect(board,view.config)} onClick={()=>onIntent?.({type:'collect'})}>
      Collect Win <small>{aggregate(board,view.config)}</small>
    </button>
  </div>;
}

/** Presentation of the existing deadline, with no local clock or progression owner. */
export function Run21Timer({view,now}:{view:Projection;now:number}) {
  const board=view.viewerId?view.boards[view.viewerId]:null;
  if(!board)return <span className="run21-timer-caption">Watching Run21</span>;
  if(view.revealed||(view.active_player_id!==undefined&&view.active_player_id!==view.viewerId))return null;
  const full=duration(view.config);
  const remaining=board.startedAt===null?full:Math.max(0,Math.min(full,board.deadline!-(board.result?.at??now)));
  const percent=100*remaining/full;
  return <div className="run21-timer" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    aria-valuetext={board.startedAt===null?'Waiting for turn':`${(remaining/1000).toFixed(1)} seconds remaining`} data-run21-time-remaining={remaining}>
    <span className="run21-timer-fill" style={{width:`${percent}%`}}/>
  </div>;
}
