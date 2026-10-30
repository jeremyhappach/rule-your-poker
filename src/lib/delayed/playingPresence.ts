import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';

export const PLAYING_BEAT_MS=10_000,PLAYING_TTL_MS=35_000;
/** Read only the authoritative gameplay clock, never the availability deadline
 * or a presentation placeholder. Run21 has startedAt instead of a phase. */
export function roundGameplayRunning(game:string,board:unknown,now:number){
 if(!board||typeof board!=='object')return false;
 const b=board as {phase?:string;startedAt?:number|null;deadline?:number|null;result?:unknown};
 if(typeof b.deadline!=='number'||!Number.isFinite(b.deadline)||now>=b.deadline||b.result)return false;
 return game==='run21'?typeof b.startedAt==='number'&&Number.isFinite(b.startedAt)&&now>=b.startedAt:b.phase==='playing';
}
/** Actor and availability window come from a permitted server projection. */
export function playingTopic(match:string,child:string,actor:string,deadline:number){
 return `delayed-playing:${match}:${child}:${actor}:${deadline}`;
}
/** Receiving the same presence snapshot again must not extend its lease. */
export function presenceLeases(){
 const seen=new Map<string,{beat:string;until:number}>();
 return {read(state:Record<string,{presence_ref?:string;beat?:string}[]>,now:number){
  const current=new Set<string>();
  for(const [key,entries] of Object.entries(state))for(const p of entries){
   if(typeof p.beat!=='string'||!p.presence_ref)continue;
   const id=key+':'+p.presence_ref;current.add(id);
   if(seen.get(id)?.beat!==p.beat)seen.set(id,{beat:p.beat,until:now+PLAYING_TTL_MS});
  }
  for(const id of seen.keys())if(!current.has(id))seen.delete(id);
  return [...seen.values()].some(p=>p.until>now);
 }};
}

/** Ephemeral UI only: no actions, scores, clocks or financial writes. */
export function usePlayingPresence(topic:string|null,publish=false,onReconnect?:()=>void){
 const [active,setActive]=useState<{topic:string;value:boolean}|null>(null);
 useEffect(()=>{
  if(!topic)return;
  let disposed=false,channel:ReturnType<typeof supabase.channel>|null=null,joined=false,everConnected=false;
  let leases=presenceLeases();
  const clear=()=>setActive({topic,value:false});
  const read=()=>{if(!disposed&&channel&&joined)setActive({topic,value:leases.read(channel.presenceState(),performance.now())});};
  const beat=()=>{if(publish&&joined&&channel&&!document.hidden)void channel.track({beat:crypto.randomUUID()});};
  const stop=()=>{joined=false;const old=channel;channel=null;leases=presenceLeases();clear();if(old){void old.untrack();void supabase.removeChannel(old);}};
  const start=()=>{
   if(disposed||document.hidden||!navigator.onLine||channel)return;
   const current=supabase.channel(topic,{config:{private:true,presence:{key:crypto.randomUUID()}}});channel=current;
   current.on('presence',{event:'sync'},read).subscribe(status=>{
    if(disposed||channel!==current)return;
    joined=status==='SUBSCRIBED';
    if(joined){leases=presenceLeases();beat();read();if(everConnected)onReconnect?.();everConnected=true;}else clear();
   });
  };
  const visibility=()=>{if(document.hidden)stop();else start();};
  const offline=()=>stop();
  const timer=setInterval(()=>{beat();read();},PLAYING_BEAT_MS);
  document.addEventListener('visibilitychange',visibility);window.addEventListener('online',start);window.addEventListener('offline',offline);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',start);start();
  return()=>{disposed=true;clearInterval(timer);stop();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('online',start);window.removeEventListener('offline',offline);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',start);};
 },[topic,publish,onReconnect]);
 return !!topic&&active?.topic===topic&&active.value;
}
