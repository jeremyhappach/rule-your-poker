import {clampUnit,triCountWindow,triResultTimeline} from '../triTowers/roundTimeline';
import {TAKE_TWO_CLEAR_MS,takeTwoAllClearCueAt} from './allClearCue';
import type {TakeTwoBoard} from './model';

// The frozen server hold is six seconds in BOTH modes. All clear reserves three
// seconds, then centers/counts/returns by 5.5s; no callback extends or advances it.
export function takeTwoCountWindow(cleared:boolean){return cleared?{start:3200,end:5200}:triCountWindow();}
export function takeTwoResultTimeline(elapsed:number,cleared:boolean){
 if(!cleared)return triResultTimeline(elapsed);
 const {start,end}=takeTwoCountWindow(true);
 return {progress:clampUnit((elapsed-start)/(end-start)),center:Math.min(clampUnit((elapsed-TAKE_TWO_CLEAR_MS)/200),clampUnit((5500-elapsed)/300)),crest:clampUnit((TAKE_TWO_CLEAR_MS-elapsed)/350)};
}
export const takeTwoResultSequence={namespace:'take-two',clearMs:TAKE_TWO_CLEAR_MS,clearCueAt:takeTwoAllClearCueAt,seekOnRecovery:true,timeline:takeTwoResultTimeline,countWindow:takeTwoCountWindow};
export function takeTwoRoundPresentation(board:TakeTwoBoard,scope:string,now:number){
 const result=board.phase==='stage_complete'?board.result:null;
 if(!result)return null;
 return {...result,id:result.id??`${scope}:${result.completedAt}`,reason:result.reason==='full_clear'?'cleared':result.reason,
  elapsed:Math.max(0,board.rules.holdMs-(board.deadline-now))};
}
