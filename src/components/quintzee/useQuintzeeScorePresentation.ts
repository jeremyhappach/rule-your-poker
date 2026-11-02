import {presentSound} from '@/lib/audio/presentationSound';
import type {RefObject} from 'react';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
export const QUINTZEE_CELEBRATION_MS=1500,QUINTZEE_BASE_COUNT_MS=600;
type Event={id:string;from:number;to:number;start:number;countAt:number;end:number;labels:string[];authoritative?:boolean};
/** Presentation consumes server totals; it never computes or awards a bonus. */
export function useQuintzeeScorePresentation(v:QuintzeeSnapshot,now:number,userId:string,enabled:boolean,surface?:RefObject<HTMLElement>){
 const b=v.state.board,base=b.baseScore??b.result?.rawSubtotal??0,bonus=b.upperBonusAwarded??b.result?.upperBonus??0;
 const prior=useRef({scope:v.scope,revision:v.revision,base,bonus,quintzee:b.scores.yahtzee,phase:b.phase,enabled,scores:{...b.scores}});
 const [queue,setQueue]=useState<Event[]>([]),[finalDelay,setFinalDelay]=useState(0);
 useLayoutEffect(()=>{const p=prior.current;prior.current={scope:v.scope,revision:v.revision,base,bonus,quintzee:b.scores.yahtzee,phase:b.phase,enabled,scores:{...b.scores}};
  if(p.scope!==v.scope||!enabled||!p.enabled||document.hidden){setQueue([]);setFinalDelay(0);return;}
  if(v.revision<=p.revision)return;
  const posted = Object.keys(b.scores).some(key => !(key in p.scores));
  if(userId && posted) presentSound(p.quintzee === undefined && b.scores.yahtzee === 50 ? 'yahtzee' : 'scorePost',
    'quintzee:'+v.scope+':'+v.revision, surface?.current ?? null);
  if(b.celebration&&b.rules.version==='quintzee/3'){setQueue([]);setFinalDelay(0);return;}
  const fresh=!(b.result&&now-b.result.completedAt>1500);
  const next=queue.filter(e=>e.end>now);if(base>p.base&&fresh){const labels:string[]=[];
   if(bonus>p.bonus)labels.push('Upper bonus!');if(p.quintzee===undefined&&(b.scores.yahtzee??0)>0)labels.push('Quintzee!');
   const start=Math.max(now,next.at(-1)?.end??now),countAt=start+labels.length*QUINTZEE_CELEBRATION_MS;
   next.push({id:v.scope+':'+v.revision,from:p.base,to:base,start,countAt,end:countAt+QUINTZEE_BASE_COUNT_MS,labels});
  }
  if(b.phase==='stage_complete'&&p.phase!=='stage_complete')setFinalDelay(Math.max(0,(next.at(-1)?.end??b.result!.completedAt)-b.result!.completedAt));
  setQueue(next);
 },[v.scope,v.revision,base,bonus,b.phase,enabled]);
 useEffect(()=>{const retire=()=>{setQueue([]);setFinalDelay(0);prior.current.enabled=false;};const hidden=()=>{if(document.hidden)retire();};window.addEventListener('offline',retire);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('offline',retire);document.removeEventListener('visibilitychange',hidden);};},[]);
 const fixed=b.rules?.version==='quintzee/3'?b.celebration:undefined;
 const authoritative:Event|undefined=fixed&&now<fixed.endsAt?{id:v.scope+':'+fixed.id,from:fixed.from,to:fixed.to,start:fixed.startedAt,countAt:fixed.countAt,end:fixed.endsAt,labels:[fixed.label],authoritative:true}:undefined;
 const event=enabled?(authoritative??queue.find(e=>e.end>now)):undefined;
 const banner=event?.authoritative?event.labels[0]:event&&now<event.countAt?event.labels[Math.floor(Math.max(0,now-event.start)/QUINTZEE_CELEBRATION_MS)]:undefined;
 // Per-category audio is a single committed posting cue; numeric motion is unchanged.
 const fraction=event?Math.max(0,Math.min(1,(now-event.countAt)/(event.end-event.countAt))):1;
 return {base:event?Math.round(event.from+(event.to-event.from)*fraction):base,banner,busy:!!event,finalDelay:fixed?0:finalDelay};
}
