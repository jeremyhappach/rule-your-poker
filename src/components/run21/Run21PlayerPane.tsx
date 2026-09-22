import type {Intent, Projection} from '@/lib/run21/model';
import {aggregate, canFinish, duration} from '@/lib/run21/rules';
import {displayedPlayerId} from '@/lib/run21/presentation';

/** The shell owns the active pane; only the viewing player can issue intents. */
export function Run21PlayerPane({view,now,onIntent,pending=false}:{view:Projection;now:number;onIntent?:(intent:Intent)=>void;pending?:boolean}) {
  const board=view.viewerId?view.boards[view.viewerId]:null;
  if(!board)return null;
  if(view.scorePresentation)return null;
  if(!view.revealed&&view.active_player_id!==view.viewerId) return null;
  const active=!view.revealed&&!board.result&&!!board.current&&(board.deadline===null||now<board.deadline)&&!pending&&!!onIntent;
  return <div className="run21-player-actions" data-run21-player-actions>
    <button className="run21-collect-button" type="button" disabled={!active||!canFinish(board,view.config)} onClick={()=>onIntent?.({type:'collect'})}>
      {aggregate(board,view.config)<97?'Give Up':'Take Win'} <small>{aggregate(board,view.config)}</small>
    </button>
  </div>;
}

/** Presentation of the existing deadline, with no local clock or progression owner. */
export function Run21Timer({view,now}:{view:Projection;now:number}) {
  const board=view.boards[displayedPlayerId(view)];
  if(!board)return <span className="run21-timer-caption">Watching Run21</span>;
  if(view.revealed)return null;
  const full=duration(view.config);
  const remaining=board.startedAt===null?full:Math.max(0,Math.min(full,board.deadline!-(board.result?.at??now)));
  const percent=100*remaining/full;
  const speed=Math.min(250,Math.ceil(remaining/1000));
  return <div className="run21-speed"><span data-run21-speed={speed}>Speed {speed}</span><div className="run21-timer" role="progressbar" aria-label="Round time remaining" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}
    aria-valuetext={board.startedAt===null?'Speed 250, waiting for first placement':`${(remaining/1000).toFixed(1)} seconds remaining`} data-run21-time-remaining={remaining}>
    <span className={`run21-timer-fill ${percent>10?'bg-green-500':percent>5?'bg-yellow-500':'bg-destructive'}`} data-run21-time-tone={percent>10?'success':percent>5?'warning':'danger'} style={{width:`${percent}%`}}/>
  </div></div>;
}
