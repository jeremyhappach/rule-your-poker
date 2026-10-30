import boxingWinner from '@/assets/async-finale/boxing-winner-cash-v1.jpg';
import {AsyncTurnStage} from './AsyncTurnStage';
import boxingDraw from '@/assets/async-finale/boxing-draw-v1.jpg';
import {useRun21FailureAudio} from '@/hooks/useRun21FailureAudio';
import {reviewSchedule,rebaseReviewBoard,reviewScoreContext,ASYNC_SCORE_HOLD_MS} from '@/lib/delayed/reviewPresentation';
import {roundResultPresentation} from '@/lib/triTowers/stagePresentation';
import {useRun21ScoreAudio} from '@/hooks/useRun21ScoreAudio';
import {Run21ScoreCelebration} from '@/components/run21/Run21ScoreCelebration';
import {celebrateCanonicalWinner} from '@/lib/canonicalShell/winnerCelebration';
import {Component,useCallback,useEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router-dom';
import {delayedRpc,type Home} from '@/lib/delayed/client';
import {money,mayViewFinale,type ReviewEvent,type Reviews} from '@/lib/delayed/reviews';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {TriScorePill} from '@/components/triTowers/TriTowersPresentation';
import {displayedScore} from '@/lib/run21/presentation';
import {TriTowersBoard} from '@/components/triTowers/TriTowersView';
import {QuintzeeView} from '@/components/quintzee/QuintzeeView';
import {BoxdropView} from '@/components/boxdrop/BoxdropView';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import {supabase} from '@/integrations/supabase/client';
import {PtownWordsView} from '@/components/ptownWords/PtownWordsView';

type Identity={childId:string;matchId:string;userId:string};
const noop=()=>{};
function useVisible(){
 const [active,setActive]=useState(!document.hidden&&navigator.onLine);
 useEffect(()=>{const update=()=>setActive(!document.hidden&&navigator.onLine);document.addEventListener('visibilitychange',update);window.addEventListener('online',update);window.addEventListener('offline',update);return()=>{document.removeEventListener('visibilitychange',update);window.removeEventListener('online',update);window.removeEventListener('offline',update);};},[]);
 return active;
}
function usePlayback(duration:number,key:string){
 const active=useVisible(),[frame,setFrame]=useState({key,elapsed:0}),origin=useRef<number|null>(null);
 useEffect(()=>{origin.current=null;setFrame({key,elapsed:0});},[key]);
 useEffect(()=>{if(!active){origin.current=null;return;}if(frame.key===key&&frame.elapsed>=duration)return;origin.current=performance.now();const id=setInterval(()=>{const elapsed=Math.min(duration,performance.now()-(origin.current??performance.now()));setFrame({key,elapsed});if(elapsed>=duration)clearInterval(id);},50);return()=>clearInterval(id);},[active,duration,key]);
 const elapsed=frame.key===key?frame.elapsed:0;
 return {elapsed,active,done:active&&elapsed>=duration};
}
function useReduced(){return useMemo(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,[]);}
class SnapshotBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<p role="status">Board preview unavailable. The saved score is shown above.</p>:this.props.children;}
}

