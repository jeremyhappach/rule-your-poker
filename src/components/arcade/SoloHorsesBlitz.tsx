import {useEffect,useMemo,useRef,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {ArcadeAbandonButton} from './ArcadeAbandonButton';
import {ArcadeInfo} from './ArcadeInfo';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogFooter,AlertDialogAction,AlertDialogCancel} from '@/components/ui/alert-dialog';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {blitzTransport,type BlitzTransport} from '@/lib/horsesBlitz/client';
import {useHorsesBlitz} from '@/hooks/useHorsesBlitz';
import {presentSound} from '@/lib/audio/presentationSound';
import {isSoundSurfaceVisible} from '@/lib/audio/presentationSound';
import {platformAudio} from '@/lib/audio/platformAudio';
import {boxingBellCue} from '@/lib/run21/boxingBell';
import {QuintzeeDie} from '../quintzee/QuintzeeDie';
import {useQuintzeeRollAudio} from '../quintzee/useQuintzeeRollAudio';
import {useHorsesBlitzRoll} from './useHorsesBlitzRoll';
import {Dices} from 'lucide-react';
import '../quintzee/quintzee.css';
import './horsesBlitz.css';

export function SoloHorsesBlitz({runId,userId,transport:provided}:{runId:string;userId:string;transport?:BlitzTransport}){
 const transport=useMemo(()=>provided??blitzTransport(runId),[provided,runId]),live=useRef(hasTriStart(runId));
 const game=useHorsesBlitz(runId,userId,transport,live.current),rollMotion=useHorsesBlitzRoll(game.cue,game.error,game.ready),motion=rollMotion.motion;
 const v=motion?(motion.settled?motion.landing:motion.source):game.snapshot,r=v?.result,navigate=useNavigate();
 const [selection,setSelection]=useState<{handId:string;indices:number[]}>({handId:'',indices:[]}),[abandon,setAbandon]=useState(false);
 const surface=useRef<HTMLDivElement>(null),done=useRef(false);
 const held=motion?.held??(selection.handId===v?.handId?selection.indices:v?.held??[]);
 const locked=!!motion||!v||v.status!=='active'||v.phase!=='playing'||game.pending||!game.ready||v.deadline===null||game.now>=v.deadline;
 const rumble=motion&&!motion.settled?motion:null;
 useQuintzeeRollAudio(rumble,game.ready&&!game.error,surface);
 const dice=rumble&&v?.dice.length===0?[1,1,1,1,1]:v?.dice??[];
 const seconds=v?.deadline==null?0:Math.max(0,Math.ceil((v.deadline-game.now)/1000));
 const final=v?.status==='completed'&&r&&game.now>=r.completedAt+3000;
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 useEffect(()=>{if(!v||v.status==='active'||done.current)return;
  if(game.bornEnded||v.status==='abandoned'||r&&game.now>=r.completedAt+5500){done.current=true;navigate('/arcade/horses-blitz?result='+runId,{replace:true});}
 },[v,r,game.now,game.bornEnded,navigate,runId]);
 useEffect(()=>{if(game.cue?.command.intent.type==='bank')presentSound('slide',runId+':'+game.cue.command.requestId,surface.current);},[game.cue,runId]);
 useEffect(()=>{
  if(!game.roundCue)return;
  const at=performance.now();
  // Manual Roll (1) may overlap the opening bell; keep both at the rolling priority.
  return platformAudio.follow({userId,id:'run21-bell:horses-blitz:'+game.roundCue,startedAt:at,expiresAt:at+2500,cueAt:()=>isSoundSurfaceVisible(surface.current)?{...boxingBellCue,policy:{priority:25,group:'horses-blitz-opening',intervalMs:0}}:undefined});
 },[game.roundCue,userId]);
 function toggle(index:number){if(locked||rollMotion.locked()||!v)return;setSelection(previous=>{const indices=previous.handId===v.handId?previous.indices:v.held;return {handId:v.handId,indices:indices.includes(index)?indices.filter(i=>i!==index):[...indices,index]};});}
 function roll(){if(locked||rollMotion.locked()||!v)return;const items=v.roll===0?[]:held,command=game.act('roll',items);if(command)rollMotion.start(command,v,items);}
 function bank(){if(!locked&&!rollMotion.locked())game.act('bank');}
 return <div className="arcade-run hb-page" ref={surface} data-status={v?.status??'loading'}>
  <header className="hb-header"><div><small>P-TOWN ORIGINAL</small><h1>HORSES <em>BLITZ</em></h1></div><nav aria-label="Game controls"><ArcadeInfo game="horses-blitz" name="Horses Blitz" ruleset={v?.ruleset??'horses-blitz/2'}/><GameplaySoundButton/><ArcadeAbandonButton disabled={!v||v.status!=='active'||!!motion} onClick={()=>setAbandon(true)}/></nav></header>
  {!v?<main className="hb-loading" role="status">{game.error||'Rolling the dice…'}{game.error&&<button onClick={game.reconnect}>Reconnect</button>}</main>:
  <main className="hb-board" data-phase={v.phase} data-canonical-felt-interaction-layer>
   {r?<section className="hb-summary" aria-label={'Round '+v.round+' summary'}>
    <h2>Round {v.round}<br/>{r.reason==='timeout'?'Time up':'Complete'}</h2>
    <dl><div><dt>Base score</dt><dd>{r.base.toLocaleString()}</dd></div><div><dt>Timer bonus</dt><dd>+{r.timerBonus.toLocaleString()}</dd></div><div className="hb-total"><dt>Round total</dt><dd>{r.total.toLocaleString()}</dd></div></dl>
    {v.round<3?<button className="hb-next" disabled={game.pending||!game.ready} onClick={()=>game.act('next_round')}>Next Round</button>:<p className="hb-run-total">TOTAL SCORE <strong>{v.score.toLocaleString()}</strong></p>}
   </section>:<div className="hb-play">
    <div className="hb-status"><span>Round {v.round}/3</span><span>Hand {v.hand}/10</span><time aria-label="Time remaining">{Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')}</time></div>
    <div className="hb-base"><span>BASE SCORE</span><strong aria-label="Round base score">{v.base.toLocaleString()}</strong></div>
    <section className="hb-hand" aria-label="Current hand" data-hand={v.handId}>
     <div className="hb-markers" aria-label={'Roll '+v.roll+' of 3'}>{[1,2,3].map(n=><i key={n} data-used={n<=v.roll}/>)}</div>
     <div className="hb-dice" aria-label="Dice">{dice.map((face,i)=>{const rolling=!!rumble&&!held.includes(i);return <button key={i} className="hb-die" data-rolling={rolling} data-wild={!rolling&&face===1} data-held={held.includes(i)} aria-pressed={held.includes(i)} aria-label={'Die '+(i+1)+': '+(rolling?'rolling':face+(face===1?' wild':''))} disabled={locked} onClick={()=>toggle(i)}>
      <QuintzeeDie value={face} rolling={rolling}/>
     </button>;})}</div>
     <div className="hb-set" role="status">{rumble?'Rolling…':v.phase==='banking'?<><span>{v.set.label}</span><strong className="hb-bank-award">+{v.bank?.points.toLocaleString()}</strong></>:v.set.label}</div>
    </section>
    <div className="hb-actions" data-canonical-felt-interaction-layer><button className="hb-bank" disabled={locked||v.set.points===0} onClick={bank}>Bank <strong>{v.set.points.toLocaleString()}</strong></button><button className="hb-roll" disabled={locked} onClick={roll}><Dices aria-hidden="true"/> Roll ({Math.min(3,v.roll+1)})</button></div>
   </div>}
  </main>}
  {game.error&&v&&<div className="hb-error" role="alert">{game.error}<button onClick={game.reconnect}>Reconnect</button></div>}
  {final&&<ArcadeCompletion score={v.score} record={v.completion}/>}
  <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. The round clock continues while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={game.pending} onClick={()=>game.act('abandon')}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
