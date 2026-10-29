import {Component,useCallback,useEffect,useMemo,useRef,useState,type ReactNode,type CSSProperties} from 'react';
import {Link,useNavigate,useSearchParams} from 'react-router-dom';
import {delayedRpc,type Home} from '@/lib/delayed/client';
import {money,reviewDuration,type ReviewEvent,type Reviews} from '@/lib/delayed/reviews';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {Run21Felt} from '@/components/run21/Run21Felt';
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
 useEffect(()=>{if(!active){origin.current=null;return;}origin.current=performance.now();const id=setInterval(()=>setFrame({key,elapsed:Math.min(duration,performance.now()-(origin.current??performance.now()))}),50);return()=>clearInterval(id);},[active,duration,key]);
 const elapsed=frame.key===key?frame.elapsed:0;
 return {elapsed,active,done:active&&elapsed>=duration};
}
function useReduced(){return useMemo(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false,[]);}
class SnapshotBoundary extends Component<{children:ReactNode},{failed:boolean}>{
 state={failed:false};static getDerivedStateFromError(){return {failed:true};}
 render(){return this.state.failed?<p role="status">Board preview unavailable. The saved score is shown above.</p>:this.props.children;}
}

export function ReviewGate({childId,matchId,userId,children}:Identity&{children:()=>ReactNode}){
 const [state,setState]=useState<Reviews|null>(null),[error,setError]=useState(''),[ready,setReady]=useState(false),navigate=useNavigate();
 const active=useVisible(),generation=useRef(0),released=useRef(false);
 const load=useCallback(async()=>{if(released.current)return;const g=++generation.current;try{const value=await delayedRpc<Reviews>('delayed_reviews',{p_child:childId});if(g!==generation.current)return;
  if(value.terminal||value.actor!==userId||Date.parse(value.expiresAt)<=value.serverAt){navigate('/delayed/'+matchId,{replace:true});return;}
  setState(value);setError('');released.current=value.started||!value.events.some(e=>!e.seen&&e.kind==='attempt');setReady(released.current);
 }catch{if(g===generation.current)setError('Unable to verify this turn.');}},[childId,matchId,userId,navigate]);
 useEffect(()=>{if(active)void load();return()=>{generation.current++;};},[active,load]);
 useEffect(()=>{const channel=supabase.channel('review-gate:'+childId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},()=>void load()).subscribe();return()=>{void supabase.removeChannel(channel);};},[childId,userId,load]);
 const event=state?.events.find(e=>e.kind==='attempt'&&!e.seen);
 if(ready)return <>{children()}</>;
 return error?<main className="delayed-page"><p role="alert">{error}</p><button onClick={()=>void load()}>Retry</button><Link to={'/delayed/'+matchId}>Match home</Link></main>:event?<AttemptReview key={event.id} event={event} {...{childId,matchId,userId}} onDone={load}/>:<p role="status">Preparing your turn…</p>;
}

function AttemptReview({event,onDone,childId,matchId,userId}:Identity&{event:ReviewEvent;onDone:()=>void|Promise<void>}){
 const reduced=useReduced(),[prior,setPrior]=useState<number|null>(null),activeView=useVisible(),duration=prior===null?reviewDuration(reduced):Math.max(600,reviewDuration(reduced)-prior),{elapsed,done,active}=usePlayback(duration,event.id+':'+prior),busy=useRef(false),[error,setError]=useState(''),[beginRetry,setBeginRetry]=useState(0);
 useEffect(()=>{if(!activeView)return;let alive=true;void delayedRpc<{elapsed:number;seen:boolean}>('delayed_review_begin',{p_event:event.id}).then(v=>{if(alive){setError('');setPrior(event.seen?0:v.elapsed);}}).catch(()=>{if(alive)setError('Unable to begin saved-result review.');});return()=>{alive=false;};},[event.id,event.seen,activeView,beginRetry]);
 const acknowledge=useCallback(async()=>{if(prior===null||busy.current||document.hidden||!navigator.onLine)return;busy.current=true;try{await delayedRpc('delayed_review_ack',{p_event:event.id});await onDone();}catch{setError('Result saved. Unable to confirm viewing; retry safely.');busy.current=false;}},[event.id,onDone,prior]);
 useEffect(()=>{if(prior!==null&&done&&!error)void acknowledge();},[prior,done,error,acknowledge]);
 if(prior===null)return <main className="delayed-page">{error?<p role="alert">{error}<button onClick={()=>{setError('');setBeginRetry(n=>n+1);}}>Retry</button></p>:<p role="status">Restoring saved result…</p>}</main>;
 return <div className="async-result-review"><div className="delayed-turn-nav"><Link to={'/delayed/'+matchId}>Match home</Link><span>Opponent · Round {event.round} · {Math.round((event.score??0)*Math.min(1,(elapsed+prior)/reviewDuration(reduced))).toLocaleString()}</span></div>
  {!active&&<p role="status">Return online to finish reviewing.</p>}{error&&<p role="alert">{error}<button onClick={()=>void acknowledge()}>Retry</button></p>}
  <SnapshotBoundary><SavedBoard event={event} childId={childId} userId={userId} elapsed={reduced?5000:Math.min(5000,elapsed+(prior??0))}/></SnapshotBoundary>
 </div>;
}

