import {useEffect,useMemo} from 'react';
import type {WordsSnapshot} from './model';

/** Presentation projection only. Never changes the authoritative turn deadline. */
export function projectWordReveal(v:WordsSnapshot,firstObservedAt:number){
 const p=v.movePresentation;if(!p||p.playerId===v.viewerId)return v;
 const first=Math.max(p.startedAt+p.focusMs,firstObservedAt),count=p.squares.length;
 // A very late reconnect catches up to committed state rather than inventing
 // another turn hold. Reserve the existing 350ms hold and a legible notice.
 const available=p.readyAt-first-350-750;
 if(!count||available<count*120)return v;
 const flipMs=Math.min(p.flipMs,Math.floor(available/count));
 const announceAt=Math.max(p.announceAt,first+count*flipMs);
 return {...v,movePresentation:{...p,startedAt:first,focusMs:0,flipMs,announceAt,noticeMs:Math.min(p.noticeMs,p.readyAt-350-announceAt)}};
}

/** One viewer/match receipt, shared by board and canonical word announcement. */
export function useWordRevealTimeline(v:WordsSnapshot|null,now:number){
 const p=v?.movePresentation,id=p&&v?`${v.identity.dealerGameId}:${v.viewerId}:${p.turn}`:'',key=v?`ptown:words:reveal:${v.identity.dealerGameId}:${v.viewerId}`:'';
 const receipt=useMemo(()=>{
  if(!p||!id)return null;
  try{const saved=JSON.parse(sessionStorage.getItem(key)??'null');if(saved?.id===id&&Number.isFinite(saved.firstAt)&&Number.isFinite(saved.startedAt))return saved as {id:string;firstAt:number;startedAt:number};}catch{}
  return {id,firstAt:now,startedAt:p.startedAt};
 },[id,key]);
 useEffect(()=>{if(receipt)try{sessionStorage.setItem(key,JSON.stringify(receipt));}catch{}},[receipt,key]);
 return useMemo(()=>{
  if(!v||!v.movePresentation||!receipt)return v;
  // Canonical pause shifts the authored schedule once; shift this projection by
  // the same amount, preserving its receipt and already-revealed tile order.
  return projectWordReveal(v,receipt.firstAt+v.movePresentation.startedAt-receipt.startedAt);
 },[v,receipt]);
}
