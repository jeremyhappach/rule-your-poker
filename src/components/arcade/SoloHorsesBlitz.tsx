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
import './horsesBlitz.css';

const pips:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
export function SoloHorsesBlitz({runId,userId,transport:provided}:{runId:string;userId:string;transport?:BlitzTransport}){
 const transport=useMemo(()=>provided??blitzTransport(runId),[provided,runId]),live=useRef(hasTriStart(runId));
 const game=useHorsesBlitz(runId,userId,transport,live.current),v=game.snapshot,r=v?.result,navigate=useNavigate();
 const [selection,setSelection]=useState<{handId:string;indices:number[]}>({handId:'',indices:[]}),[abandon,setAbandon]=useState(false);
 const surface=useRef<HTMLDivElement>(null),done=useRef(false);
 const held=selection.handId===v?.handId?selection.indices:v?.held??[];
 const locked=!v||v.status!=='active'||v.phase!=='playing'||game.pending||!game.ready||v.deadline===null||game.now>=v.deadline;
 const seconds=v?.deadline==null?0:Math.max(0,Math.ceil((v.deadline-game.now)/1000));
 const final=v?.status==='completed'&&r&&game.now>=r.completedAt+3000;
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 useEffect(()=>{if(!v||v.status==='active'||done.current)return;
  if(game.bornEnded||v.status==='abandoned'||r&&game.now>=r.completedAt+5500){done.current=true;navigate('/arcade/horses-blitz?result='+runId,{replace:true});}
 },[v,r,game.now,game.bornEnded,navigate,runId]);
 useEffect(()=>{if(game.cue&&game.cue.intent.type!=='abandon')presentSound(game.cue.intent.type==='bank'?'slide':'flip',runId+':'+game.cue.requestId,surface.current);},[game.cue,runId]);
 function toggle(index:number){if(locked||!v)return;setSelection(previous=>{const indices=previous.handId===v.handId?previous.indices:v.held;return {handId:v.handId,indices:indices.includes(index)?indices.filter(i=>i!==index):[...indices,index]};});}
 return <div className="arcade-run hb-page" ref={surface} data-status={v?.status??'loading'}>
  <header className="hb-header"><div><small>P-TOWN ORIGINAL</small><h1>HORSES <em>BLITZ</em></h1></div><nav aria-label="Game controls"><ArcadeInfo game="horses-blitz" name="Horses Blitz" ruleset="horses-blitz/1"/><GameplaySoundButton/><ArcadeAbandonButton disabled={!v||v.status!=='active'} onClick={()=>setAbandon(true)}/></nav></header>
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
     <div className="hb-dice">{v.dice.map((face,i)=><button key={i} className="hb-die" data-wild={face===1} data-held={held.includes(i)} aria-pressed={held.includes(i)} aria-label={'Die '+(i+1)+': '+face+(face===1?' wild':'')} disabled={locked} onClick={()=>toggle(i)}>
      <span className="hb-face" aria-hidden="true">{Array.from({length:9},(_,cell)=><i key={cell} data-pip={pips[face].includes(cell)}/>)}</span>
     </button>)}</div>
     <div className="hb-set" role="status">{v.phase==='banking'?<><span>{v.set.label}</span><strong className="hb-bank-award">+{v.bank?.points.toLocaleString()}</strong></>:v.set.label}</div>
    </section>
    <div className="hb-actions" data-canonical-felt-interaction-layer><button className="hb-bank" disabled={locked||v.set.points===0} onClick={()=>game.act('bank')}>Bank <strong>{v.set.points.toLocaleString()}</strong></button><button className="hb-roll" disabled={locked} onClick={()=>game.act('roll',held)}>Roll {Math.min(3,v.roll+1)}</button></div>
   </div>}
  </main>}
  {game.error&&v&&<div className="hb-error" role="alert">{game.error}<button onClick={game.reconnect}>Reconnect</button></div>}
  {final&&<ArcadeCompletion score={v.score} record={v.completion}/>}
  <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. The round clock continues while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={game.pending} onClick={()=>game.act('abandon')}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </div>;
}
