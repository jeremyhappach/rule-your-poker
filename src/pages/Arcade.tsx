import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Gamepad2,ArrowLeft,Trophy,Play,RotateCcw} from 'lucide-react';
import {useAuthGuard} from '@/hooks/useAuthGuard';
import {useArcadeRun} from '@/hooks/useArcadeRun';
import {arcadeRequest} from '@/lib/arcade/client';
import type {ArcadeSnapshot,Leaderboard} from '@/lib/arcade/model';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {Run21PlayerPane,Run21Timer} from '@/components/run21/Run21PlayerPane';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
import {Run21ScoreCelebration} from '@/components/run21/Run21ScoreCelebration';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel,AlertDialogFooter} from '@/components/ui/alert-dialog';
import {displayedScore} from '@/lib/run21/presentation';
import {roundIntro} from '@/lib/run21/roundIntro';
import {useRun21Bell} from '@/hooks/useRun21Bell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {ScoreCelebrationReceipt} from '@/lib/run21/scoreCelebration';
import '@/lib/arcade/arcade.css';
const games=[{id:'run21',name:'Run21',description:'Five columns. Three rounds. Your best run.',ready:true},
 {id:'tri-towers',name:'TriTowers',description:'Clear the towers.',ready:false},
 {id:'yahtzee',name:'Yahtzee',description:'Make every roll count.',ready:false}];
