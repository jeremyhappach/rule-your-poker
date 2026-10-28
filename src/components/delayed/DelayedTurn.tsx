import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
import {BoxdropView} from '@/components/boxdrop/BoxdropView';
import type {BoxdropSnapshot} from '@/lib/boxdrop/model';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {delayedRequest,DelayedRequestError,gameName} from '@/lib/delayed/client';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {BoardProjection} from '@/lib/run21/model';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {Run21PlayerPane,Run21Timer} from '@/components/run21/Run21PlayerPane';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
import {Run21SpaceScene} from '@/components/run21/Run21SpaceScene';
import {TriTowersBoard,TriTowersRules} from '@/components/triTowers/TriTowersView';
import type {project} from '../../../server/delayed/adapter';
import '@/lib/arcade/arcade.css';
type Snapshot=Awaited<ReturnType<typeof project>>;

export function DelayedTurn({childId,matchId,userId}:{childId:string;matchId:string;userId:string}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(Date.now()),[tab,setTab]=useState<ShellTabId>('cards');
 const clock=useRef({at:Date.now(),received:performance.now()}),generation=useRef(0),request=useRef<Record<string,unknown>|null>(null),initialSegment=useRef<number|null>(null);
 const navigate=useNavigate(),latest=useRef<Snapshot|null>(null);
 const accept=useCallback((value:Snapshot)=>{
  if(value.id!==childId||value.matchId!==matchId)throw Error('Turn identity changed. Return to the match.');
  const old=latest.current;if(old&&old.revision>value.revision)return;
  if(old&&old.revision===value.revision&&JSON.stringify({...old,serverAt:0})!==JSON.stringify({...value,serverAt:0}))throw Error('Conflicting turn snapshot. Reconnect safely.');
  latest.current=value;
  clock.current={at:value.serverAt,received:performance.now()};setNow(value.serverAt);
  setSnapshot(old=>old&&old.revision>value.revision?old:value);
  if(initialSegment.current===null){initialSegment.current=value.segment;if(value.terminal||value.actor!==userId)navigate('/delayed/'+matchId,{replace:true});}
 },[childId,matchId,userId,navigate]);
 const refresh=useCallback(async()=>{const epoch=++generation.current;try{
  const value=await delayedRequest<Snapshot>(request.current??{op:'state',childId});
  if(epoch!==generation.current)return;accept(value);request.current=null;setPending(false);setError('');
 }catch(e){if(epoch===generation.current){
  const message=e instanceof Error?e.message:'Unable to reconnect.';
  if(message==='delayed:stale_action'||e instanceof DelayedRequestError&&e.status<500){
   request.current=null;setPending(false);
   try{accept(await delayedRequest<Snapshot>({op:'state',childId}));setError('');}catch{setError('Unable to restore the latest turn.');}
  }else setError(message);
 }}},[childId,accept]);
 useEffect(()=>{void refresh();const channel=supabase.channel('delayed-turn:'+childId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},payload=>{
  if((payload.new as any).match_id===matchId&&!request.current)void refresh();
 }).subscribe(status=>{if(status==='SUBSCRIBED'&&!request.current)void refresh();});
  const focus=()=>{if(!document.hidden)void refresh();};document.addEventListener('visibilitychange',focus);window.addEventListener('online',focus);
  return()=>{generation.current++;void supabase.removeChannel(channel);document.removeEventListener('visibilitychange',focus);window.removeEventListener('online',focus);};
 },[childId,userId,matchId,refresh]);
 useEffect(()=>{const timer=setInterval(()=>setNow(clock.current.at+performance.now()-clock.current.received),100);return()=>clearInterval(timer);},[]);
 const ended=!!snapshot&&(snapshot.terminal||snapshot.actor!==userId||snapshot.segment!==initialSegment.current);
 const result=snapshot?.ownResults.at(-1);
 const board=(ended?result?.board:snapshot?.board) as any;
 const displayRound=ended&&result?result.round:snapshot?.round;
 const due=snapshot&&!snapshot.terminal&&!ended?Math.min(board?.deadline??Infinity,Date.parse(snapshot.expiresAt)):null;
 useEffect(()=>{if(due===null||!Number.isFinite(due)||request.current)return;
  const timer=setTimeout(()=>void refresh(),Math.max(0,due-clock.current.at));return()=>clearTimeout(timer);
 },[due,snapshot?.revision,refresh]);
 async function act(intent:Record<string,unknown>){if(!snapshot||pending||request.current)return;
  request.current={op:'action',childId,revision:snapshot.revision,segment:snapshot.segment,requestId:crypto.randomUUID(),intent};setPending(true);setError('');await refresh();}
 // A reconnect into an unavailable/terminal segment belongs at the match home.
 useEffect(()=>{if(snapshot&&ended&&!result)navigate('/delayed/'+matchId,{replace:true});},[snapshot,ended,result,matchId,navigate]);
 const view:BoardProjection|undefined=snapshot?.game==='run21'&&board?{config:snapshot.config as BoardProjection['config'],
  roundId:childId+':'+snapshot.segment,roundNumber:displayRound!,viewerId:userId,boards:{[userId]:board},players:[{id:userId,name:'You'}],
  active_player_id:ended?null:userId,liveBoards:true,revealed:false,cumulative:snapshot.totals,scorePresentation:null,presentationKey:childId}:undefined;
 const canAct=!!snapshot&&!snapshot.held&&!ended&&!pending&&!error&&now<Date.parse(snapshot.expiresAt)&&!!board&&now<board.deadline;
 const home=<Link to={'/delayed/'+matchId}>Match home</Link>;
 if(!snapshot||!board)return <main className="delayed-page"><header>{home}<h1>{snapshot?gameName(snapshot.game):'Your turn'}</h1></header>
  {error&&<p role="alert">{error} <button onClick={()=>void refresh()}>Retry safely</button></p>}
  {!snapshot?<p role="status">Restoring your turn…</p>:ended?<><h2>{snapshot.terminal?'Game complete':'Turn complete'}</h2>{result&&<p>Your round {result.round} score: {result.score.toLocaleString()}.</p>}
   <p>The result is provisional until every game in the match finishes.</p>{home}</>:<><p>Availability deadline: {new Date(snapshot.expiresAt).toLocaleString()}. Starting now also starts the normal gameplay clock.</p>
    {snapshot.held&&<p role="status">This match is on hold during a platform incident.</p>}
    <button disabled={snapshot.held||pending||!!error||snapshot.actor!==userId||now>=Date.parse(snapshot.expiresAt)} onClick={()=>void act({type:'start'})}>Begin round {snapshot.round}</button></>}
 </main>;
 if(snapshot.game==='quintzee'){
  const players=Object.keys(snapshot.totals),value:QuintzeeSnapshot={id:childId,revision:snapshot.revision,scope:childId+':'+snapshot.segment,serverAt:snapshot.serverAt,theme:'modern',pausedAt:snapshot.held?snapshot.serverAt:null,status:snapshot.terminal?'completed':'active',outcome:'active',playerNames:Object.fromEntries(players.map(id=>[id,id===userId?'You':'Opponent'])),state:{rules:board.rules,players,scores:snapshot.totals,round:displayRound!,turnIndex:players.indexOf(ended?userId:snapshot.actor),qualified:[],results:[],finished:snapshot.terminal,board}};
  return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><div className="delayed-turn-nav">{home}<span>Play money · 36-hour turns</span></div><QuintzeeView navigation={<nav><button onClick={()=>setTab('lobby')}>Rules</button><Link to={'/delayed/'+matchId}>History</Link></nav>} snapshot={value} actor={userId} userId={userId} now={now} pending={!canAct} error={error} onIntent={i=>void act({...i})} onReconnect={()=>void refresh()} activeTab={tab} setActiveTab={setTab}/></div>;
 }
 if(snapshot.game==='boxdrop'){
  const value:BoxdropSnapshot={id:childId,revision:snapshot.revision,scope:childId+':'+snapshot.segment,serverAt:snapshot.serverAt,round:displayRound!,board,canAct,paused:snapshot.held,pausedAt:snapshot.held?snapshot.serverAt:null,finished:snapshot.terminal,settled:false,solo:false,players:Object.keys(snapshot.totals).map(id=>({id,name:id===userId?'You':'Opponent',score:snapshot.totals[id],active:id===(ended?userId:snapshot.actor)}))};
  return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><div className="delayed-turn-nav">{home}<span>Play money · 36-hour turns</span></div><BoxdropView navigation={<nav><button onClick={()=>setTab('lobby')}>Rules</button><Link to={'/delayed/'+matchId}>History</Link></nav>} view={value} userId={userId} now={now} pending={!canAct} error={error} epoch={0} onIntent={i=>act(i)} onReconnect={()=>void refresh()} activeTab={tab} setActiveTab={setTab}/></div>;
 }
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell className={view?'run21-space-theme':'tri-scene'} title={gameName(snapshot.game)} description={'Round '+displayRound}
  activeTab={tab} setActiveTab={setTab} panel={view?<Run21ScoringReference config={view.config}/>:<TriTowersRules rules={board.rules}/>}
  announcement={false} navigation={<nav>{home}<button onClick={()=>setTab('lobby')}>Rules</button></nav>}
  actions={view&&<div className="run21-fullscreen-footer"><div className="run21-fullscreen-actions"><Run21Timer view={view} now={now}/><Run21PlayerPane view={view} now={now} onIntent={i=>void act(i)} pending={!canAct}/></div></div>}>
   {error&&<div role="alert" className="arcade-error">{error}<button onClick={()=>void refresh()}>Reconnect</button></div>}
   {view?<><Run21SpaceScene/><Run21Felt solo layout="fullscreen" view={view} now={now} onIntent={i=>void act(i)} pending={!canAct}/></>:
    <div className="tri-game" data-tri-towers data-phase={board.phase}><TriTowersBoard view={board} now={now} canAct={canAct} roundKey={childId+':'+snapshot.segment} result={ended?board.result:null}
     userId={userId} connected={!error} roundLabel={'ROUND '+displayRound} scores={[{id:userId,score:board.score,active:true}]}
     takeScore={board.phase==='playing'?<button className="tri-take-score" disabled={!canAct} onClick={()=>void act({type:'take_score'})}>Take Score</button>:null}
     onIntent={i=>void act(i)}/></div>}
  </FullscreenGameShell></div>;
}
