import {useLayoutEffect,useRef,useState,type RefObject} from 'react';
import {platformAudio} from '@/lib/audio/platformAudio';
import {triSwooshCueAt} from '@/lib/triTowers/cardSwoosh';
interface Board {cards:(number|null)[];removed:number[];waste:number;phase:string}
export function useTriCardFlight(root:RefObject<HTMLDivElement>,v:Board,scope:string,epoch:number,active:boolean,reduced:boolean,userId:string){
 const [flight,setFlight]=useState<{id:number;key:string;card:number;from:DOMRect;to:DOMRect;board:DOMRect}|null>(null),node=useRef<HTMLDivElement>(null),serial=useRef(0);
 const prior=useRef<{scope:string;epoch:number;active:boolean;v:Board;rects:Map<number,DOMRect>}|null>(null);
 useLayoutEffect(()=>{
  const board=root.current,p=prior.current;if(!board)return;
  const removed=p?v.removed.filter(i=>!p.v.removed.includes(i)):[];
  const index=removed[0],from=p?.rects.get(index),to=board.querySelector('.tri-waste .tri-card-art')?.getBoundingClientRect();
  const continuous=active&&!reduced&&p?.active&&p.scope===scope&&p.epoch===epoch;
  if(continuous&&['ready','playing'].includes(p.v.phase)&&removed.length===1&&p.v.cards[index]===v.waste&&from&&to)setFlight({id:++serial.current,key:`${scope}:${index}:${v.removed.length}`,card:v.waste,from,to,board:board.getBoundingClientRect()});
  else if(!continuous||removed.length||p?.v.waste!==v.waste||p?.v.phase!==v.phase)setFlight(null);
  const rects=new Map<number,DOMRect>();board.querySelectorAll<HTMLElement>('[data-tri-card]').forEach(el=>rects.set(Number(el.dataset.triCard),el.getBoundingClientRect()));
  prior.current={scope,epoch,active,v,rects};
 },[scope,epoch,active,reduced,v.removed,v.waste]);
 useLayoutEffect(()=>{
  if(!flight||!node.current)return;
  const {from,to,id}=flight,animation=node.current.animate?.([{transform:'translate(0,0)'},{transform:`translate(${to.left-from.left}px,${to.top-from.top}px) scale(${to.width/from.width},${to.height/from.height})`}],{duration:120,easing:'cubic-bezier(.2,.75,.3,1)',fill:'forwards'});
  if(!animation){setFlight(null);return;}
  const startedAt=performance.now(),stopSound=platformAudio.follow({userId,id:'tri-swoosh:'+flight.key,startedAt,expiresAt:startedAt+100,cueAt:triSwooshCueAt});
  animation.onfinish=()=>setFlight(f=>f?.id===id?null:f);return()=>{animation.cancel();stopSound();};
 },[flight,userId]);
 useLayoutEffect(()=>{const board=root.current;if(!board)return;let size=board.getBoundingClientRect();const observer=new ResizeObserver(()=>{const next=board.getBoundingClientRect();if(next.width!==size.width||next.height!==size.height){setFlight(null);const rects=new Map<number,DOMRect>();board.querySelectorAll<HTMLElement>('[data-tri-card]').forEach(el=>rects.set(Number(el.dataset.triCard),el.getBoundingClientRect()));if(prior.current)prior.current.rects=rects;}size=next;});observer.observe(board);return()=>observer.disconnect();},[root]);
 useLayoutEffect(()=>{const cancel=()=>setFlight(null),hidden=()=>{if(document.hidden)cancel();};window.addEventListener('offline',cancel);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('offline',cancel);document.removeEventListener('visibilitychange',hidden);};},[]);
 return {flight,node};
}