function SavedBoard({event,childId,userId,elapsed}:{event:ReviewEvent;childId:string;userId:string;elapsed:number}){
 const [tab,setTab]=useState<ShellTabId>('cards'),actor=event.actor??userId,scope='review:'+event.id;
 const origin=1_000_000,now=origin+elapsed;
 const board=useMemo(()=>{if(!event.board)return null;const b=structuredClone(event.board);b.deadline=origin+5000;if(b.result){b.result.at=origin;b.result.completedAt=origin;}return b;},[event]);
 if(!board)return <main className="delayed-page"><p>Historic board replay is unavailable.</p><strong>{event.score?.toLocaleString()} points</strong></main>;
 const players=[actor,userId].filter((v,i,a)=>a.indexOf(v)===i),base={activeTab:tab,setActiveTab:setTab,pending:false,error:'',onReconnect:noop,onIntent:noop};
 if(event.receipt.game==='quintzee')return <QuintzeeView {...base} actor={userId} userId={userId} now={now} snapshot={{id:childId,revision:1,scope,serverAt:origin,theme:'modern',pausedAt:null,status:'completed',outcome:'active',playerNames:{[actor]:'Opponent'},state:{rules:board.rules,players,scores:Object.fromEntries(players.map(p=>[p,p===actor?board.score:0])),round:event.round,turnIndex:0,qualified:[],results:[],finished:false,board}} as any}/>;
 if(event.receipt.game==='boxdrop')return <BoxdropView {...base} userId={userId} now={now} epoch={0} view={{id:childId,revision:1,scope,serverAt:origin,round:event.round,board,canAct:false,paused:false,pausedAt:null,finished:false,settled:false,solo:false,players:[{id:actor,name:'Opponent',score:board.score,active:true}]} as any}/>;
 if(event.receipt.game==='ptown-words')return <PtownWordsView view={{...board,identity:{sessionId:childId,dealerGameId:childId,roundId:scope},revision:1,viewerId:userId,serverAt:origin,canAct:false,paused:false,finished:true,phase:'complete',rack:[],rackCounts:{},movePresentation:null,terminal:null,financial:{balances:{}}} as any} now={now} pending={false} connected={true} error="" activeTab={tab} setActiveTab={setTab} panel={<p>Saved public board. Private racks are not included.</p>} sessionEnded={false} onIntent={async()=>false} onReconnect={noop}/>;
 return <FullscreenGameShell className={event.receipt.game==='tri-towers'?'tri-scene':'run21-space-theme'} title="Saved result" description={'Round '+event.round} activeTab={tab} setActiveTab={setTab} panel={<p>Saved result · controls disabled</p>} announcement={false}>
  {event.receipt.game==='run21'?<Run21Felt solo layout="fullscreen" playerId={actor} now={now} view={{config:event.receipt.rules,roundId:scope,roundNumber:event.round,viewerId:userId,boards:{[actor]:board},players:[{id:actor,name:'Opponent'}],active_player_id:null,liveBoards:true,revealed:true,cumulative:{[actor]:event.score??0},scorePresentation:{playerId:actor,startedAt:origin,endsAt:origin+5000,from:0,to:event.score??0},presentationKey:scope} as any}/>:<div className="tri-game" data-tri-towers data-phase={board.phase}><TriTowersBoard view={board} canAct={false} onIntent={noop} now={now} roundKey={scope} userId={userId} result={{...board.result,id:scope,stage:event.round,elapsed,displayScore:board.score}} scores={[{id:actor,score:board.score,active:true}]}/></div>}
 </FullscreenGameShell>;
}

