import { useCallback, useEffect, useState } from 'react';
import type { HorsesPlayerDiceState } from './useHorsesMobileController';

type Completed = HorsesPlayerDiceState & { result: NonNullable<HorsesPlayerDiceState['result']> };
type Event = { key:string; playerId:string; state:Completed; animate:boolean; landedAt:number|null };
type Ledger = { scope:string|null; baseline:boolean; seen:Record<string,string>; latest:Record<string,number>; consumed:string[]; queue:Event[] };
const empty=(scope:string|null):Ledger=>({scope,baseline:false,seen:{},latest:{},consumed:[],queue:[]});

/** Capture completion from immutable authority, independently of current actor
 * and game phase. A renderer receipt, not another duration, admits the result. */
export function useDiceResultPresentation(scope:string|null, states:Record<string,HorsesPlayerDiceState>|null|undefined) {
  const [ledger,setLedger]=useState<Ledger>(()=>empty(scope));
  let current=ledger.scope===scope?ledger:empty(scope);
  if(scope&&states){
    const seen:Record<string,string>={};
    const latest={...current.latest};
    const consumed=new Set(current.consumed);
    const added:Event[]=[];
    for(const [playerId,state] of Object.entries(states)){
      const signature=`${state.rollKey??0}:${!!(state.isComplete&&state.result)}`;
      if((state.rollKey??0)<(latest[playerId]??0)){seen[playerId]=current.seen[playerId];continue;}
      latest[playerId]=state.rollKey??0;
      seen[playerId]=signature;
      const key=`${scope}:${playerId}:${state.rollKey??0}`;
      if(!current.baseline&&state.isComplete&&state.result)consumed.add(key);
      if(current.baseline&&current.seen[playerId]!==signature&&state.isComplete&&state.result){
        if(!consumed.has(key))added.push({key,playerId,
          state:{...state,dice:state.dice.map(die=>({...die})),result:{...state.result}},
          animate:!!state.rollStartedAt && Date.now()-Date.parse(state.rollStartedAt)<2300,landedAt:null});
        consumed.add(key);
      }
    }
    if(!current.baseline||JSON.stringify(seen)!==JSON.stringify(current.seen))
      current={scope,baseline:true,seen,latest,consumed:[...consumed],queue:[...current.queue,...added]};
  }
  if(current!==ledger)setLedger(current);
  const event=current.queue[0]??null;
  const expiresAt=event?.landedAt==null?Infinity:event.landedAt+3000;
  useEffect(()=>{
    if(!event||event.landedAt===null)return;
    const timer=setTimeout(()=>setLedger(previous=>previous.scope===scope&&previous.queue[0]?.key===event.key
      ? {...previous,queue:previous.queue.slice(1)}:previous),Math.max(0,expiresAt-Date.now()));
    return()=>clearTimeout(timer);
  },[scope,event?.key,event?.landedAt,expiresAt]);
  const landed=useCallback((key:string|null)=>setLedger(previous=>previous.scope===scope&&previous.queue[0]?.key===key&&previous.queue[0].landedAt===null
    ? {...previous,queue:[{...previous.queue[0],landedAt:Date.now()},...previous.queue.slice(1)]}:previous),[scope]);
  return {
    key:event?.key??null,
    pending:current.queue.length>0,
    hold:event?{...event.state,playerId:event.playerId,expiresAt,isRolling:event.landedAt===null&&event.animate}:null,
    announcement:event?.landedAt!=null?{playerId:event.playerId,description:event.state.result.description}:null,
    resultReady:(playerId:string)=>!current.queue.some(item=>item.playerId===playerId&&item.landedAt===null),
    landed,
  };
}