export function ReviewGate({childId,matchId,userId,home,children}:Identity&{home:Home;children:()=>ReactNode}){
 const [state,setState]=useState<Reviews|null>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),navigate=useNavigate();
 const location=useLocation();
 const active=useVisible(),generation=useRef(0),released=useRef(false),reviewed=useRef(false),[handoff,setHandoff]=useState(false);
 const handoffPlay=usePlayback(2000,handoff?'your-turn:'+childId:'waiting');
 const load=useCallback(async(release=false)=>{if(released.current)return;const g=++generation.current;try{const value=await delayedRpc<Reviews>('delayed_reviews',{p_child:childId});if(g!==generation.current)return;
  if(value.terminal||value.actor!==userId||Date.parse(value.expiresAt)<=value.serverAt){navigate('/delayed/'+matchId,{replace:true});return;}
  setState(value);setError('');const pending=value.events.some(e=>!e.seen&&e.kind==='attempt');
  released.current=value.started||!pending&&(!reviewed.current||release);setReady(released.current);setHandoff(!released.current&&!pending);
 }catch{if(g===generation.current)setError('Unable to verify this turn.');}},[childId,matchId,userId,navigate]);
 useEffect(()=>{if(handoff&&handoffPlay.done&&!error)void load(true);},[handoff,handoffPlay.done,error,load]);
 useEffect(()=>{if(active)void load();return()=>{generation.current++;};},[active,load]);
 useEffect(()=>{const channel=supabase.channel('review-gate:'+childId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel);};},[childId,userId,load]);
 useEffect(()=>{if(ready&&location.state?.asyncEntry)navigate(location.pathname+location.search,{replace:true,state:{...location.state,asyncEntry:undefined}});},[ready,location.state,location.pathname,location.search,navigate]);
 const event=state?.events.find(e=>e.kind==='attempt'&&!e.seen);
 if(ready)return <>{children()}</>;
 return error?<AsyncTurnStage matchId={matchId} title={error}><button onClick={()=>void load()}>Retry</button></AsyncTurnStage>:handoff?<AsyncTurnStage matchId={matchId} title="Your turn!"/>:event&&home?<AttemptReview key={event.id} event={event} events={state!.events} home={home} {...{childId,matchId,userId}} onDone={()=>{reviewed.current=true;return load();}}/>:<AsyncTurnStage matchId={matchId} title={home.players.some(p=>p.id!==userId&&home.lineup.find(c=>c.id===childId)?.pendingResults?.[p.id])?'Showing '+home.players.find(p=>p.id!==userId)!.name+"'s results":undefined}/>;
}

function AttemptReview({event,events,home,onDone,childId,matchId,userId}:Identity&{event:ReviewEvent;events:ReviewEvent[];home:Home;onDone:()=>void|Promise<void>}){
 const [scores]=useState(()=>reviewScoreContext(event,events,home,childId,userId));
 const schedule=reviewSchedule(event),reduced=useReduced(),intro=event.receipt.game==='ptown-words'?0:3000,total=intro+(reduced?0:schedule.presentationEnd)+ASYNC_SCORE_HOLD_MS,[prior,setPrior]=useState<number|null>(null),activeView=useVisible(),duration=prior===null?total:Math.max(ASYNC_SCORE_HOLD_MS,total-prior),{elapsed,done,active}=usePlayback(duration,event.id+':'+prior),busy=useRef(false),[error,setError]=useState(''),[beginRetry,setBeginRetry]=useState(0);
 useEffect(()=>{if(!activeView)return;let alive=true;void delayedRpc<{elapsed:number;seen:boolean}>('delayed_review_begin',{p_event:event.id}).then(v=>{if(alive){setError('');setPrior(event.seen?0:v.elapsed);}}).catch(()=>{if(alive)setError('Unable to begin saved-result review.');});return()=>{alive=false;};},[event.id,event.seen,activeView,beginRetry]);
 const acknowledge=useCallback(async()=>{if(prior===null||busy.current||document.hidden||!navigator.onLine)return;busy.current=true;try{await delayedRpc('delayed_review_ack',{p_event:event.id});await onDone();}catch{setError('Result saved. Unable to confirm viewing; retry safely.');busy.current=false;}},[event.id,onDone,prior]);
 useEffect(()=>{if(prior!==null&&done&&!error)void acknowledge();},[prior,done,error,acknowledge]);
 if(prior===null)return <AsyncTurnStage matchId={matchId} title={error||'Showing '+(event.actorName??home.players.find(p=>p.id===event.actor)?.name??'')+"'s results"}>{error&&<button onClick={()=>{setError('');setBeginRetry(n=>n+1);}}>Retry</button>}</AsyncTurnStage>;
 if(elapsed+prior<intro)return <AsyncTurnStage matchId={matchId} title={'Showing '+(event.actorName??home.players.find(p=>p.id===event.actor)?.name??'')+"'s results"}/>;
 const shown=Math.max(0,elapsed+prior-intro);
 return <div className="async-result-review async-turn"><div className="delayed-turn-nav"><Link to={'/delayed/'+matchId}>Match home</Link><span>{event.actorName??'Opponent'} · Round {event.round} · {Math.round((event.score??0)*(reduced?1:Math.max(0,Math.min(1,(shown-schedule.countStart)/(schedule.countEnd-schedule.countStart))))).toLocaleString()}</span></div>
  {!active&&<p role="status">Return online to finish reviewing.</p>}{error&&<p role="alert">{error}<button onClick={()=>void acknowledge()}>Retry</button></p>}
  <SnapshotBoundary><SavedBoard key={event.id+':'+prior} event={event} scores={scores} childId={childId} userId={userId} elapsed={reduced?schedule.duration:Math.min(schedule.duration,shown)}/></SnapshotBoundary>
 </div>;
}

