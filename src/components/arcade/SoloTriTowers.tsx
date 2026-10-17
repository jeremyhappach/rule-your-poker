import {useEffect,useRef,useState} from 'react';
import {hasTriStart,retireTriStart} from '@/lib/triTowers/roundTimeline';
import {useNavigate} from 'react-router-dom';
import {useArcadeRun} from '@/hooks/useArcadeRun';
import type {TriArcadeSnapshot} from '@/lib/arcade/model';
import {roundResultPresentation} from '@/lib/triTowers/stagePresentation';
import {TriTowersBoard,TriTowersRules} from '@/components/triTowers/TriTowersView';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel,AlertDialogFooter} from '@/components/ui/alert-dialog';

export function SoloTriTowers({runId,userId}:{runId:string;userId:string}){
 const {snapshot,error,pending,now,act,completionLive,presentationEpoch,interruptPresentation,input,recoverInput}=useArcadeRun<TriArcadeSnapshot>(runId,true),navigate=useNavigate();
 const entry=useRef({runId,live:hasTriStart(runId)});if(entry.current.runId!==runId)entry.current={runId,live:hasTriStart(runId)};
 useEffect(()=>()=>retireTriStart(runId),[runId]);
 const [tab,setTab]=useState<ShellTabId>('cards'),[abandon,setAbandon]=useState(false),[finalUntil,setFinalUntil]=useState<number|null>(null);
 const view=snapshot?.view,result=view?.result?roundResultPresentation(view.result,view.deadline,view.rules.holdMs,now):null;
 const phase=view?.scorePresentation;
 useEffect(()=>setFinalUntil(null),[runId]);
 useEffect(()=>{
  if(snapshot?.status==='completed'&&completionLive&&phase&&now>=phase.endsAt&&finalUntil===null)setFinalUntil(performance.now()+2500);
 },[snapshot?.status,completionLive,phase?.endsAt,finalUntil,now]);
 useEffect(()=>{
  if(snapshot&&snapshot.status!=='active'&&(snapshot.status!=='completed'||!completionLive||!phase||(finalUntil!==null&&performance.now()>=finalUntil)))
   navigate('/arcade/tri-towers?result='+runId,{replace:true});
 },[snapshot,phase,now,completionLive,finalUntil,navigate,runId]);
 const canAct=snapshot?.status==='active'&&!(input?input.uncertain:pending)&&!error&&!!view&&now<view.deadline;
 const showFinal=snapshot?.status==='completed'&&completionLive&&finalUntil!==null&&performance.now()<finalUntil;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">
  <FullscreenGameShell className="tri-scene" title="TriTowers" panelTitle="Rules" panelDescription="Scoring for this game." ready={!!view}
   description={view?`Round ${view.round}${view.round===3?' · Bonus':' of 2'}`:'Connecting…'} activeTab={tab} setActiveTab={setTab}
   panel={view&&<TriTowersRules rules={view.rules} solo/>} announcement={false}
   navigation={<nav aria-label="Arcade controls"><button onClick={()=>setTab('lobby')}>Rules</button>{snapshot?.status==='active'&&<button onClick={()=>setAbandon(true)}>Abandon</button>}</nav>}
>
   <div className="tri-game" data-tri-towers data-phase={view?.phase}>
    {error&&<div role="alert" className="arcade-error">{error} <button onClick={()=>{interruptPresentation();void recoverInput();}}>Reconnect</button></div>}
    {view?<>
     <TriTowersBoard diagnosticRevision={snapshot?.revision} input={input} liveEntry={entry.current.live} recoveryEpoch={presentationEpoch} userId={userId} connected={!error} presentationActive={tab==='cards'} roundLabel={view.round===3?'BONUS ROUND':`ROUND ${view.round}`} scores={[{id:userId,score:view.score,active:true}]} takeScore={view.phase==='playing'?<button className="tri-take-score" disabled={!canAct} onClick={()=>void act({type:'take_score'})}>Take Score</button>:null} now={now} highRun={snapshot?.highRun} view={view} canAct={canAct} roundKey={view.roundId} result={result} onIntent={intent=>{if(intent.type==='remove')void act(intent);else if(intent.type==='draw')void act({type:'draw'});}}/></>:<p role="status">Restoring your game…</p>}
   </div>
   <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. Clocks continue while this dialog is open.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending||snapshot?.status!=='active'} onClick={()=>void act({type:'abandon'})}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </FullscreenGameShell>{showFinal&&<ArcadeCompletion score={snapshot.score} record={snapshot.completion}/>}
 </div>;
}