export default function Arcade(){
 const {user,isReady}=useAuthGuard({pageLabel:'Arcade'}),{game,runId}=useParams();
 if(!isReady||!user)return <main className="arcade-page"><p role="status">Connecting…</p></main>;
 if(!game)return <main className="arcade-page"><Link className="arcade-back" to="/"><ArrowLeft size={18}/>Main Lobby</Link>
  <header className="arcade-heading"><Gamepad2 size={36}/><div><h1>Arcade Mode</h1><p>Pick a game. Chase your personal best.</p></div></header>
  <div className="arcade-tiles">{games.map(g=><article key={g.id} className="arcade-tile"><Gamepad2 aria-hidden="true"/><h2>{g.name}</h2><p>{g.description}</p>
   {g.ready?<Link className="arcade-primary" to={'/arcade/'+g.id}>Play {g.name}</Link>:<span className="arcade-soon">Coming Soon</span>}</article>)}</div></main>;
 if(game!=='run21')return <main className="arcade-page"><Link to="/arcade">Back to Arcade</Link><h1>Coming Soon</h1></main>;
 return runId?<SoloRun key={runId} runId={runId} userId={user.id}/>:<GameBoard/>;
}
function GameBoard(){
 const navigate=useNavigate(),[search]=useSearchParams(),result=search.get('result');
 const [window,setWindow]=useState<'30'|'all'>('30'),[board,setBoard]=useState<Leaderboard|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const createId=useRef<string|null>(null);
 const [ruleset,setRuleset]=useState<string|null>(null);
 useEffect(()=>{let alive=true;setBoard(null);void arcadeRequest<Leaderboard>({op:'leaderboard',game:'run21',window,result,ruleset}).then(value=>{if(alive){setBoard(value);setError('');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[window,result,ruleset]);
 async function start(){
  if(pending)return;setPending(true);setError('');
  try{createId.current??=crypto.randomUUID();const run=await arcadeRequest<ArcadeSnapshot>({op:'start',game:'run21',requestId:createId.current});navigate('/arcade/run21/run/'+run.id);}
  catch(e){setError(e instanceof Error?e.message:'Unable to start.');}finally{setPending(false);}
 }
 return <main className="arcade-page"><Link className="arcade-back" to="/arcade"><ArrowLeft size={18}/>Arcade Mode</Link>
 <header className="arcade-heading"><Trophy size={36}/><div><h1>Run21</h1><p>Three rounds. One score.</p></div></header>
 {board?.latestResult&&<div className="arcade-result" role="status"><span>{board.latestResult.status==='completed'?'Run complete':'Run ended · Unranked'}</span><strong>{board.latestResult.score.toLocaleString()}</strong>
 <p>{board.latestResult.status==='completed'&&board.latestResult.ruleset&&board.latestResult.ruleset!==board.ruleset?'Recorded on '+board.latestResult.ruleset+'.':board.latestResult.status==='completed'&&board.personalBest!==null&&board.latestResult.score<board.personalBest?'Your personal best remains '+board.personalBest.toLocaleString()+'.':board.latestResult.status!=='completed'?'This run does not enter the leaderboard.':'Your verified score is recorded.'}</p></div>}
 <div className="arcade-summary"><div><span>Personal best · All Time</span><strong>{board?.personalBest?.toLocaleString()??'—'}</strong></div>
 <div><span>Your rank · {window==='30'?'Last 30 Days':'All Time'}</span><strong>{board?.self?'#'+board.self.rank:'—'}</strong></div></div>
 {board?.activeRun?<div className="arcade-play"><Link className="arcade-primary" to={'/arcade/run21/run/'+board.activeRun}><Play size={18}/>Resume Run</Link><p>Your clocks keep running. Open the run to resume or abandon.</p></div>:
 <button className="arcade-primary arcade-play" disabled={pending||!board} onClick={()=>void start()}>{board?.latestResult?<RotateCcw size={18}/>:<Play size={18}/>} {pending?'Starting…':board?.latestResult?'Play Again':'Play'}</button>}
 <p className="arcade-note">No pauses. Leaving the game does not stop its clocks.</p>
 {!!board?.availableRulesets?.length&&<label>Leaderboard rules <select className="bg-background text-foreground border border-border rounded px-2 py-1" aria-label="Leaderboard rules" value={board.ruleset} onChange={e=>setRuleset(e.target.value)}>{board.availableRulesets.map(id=><option key={id} value={id}>{id}{id===board.currentRuleset?' · Current':' · Legacy'}</option>)}</select></label>}
 {board?.currentRuleset&&board.ruleset!==board.currentRuleset&&<p>Viewing legacy scores. New games use {board.currentRuleset}.</p>}
 <div className="arcade-tabs" role="tablist" aria-label="Leaderboard period">{(['30','all'] as const).map(value=><button key={value} role="tab" aria-selected={window===value} onClick={()=>setWindow(value)}>{value==='30'?'Last 30 Days':'All Time'}</button>)}</div>
 {error&&<p role="alert">{error}</p>}
 <section className="arcade-leaderboard" aria-label="Run21 leaderboard"><h2>Top 10 players</h2>
 {!board?<p role="status">Loading scores…</p>:board.rows.length===0?<p>No qualifying runs yet. Set the first score.</p>:
 <table><thead><tr><th>Rank</th><th>Player</th><th>Best score</th></tr></thead><tbody>{board.rows.map(({rank:position,...row})=><tr key={row.userId} data-self={row.userId===board.self?.userId}><td>{position}</td><td>{row.name}</td><td>{row.score.toLocaleString()}</td></tr>)}</tbody></table>}
 {board?.self&&!board.rows.some(row=>row.userId===board.self?.userId)&&<p className="arcade-your-rank">You · #{board.self.rank.toLocaleString()} · {board.self.score.toLocaleString()}</p>}
 </section><p className="arcade-note">One best run per player. Equal scores share rank. Rules: {board?.ruleset??'Run21'}</p>
 {!!board?.previousBests.length&&<details><summary>Personal bests under previous rules</summary>{board.previousBests.map(item=><p key={item.ruleset}>{item.ruleset}: {item.score.toLocaleString()}</p>)}</details>}
 </main>;
}
function SoloRun({runId,userId}:{runId:string;userId:string}){
 const {snapshot,error,pending,now,act,refresh,completedOnEntry}=useArcadeRun(runId),navigate=useNavigate();
 const [tab,setTab]=useState<ShellTabId>('cards'),[abandon,setAbandon]=useState(false),[celebration,setCelebration]=useState<ScoreCelebrationReceipt|null>(null);
 const seen=useRef<string|null>(null),retire=useCallback(()=>setCelebration(null),[]);
 const view=snapshot?.view,intro=view?roundIntro(view,now):null;
 useRun21Bell(userId,intro?.key??null,intro?.remaining??0);
 useEffect(()=>{
  if(!snapshot)return;
  const result=view?.boards[userId]?.result,key=result?runId+':'+view?.roundId:null;
  if(key&&seen.current!==key&&!completedOnEntry&&now-(result?.at??0)<1500&&result!.score>0&&(result!.aggregate===104||result!.aggregate===105))
   setCelebration({key,aggregate:result!.aggregate as 104|105,playerName:'You'});
  seen.current=key;
  if(view?.scorePresentation&&now>=view.scorePresentation.startedAt)setCelebration(null);
 },[snapshot,view,userId,runId,completedOnEntry,now]);
 useEffect(()=>{
  if(snapshot&&snapshot.status!=='active'&&(completedOnEntry||!view?.scorePresentation||now>=view.scorePresentation.endsAt))
   navigate('/arcade/run21?result='+runId,{replace:true});
 },[snapshot,view,now,completedOnEntry,navigate,runId]);
 const onIntent=(intent:{type:string;column?:number})=>{if(intent.type==='place')void act({type:'place',column:intent.column!});else if(intent.type==='pass'||intent.type==='collect')void act({type:intent.type});};
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">
 <FullscreenGameShell title="Run21" panelTitle="Rules" description={view?'Round '+view.roundNumber+' of 3':'Connecting…'} ready={!!view}
 activeTab={tab} setActiveTab={setTab} panel={<><Run21ScoringReference/><p>Exactly three rounds. Rounds advance automatically. All clocks continue while this panel is open or you are away. First-placement expiry or abandoning the run is unranked.</p></>}
 navigation={<nav aria-label="Arcade controls"><button onClick={()=>setTab('lobby')}>Rules</button><Link to="/arcade/run21">Leaderboard</Link><button onClick={()=>setAbandon(true)}>Abandon</button></nav>}
 announcement={<div className="arcade-run-notice" role="status">{view?.scorePresentation?'Round score recorded · Continuing automatically':'Solo Arcade · No pauses'}</div>}
 scores={<div className="arcade-run-score"><span>Total score</span><strong>{view?displayedScore(view,userId,now).toLocaleString():0}</strong></div>}
 actions={view&&<div className="run21-fullscreen-footer"><div className="run21-fullscreen-actions"><Run21Timer view={view} now={now}/><Run21PlayerPane view={view} now={now} onIntent={onIntent} pending={pending}/></div></div>}>
 {error&&<div role="alert" className="arcade-error">{error} <button onClick={()=>void refresh()}>Reconnect</button></div>}
 {view?<Run21Felt layout="fullscreen" view={view} now={now} acceptedEvents={snapshot?.events} onIntent={onIntent} pending={pending} hideScoring={!!celebration}/>:<p role="status">Restoring your run…</p>}
 <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon run?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard. The clock is still running.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>void act({type:'abandon'})}>Abandon Run</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </FullscreenGameShell>{celebration&&<Run21ScoreCelebration receipt={celebration} onRetire={retire}/>}</div>;
}

