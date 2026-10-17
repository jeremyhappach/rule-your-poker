import {useEffect,useState} from 'react';
import {useNavigate} from 'react-router-dom';
import {useArcadeRun} from '@/hooks/useArcadeRun';
import {usePresentedScoreAudio} from '@/hooks/usePresentedScoreAudio';
import type {TriArcadeSnapshot} from '@/lib/arcade/model';
import {roundResultPresentation} from '@/lib/triTowers/stagePresentation';
import {TriTowersBoard,TriTowersRules} from '@/components/triTowers/TriTowersView';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {RoundTimeBar} from '@/lib/canonicalShell/RoundTimeBar';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel,AlertDialogFooter} from '@/components/ui/alert-dialog';

export function SoloTriTowers({runId,userId}:{runId:string;userId:string}){
 const {snapshot,error,pending,now,act,refresh,completionLive}=useArcadeRun<TriArcadeSnapshot>(runId),navigate=useNavigate();
 const [tab,setTab]=useState<ShellTabId>('cards'),[abandon,setAbandon]=useState(false),[finalUntil,setFinalUntil]=useState<number|null>(null);
 const view=snapshot?.view,result=view?.result?roundResultPresentation(view.result,view.deadline,view.rules.holdMs,now):null;
 const phase=view?.scorePresentation,count=phase?{...phase,endsAt:phase.startedAt+2800}:null;
 const countLive=!error&&(snapshot?.status==='active'||completionLive)&&count&&count.to>count.from&&now>=count.startedAt&&now<count.endsAt;
 usePresentedScoreAudio(userId,countLive?'tri-count:'+runId+':'+view?.roundId:null,count,now);
 useEffect(()=>setFinalUntil(null),[runId]);
 useEffect(()=>{
  if(snapshot?.status==='completed'&&completionLive&&phase&&now>=phase.endsAt&&finalUntil===null)setFinalUntil(performance.now()+2500);
 },[snapshot?.status,completionLive,phase?.endsAt,finalUntil,now]);
 useEffect(()=>{
  if(snapshot&&snapshot.status!=='active'&&(snapshot.status!=='completed'||!completionLive||!phase||(finalUntil!==null&&performance.now()>=finalUntil)))
   navigate('/arcade/tri-towers?result='+runId,{replace:true});
 },[snapshot,phase,now,completionLive,finalUntil,navigate,runId]);
 const canAct=snapshot?.status==='active'&&!pending&&!error&&!!view&&now<view.deadline;
 const score=result?.displayScore??view?.score??0;
 const showFinal=snapshot?.status==='completed'&&completionLive&&finalUntil!==null&&performance.now()<finalUntil;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">
  <FullscreenGameShell title="TriTowers" panelTitle="Rules" panelDescription="Scoring for this run." ready={!!view}
   description={view?`Round ${view.round}${view.round===3?' · Bonus':' of 2'}`:'Connecting…'} activeTab={tab} setActiveTab={setTab}
   panel={view&&<TriTowersRules rules={view.rules} solo/>} announcement={false}
   navigation={<nav aria-label="Arcade controls"><button onClick={()=>setTab('lobby')}>Rules</button>{snapshot?.status==='active'&&<button onClick={()=>setAbandon(true)}>Abandon</button>}</nav>}
   scores={<div className="arcade-run-score"><span>Total score</span><strong><span className="tri-count-animated">{score.toLocaleString()}</span><span className="tri-count-reduced">{(view?.score??0).toLocaleString()}</span></strong></div>}
   timer={view&&(view.phase==='playing'?<div className="tri-timer"><small>Round time</small><RoundTimeBar remaining={Math.max(0,Math.min(view.rules.stageMs,view.deadline-now))} full={view.rules.stageMs}/></div>:
    <span className="tri-clock" role="timer">{Math.max(0,Math.ceil((view.deadline-now)/1000))}s <small>{view.phase==='ready'?'to play first card':'result hold'}</small></span>)}
   actions={view&&<div className="tri-actions">{view.phase==='ready'?<span>Play a card or draw to start</span>:view.phase==='playing'?<button className="tri-take-score" disabled={!canAct} onClick={()=>void act({type:'take_score'})}>Take Score</button>:<span>Continuing automatically…</span>}</div>}>
   <div className="tri-game" data-tri-towers data-phase={view?.phase}>
    {error&&<div role="alert" className="arcade-error">{error} <button onClick={()=>void refresh(true)}>Reconnect</button></div>}
    {view?<><div className="tri-status"><strong aria-live="polite">{view.event.label}{view.event.points?` ${view.event.points>0?'+':''}${view.event.points.toLocaleString()}`:''}</strong></div>
     <TriTowersBoard view={view} canAct={canAct} roundKey={view.roundId} result={result} onIntent={intent=>{if(intent.type==='remove')void act(intent);else if(intent.type==='draw')void act({type:'draw'});}}/></>:<p role="status">Restoring your run…</p>}
   </div>
   <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon run?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. Clocks continue while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending||snapshot?.status!=='active'} onClick={()=>void act({type:'abandon'})}>Abandon Run</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FullscreenGameShell>{showFinal&&<ArcadeCompletion score={snapshot.score} record={snapshot.completion}/>}
 </div>;
}