function SavedBoard({event,scores,childId,userId,elapsed}:{event:ReviewEvent;scores:ReturnType<typeof reviewScoreContext>;childId:string;userId:string;elapsed:number}){
 const scoreRoot=useRef<HTMLDivElement>(null);
 const [tab,setTab]=useState<ShellTabId>('cards'),[playId]=useState(()=>crypto.randomUUID()),actor=event.actor??userId,name=event.actorName??'Opponent',scope='review:'+event.id+':'+playId,schedule=reviewSchedule(event),active=useVisible();
 const origin=1_000_000,now=origin+elapsed;
 const board=useMemo(()=>rebaseReviewBoard(event,origin,scores.before),[event,scores.before]);
 const runView=event.receipt.game==='run21'&&board?{config:event.receipt.rules,roundId:scope,roundNumber:event.round,viewerId:userId,boards:{[actor]:board},players:scores.players,active_player_id:null,liveBoards:true,revealed:true,cumulative:Object.fromEntries(scores.players.map(p=>[p.id,p.score])),scorePresentation:{playerId:actor,startedAt:origin+schedule.countStart,endsAt:origin+schedule.countEnd,from:scores.before,to:scores.after},presentationKey:scope}:undefined;
 useRun21ScoreAudio(userId,scope,runView as any,now,active&&tab==='cards');
 useRun21FailureAudio(userId,scope,runView as any,now,0,active&&tab==='cards',true);
 if(!board)return <main className="delayed-page"><p>Historic board replay is unavailable.</p><strong>{event.score?.toLocaleString()} points</strong></main>;
 const players=scores.players.map(p=>p.id),base={navigation:<nav aria-label="Saved result information"><button onClick={()=>setTab('lobby')}>Rules</button></nav>,activeTab:tab,setActiveTab:setTab,pending:false,error:'',onReconnect:noop,onIntent:noop};
 if(event.receipt.game==='quintzee')return <QuintzeeView replay {...base} actor={userId} userId={userId} now={now} snapshot={{id:childId,revision:1,scope,serverAt:origin,theme:'modern',pausedAt:null,status:'completed',outcome:'active',playerNames:Object.fromEntries(scores.players.map(p=>[p.id,p.name])),state:{rules:board.rules,players,scores:Object.fromEntries(scores.players.map(p=>[p.id,p.score])),round:event.round,turnIndex:players.indexOf(actor),qualified:[],results:[],finished:false,board}} as any}/>;
 if(event.receipt.game==='boxdrop')return <BoxdropView replay {...base} userId={userId} now={now} epoch={0} view={{id:childId,revision:1,scope,serverAt:origin,round:event.round,board,canAct:false,paused:false,pausedAt:null,finished:false,settled:false,solo:false,players:scores.players} as any}/>;
 if(event.receipt.game==='ptown-words')return <PtownWordsView view={{...board,identity:{sessionId:childId,dealerGameId:childId,roundId:scope},revision:1,viewerId:userId,serverAt:origin,canAct:false,paused:false,finished:true,phase:'complete',rack:[],rackCounts:{},terminal:null,financial:{balances:{}}} as any} now={now} pending={false} connected={true} error="" activeTab={tab} setActiveTab={setTab} panel={<p>Saved public board. Private racks are not included.</p>} sessionEnded={false} onIntent={async()=>false} onReconnect={noop}/>;
 return <FullscreenGameShell className={event.receipt.game==='tri-towers'?'tri-scene':'run21-space-theme'} title="Saved result" description={'Round '+event.round} activeTab={tab} setActiveTab={setTab} panel={<p>Saved result · controls disabled</p>} announcement={false} scores={runView&&<div ref={scoreRoot} className="async-score-pills" aria-label="Game scores">{scores.players.map(p=><TriScorePill key={p.id} root={scoreRoot} item={{...p,active:p.id===userId}} value={p.id===actor?displayedScore(runView as any,actor,now):p.score}/>)}</div>}>
  {runView?<><Run21Felt solo layout="fullscreen" playerId={actor} now={now} view={runView as any} hideScoring={elapsed<schedule.medal}/>{active&&elapsed<schedule.medal&&<Run21ScoreCelebration userId={userId} onRetire={noop} receipt={{key:scope,aggregate:board.result.aggregate,playerName:name,durationMs:schedule.medal,startedAt:performance.now()-elapsed}}/>}</>:<div className="tri-game" data-tri-towers data-phase={board.phase}><TriTowersBoard replay view={board} canAct={false} onIntent={noop} now={now} roundKey={scope} userId={userId} result={roundResultPresentation({...board.result,id:scope,stage:event.round},board.deadline,board.rules.holdMs,now,board.rules.clearCelebrationMs??0)} scores={scores.players}/></div>}
 </FullscreenGameShell>;
}

