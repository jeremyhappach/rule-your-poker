import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
import {platformAudio} from '@/lib/audio/platformAudio';
import {celebrationCueAt} from '@/lib/audio/celebrationCue';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
export const QUINTZEE_CELEBRATION_MS=1500,QUINTZEE_BASE_COUNT_MS=600;
type Event={id:string;from:number;to:number;start:number;countAt:number;end:number;labels:string[]};
/** Presentation consumes server totals; it never computes or awards a bonus. */
export function useQuintzeeScorePresentation(v:QuintzeeSnapshot,now:number,userId:string,enabled:boolean){
 const b=v.state.board,base=b.baseScore??b.result?.rawSubtotal??0,bonus=b.upperBonusAwarded??b.result?.upperBonus??0;
 const prior=useRef({scope:v.scope,revision:v.revision,base,bonus,quintzee:b.scores.yahtzee,phase:b.phase,enabled});
 const [queue,setQueue]=useState<Event[]>([]),[finalDelay,setFinalDelay]=useState(0);
 useLayoutEffect(()=>{const p=prior.current;prior.current={scope:v.scope,revision:v.revision,base,bonus,quintzee:b.scores.yahtzee,phase:b.phase,enabled};
  if(p.scope!==v.scope||!enabled||!p.enabled||document.hidden){setQueue([]);setFinalDelay(0);return;}
  if(v.revision<=p.revision)return;
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
 const event=enabled?queue.find(e=>e.end>now):undefined;
 const banner=event&&now<event.countAt?event.labels[Math.floor(Math.max(0,now-event.start)/QUINTZEE_CELEBRATION_MS)]:undefined;
 const bannerIndex=event?Math.floor(Math.max(0,now-event.start)/QUINTZEE_CELEBRATION_MS):0;
 const bannerKey=banner&&event?`quintzee-bonus:${event.id}:${bannerIndex}`:null;
 useEffect(()=>{if(!bannerKey||!event)return;const at=event.start+bannerIndex*QUINTZEE_CELEBRATION_MS,local=performance.now();return platformAudio.follow({userId,id:bannerKey,startedAt:local-(now-at),expiresAt:local+at+QUINTZEE_CELEBRATION_MS-now,cueAt:celebrationCueAt});},[bannerKey,userId]);
 usePresentedScoreAudio(userId,event&&now>=event.countAt?`quintzee-base:${event.id}`:null,event?{startedAt:event.countAt,endsAt:event.end,from:event.from,to:event.to}:null,now);
 const fraction=event?Math.max(0,Math.min(1,(now-event.countAt)/(event.end-event.countAt))):1;
 return {base:event?Math.round(event.from+(event.to-event.from)*fraction):base,banner,busy:!!event,finalDelay};
}
