import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import {platformAudio} from '@/lib/audio/platformAudio';
import {boxingBellCue} from '@/lib/run21/boxingBell';
import {TRI_FANFARE_MS,triAllClearCueAt} from '@/lib/triTowers/allClearCue';
import {triCountWindow,triResultTimeline} from '@/lib/triTowers/roundTimeline';
import {RoundIntroArtwork} from '@/components/run21/Run21RoundIntro';
import '@/components/run21/run21.css';

export interface TriScore {id:string;name?:string;score:number;active:boolean;balance?:ReactNode}
export function TriScorePill({item,root,fraction=0,value=item.score}:{item:TriScore;root:RefObject<HTMLDivElement>;fraction?:number;value?:number}){
 const ref=useRef<HTMLDivElement>(null),[offset,setOffset]=useState({x:0,y:0});
 // The parent board ref attaches after child layout effects on initial mount.
 useEffect(()=>{const target=ref.current,board=root.current;if(!target||!board)return;
  const measure=()=>{const a=target.getBoundingClientRect(),b=board.getBoundingClientRect();setOffset({x:b.left+b.width/2-a.left-a.width/2,y:b.top+b.height*.48-a.top-a.height/2});};
  const observer=new ResizeObserver(measure);observer.observe(target);observer.observe(board);measure();return()=>observer.disconnect();
 },[root]);
 return <div className="tri-score-cell" data-active={item.active}>
  <div ref={ref} className="tri-score-home"><div className="tri-score-pill" data-centered={fraction>0} style={{transform:`translate(${offset.x*fraction}px,${offset.y*fraction}px) scale(${1+fraction*.4})`}}>
   {item.name&&<span title={item.name}>{item.name}</span>}<strong aria-label={item.name?`${item.name} score ${value}`:`Score ${value}`}>{value.toLocaleString()}</strong>
  </div></div>{item.balance}
 </div>;
}
interface RoundPresentationProps {
 scope:string;phase:string;connected:boolean;paused:boolean;now:number;deadline:number;userId:string;active:boolean;
 celebrationMs?:number;modern:boolean;liveEntry:boolean;recoveryEpoch:number;
 result:{id:string;elapsed:number;scoreBefore:number;score:number;displayScore:number;reason:string;completedAt?:number}|null;
}
export function useTriRoundPresentation({scope,phase,connected,paused,result,now,deadline,userId,active,modern,liveEntry,recoveryEpoch,celebrationMs=0}:RoundPresentationProps){
 const prior=useRef<{scope:string;phase:string;connected:boolean;active:boolean;epoch:number}|null>(null);
 const initial=useRef(liveEntry&&recoveryEpoch===0&&phase==='intro'?scope:null),seen=useRef(new Set<string>());
 const clock=useRef<{scope:string;deadline:number}|null>(null),[drainFrom,setDrainFrom]=useState(0);
 const [live,setLive]=useState<string|null>(null),[intro,setIntro]=useState<string|null>(null);
 const [reduced,setReduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false);
 useEffect(()=>{const media=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!media)return;
  const update=()=>setReduced(media.matches);media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
 },[]);
 useLayoutEffect(()=>{
  const p=prior.current,interrupted=!!p&&p.epoch!==recoveryEpoch;
  if(!connected||!active||paused||document.hidden||interrupted){
   setLive(null);setIntro(null);
   if(interrupted||!active||paused||document.hidden){seen.current.add(scope);initial.current=null;}
  }else{
   if(p?.scope!==scope){setLive(null);setIntro(null);}
   if(modern&&phase==='intro'&&!seen.current.has(scope)&&(initial.current===scope||!!p&&p.scope!==scope&&p.connected&&p.active)){
    seen.current.add(scope);setIntro(scope);initial.current=null;
   }
   if(result&&p?.scope===scope&&p.phase!=='stage_complete'&&p.connected&&p.active){
    setLive(result.id);
    setDrainFrom(clock.current?.scope===scope?Math.max(0,clock.current.deadline-(result.completedAt??now-result.elapsed)):0);
   }
  }
  if(phase==='playing')clock.current={scope,deadline};
  if(phase!=='intro')setIntro(null);
  prior.current={scope,phase,connected,active,epoch:recoveryEpoch};
 },[scope,phase,connected,active,paused,result?.id,recoveryEpoch,deadline,modern]);
 useEffect(()=>{
  const retire=()=>{setLive(null);setIntro(null);seen.current.add(scope);initial.current=null;};
  const visible=()=>{if(document.hidden)retire();};
  window.addEventListener('offline',retire);document.addEventListener('visibilitychange',visible);
  return()=>{window.removeEventListener('offline',retire);document.removeEventListener('visibilitychange',visible);};
 },[scope]);
 const admitted=!!result&&live===result.id&&active&&connected&&!paused&&!document.hidden;
 const elapsed=result?.elapsed??0,timeline=triResultTimeline(elapsed,result?.reason==='cleared',result?.reason==='cleared'?celebrationMs:0);
 const bellKey=modern&&intro===scope&&phase==='intro'&&connected&&active&&!paused&&!document.hidden?scope:null;
 useEffect(()=>{
  if(!bellKey)return;
  const local=performance.now();
  return platformAudio.follow({userId,id:'run21-bell:tri:'+bellKey,startedAt:local,expiresAt:local+deadline-now,cueAt:()=>boxingBellCue});
 },[bellKey,userId]);
 const fraction=admitted&&!reduced?(modern?timeline.center:Math.max(0,Math.min(1,elapsed/200,(3100-elapsed)/300))):0;
 const countWindow=triCountWindow(result?.reason==='cleared',result?.reason==='cleared'?celebrationMs:0);
 const end=modern?countWindow.end:2800,start=modern?countWindow.start:0;
 const count=result?{from:result.scoreBefore,to:result.score,startedAt:now-elapsed+start,endsAt:now-elapsed+end}:null;
 usePresentedScoreAudio(userId,admitted&&!reduced&&result.score>result.scoreBefore&&elapsed>=start&&elapsed<end?'tri-count:'+scope+':'+result.id:null,count,now);
 const clearKey=modern&&admitted&&!reduced&&result.reason==='cleared'&&elapsed<TRI_FANFARE_MS?result.id:null;
 useEffect(()=>{
  if(!clearKey)return;
  const local=performance.now();
  return platformAudio.follow({userId,id:'tri-clear:'+scope+':'+clearKey,startedAt:local-elapsed,expiresAt:local-elapsed+TRI_FANFARE_MS,cueAt:triAllClearCueAt});
 },[clearKey,userId,scope]);
 return {fraction,admitted,reduced,elapsed,timeline,
  drainRemaining:admitted&&!reduced?drainFrom*(1-timeline.progress):0,
  displayScore:admitted&&!reduced&&result.score>result.scoreBefore?(modern?Math.round(result.scoreBefore+(result.score-result.scoreBefore)*timeline.progress):result.displayScore):result?.score};
}
export function TriRoundIntro({remaining,roundLabel,turnLabel,paused}:{remaining:number;roundLabel:string;turnLabel?:string;paused:boolean}){
 return remaining>0?<RoundIntroArtwork label={roundLabel} turnLabel={turnLabel} fading={remaining<=200&&!paused}/>:null;
}
