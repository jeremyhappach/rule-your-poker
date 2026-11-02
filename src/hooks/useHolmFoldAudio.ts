import {useEffect,useLayoutEffect,useRef,type RefObject} from 'react';
import {presentSound} from '@/lib/audio/presentationSound';

/** HOLM retires opponent backs / dims the own hand at the fold commit.
 * It does not launch canonical card transport. Observe only an already-mounted
 * player's new fold in this hand; never a restored or interrupted hand. */
export function useHolmFoldAudio(scope:string|null|undefined,players:readonly {id:string;current_decision?:string|null}[],active:boolean,surface:RefObject<HTMLElement>){
 const prior=useRef<{scope:string;decisions:Map<string,string|null|undefined>}|null>(null);
 const interrupted=useRef(document.hidden||!navigator.onLine);
 useEffect(()=>{
  const retire=()=>{interrupted.current=true;},hidden=()=>{if(document.hidden)retire();};
  window.addEventListener('offline',retire);window.addEventListener('pagehide',retire);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('offline',retire);window.removeEventListener('pagehide',retire);document.removeEventListener('visibilitychange',hidden);};
 },[]);
 useLayoutEffect(()=>{
  const previous=prior.current;
  prior.current=scope?{scope,decisions:new Map(players.map(p=>[p.id,p.current_decision]))}:null;
  if(!scope||previous?.scope!==scope){interrupted.current=document.hidden||!navigator.onLine;return;}
  if(!active||interrupted.current)return;
  for(const player of players)if(player.current_decision==='fold'&&previous.decisions.has(player.id)&&previous.decisions.get(player.id)!=='fold')
   presentSound('slide',`holm:fold:${scope}:${player.id}`,surface.current);
 });
}
