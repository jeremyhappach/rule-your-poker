import {useLayoutEffect,useRef,useState} from 'react';
import {ballValue,type ElevenBoard,type ElevenSnapshot} from '@/lib/elevenUp/model';

export function confirmedBotGroup(before:ElevenSnapshot,after:ElevenSnapshot):number[]|null {
 const actor=after.players.find(p=>p.active);
 if(after.solo||before.scope!==after.scope||after.revision<=before.revision
  ||!(actor?.isBot||actor?.autoplay)||after.board.groups!==before.board.groups+1)return null;
 const items=before.board.slots.filter((id,index):id is number=>id!==null&&after.board.slots[index]===null);
 if(before.board.current!==null&&before.board.current!==after.board.current)items.push(before.board.current);
 return items.length>=2&&items.reduce((sum,id)=>sum+ballValue(id),0)===11?items:null;
}

/** Only animates a witnessed confirmed transition. Never replays on mount/reconnect,
 * manufactures a move, queues old boards, or outlives its scoring deadline. */
export function useElevenBotSelection(v:ElevenSnapshot,now:number,epoch:number,enabled:boolean){
 const previous=useRef<{v:ElevenSnapshot;epoch:number;enabled:boolean}|null>(null);
 const [animation,setAnimation]=useState<{scope:string;group:number;board:ElevenBoard;items:number[];start:number;expires:number}|null>(null);
 useLayoutEffect(()=>{
  const prior=previous.current;previous.current={v,epoch,enabled};
  if(!enabled||!prior?.enabled||epoch!==prior.epoch||prior.v.scope!==v.scope){setAnimation(null);return;}
  const actor=v.players.find(p=>p.active);
  if(!(actor?.isBot||actor?.autoplay)){setAnimation(null);return;}
  const items=confirmedBotGroup(prior.v,v);
  if(items){
   const expires=prior.v.board.phase==='playing'?prior.v.board.deadline:v.board.deadline;
   setAnimation({scope:v.scope,group:v.board.groups,board:prior.v.board,items,start:now,expires});
  }else if(v.board.groups!==prior.v.board.groups||v.board.phase==='complete')setAnimation(null);
 },[v,epoch,enabled]);
 const showing=enabled&&animation?.scope===v.scope&&now<animation.expires
  &&now-animation.start<animation.items.length*750;
 return showing?{group:animation.group,board:{...animation.board,phase:v.board.phase==='playing'?'playing':animation.board.phase,deadline:v.board.deadline},selection:animation.items.slice(0,Math.floor(Math.max(0,now-animation.start)/750)+1)}:null;
}
