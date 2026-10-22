import {useRef} from 'react';
import type {GolfSnapshot} from '@/lib/golf/model';

/** Live visual continuity only. Authority, deadlines and settlement never wait.
 * Recovery seeks the persisted schedule; a connected viewer finishes the observed
 * last move and all counting before releasing the scorecard/terminal presentation. */
export function useGolfScoringPresentation(authority:GolfSnapshot|null,epoch:number,now:number,busy:boolean){
 const state=useRef<{id:string;epoch:number;live:string|null;held:GolfSnapshot|null;offset:number|null}>({id:'',epoch,live:null,held:null,offset:null});
 let s=state.current;
 if(!authority||s.id!==authority.id||s.epoch!==epoch)s=state.current={id:authority?.id??'',epoch,live:null,held:null,offset:null};
 if(authority?.phase==='playing'&&!authority.paused&&!s.held)s.live=authority.scope;
 if(authority?.presentation&&s.live===authority.scope&&['hole_complete','complete'].includes(authority.phase)&&!s.held){s.held=authority;s.offset=null;}
 if(s.held&&authority?.scope===s.held.scope)s.held=authority;
 let snapshot=s.held??authority;
 const clock=snapshot?.paused?(snapshot.pausedAt??now):now;
 if(s.held&&busy)s.offset=null;
 if(s.held&&s.offset===null&&!busy&&!snapshot?.paused)s.offset=clock+(snapshot?.rules.presentation?.scoringDelayMs??1200)-s.held.presentation!.startedAt;
 let offset=s.offset??0;
 const end=(snapshot?.presentation?.endsAt??0)+offset;
 if(s.held&&!s.held.settled&&s.offset!==null&&clock>=end&&authority?.scope!==s.held.scope){s.held=null;s.offset=null;s.live=authority?.phase==='playing'?authority.scope:null;snapshot=authority;offset=0;}
 const waiting=!!s.held&&(s.offset===null||clock< s.held.presentation!.startedAt+offset);
 const winnerAt=snapshot?.terminal?Math.max(snapshot.terminal.startedAt,(snapshot.presentation?.endsAt??0)+offset):Infinity;
 const terminalEnd=snapshot?.terminal?winnerAt+Math.max(0,snapshot.terminal.deadline-snapshot.terminal.startedAt):Infinity;
 return {snapshot,now:clock-offset,waiting,winnerReady:!!snapshot?.settled&&!snapshot.paused&&!busy&&!waiting&&clock>=winnerAt,terminalDone:clock>=terminalEnd,seek:s.live!==snapshot?.scope,held:!!s.held};
}