export function ChildResults({childId,matchId,userId}:Identity){
 const [home,setHome]=useState<Home|null>(null),[state,setState]=useState<Reviews|null>(null),[error,setError]=useState(''),[overlay,setOverlay]=useState(false),[query]=useSearchParams(),navigate=useNavigate();
 const played=useRef(false);
 const load=useCallback(async()=>{try{const [h,r]=await Promise.all([delayedRpc<Home>('delayed_home',{p_match:matchId}),delayedRpc<Reviews>('delayed_reviews',{p_child:childId})]);if(h.removedAt||!h.lineup.some(c=>c.id===childId&&c.terminal)){navigate('/delayed/'+matchId,{replace:true});return;}setHome(h);setState(r);setOverlay(query.has('finished')||!r.events.some(e=>e.kind==='attempt')||played.current&&!r.events.some(e=>e.kind==='attempt'&&!e.seen));}catch{setError('Unable to restore saved results.');}},[matchId,childId,navigate,query]);
 useEffect(()=>{void load();},[load]);
 const final=state?.events.find(e=>e.kind==='child'),child=home?.lineup.find(c=>c.id===childId),winner=final?.receipt.winner??child?.result?.winner,won=winner===userId;
 const reduced=useReduced(),play=usePlayback(reduced?1200:4000,overlay?'overlay:'+childId:'waiting'),busy=useRef(false);
 useEffect(()=>{if(!overlay||!play.done||busy.current||!home)return;busy.current=true;void (final?delayedRpc('delayed_review_ack',{p_event:final.id}):Promise.resolve()).then(()=>navigate('/delayed/'+matchId+(home.receipt?'?finale=1':''),{replace:true})).catch(()=>{busy.current=false;setError('Unable to confirm viewing. Return to match home and retry.');});},[overlay,play.done,final,home,matchId,navigate]);
 if(error)return <main className="delayed-page"><p role="alert">{error}</p><Link to={'/delayed/'+matchId}>Match home</Link></main>;
 if(!home||!state||!child)return <p role="status">Loading saved result…</p>;
 const event=state.events.find(e=>e.kind==='attempt'&&!e.seen)??state.events.filter(e=>e.kind==='attempt').at(-1);
 if(!overlay&&event)return <AttemptReview key={event.id} {...{childId,matchId,userId,event}} onDone={()=>{played.current=true;return load();}}/>;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell title="Game result" description="" activeTab="cards" setActiveTab={noop} navigation={<Link to={'/delayed/'+matchId}>Match home</Link>} panel={<p>Saved authoritative result</p>} announcement={false}><div className="async-winner-overlay" data-winner={won||undefined}>
  {won&&!reduced&&<Confetti/>}<strong>{winner?(won?'You':home.players.find(p=>p.id===winner)?.name??'Opponent')+' banked the $'+child.stake+' stake!':'Tie · $0'}</strong>
  <p>Included in the single match settlement.</p>
 </div></FullscreenGameShell></div>;
}

