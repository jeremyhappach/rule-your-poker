import {useEffect,useMemo,useRef} from 'react';
import type {WordsSnapshot} from './model';
import {scoreFrame} from './scorePresentation';
/** Receipts resume elapsed presentation across reentry; they never mutate scores or deadlines. */
export function useWordScorePresentation(v:WordsSnapshot,now:number,asynchronous:boolean,onComplete?:(playerId:string)=>void){
 const p=v.movePresentation,id=p?`${v.identity.dealerGameId}:${v.viewerId}:${p.turn}`:'',key=`ptown:words:score:${v.identity.dealerGameId}:${v.viewerId}`;
 const receipt=useMemo(()=>{
  if(!p||p.turn!==v.turn-1||asynchronous&&p.playerId!==v.viewerId&&!v.canAct&&!v.finished)return null;
  try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');if(saved?.id===id&&Number.isFinite(saved.at))return saved as {id:string;at:number};}catch{}
  const replay=asynchronous&&p.playerId!==v.viewerId&&v.canAct;
  return {id,at:replay?now:p.startedAt};
 },[id,key,asynchronous,v.canAct,v.finished]);
 useEffect(()=>{if(receipt)try{sessionStorage.setItem(key,JSON.stringify(receipt));}catch{}},[receipt,key]);
 const visual=useMemo(()=>{
  if(!asynchronous||!p||!receipt)return v;
  const opponent=p.playerId!==v.viewerId,announceAt=receipt.at+(opponent?p.focusMs+p.squares.length*p.flipMs:0);
  return {...v,movePresentation:{...p,startedAt:receipt.at,focusMs:opponent?p.focusMs:0,announceAt,noticeMs:3600,readyAt:announceAt+3600}};
 },[v,receipt,asynchronous]);
 const projection=visual.movePresentation;
 const start=projection?(projection.playerId===v.viewerId?projection.startedAt:projection.announceAt):0;
 // Existing live schedules remain binding, including late delivery/reconnect.
 const frame=receipt?scoreFrame(visual,v.paused?v.pausedAt??now:now,start,asynchronous?Infinity:projection?.readyAt):null;
 const completed=useRef(''),callback=useRef(onComplete);callback.current=onComplete;
 useEffect(()=>{if(frame&&!frame.active&&completed.current!==frame.id){completed.current=frame.id;callback.current?.(frame.playerId);}},[frame?.id,frame?.active]);
 return {visual,frame:frame?.active?frame:null};
}
