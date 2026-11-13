import {useCallback,useLayoutEffect,useRef,useState} from 'react';
import type {ChessIntent} from '@/lib/chess/rules';
export type ChessMoveIntent=Extract<ChessIntent,{type:'move'}>;
export const CHESS_UNDO_MS=3000;
type Draft={intent:ChessMoveIntent;scope:string;revision:number;expiresAt:number};
/** Reversible local intent only. No request ID, persistence or authority call until expiry. */
export function useChessMoveDraft(scope:string,revision:number,enabled:boolean,submit:(move:ChessMoveIntent,revision:number)=>Promise<boolean>){
 const [draft,setDraft]=useState<Draft|null>(null),[seconds,setSeconds]=useState(3),[submitting,setSubmitting]=useState(false);
 const live=useRef({scope,revision,enabled,submit}),current=useRef<Draft|null>(null),flight=useRef(false),mounted=useRef(false),timers=useRef<ReturnType<typeof setTimeout>[]>([]);
 const clear=useCallback(()=>{timers.current.forEach(clearTimeout);timers.current=[];},[]);
 const cancel=useCallback(()=>{clear();current.current=null;setDraft(null);},[clear]);
 useLayoutEffect(()=>{live.current={scope,revision,enabled,submit};if(current.current&&(current.current.scope!==scope||current.current.revision!==revision||!enabled))cancel();},[scope,revision,enabled,submit,cancel]);
 useLayoutEffect(()=>{mounted.current=true;const hide=()=>{if(document.hidden)cancel();};document.addEventListener('visibilitychange',hide);window.addEventListener('pagehide',cancel);window.addEventListener('offline',cancel);return()=>{mounted.current=false;clear();current.current=null;document.removeEventListener('visibilitychange',hide);window.removeEventListener('pagehide',cancel);window.removeEventListener('offline',cancel);};},[cancel,clear]);
 const stage=useCallback((intent:ChessMoveIntent)=>{
  const context=live.current;if(!mounted.current||current.current||flight.current||!context.enabled||document.hidden||!navigator.onLine)return false;
  const next={intent,scope:context.scope,revision:context.revision,expiresAt:performance.now()+CHESS_UNDO_MS};current.current=next;setDraft(next);setSeconds(3);
  for(const [at,left] of [[1000,2],[2000,1]])timers.current.push(setTimeout(()=>{if(current.current===next)setSeconds(left);},at));
  timers.current.push(setTimeout(()=>{
   if(current.current!==next)return;const latest=live.current;
   if(latest.scope!==next.scope||latest.revision!==next.revision||!latest.enabled||document.hidden||!navigator.onLine){cancel();return;}
   // Claim once before touching authority. Undo is no longer offered after this boundary.
   clear();current.current=null;setDraft(null);flight.current=true;setSubmitting(true);
   void latest.submit(next.intent,next.revision).finally(()=>{flight.current=false;if(mounted.current)setSubmitting(false);});
  },CHESS_UNDO_MS));return true;
 },[cancel,clear]);
 return {draft,seconds,submitting,stage,cancel};
}