function Confetti(){return <div className="async-confetti" aria-hidden="true">{Array.from({length:24},(_,i)=><i key={i} style={{left:(i*37%100)+'%',animationDelay:(i%6)*.12+'s',background:['#f9d45b','#74dac3','#ef858b'][i%3]}}/>)}</div>;}
export function MatchFinale({matchId,userId}:{matchId:string;userId:string}){
 const [home,setHome]=useState<Home|null>(null),[error,setError]=useState(''),navigate=useNavigate(),reduced=useReduced(),play=usePlayback(reduced?1500:9000,home?matchId:'loading'),busy=useRef(false);
 useEffect(()=>{let alive=true;void delayedRpc<Home>('delayed_history_detail',{p_match:matchId}).then(h=>{if(!alive)return;if(!h.receipt||h.removedAt){navigate('/delayed/'+matchId,{replace:true});return;}setHome(h);}).catch(()=>setError('Unable to load match result.'));return()=>{alive=false;};},[matchId,navigate]);
 useEffect(()=>{if(!home||!play.done||busy.current)return;busy.current=true;void delayedRpc('delayed_finale_ack',{p_match:matchId}).then(()=>navigate('/delayed/'+matchId+'?history=1',{replace:true})).catch(()=>{busy.current=false;setError('Unable to confirm viewing. The result is still available.');});},[home,play.done,matchId,navigate]);
 if(error)return <main className="delayed-page"><p role="alert">{error}</p><Link to={'/delayed/'+matchId}>Match home</Link></main>;
 if(!home)return <p role="status">Loading match finale…</p>;
 const winner=home.net===0?null:home.net>0?userId:home.players.find(p=>p.id!==userId)!.id;
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen"><FullscreenGameShell title="Match complete" description="" activeTab="cards" setActiveTab={noop} navigation={<Link to={'/delayed/'+matchId}>Match home</Link>} panel={<p>Saved authoritative settlement</p>} announcement={false}><div className="async-finale" data-phase={play.elapsed>6000?'breakdown':'ring'}>
  {home.net>0&&!reduced&&<Confetti/>}<svg viewBox="0 0 600 360" role="img" aria-label={winner?home.players.find(p=>p.id===winner)?.name+' wins the match':'Match drawn'}>
   <path d="M45 270 L110 130 H490 L555 270Z" fill="#25465b" stroke="#e8d9af" strokeWidth="5"/>{[150,190,230].map(y=><path key={y} d={`M65 ${y+40} H535 M110 ${y-20} H490`} stroke="#d1b982" strokeWidth="4"/>)}
   {home.players.map((p,i)=>{const wins=winner===null||winner===p.id,x=i===0?190:410;return <g key={p.id} transform={`translate(${x} 210)`} className={wins?'boxer-winner':'boxer-loser'}><circle cx="0" cy={wins?-65:-48} r="20" fill="#c78c66"/><path d="M0 -40 V15 M0 15 L-20 55 M0 15 L20 55" stroke={i===0?'#59baca':'#d67c80'} strokeWidth="23" fill="none"/><path d={wins?`M0 -25 L${i===0?55:-55} -80`:'M0 -25 L25 10'} stroke="#c78c66" strokeWidth="13" fill="none"/><text x="0" y="88" textAnchor="middle" fill="white" fontSize="17">{p.name}</text></g>;})}
   <g transform="translate(300 220)"><circle cy="-75" r="17" fill="#c9a07b"/><path d={`M0 -55 V10 M0 -45 L-55 ${winner===null||winner===home.players[0].id?-90:0} M0 -45 L55 ${winner===null||winner===home.players[1].id?-90:0} M0 10 L-18 45 M0 10 L18 45`} fill="none" stroke="#eee" strokeWidth="13"/></g>
   {home.net!==0&&<g className={!reduced?'async-chip-transfer':''} style={{'--direction':winner===home.players[0].id?-1:1} as CSSProperties}><circle cx="300" cy="210" r="22" fill="#f9d45b"/><text x="300" y="216" textAnchor="middle" fontSize="16">${Math.abs(home.net)}</text></g>}
  </svg><strong>{winner?home.players.find(p=>p.id===winner)?.name+' wins '+money(Math.abs(home.net)):'Draw · $0'}</strong>
  <p>One authoritative match settlement · {home.realMoney?'Real money':'Play money'}</p>
  <ol className="async-finale-breakdown">{home.lineup.map(c=><li key={c.id}>{c.ordinal}. {c.game} · {c.result?.delta?c.result.delta>0?'W':'L':'T'} {money(c.result?.delta??0)}</li>)}</ol>
 </div></FullscreenGameShell></div>;
}
