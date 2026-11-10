import {QuintzeeRulesIcon} from '@/components/quintzee/QuintzeeRulesIcon';
import {OptionalBonusDialog} from '@/components/OptionalBonusDialog';
import {AsyncSessionName} from './AsyncSessionName';
import type {LabCommand} from '@/lib/cribLab/model';
import {OriginalsBoard} from '@/components/originals/OriginalsBoard';
import {MegaCompetitionBoard} from '@/components/megaCardGolf/MegaCompetitionBoard';
import {MegaCompetitionScorecard} from '@/components/megaCardGolf/MegaCompetitionScorecard';
import {playingTopic,roundGameplayRunning,usePlayingPresence} from '@/lib/delayed/playingPresence';
import {admitTurnSnapshot} from '@/lib/delayed/turnSnapshot';
import {localTurnPresentation} from '@/lib/delayed/turnAudio';
import {useAsyncTriInput} from '@/hooks/useAsyncTriInput';
import type {TriIntentBuffer} from '@/lib/triTowers/intentBuffer';
import {useRun21PlacementAudio} from '@/hooks/useRun21PlacementAudio';
import {useRun21Bell} from '@/hooks/useRun21Bell';
import {roundIntro} from '@/lib/run21/roundIntro';
import type {BoardFeedbackEvent} from '@/lib/run21/exact21Feedback';
import {ASYNC_SCORE_HOLD_MS,reviewSchedule} from '@/lib/delayed/reviewPresentation';
import {AsyncTurnStage} from './AsyncTurnStage';
import {TriScorePill} from '@/components/triTowers/TriTowersPresentation';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import type {QuintzeeSnapshot} from '@/lib/quintzee/model';
import {TakeTwoView} from '@/components/takeTwo/TakeTwoView';
import type {TakeTwoSnapshot} from '@/lib/takeTwo/model';
import {BoxdropView} from '@/components/boxdrop/BoxdropView';
import type {BoxdropSnapshot} from '@/lib/boxdrop/model';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {supabase} from '@/integrations/supabase/client';
import {delayedRequest,DelayedRequestError,gameName} from '@/lib/delayed/client';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {BoardProjection} from '@/lib/run21/model';
import {SCORE_PRESENTATION_MS} from '@/lib/run21/model';
import {medalDuration} from '@/lib/run21/rulesets';
import {displayedScore} from '@/lib/run21/presentation';
import type {ScoreCelebrationReceipt} from '@/lib/run21/scoreCelebration';
import {Run21ScoreCelebration} from '@/components/run21/Run21ScoreCelebration';
import {useRun21ScoreAudio} from '@/hooks/useRun21ScoreAudio';
import {useRun21FailureAudio} from '@/hooks/useRun21FailureAudio';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {Run21FullscreenActions} from '@/components/run21/Run21PlayerPane';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
import {Run21SpaceScene} from '@/components/run21/Run21SpaceScene';
import {TriTowersBoard,TriTowersRules} from '@/components/triTowers/TriTowersView';
import {roundResultPresentation} from '@/lib/triTowers/stagePresentation';
import type {project} from '../../../server/delayed/adapter';
import '@/lib/arcade/arcade.css';
type Snapshot=Awaited<ReturnType<typeof project>>;