export function ChildResults({childId,matchId,userId}:Identity){
 const [home,setHome]=useState<Home|null>(null),[state,setState]=useState<Reviews|null>(null),[error,setError]=useState(''),[overlay,setOverlay]=useState(false),[query]=useSearchParams(),navigate=useNavigate();
 const played=useRef(false),[playId]=useState(()=>crypto.randomUUID());
 const load=useCallback(async()=>{try{const [h,r]=await Promise.all([delayedRpc<Home>('delayed_home',{p_match:matchId}),delayedRpc<Reviews>('delayed_reviews',{p_child:childId})]);if(h.removedAt||!h.lineup.some(c=>c.id===childId&&c.terminal)){navigate('/delayed/'+matchId,{replace:true});return;}setHome(h);setState(r);setOverlay(!r.events.some(e=>e.kind==='attempt'&&!e.seen)&&(query.has('finished')||!r.events.some(e=>e.kind==='attempt')||played.current));}catch{setError('Unable to restore saved results.');}},[matchId,childId,navigate,query]);
 useEffect(()=>{void load();},[load]);
 const final=state?.events.find(e=>e.kind==='child'),child=home?.lineup.find(c=>c.id===childId),winner=final?.receipt.winner??child?.result?.winner,won=winner===userId;
 const reduced=useReduced(),play=usePlayback(reduced?1200:6000,overlay?'overlay:'+childId:'waiting'),busy=useRef(false);
 useEffect(()=>{if(!overlay||!play.done||busy.current||!home||document.hidden||!navigator.onLine)return;busy.current=true;void (final?delayedRpc('delayed_review_ack',{p_event:final.id}):Promise.resolve())
  .then(()=>delayedRpc<Home>('delayed_home',{p_match:matchId}))
  .then(fresh=>navigate('/delayed/'+matchId+(mayViewFinale(fresh)?'?finale=1':''),{replace:true}))
  .catch(()=>{busy.current=false;setError('Unable to confirm viewing. Return to match home and retry.');});},[overlay,play.done,final,home,matchId,navigate]);
 if(error)return <main className="delayed-page"><p role="alert">{error}</p><Link to={'/delayed/'+matchId}>Match home</Link></main>;
 if(!home||!state||!child)return <AsyncTurnStage matchId={matchId} title="Loading saved result…"/>;
 const event=state.events.find(e=>e.kind==='attempt'&&!e.seen)??state.events.filter(e=>e.kind==='attempt').at(-1);
 if(!overlay&&event)return <AttemptReview key={event.id} events={state.events} home={home} {...{childId,matchId,userId,event}} onDone={()=>{played.current=true;return load();}}/>;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell title="Game result" description="" activeTab="cards" setActiveTab={noop} navigation={<Link to={'/delayed/'+matchId}>Match home</Link>} panel={<p>Saved game result</p>} announcement={false}><div className="async-winner-overlay" data-winner={won||undefined}>
  {won&&!reduced&&play.elapsed<3000&&<Confetti identity={'child:'+childId+(final?.seen?':replay:'+playId:'')} userId={userId} winner={winner!}/>}<strong>Game Complete</strong>
  <strong>{winner?(home.players.find(p=>p.id===winner)?.name??'Winner')+' banked the $'+child.stake+' stake':'Tie · $0'}</strong>
 </div></FullscreenGameShell></div>;
}

