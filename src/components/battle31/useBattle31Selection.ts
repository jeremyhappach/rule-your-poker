import {useLayoutEffect,useRef,useState} from 'react';
import type {Battle31Intent,Battle31Snapshot} from '@/lib/battle31/model';

export type Battle31ActionRevision={scope:string;revision:number};
type Selection={own:number|null;center:number|null};
/** Selection is presentation state; a complete pair submits one revision-bound command. */
export function useBattle31Selection(v:Battle31Snapshot,epoch:number,active:boolean,onIntent:(intent:Battle31Intent,expected?:Battle31ActionRevision)=>void|Promise<void>){
 const key=`${v.id}:${v.viewerId}:${v.scope}:${v.revision}:${epoch}`;
 const [display,setDisplay]=useState<{key:string;selection:Selection}|null>(null);
 const current=useRef<{key:string;selection:Selection;submitted:boolean}>({key,selection:{own:null,center:null},submitted:false});
 const reset=()=>{current.current={key,selection:{own:null,center:null},submitted:false};setDisplay(null);};
 useLayoutEffect(()=>{reset();},[key,active]);
 const pick=(zone:'own'|'center',id:number)=>{
  if(!active)return;
  if(current.current.key!==key)reset();
  if(current.current.submitted)return;
  const own=v.board.hands[v.players.findIndex(p=>p.id===v.viewerId)]??[];
  if(!(zone==='own'?own:v.board.center).includes(id))return;
  const selection={...current.current.selection,[zone]:id};
  current.current.selection=selection;
  if(selection.own!==null&&selection.center!==null){
   if(!own.includes(selection.own)||!v.board.center.includes(selection.center)){reset();return;}
   current.current.submitted=true;setDisplay(null);
   void onIntent({type:'swap',items:[selection.own,selection.center]},{scope:v.scope,revision:v.revision});
  }else setDisplay({key,selection});
 };
 return {selected:active&&display?.key===key?display.selection:null,pick,clear:reset};
}
