import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {ArcadeAbandonButton} from './ArcadeAbandonButton';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {TriScorePill,TriRoundIntro,useTriRoundPresentation} from '@/components/triTowers/TriTowersPresentation';
import {voyageTransport,type VoyageTransport} from '@/lib/shipCapVoyage/client';
import {type VoyageSnapshot} from '@/lib/shipCapVoyage/model';
import {useShipCapVoyage} from '@/hooks/useShipCapVoyage';
import {useQuintzeeRollTiming} from '@/lib/geometryLab/quintzeeRollTiming';
import {QuintzeeDie} from '../quintzee/QuintzeeDie';
import {approvedSound} from '@/lib/audio/approvedSounds';
import {startRollSound} from '@/lib/audio/diceRollSound';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {platformAudio} from '@/lib/audio/platformAudio';
import {boxingBellCue} from '@/lib/run21/boxingBell';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import {useBankOffer} from '@/hooks/useBankOffer';
import {supabase} from '@/integrations/supabase/client';
import '../quintzee/quintzee.css';
import './shipCapVoyage.css';
import {cargoBankCue} from '@/lib/shipCapVoyage/cues';
import type {CSSProperties} from 'react';

interface Flight {id:string;roundId:string;at:number;dice:{index:number;slot:number;face:number;x:number;y:number;dx:number;dy:number;width:number;scale:number}[]}
interface Motion {identity:string;source:VoyageSnapshot;until:number}
export function SoloShipCapVoyage({runId,userId,transport:provided}:{runId:string;userId:string;transport?:VoyageTransport}){
 const transport=useMemo(()=>provided??voyageTransport(runId),[provided,runId]),live=useRef(hasTriStart(runId));
 const game=useShipCapVoyage(runId,userId,transport,live.current),navigate=useNavigate(),{durationMs}=useQuintzeeRollTiming();
 const [motion,setMotion]=useState<Motion|null>(null),motionRef=useRef<Motion|null>(null),surface=useRef<HTMLDivElement>(null),board=useRef<HTMLDivElement>(null);
 const [abandon,setAbandon]=useState(false),done=useRef(false);
 const [flight,setFlight]=useState<Flight|null>(null),flightRef=useRef<Flight|null>(null),landed=useRef(new Set<string>());
 const nowRef=useRef(game.now);nowRef.current=game.now;
 const haptic=useRef(false),landingStop=useRef<()=>void>(()=>{});
 const v=motion?.source??game.snapshot,r=v?.result,elapsed=r?game.now-r.completedAt:0;
 const final=v?.status==='completed'&&!!r&&(game.bornEnded||elapsed>=5000);
 const intro=v&&game.roundCue===v.roundId?Math.max(0,2500-(game.now-v.startedAt)):0;
 const result=r?{...r,scoreBefore:0,score:r.total,displayScore:r.total,elapsed}:null;
 const tally=useTriRoundPresentation({scope:'voyage:'+v?.roundId,phase:r?'stage_complete':'playing',connected:game.ready&&!game.error,paused:false,result,now:game.now,deadline:0,userId,active:!!v,modern:true,liveEntry:live.current,recoveryEpoch:game.recoveryEpoch});
 const finalPhase=r&&v?{from:0,to:v.score,startedAt:r.completedAt+5000,endsAt:r.completedAt+8000}:null;
 usePresentedScoreAudio(userId,final&&!game.bornEnded&&game.liveRevision>=0&&elapsed<8000?'voyage-final:'+runId:null,finalPhase,game.now);
 const finalScore=final&&!game.bornEnded&&game.liveRevision>=0&&finalPhase?Math.round(v!.score*Math.min(1,Math.max(0,(game.now-finalPhase.startedAt)/3000))):v?.score??0;
 const offer=useBankOffer({scope:runId+':'+v?.roundId+':'+v?.banks.length,receipt:String(v?.roll),points:v?.quote?.points??null,bankable:!!v&&v.cargo!==null&&v.cargo>=3,now:game.now,live:game.liveRevision>=0&&!motion,userId,surface});
 const locked=!!flight||!!motion||!v||v.status!=='active'||v.phase!=='playing'||game.pending||!game.ready||!!game.error||intro>0;
 function vibrate(pattern:number|number[]){if(haptic.current&&!document.hidden)navigator.vibrate?.(pattern);}
 function stopMotion(){flightRef.current=null;setFlight(null);motionRef.current=null;setMotion(null);navigator.vibrate?.(0);landingStop.current();}
 useEffect(()=>{let active=true;void supabase.from('profiles').select('use_haptic').eq('id',userId).maybeSingle().then(({data})=>{if(active)haptic.current=data?.use_haptic===true;});return()=>{active=false;};},[userId]);
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 useEffect(()=>{if(!v||v.status==='active'||done.current)return;if(v.status==='abandoned'||game.bornEnded||r&&elapsed>=11000){done.current=true;navigate('/arcade/ship-cap-voyage?result='+runId,{replace:true});}},[v?.status,game.bornEnded,r,elapsed,navigate,runId]);
 useEffect(()=>{
  if(!game.roundCue)return;const at=performance.now();
  return platformAudio.follow({userId,id:'run21-bell:ship-cap-voyage:'+game.roundCue,startedAt:at,expiresAt:at+2500,cueAt:()=>isSoundSurfaceVisible(surface.current)?boxingBellCue:undefined});
 },[game.roundCue,userId]);
 useEffect(()=>{
  if(!motion)return;landingStop.current();const stop=startRollSound('cupRoll',motion.identity,surface.current);
  return stop;
 },[motion?.identity]);
 useEffect(()=>{
  if(!motion||game.cue?.command.requestId!==motion.identity)return;
  const timer=setTimeout(()=>{if(motionRef.current!==motion)return;const target=game.cue!.snapshot,root=board.current?.getBoundingClientRect();
   const dice=root&&target.roundId===motion.source.roundId?target.locked.slice(motion.source.locked.length).flatMap((index,n)=>{
    const slot=motion.source.locked.length+n,from=board.current?.querySelector('[data-die-index="'+index+'"]')?.getBoundingClientRect(),to=board.current?.querySelector('[data-qualification-slot="'+slot+'"]')?.getBoundingClientRect();
    return from&&to?[{index,slot,face:target.dice[index],x:100*(from.left-root.left)/root.width,y:100*(from.top-root.top)/root.height,dx:to.left-from.left,dy:to.top-from.top,width:100*from.width/root.width,scale:to.width/from.width}]:[];
   }):[];
   stopMotion();if(dice.length){const next={id:motion.identity,roundId:target.roundId,at:nowRef.current,dice};flightRef.current=next;setFlight(next);}
   platformAudio.present({userId,id:'palette:diceMany:'+motion.identity+':land',cue:isSoundSurfaceVisible(surface.current)?approvedSound('diceMany'):undefined},cancel=>{landingStop.current=cancel;});vibrate([25,35,20]);},Math.max(0,motion.until-performance.now()));
  return()=>clearTimeout(timer);
 },[motion,game.cue]);
 useEffect(()=>{if(game.error||!game.ready)stopMotion();},[game.error,game.ready]);
 useEffect(()=>{const hidden=()=>{if(document.hidden)stopMotion();};window.addEventListener('offline',stopMotion);document.addEventListener('visibilitychange',hidden);return()=>{window.removeEventListener('offline',stopMotion);document.removeEventListener('visibilitychange',hidden);navigator.vibrate?.(0);landingStop.current();};},[]);
 useEffect(()=>{
  if(!flight)return;
  if(flight.roundId!==game.snapshot?.roundId){flightRef.current=null;setFlight(null);return;}
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  flight.dice.forEach((die,i)=>{const id=flight.id+':qualify:'+die.slot;if((reduced||game.now-flight.at>=(i+1)*500)&&!landed.current.has(id)){
   landed.current.add(id);platformAudio.present({userId,id:'voyage:'+id,cue:isSoundSurfaceVisible(surface.current)?approvedSound('scorePost'):undefined});
  }});
  if(reduced||game.now-flight.at>=flight.dice.length*500){flightRef.current=null;setFlight(null);}
 },[flight,game.now,game.snapshot?.roundId,userId]);
 useEffect(()=>{
  const cue=game.cue;if(cue?.command.intent.type!=='bank')return;
  platformAudio.present({userId,id:'voyage-bank:'+runId+':'+cue.command.requestId,cue:isSoundSurfaceVisible(surface.current)?cargoBankCue:undefined});
 },[game.cue,runId,userId]);
 function roll(){if(locked||motionRef.current||flightRef.current||!v)return;const command=game.act('roll');if(command){const m={identity:command.requestId,source:v,until:performance.now()+durationMs};motionRef.current=m;setMotion(m);vibrate([25,40,25]);}}
 return <div className="arcade-run scv-page" ref={surface} data-phase={final?'final':r?'result':motion?'rolling':'playing'}>
 <header className="scv-header"><h1>SHIP CAP <em>VOYAGE</em></h1><nav aria-label="Game controls"><GameplaySoundButton/>{v?.status==='active'&&<ArcadeAbandonButton disabled={game.pending||!!motion} onClick={()=>setAbandon(true)}/>}</nav></header>
 {!v?<p role="status">{game.error||'Preparing your voyage…'}</p>:final?<main className="scv-final">
  <h2>VOYAGE COMPLETE</h2><dl>{v.results.map(x=><div key={x.round}><dt>Round {x.round}</dt><dd>{x.total.toLocaleString()}</dd></div>)}</dl>
  <section className="scv-grand"><h3>GRAND TOTAL</h3><strong aria-label="Grand total">{finalScore.toLocaleString()}</strong>{v.completion?.kind==='broken'&&<p>New personal best</p>}</section>
 </main>:<main className="scv-board" ref={board} data-canonical-felt-interaction-layer>
  <div className="scv-status"><div><strong>ROUND {v.round} OF 3</strong></div><div className="scv-score"><small>{r?'ROUND SCORE':'GAME SCORE'}</small><TriScorePill item={{id:userId,score:v.score,active:true}} root={board} fraction={r?tally.fraction:0} value={r?tally.displayScore??r.total:v.score}/></div></div>
  <section className="scv-qualification" aria-label="Qualification">{['Ship','Captain','Crew'].map((label,i)=>{const travelling=flight?.dice.find(d=>d.slot===i),arrived=!travelling||game.now-flight!.at>=(flight!.dice.indexOf(travelling)+1)*500;return <div key={label} data-locked={v.locked.length>i}><span>{label}</span><div className="scv-qualified-die" data-qualification-slot={i}>{v.locked.length>i&&arrived&&<QuintzeeDie value={6-i} rolling={false}/>}</div></div>;})}</section>
  <section className="scv-tray" aria-label="Dice tray">
   {r?<div className="scv-result"><h2>{r.reason==='complete'?'MANIFEST COMPLETE':'INCOMPLETE MANIFEST'}</h2><strong style={{visibility:tally.fraction>0?'hidden':'visible'}}>{r.total.toLocaleString()}</strong><p>{r.reason==='incomplete'?'Round scores zero · cargo forfeited':'All three cargo banks secured'}</p></div>:<>
   <div className="scv-rolls-left" data-left={12-v.roll} role="status">Rolls Left <strong>{12-v.roll}</strong></div><div className="scv-dice">{Array.from({length:5},(_,i)=>i).filter(i=>!v.locked.includes(i)).map(i=>{const held=false,rolling=!!motion&&!held,empty=!rolling&&(!v.dice.length||v.locked.length===3&&v.cargo===null&&!held);return <div key={i} className="scv-die" data-die-index={i} data-rolling={rolling} data-locked={held} aria-label={'Die '+(i+1)+': '+(rolling?'rolling':empty?'unrolled':v.dice[i])}>{empty?<span className="scv-empty"/>:<QuintzeeDie value={v.dice[i]??1} rolling={rolling}/>}</div>;})}</div>
   <div className="scv-candidate" role="status">{motion?'Rolling…':v.cargo!==null?<>CARGO <strong>{v.cargo}</strong><small>{v.cargo>=3?`${v.quote?.base} base + ${v.quote?.bonus} roll bonus = ${v.quote?.points}`:'Snake eyes · roll again'}</small></>:v.roll===0?'Ready when you are':v.locked.length===3?'Roll your next cargo':'Qualify 6 → 5 → 4'}</div></>}
  </section>
  <section className="scv-manifest" aria-label="Cargo manifest"><h2>CARGO MANIFEST</h2><div>{[0,1,2].map(i=>{const b=v.banks[i];return <article key={i} data-highlight={!!r&&r.total>0&&Math.floor(Math.max(0,elapsed-1000)/1000)===i} data-forfeit={r?.total===0}><small>BANK {i+1}</small><strong>{b?.cargo??'—'}</strong><span>{b?`${b.base} + ${b.bonus}`:'EMPTY'}</span><b>{b?b.points+' PTS':'—'}</b></article>;})}</div></section>
  <div className="scv-actions">{r?<p role="status">{v.round<3?'Next round opens after the score tally':'Preparing scoreboard…'}</p>:<><button className="scv-bank" disabled={locked||v.cargo===null||v.cargo<3} onClick={()=>{if(!motionRef.current&&!flightRef.current)game.act('bank');}}><strong>{offer??'—'}</strong><span>Bank Cargo</span></button><button onClick={roll} disabled={locked||v.roll>=12}>{motion?'Rolling…':v.roll===0?'Roll (1)':'Roll Again'}</button></>}</div>
  {flight&&flight.dice.map((die,i)=><div key={die.index} className="scv-flight" aria-hidden="true" style={{left:die.x+'%',top:die.y+'%',width:die.width+'%','--flight-x':die.dx+'px','--flight-y':die.dy+'px','--flight-scale':die.scale,animationDelay:i*500+'ms',visibility:game.now-flight.at>=(i+1)*500?'hidden':undefined} as CSSProperties}><QuintzeeDie value={die.face} rolling={false}/></div>)}
  {intro>0&&<div className="scv-intro"><TriRoundIntro remaining={intro} roundLabel={'ROUND '+v.round} paused={false}/></div>}
 </main>}
 {game.error&&<div role="alert">{game.error} <button onClick={game.reconnect}>Reconnect</button></div>}
 <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={game.pending} onClick={()=>game.act('abandon')}>Abandon</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
