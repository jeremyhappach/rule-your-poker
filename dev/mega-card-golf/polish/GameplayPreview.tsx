import {useEffect,useRef,useState} from 'react';
import {MegaCardGolfGame,MegaCard} from '@/components/megaCardGolf/MegaCardGolfGame';
import {PlayingCard} from '@/components/PlayingCard';
import {INITIAL_COURSES} from '@/lib/megaCardGolf/config';
import {applyIntent,createRun,projectRun,recoverRun,type MegaRun,type Intent} from '@/lib/megaCardGolf/engine';
import {emptyPresentation,receivePresentation,presentationFrame,formatGolfScore} from '@/lib/megaCardGolf/presentation';
import {megaCupCue,megaHoleCue} from '@/lib/megaCardGolf/audio';
import type {AudioManager} from '@/lib/audio/audioManager';
import '@/components/megaCardGolf/megaCardGolf.css';

const params=new URLSearchParams(location.search),scenario=params.get('gameplay')??'play',theme=Number(params.get('theme')??0),course=INITIAL_COURSES[theme]??INITIAL_COURSES[0];
function fixture(){
 const faces=scenario==='negative'?[1,14,12,0,39,25]:scenario==='zero'?[4,6,9,17,19,22]:[4,6,9,1,19,22];
 const deck=[...faces,...Array.from({length:52},(_,i)=>i).filter(c=>!faces.includes(c))];
 let run=createRun('fixture-'+scenario+'-'+crypto.randomUUID(),'local-fixture',course,Array.from({length:9},()=>deck),Date.now());
 if(scenario==='final')for(let i=0;i<8;i++){run=recoverRun(run,run.deadline);run=recoverRun(run,run.deadline);}
 // Fixture clocks are rebased together; no published runtime or stored data is read.
 run.deadline=Date.now()+300000;
 run=applyIntent(run,{type:'open',indices:[0,5]},Date.now());
 if(scenario==='tap-in')for(const index of [1,2,3])run=applyIntent(applyIntent(run,{type:'draw'},Date.now()),{type:'replace',index},Date.now());
 if(scenario==='replacement'||scenario==='tap-in')run=applyIntent(run,{type:'draw'},Date.now());
 return run;
}
export function GameplayPreview({audio}:{audio:AudioManager}){
 const [run,setRun]=useState(fixture),[timeline,setTimeline]=useState(()=>receivePresentation(emptyPresentation(),projectRun(run,Date.now()),performance.now(),true)),[now,setNow]=useState(Date.now()),[sound,setSound]=useState(false),[error,setError]=useState('');
 const live=useRef(run);live.current=run;
 const [scrub,setScrub]=useState<number|null>(null);
 const frame=presentationFrame(timeline,scrub===null?performance.now():(timeline.events[0]?.start??0)+scrub,matchMedia('(prefers-reduced-motion: reduce)').matches)!;
 const receive=(next:MegaRun,intent?:Intent,silent=false)=>{setRun(next);setTimeline(old=>receivePresentation(old,projectRun(next,Date.now()),performance.now(),silent,intent));};
 useEffect(()=>{const uninstall=audio.install();audio.setUser('local-fixture');let raf:number;const tick=()=>{setNow(Date.now());raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>{uninstall();cancelAnimationFrame(raf);};},[]);
 useEffect(()=>{if(run.status!=='active'||scrub!==null)return;const timer=setTimeout(()=>receive(recoverRun(live.current,Date.now())),Math.max(0,run.deadline-Date.now())+20);return()=>clearTimeout(timer);},[run.revision,run.deadline,scrub]);
 useEffect(()=>{if(!frame.cue?.fresh)return;return audio.request({userId:'local-fixture',id:frame.cue.id,expiresAt:performance.now()+700,cue:frame.cue.kind==='cup'?megaCupCue:megaHoleCue});},[frame.cue?.id]);
 const act=(intent:Intent)=>{if(frame.locked)return;try{receive(applyIntent(run,intent,Date.now()),intent);}catch(e){setError(String(e));}};
 const replay=()=>{
  setScrub(null);
  const base=fixture(),at=performance.now(),before=projectRun(base,Date.now());let next=base,intent:Intent|undefined;
  if(scenario==='replacement'){intent={type:'replace',index:1};next=applyIntent(base,intent,Date.now());}
  else if(['scoring','pairs','negative','zero','final'].includes(scenario))next=recoverRun(base,base.deadline);
  // Rebase only the fixture's authoritative score boundary to the current demo clock.
  if(next.phase==='scoring'){const result=next.results.at(-1)!;const delta=result.startedAt-Date.now();result.startedAt-=delta;result.endsAt-=delta;next.deadline-=delta;}
  setRun(next);setTimeline(receivePresentation(receivePresentation(emptyPresentation(),before,at,true),projectRun(next,Date.now()),at,false,intent));setError('');
 };
 return <><nav className="polish-gameplay-tools"><select aria-label="Demo" value={scenario} onChange={e=>{location.search='?gameplay='+e.target.value+'&theme='+theme;}}>{['play','replacement','tap-in','scoring','pairs','negative','zero','final','cards'].map(s=><option key={s}>{s}</option>)}</select><select aria-label="Course theme" value={theme} onChange={e=>{location.search='?gameplay='+scenario+'&theme='+e.target.value;}}>{INITIAL_COURSES.map((c,i)=><option key={c.id} value={i}>{c.name}</option>)}</select><button onClick={replay}>Replay demo</button><button onClick={()=>{setSound(!sound);audio.setPreference('local-fixture',!sound);}}>Sound {sound?'on':'off'}</button><input aria-label="Presentation time" type="range" min="0" max="14000" step="100" value={scrub??0} onChange={e=>setScrub(Number(e.target.value))}/><button onClick={()=>setScrub(null)}>Live</button><a href="evidence.local/index.html">Gallery</a></nav>
  {scenario==='cards'?<div className="polish-deck-examples">{INITIAL_COURSES.map(c=><section key={c.id}><h2>{c.name}</h2><div className="polish-card-samples"><MegaCard course={c} card={null} label={c.name}/>{(['small','medium','large'] as const).map(tier=><figure key={tier}><PlayingCard card={{rank:'10',suit:'♥'}} frontStyle="megatouch" tier={tier} style={{width:110,height:154}}/><figcaption>{tier}</figcaption></figure>)}</div></section>)}</div>:
  <div className="mega-app" data-screen="game" data-preview-gameplay=""><header className="mega-topbar"><div className="mega-brand">MEGA CARD GOLF</div></header>{error&&<p role="alert">{error}</p>}{run.status==='abandoned'?<div className="mega-full-board"><h1>Course abandoned</h1><p>No leaderboard entry.</p></div>:run.status==='completed'&&!frame.locked?<div className="mega-full-board"><h1>Course complete</h1><p>Final score {formatGolfScore(run.score)}</p></div>:<MegaCardGolfGame view={frame.view} presentation={frame} now={now} busy={false} canAbandon={run.status==='active'} onIntent={act} onExit={()=>act({type:'abandon'})}/>}</div>}
 </>;
}