export function DelayedTurn({childId,matchId,userId,autoStart=false,players:participants=[],realMoney=false}:{childId:string;matchId:string;userId:string;autoStart?:boolean;players?:{id:string;name:string}[];realMoney?:boolean}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[now,setNow]=useState(Date.now()),[tab,setTab]=useState<ShellTabId>('cards');
 const requestKey='ptown:async-turn:request:'+userId+':'+childId;
 const clock=useRef({at:Date.now(),received:performance.now()}),generation=useRef(0),request=useRef<Record<string,unknown>|null>(readPendingTurn(requestKey)),initialSegment=useRef<number|null>(null);
 const initialRound=useRef<number|null>(null);
 const triController=useRef<TriIntentBuffer|null>(null);
 const freshAction=useRef<{id:unknown;before:Snapshot;startedAt:number}|null>(null);
 const [labCue,setLabCue]=useState<LabCommand|null>(null);
 const [audio,setAudio]=useState({liveEntry:false,epoch:0,events:[] as BoardFeedbackEvent[]});
 const interruptAudio=useCallback(()=>{freshAction.current=null;setLabCue(null);setAudio(p=>({liveEntry:false,epoch:p.epoch+1,events:[]}));},[]);
 useEffect(()=>{if(tab!=='cards')interruptAudio();},[tab,interruptAudio]);
 const scoreRoot=useRef<HTMLDivElement>(null);
 const [medal,setMedal]=useState<ScoreCelebrationReceipt|null>(null),seenMedal=useRef<string|null>(null);
 const retireMedal=useCallback(()=>setMedal(null),[]);
 const navigate=useNavigate(),latest=useRef<Snapshot|null>(null);
 const accept=useCallback((value:Snapshot,command?:Record<string,unknown>|null)=>{
  if(value.id!==childId||value.matchId!==matchId)throw Error('Turn identity changed. Return to the match.');
  const old=latest.current;if(!admitTurnSnapshot(old,value)){if(old&&(value.reviewRevision??0)<(old.reviewRevision??0))throw Error('delayed:review_stale');return;}
  const fresh=freshAction.current;
  if(command&&fresh?.id===command.requestId){
   freshAction.current=null;
   if(!document.hidden&&navigator.onLine){
    const admitted=localTurnPresentation(fresh.before,value,command,userId);
    if(value.game==='crib-lab'&&value.revision===fresh.before.revision+1&&fresh.before.board&&value.board&&(fresh.before.board as {roundId:string}).roundId===(value.board as {roundId:string}).roundId){
     setLabCue({requestId:String(command.requestId),revision:fresh.before.revision,roundId:(value.board as {roundId:string}).roundId,intent:command.intent as LabCommand['intent']});
    }
    if(admitted.start)setAudio({liveEntry:true,epoch:0,events:[]});
    else if(admitted.event)setAudio(p=>({...p,events:[admitted.event!]}));
   }
  }
  latest.current=value;
  // A duplicate/recovery response cannot rewind an already-running result window.
  const at=old?Math.max(value.serverAt,clock.current.at+performance.now()-clock.current.received):value.serverAt;
  clock.current={at,received:performance.now()};setNow(at);
  setSnapshot(old=>old&&old.revision>value.revision?old:value);
  if(initialSegment.current===null){initialSegment.current=value.segment;initialRound.current=value.round;if(value.terminal||value.actor!==userId)navigate('/delayed/'+matchId+(value.terminal?'?review='+childId:''),{replace:true});}
 },[childId,matchId,userId,navigate]);
 const triInput=useAsyncTriInput({childId,userId,read:()=>latest.current,accept,
  available:!pending&&!request.current&&!error&&tab==='cards',now:()=>clock.current.at+performance.now()-clock.current.received,
  enabled:snapshot?.game==='tri-towers',interruptAudio});
 triController.current=snapshot?.game==='tri-towers'?triInput:null;
 const refresh=useCallback(async()=>{
  if(triController.current?.sent){await triController.current.recover();return;}
  const epoch=++generation.current,command=request.current;try{
  const value=await delayedRequest<Snapshot>(command??{op:'state',childId,...(latest.current&&['run21','tri-towers'].includes(latest.current.game)?{game:latest.current.game}:{})});
  if(epoch!==generation.current)return;accept(value,command);request.current=null;try{sessionStorage.removeItem(requestKey);}catch{}setPending(false);setError('');return true;
 }catch(e){if(epoch===generation.current){
  interruptAudio();
  const message=e instanceof Error?e.message:'Unable to reconnect.';
  if(message==='delayed:stale_action'||message==='delayed:review_stale'||e instanceof DelayedRequestError&&e.status<500){
   request.current=null;try{sessionStorage.removeItem(requestKey);}catch{}setPending(false);
   try{accept(await delayedRequest<Snapshot>({op:'state',childId}));setError('');}catch{setError('Unable to restore the latest turn.');}
  }else setError(message);
 }}},[childId,accept,interruptAudio]);
 useEffect(()=>{void refresh();const channel=supabase.channel('delayed-turn:'+childId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},payload=>{
  if((payload.new as any).match_id===matchId&&!request.current&&!triController.current?.busy)void refresh();
 }).subscribe(status=>{if(status==='SUBSCRIBED'&&!request.current)void refresh();});
  const focus=()=>{if(document.hidden)interruptAudio();else void refresh();};document.addEventListener('visibilitychange',focus);window.addEventListener('online',focus);
  window.addEventListener('offline',interruptAudio);window.addEventListener('pagehide',interruptAudio);
  return()=>{generation.current++;void supabase.removeChannel(channel);document.removeEventListener('visibilitychange',focus);window.removeEventListener('online',focus);window.removeEventListener('offline',interruptAudio);window.removeEventListener('pagehide',interruptAudio);};
 },[childId,userId,matchId,refresh,interruptAudio]);
 useEffect(()=>{const timer=setInterval(()=>setNow(clock.current.at+performance.now()-clock.current.received),100);return()=>clearInterval(timer);},[]);
 const ended=!!snapshot&&(snapshot.terminal||snapshot.actor!==userId||snapshot.segment!==initialSegment.current);
 // Keep this route's attempt even if later turns arrive while its result plays.
 const result=snapshot?.ownResults.find(r=>r.round===initialRound.current);
 const awaitingStart=!!snapshot&&snapshot.game==='quintzee'&&!snapshot.board&&!ended;
 // Empty presentation only. The existing server Start owns dealing, rolls and clocks.
 const board=(ended?result?.board:snapshot?.board) as any ?? (awaitingStart?{rules:snapshot!.config,phase:'ready',deadline:Date.parse(snapshot!.expiresAt),dice:[],held:[],rollsRemaining:3,rollSerial:0,scores:{},potentials:{},scoreBefore:snapshot!.totals[userId]??0,score:snapshot!.totals[userId]??0,result:null}:null);
 usePlayingPresence(snapshot&&roundGameplayRunning(snapshot.game,snapshot.board,now)&&tab==='cards'&&!ended&&!snapshot.held&&now<Date.parse(snapshot.expiresAt)&&!error?playingTopic(matchId,childId,userId,Date.parse(snapshot.expiresAt)):null,true);
 const scores=Object.keys(snapshot?.totals??{}).map(id=>({id,name:participants.find(p=>p.id===id)?.name??(id===userId?'You':'Opponent'),score:snapshot!.totals[id],active:id===userId}));
 const displayRound=ended&&result?result.round:snapshot?.round;
 const triResult=snapshot?.game==='tri-towers'&&ended&&result&&board?.result?roundResultPresentation({
  ...board.result,id:[childId,userId,result.round,result.at].join(':'),stage:result.round,
 },board.deadline,board.rules.holdMs,now,board.rules.clearCelebrationMs??0):null;
 const attemptKey=result?[childId,userId,result.round,result.at].join(':'):null;
 const runResult=snapshot?.game==='run21'&&ended?board?.result:null;
 const medalMs=runResult?.score>0&&(runResult.aggregate===104||runResult.aggregate===105)?medalDuration(snapshot!.config as BoardProjection['config'],runResult.aggregate):0;
 const runTotal=runResult?snapshot!.ownResults.filter(r=>r.round<=result!.round).reduce((total,r)=>total+r.score,0):0;
 const runPresentation=runResult?{playerId:userId,startedAt:runResult.at+medalMs,endsAt:runResult.at+medalMs+SCORE_PRESENTATION_MS,from:runTotal-result!.score,to:runTotal}:null;
 const [reduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false),firstPresented=useRef<{key:string;at:number}|null>(null);
 if(attemptKey&&firstPresented.current?.key!==attemptKey)firstPresented.current={key:attemptKey,at:now};
 const [quintEnd,setQuintEnd]=useState<{key:string;at:number}|null>(null);
 const resultTimelineEnd=useCallback((at:number)=>{if(attemptKey)setQuintEnd(previous=>previous?.key===attemptKey&&previous.at===at?previous:{key:attemptKey,at});},[attemptKey]);
 const schedule=ended&&result&&board?reviewSchedule({board,receipt:{game:snapshot!.game,rules:snapshot!.config}} as any):null;
 const originalsEnd=snapshot?.game==='crib-lab'?board?.phaseUntil:snapshot?.game==='chucky-showdown'?board?.since+4650:null;
 const animationEnd=runPresentation?.endsAt??originalsEnd??(snapshot?.game==='quintzee'?(quintEnd?.key===attemptKey?quintEnd.at:null):schedule?board.deadline-schedule.duration+schedule.presentationEnd:null);
 const resultUntil=snapshot?.game!=='mega-card-golf'&&ended&&result&&firstPresented.current&&(reduced||animationEnd!==null)?Math.max(reduced?0:animationEnd!,firstPresented.current.at)+ASYNC_SCORE_HOLD_MS:null;
 const boardDue=snapshot?.game==='crib-lab'?board?.phaseUntil??board?.deadline:snapshot?.game==='chucky-showdown'?board?.due:board?.deadline;
 const due=snapshot&&!snapshot.terminal&&!ended?Math.min(boardDue??Infinity,Date.parse(snapshot.expiresAt)):null;
 useEffect(()=>{if(due===null||!Number.isFinite(due)||request.current)return;
  const timer=setTimeout(()=>void refresh(),Math.max(0,due-clock.current.at));return()=>clearTimeout(timer);
 },[due,snapshot?.revision,refresh]);
 async function act(intent:Record<string,unknown>){if(!snapshot||pending||request.current)return;
  if(snapshot.game==='tri-towers'&&!['start','bonus_play','bonus_skip'].includes(String(intent.type))){
   if(intent.type==='remove')triInput.enqueue({type:'remove',index:Number(intent.index)});
   else if(intent.type==='draw'||intent.type==='take_score')triInput.enqueue({type:intent.type});
   return;
  }
  request.current={op:'action',game:snapshot.game,childId,revision:snapshot.revision,segment:snapshot.segment,requestId:crypto.randomUUID(),intent};freshAction.current={id:request.current.requestId,before:snapshot,startedAt:performance.now()};try{sessionStorage.setItem(requestKey,JSON.stringify(request.current));}catch{}setPending(true);setError('');return await refresh();}
 // A reconnect into an unavailable/terminal segment belongs at the match home.
 useEffect(()=>{if(snapshot&&ended&&!result)navigate('/delayed/'+matchId,{replace:true});},[snapshot,ended,result,matchId,navigate]);
 // Shared presentation completion starts the final readable hold. This only
 // finishes local presentation; authority already handed off the turn.
 useEffect(()=>{if(resultUntil!==null&&now>=resultUntil)navigate('/delayed/'+matchId+(snapshot?.terminal?'?review='+childId+'&finished=1':''),{replace:true});},[resultUntil,now,matchId,childId,snapshot?.terminal,navigate]);
 useEffect(()=>{
  if(!autoStart||!snapshot||snapshot.optionalBonus?.choice==='pending'||snapshot.game==='quintzee'||snapshot.board||ended||pending||request.current||error||snapshot.held||snapshot.actor!==userId||now>=Date.parse(snapshot.expiresAt))return;
  if(document.hidden||!navigator.onLine)return;
  void act({type:'start'});
 },[autoStart,snapshot,ended,pending,error,now,userId]);
 const view:BoardProjection|undefined=snapshot?.game==='run21'&&board?{config:snapshot.config as BoardProjection['config'],
  roundId:childId+':'+initialSegment.current,roundNumber:displayRound!,viewerId:userId,boards:{[userId]:board},players:[{id:userId,name:'You'}],
  active_player_id:ended?null:userId,liveBoards:true,revealed:false,cumulative:runResult?{...snapshot.totals,[userId]:runTotal}:snapshot.totals,scorePresentation:runPresentation,presentationKey:childId,
  pausedAt:snapshot.held?now:null}:undefined;
 const presentationActive=!error&&!snapshot?.held&&tab==='cards';
 const intro=view?roundIntro(view,now):null;
 useRun21Bell(userId,audio.liveEntry&&presentationActive?intro?.key??null:null,intro?.remaining??0);
 useRun21PlacementAudio(userId,childId+':'+initialSegment.current,audio.events,audio.epoch,presentationActive);
 useRun21ScoreAudio(userId,childId,view,now,presentationActive&&!medal);
 useRun21FailureAudio(userId,childId,view,now,0,presentationActive&&!medal);
 useEffect(()=>{
  if(!runResult||!attemptKey)return;
  if(seenMedal.current!==attemptKey){seenMedal.current=attemptKey;
   if(medalMs&&now-runResult.at<1500&&presentationActive&&!document.hidden&&navigator.onLine)
    setMedal({key:attemptKey,aggregate:runResult.aggregate,playerName:'You',durationMs:medalMs,startedAt:performance.now()-(now-runResult.at)});
  }
  if(!presentationActive||now>=runResult.at+medalMs)setMedal(null);
 },[attemptKey,runResult,medalMs,now,presentationActive]);
 useEffect(()=>{const hidden=()=>{if(document.hidden)retireMedal();};window.addEventListener('offline',retireMedal);document.addEventListener('visibilitychange',hidden);
  return()=>{window.removeEventListener('offline',retireMedal);document.removeEventListener('visibilitychange',hidden);};},[retireMedal]);
 const turnAvailable=!!snapshot&&!snapshot.held&&!ended&&!error&&!(snapshot.game==='tri-towers'&&triInput.uncertain)&&now<Date.parse(snapshot.expiresAt)&&!!board&&now<(snapshot.game==='chucky-showdown'?board.due:board.deadline);
 const canAct=turnAvailable&&!pending;
 const submitted=request.current?.intent as {type:string;column?:number}|undefined;
 const placement=pending&&!error&&freshAction.current&&snapshot?.game==='run21'&&view&&submitted?.type==='place'&&typeof submitted.column==='number' ? {
  playerId:userId,roundId:view.roundId,requestId:String(request.current?.requestId),revision:(freshAction.current.before.board as typeof board).revision,intent:{type:'place' as const,column:submitted.column}
 } : null;
 const home=<Link aria-label="Match home" to={'/delayed/'+matchId}><AsyncSessionName realMoney={realMoney}>{participants.map(p=>p.name).join(' vs. ')||'Match home'}</AsyncSessionName></Link>;
 if(snapshot?.optionalBonus?.choice==='pending'&&snapshot.optionalBonus.actor===userId&&!ended)return <AsyncTurnStage matchId={matchId} title="Bonus round"><OptionalBonusDialog decision={snapshot.optionalBonus} actor={userId} disabled={pending||snapshot.held||now>=Date.parse(snapshot.expiresAt)} error={error} onReconnect={()=>void refresh()} onChoice={choice=>void act({type:choice==='play'?'bonus_play':'bonus_skip'})}/></AsyncTurnStage>;
 if(!snapshot||!board)return <AsyncTurnStage matchId={matchId} title="Your turn!">
  {autoStart&&!ended&&!error&&!snapshot?.held&&(!snapshot||now<Date.parse(snapshot.expiresAt))?null:<>
  {error&&<p role="alert">{error} <button onClick={()=>void refresh()}>Retry safely</button></p>}
  {!snapshot?null:ended?<><h2>{snapshot.terminal?'Game complete':'Turn complete'}</h2>{result&&<p>Your round {result.round} score: {result.score.toLocaleString()}.</p>}
   <p>The result is provisional until every game in the match finishes.</p>{home}</>:<><p>Availability deadline: {new Date(snapshot.expiresAt).toLocaleString()}. Starting now also starts the normal gameplay clock.</p>
    {snapshot.held&&<p role="status">This match is on hold during a platform incident.</p>}
    <button disabled={snapshot.held||pending||!!error||snapshot.actor!==userId||now>=Date.parse(snapshot.expiresAt)} onClick={()=>void act({type:'start'})}>Begin {snapshot.game==='mega-card-golf'?'hole':'round'} {snapshot.round}</button></>}
 </>}
 </AsyncTurnStage>;
 if(snapshot.game==='crib-lab'||snapshot.game==='chucky-showdown'){
  const visible={...board,id:childId,revision:snapshot.revision,ruleset:(snapshot.config as {ruleset:string}).ruleset,serverAt:snapshot.serverAt};
  return <div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><OriginalsBoard
   game={snapshot.game} board={visible} cue={labCue} userId={userId} now={now} pending={pending} canAct={canAct}
   live={audio.liveEntry&&presentationActive} epoch={audio.epoch} error={error} reconnect={()=>void refresh()}
   onIntent={intent=>void act(intent)} activeTab={tab} setActiveTab={setTab}
   navigation={<nav>{home}<button onClick={()=>setTab('lobby')}>Rules</button></nav>}
   scores={<div ref={scoreRoot} className="async-score-pills">{scores.map(item=><TriScorePill key={item.id} root={scoreRoot} item={item} value={item.score}/>)}</div>}/></div>;
 }
 if(snapshot.game==='quintzee'){
  const players=Object.keys(snapshot.totals),value:QuintzeeSnapshot={id:childId,revision:snapshot.revision,scope:childId+':'+initialSegment.current,serverAt:snapshot.serverAt,theme:'modern',pausedAt:snapshot.held?snapshot.serverAt:null,status:snapshot.terminal?'completed':'active',outcome:'active',playerNames:Object.fromEntries(scores.map(p=>[p.id,p.name])),state:{rules:board.rules,players,scores:snapshot.totals,round:displayRound!,turnIndex:players.indexOf(ended?userId:snapshot.actor),qualified:[],results:[],finished:snapshot.terminal,board}};
  return <div className="arcade-run async-turn quintzee-async-turn" data-shell-presentation-mode="fullscreen"><div className="delayed-turn-nav">{home}<span>{realMoney?'Real money':'Play money'} · 36-hour turns</span></div><QuintzeeView onResultTimelineEnd={resultTimelineEnd} awaitingStart={awaitingStart} navigation={<nav><button onClick={()=>setTab('lobby')}><QuintzeeRulesIcon/></button><Link to={'/delayed/'+matchId}>History</Link></nav>} snapshot={value} actor={userId} userId={userId} now={now} pending={pending||(!ended&&!canAct)} error={error} onIntent={i=>void act({...i})} onReconnect={()=>void refresh()} activeTab={tab} setActiveTab={setTab}/></div>;
 }
 if(snapshot.game==='mega-card-golf')return <div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><div className="delayed-turn-nav">{home}<span>{realMoney?'Real money':'Play money'} · Hole {displayRound}</span></div>
  {error&&<p role="alert">{error}<button onClick={()=>void refresh()}>Reconnect</button></p>}
  <MegaCompetitionBoard view={board} userId={userId} now={now} pending={pending} canAct={canAct} onIntent={i=>act(i)} activeTab={tab} setActiveTab={setTab} navigation={<nav>{home}<button onClick={()=>setTab('lobby')}>Rules</button></nav>}
   onPresentationDone={()=>{if(ended)navigate('/delayed/'+matchId+(snapshot.terminal?'?review='+childId+'&finished=1':''),{replace:true});}}
   scorecard={frame=><MegaCompetitionScorecard course={board.config.name} holes={board.config.holes} hole={displayRound!} players={participants} results={(snapshot.holeResults??[]).filter(r=>r.actor!==userId||r.hole<frame.view.hole||frame.scoring?.finished)} write={frame.scoring?.finished?{actor:userId,hole:frame.view.hole}:undefined}/>}/></div>;
 if(snapshot.game==='take-two'){
  const value:TakeTwoSnapshot={id:childId,revision:snapshot.revision,scope:childId+':'+initialSegment.current,serverAt:snapshot.serverAt,round:displayRound!,board,canAct:turnAvailable,paused:snapshot.held,pausedAt:snapshot.held?snapshot.serverAt:null,finished:snapshot.terminal,settled:false,solo:false,players:scores};
  return <div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><div className="delayed-turn-nav">{home}<span>{realMoney?'Real money':'Play money'} · 36-hour turns</span></div><TakeTwoView navigation={<nav><button onClick={()=>setTab('lobby')}>Rules</button><Link to={'/delayed/'+matchId}>History</Link></nav>} view={value} userId={userId} now={now} pending={pending||(!ended&&!canAct)} error={error} epoch={audio.epoch} liveEntry={audio.liveEntry} onIntent={i=>act(i)} onReconnect={()=>void refresh()} activeTab={tab} setActiveTab={setTab}/></div>;
 }
 if(snapshot.game==='boxdrop'){
  const value:BoxdropSnapshot={id:childId,revision:snapshot.revision,scope:childId+':'+initialSegment.current,serverAt:snapshot.serverAt,round:displayRound!,board,canAct,paused:snapshot.held,pausedAt:snapshot.held?snapshot.serverAt:null,finished:snapshot.terminal,settled:false,solo:false,players:Object.keys(snapshot.totals).map(id=>({id,name:participants.find(p=>p.id===id)?.name??(id===userId?'You':'Opponent'),score:snapshot.totals[id],active:id===(ended?userId:snapshot.actor)}))};
  return <div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><div className="delayed-turn-nav">{home}<span>{realMoney?'Real money':'Play money'} · 36-hour turns</span></div><BoxdropView navigation={<nav><button onClick={()=>setTab('lobby')}>Rules</button><Link to={'/delayed/'+matchId}>History</Link></nav>} view={value} userId={userId} now={now} pending={pending||(!ended&&!canAct)} error={error} epoch={audio.epoch} liveEntry={audio.liveEntry} onIntent={async i=>{await act(i);}} onReconnect={()=>void refresh()} activeTab={tab} setActiveTab={setTab}/></div>;
 }
 return <div className="arcade-run async-turn" data-shell-presentation-mode="fullscreen"><FullscreenGameShell className={view?'run21-space-theme':'tri-scene'} title={gameName(snapshot.game)} description={'Round '+displayRound}
  activeTab={tab} setActiveTab={setTab} panel={view?<Run21ScoringReference config={view.config}/>:<TriTowersRules rules={board.rules}/>}
  announcement={false} navigation={<nav>{home}<button onClick={()=>setTab('lobby')}>Rules</button></nav>}
  scores={view&&<div ref={scoreRoot} className="async-score-pills" aria-label="Game scores">{scores.map(item=><TriScorePill key={item.id} root={scoreRoot} item={item} value={item.id===userId?(reduced&&runResult?runTotal:displayedScore(view,userId,now)):item.score}/>)}</div>}
  actions={view&&<div className="run21-fullscreen-footer"><Run21FullscreenActions view={view} now={now} onIntent={i=>void act(i)} pending={!canAct}/></div>}>
   {error&&<div role="alert" className="arcade-error">{error}<button onClick={()=>void refresh()}>Reconnect</button></div>}
   {view?<><Run21SpaceScene/><Run21Felt solo layout="fullscreen" view={view} now={now} onIntent={i=>void act(i)} pending={!canAct} placement={placement} showPendingStatus={!freshAction.current||performance.now()-freshAction.current.startedAt>=1000} hideScoring={!!medal}/></>:
    <div className="tri-game" data-tri-towers data-phase={board.phase}><TriTowersBoard input={triInput} view={board} now={now} canAct={canAct} roundKey={childId+':'+initialSegment.current} result={triResult}
     userId={userId} liveEntry={audio.liveEntry} recoveryEpoch={audio.epoch} connected={!error} presentationActive={tab==='cards'} paused={snapshot.held} roundLabel={'ROUND '+displayRound} scores={scores.map(item=>item.active?{...item,score:board.score}:item)}
     takeScore={board.phase==='playing'?<button className="tri-take-score" disabled={!canAct} onClick={()=>void act({type:'take_score'})}>Take Score</button>:null}
     onIntent={i=>void act(i)}/></div>}
  </FullscreenGameShell>{medal&&<Run21ScoreCelebration userId={userId} receipt={medal} onRetire={retireMedal}/>}</div>;
}

function readPendingTurn(key:string):Record<string,unknown>|null{try{const value=JSON.parse(sessionStorage.getItem(key)??'null');return value?.op==='action'&&typeof value.requestId==='string'?value:null;}catch{return null;}}
