import type {Intent, BoardProjection as Projection} from '@/lib/run21/model';
import {aggregate, canFinish, duration, speedAt} from '@/lib/run21/rules';
import {displayedPlayerId} from '@/lib/run21/presentation';
import {multiplierAt} from '@/lib/run21/rules';
import {roundIntro} from '@/lib/run21/roundIntro';
import {RoundTimeBar} from '@/lib/canonicalShell/RoundTimeBar';

/** The shell owns the active pane; only the viewing player can issue intents. */
export function Run21PlayerPane({view,now,onIntent,pending=false,withPass=false}:{withPass?:boolean;view:Projection;now:number;onIntent?:(intent:Intent)=>void;pending?:boolean}) {
  const board=view.viewerId?view.boards[view.viewerId]:null;
  if(!board)return null;
  if(view.scorePresentation)return null;
  if(!view.revealed&&view.active_player_id!==view.viewerId) return null;
  const active=!roundIntro(view,now)&&view.pausedAt==null&&!view.automaticPlayers?.includes(view.viewerId!)&&!view.revealed&&!board.result&&!!board.current&&(board.deadline===null||now<board.deadline)&&!!onIntent;
  const eligible=active&&canFinish(board,view.config);
  return <div className="run21-player-actions" data-run21-player-actions data-run21-table-actions={withPass||undefined}>
    <button className="run21-collect-button" type="button" data-eligible={eligible||undefined} disabled={!eligible||pending} onClick={()=>onIntent?.({type:'collect'})}>
      {multiplierAt(aggregate(board,view.config),view.config)>0?'Take Win':'Give Up'} <small>{aggregate(board,view.config)}</small>
    </button>
    {withPass&&board.current&&!board.result&&board.passesUsed<view.config.passes&&<button type="button" aria-label="Pass" disabled={!active||pending} onClick={()=>onIntent?.({type:'pass'})}>Pass</button>}
  </div>;
}

/** Presentation of the existing deadline, with no local clock or progression owner. */
export function Run21Timer({view,now}:{view:Projection;now:number}) {
  if(roundIntro(view,now))return null;
  const board=view.boards[displayedPlayerId(view)];
  if(!board)return null;
  if(view.revealed)return null;
  const at=view.pausedAt??now;
  if(board.startedAt===null&&board.firstPlacementDeadline!=null&&!view.automaticPlayers?.includes(board.playerId)) {
    const remaining=Math.max(0,board.firstPlacementDeadline-at);
    return <div className="run21-speed"><RoundTimeBar remaining={remaining} full={view.config.firstPlacementSeconds===undefined?duration(view.config):view.config.firstPlacementSeconds*1000}/></div>;
  }
  const full=duration(view.config);
  const remaining=board.startedAt===null?full:Math.max(0,Math.min(full,board.deadline!-(board.result?.at??at)));
  const speed=speedAt(board,view.config,board.result?.at??at);
  return <div className="run21-speed" data-run21-speed={speed}><RoundTimeBar remaining={remaining} full={full} waiting={board.startedAt===null} speed={speed}/></div>;
}

export function Run21FullscreenActions(props:Parameters<typeof Run21PlayerPane>[0]) {
  return <div className="run21-fullscreen-actions">
    <Run21Timer view={props.view} now={props.now}/>
  </div>;
}
