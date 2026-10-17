import {useEffect,useLayoutEffect,useRef,useState,type ReactNode,type RefObject} from 'react';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import {useRun21Bell} from '@/hooks/useRun21Bell';
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
export function useTriRoundPresentation({scope,phase,connected,paused,result,now,userId,active}:{scope:string;phase:string;connected:boolean;paused:boolean;result:{id:string;elapsed:number;scoreBefore:number;score:number;displayScore:number}|null;now:number;userId:string;active:boolean}){
 const prior=useRef<{scope:string;phase:string;connected:boolean}|null>(null),[live,setLive]=useState<string|null>(null);
 useLayoutEffect(()=>{const p=prior.current;if(!connected||p?.scope!==scope)setLive(null);
  else if(result&&p.phase!=='stage_complete'&&p.connected&&active)setLive(result.id);
  prior.current={scope,phase,connected};
 },[scope,phase,connected,result?.id,active]);
 useEffect(()=>{const retire=()=>setLive(null);const visible=()=>{if(document.hidden)retire();};window.addEventListener('offline',retire);document.addEventListener('visibilitychange',visible);return()=>{window.removeEventListener('offline',retire);document.removeEventListener('visibilitychange',visible);};},[]);
 const admitted=!!result&&live===result.id&&active&&connected;
 const elapsed=result?.elapsed??0;
 const fraction=admitted?Math.max(0,Math.min(1,elapsed/200,(3100-elapsed)/300)):0;
 const count=result?{from:result.scoreBefore,to:result.score,startedAt:now-elapsed,endsAt:now-elapsed+2800}:null;
 usePresentedScoreAudio(userId,admitted&&!paused&&result.score>result.scoreBefore&&elapsed<2800?'tri-count:'+scope+':'+result.id:null,count,now);
 return {fraction,displayScore:admitted&&result.score>result.scoreBefore?result.displayScore:result?.score};
}
export function TriRoundIntro({scope,remaining,roundLabel,turnLabel,userId,paused}:{scope:string;remaining:number;roundLabel:string;turnLabel?:string;userId:string;paused:boolean}){
 const first=useRef(remaining),fresh=first.current>2150;
 useRun21Bell(userId,!paused&&fresh&&remaining>0?'tri:'+scope:null,remaining);
 return remaining>0?<RoundIntroArtwork label={roundLabel} turnLabel={turnLabel} fading={remaining<=200&&!paused}/>:null;
}