function Confetti({identity,userId,winner}:{identity:string;userId:string;winner:string}){const active=useVisible();useEffect(()=>{celebrateCanonicalWinner(identity,userId,[winner],active);},[identity,userId,winner,active]);return <div className="async-confetti" aria-hidden="true"/>;}
export function MatchFinale({matchId,userId}:{matchId:string;userId:string}){
 const [home,setHome]=useState<Home|null>(null),[error,setError]=useState(''),[imageReady,setImageReady]=useState(false),[ackError,setAckError]=useState(''),navigate=useNavigate(),[playId]=useState(()=>crypto.randomUUID()),reduced=useReduced(),play=usePlayback(7500,home&&imageReady?matchId:'loading'),busy=useRef(false);
 useEffect(()=>{let alive=true;setHome(null);setImageReady(false);setError('');setAckError('');busy.current=false;void delayedRpc<Home>('delayed_history_detail',{p_match:matchId}).then(h=>{if(!alive)return;if(!mayViewFinale(h)){navigate('/delayed/'+matchId+(h.removedAt?'?history=1':''),{replace:true});return;}setHome(h);}).catch(()=>{if(alive)setError('Unable to load match result.');});return()=>{alive=false;};},[matchId,navigate]);
 const acknowledgeFinale=useCallback(()=>{if(!home||busy.current||document.hidden||!navigator.onLine)return;busy.current=true;setAckError('');void (home.removedAt?Promise.resolve():delayedRpc('delayed_finale_ack',{p_match:matchId})).catch(()=>{busy.current=false;setAckError('Unable to confirm viewing. Your saved results remain available.');});},[home,matchId]);
 useEffect(()=>{if(imageReady&&play.done)acknowledgeFinale();},[imageReady,play.done,acknowledgeFinale]);
 if(error)return <main className="delayed-page"><p role="alert">{error}</p><Link to={'/delayed/'+matchId}>Match home</Link></main>;
 if(!home)return <AsyncTurnStage matchId={matchId} title="Loading match finale…"/>;
 const winner=home.net===0?null:home.net>0?userId:home.players.find(p=>p.id!==userId)!.id;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell title="Match complete" description="" activeTab="cards" setActiveTab={noop} navigation={<Link to={'/delayed/'+matchId}>Match home</Link>} panel={<p>Match results</p>} announcement={false}><div className="async-finale" data-phase={imageReady&&play.elapsed>=7500?'breakdown':imageReady&&play.elapsed>=7000?'fade':'ring'}>
  {home.net>0&&!reduced&&<Confetti identity={'match:'+matchId+(home.finaleViewed?':replay:'+playId:'')} userId={userId} winner={winner!}/>}<figure className="async-boxing" data-outcome={winner?'decisive':'draw'}>
   <div className="async-boxing-scene"><img src={winner?boxingWinner:boxingDraw} onLoad={()=>setImageReady(true)} onError={()=>setError('Unable to load the match artwork. The saved results remain available.')} alt={winner?home.players.find(p=>p.id===winner)?.name+' wins the match':'Match drawn'} decoding="async"/>
    {winner&&<span className="async-cash-label" aria-label={'Net winnings $'+Math.abs(home.net).toLocaleString()} style={{'--cash-chars':Math.max(4,('$'+Math.abs(home.net).toLocaleString()).length)} as CSSProperties}>{'$'+Math.abs(home.net).toLocaleString()}</span>}
    <figcaption className="async-boxer-names">{(winner?[home.players.find(p=>p.id===winner)!,home.players.find(p=>p.id!==winner)!]:home.players).map(p=><span key={p.id} data-player-id={p.id} className={!winner?'boxer-neutral':p.id===winner?'boxer-winner':'boxer-loser'}>{p.name}</span>)}</figcaption>
   </div>
  </figure><strong>{winner?home.players.find(p=>p.id===winner)?.name+' wins '+money(Math.abs(home.net)):'Draw · $0'}</strong>
  {home.realMoney&&home.receipt&&<p>Balances have been settled</p>}
  <ol className="async-finale-breakdown">{home.lineup.map(c=><li key={c.id}>{c.ordinal}. {c.game} · {c.result?.delta?c.result.delta>0?'W':'L':'T'} {money(c.result?.delta??0)}</li>)}</ol>
  {imageReady&&play.elapsed>=7500&&<div className="async-finale-exit">{ackError&&<p role="alert">{ackError} <button onClick={acknowledgeFinale}>Retry acknowledgement</button></p>}<Link className="delayed-primary" to="/">Back to Lobby</Link></div>}
 </div></FullscreenGameShell></div>;
}
