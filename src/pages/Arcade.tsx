import {RiverCityRunPage} from '@/components/riverCityRun/RiverCityRunPage';
import {SoloShipCapVoyage} from '@/components/arcade/SoloShipCapVoyage';
import {SoloHorsesBlitz} from '@/components/arcade/SoloHorsesBlitz';
import {SoloDrop357} from '@/components/arcade/SoloDrop357';
import {ArcadeAbandonButton} from '@/components/arcade/ArcadeAbandonButton';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {AchievementTime} from '@/components/arcade/AchievementTime';
import {NotificationBell} from '@/components/delayed/NotificationBell';
import {useQuintzeeTheme} from '@/hooks/useQuintzeeTheme';
import {Switch} from '@/components/ui/switch';
import {MegaArcadePage} from '@/components/megaCardGolf/MegaArcadePage';
import {ArcadeSwitchboard} from '@/components/arcade/ArcadeSwitchboard';
import {findGame} from '@/lib/gameCatalog';
import {SoloChuckyShowdown} from '@/components/arcade/SoloChuckyShowdown';
import {ShowdownHistory} from '@/components/arcade/ShowdownHistory';
import {SoloCribLab} from '@/components/arcade/SoloCribLab';
import {SoloQuintzee} from '@/components/arcade/SoloQuintzee';
import {SoloBoxdrop} from '@/components/arcade/SoloBoxdrop';
import {SoloTripFlip} from '@/components/arcade/SoloTripFlip';
import {SoloTakeTwo} from '@/components/arcade/SoloTakeTwo';
import {SoloRoyalFlash} from '@/components/arcade/SoloRoyalFlash';
import {SoloElevenUp} from '@/components/arcade/SoloElevenUp';
import {Run21SpaceScene} from '@/components/run21/Run21SpaceScene';
import {SoloTriTowers} from '@/components/arcade/SoloTriTowers';
import {grantTriStart} from '@/lib/triTowers/roundTimeline';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Gamepad2,ArrowLeft,Trophy,Play,RotateCcw} from 'lucide-react';
import {useRun21Diagnostics} from '@/hooks/useRun21Diagnostics';
import {useAuthGuard} from '@/hooks/useAuthGuard';
import {ArcadeInfo} from '@/components/arcade/ArcadeInfo';
import {useArcadeRun} from '@/hooks/useArcadeRun';
import {arcadeRequest} from '@/lib/arcade/client';
import type {ArcadeSnapshot,Leaderboard} from '@/lib/arcade/model';
import {FullscreenGameShell} from '@/lib/canonicalShell/FullscreenGameShell';
import {Run21Felt} from '@/components/run21/Run21Felt';
import {Run21FullscreenActions} from '@/components/run21/Run21PlayerPane';
import {Run21ScoringReference} from '@/components/run21/Run21ScoringHelp';
import {Run21ScoreCelebration} from '@/components/run21/Run21ScoreCelebration';
import {AlertDialog,AlertDialogContent,AlertDialogTitle,AlertDialogDescription,AlertDialogAction,AlertDialogCancel,AlertDialogFooter} from '@/components/ui/alert-dialog';
import {displayedScore} from '@/lib/run21/presentation';
import {roundIntro} from '@/lib/run21/roundIntro';
import {ArcadeCompletion} from '@/components/run21/ArcadeCompletion';
import {useRun21ScoreAudio} from '@/hooks/useRun21ScoreAudio';
import {useRun21PlacementAudio} from '@/hooks/useRun21PlacementAudio';
import {useRun21FailureAudio} from '@/hooks/useRun21FailureAudio';
import {medalDuration} from '@/lib/run21/rulesets';
import {useRun21Bell} from '@/hooks/useRun21Bell';
import type {ShellTabId} from '@/lib/canonicalShell/ShellTabBar';
import type {ScoreCelebrationReceipt} from '@/lib/run21/scoreCelebration';
import '@/lib/arcade/arcade.css';
import {ArcadeLeaderboardArtwork} from '@/components/arcade/ArcadeLeaderboardArtwork';
import '@/components/arcade/leaderboardTheme.css';
export default function Arcade(){
 const {user,isReady}=useAuthGuard({pageLabel:'Arcade'}),{game,runId}=useParams();
 if(!isReady||!user)return <main className="arcade-page"><p role="status">Connecting…</p></main>;
 if(!game)return <ArcadeSwitchboard userId={user.id}/>;
 if(game==='chucky-showdown')return runId?<SoloChuckyShowdown key={user.id+runId} runId={runId} userId={user.id}/>:<GameBoard key={game+user.id} game={game} userId={user.id}/>;
 if(game==='ship-cap-voyage')return runId?<SoloShipCapVoyage key={user.id+runId} runId={runId} userId={user.id}/>:<GameBoard key={game+user.id} game={game} userId={user.id}/>;
 if(game==='horses-blitz')return runId?<SoloHorsesBlitz key={user.id+runId} runId={runId} userId={user.id}/>:<GameBoard key={game+user.id} game={game} userId={user.id}/>;
 if(game==='357-drop')return runId?<SoloDrop357 key={user.id+runId} runId={runId} userId={user.id}/>:<GameBoard key={game+user.id} game={game} userId={user.id}/>;
 if(game==='crib-lab')return runId?<SoloCribLab key={runId} runId={runId} userId={user.id}/>:<GameBoard key={game+user.id} game={game} userId={user.id}/>;
 if(game==='river-city-run')return <RiverCityRunPage userId={user.id}/>;
 if(game==='mega-card-golf')return <MegaArcadePage userId={user.id}/>;
 if(game!=='run21'&&game!=='tri-towers'&&game!=='eleven-up'&&game!=='royal-flash'&&game!=='quintzee'&&game!=='boxdrop'&&game!=='trip-flip'&&game!=='take-two')return <main className="arcade-page"><Link to="/arcade">Back to Arcade</Link><h1>Coming Soon</h1></main>;
 return runId?(game==='quintzee'?<SoloQuintzee key={runId} runId={runId} userId={user.id}/>:game==='boxdrop'?<SoloBoxdrop key={runId} runId={runId} userId={user.id}/>:game==='trip-flip'?<SoloTripFlip key={runId} runId={runId} userId={user.id}/>:game==='take-two'?<SoloTakeTwo key={runId} runId={runId} userId={user.id}/>:game==='royal-flash'?<SoloRoyalFlash key={runId} runId={runId} userId={user.id}/>:game==='eleven-up'?<SoloElevenUp key={runId} runId={runId} userId={user.id}/>:game==='tri-towers'?<SoloTriTowers key={runId} runId={runId} userId={user.id}/>:<SoloRun key={runId} runId={runId} userId={user.id}/>):<GameBoard key={game+user.id} game={game} userId={user.id}/>;
}
export function GameBoard({game,userId}:{userId:string;game:'ship-cap-voyage'|'horses-blitz'|'357-drop'|'crib-lab'|'chucky-showdown'|'run21'|'tri-towers'|'eleven-up'|'royal-flash'|'quintzee'|'boxdrop'|'trip-flip'|'take-two'}){
 const descriptor=findGame(game),name=descriptor?.name??game;
 const [classic,setClassic]=useQuintzeeTheme(userId);
 const navigate=useNavigate(),[search]=useSearchParams(),result=search.get('result');
 const [window,setWindow]=useState<'30'|'all'>('30'),[board,setBoard]=useState<Leaderboard|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false);
 const createId=useRef<string|null>(null);
 const [ruleset,setRuleset]=useState<string|null>(null);
 const displayRuleset=board?.currentRuleset&&board.compatibleRulesets?.includes(board.currentRuleset)?board.currentRuleset:board?.ruleset;
 useEffect(()=>{let alive=true;setBoard(null);void arcadeRequest<Leaderboard>({op:'leaderboard',game,window,result,ruleset}).then(value=>{if(alive){setBoard(value);setError('');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[game,window,result,ruleset]);
 async function start(){
  if(pending)return;setPending(true);setError('');
  try{createId.current??=crypto.randomUUID();const run=await arcadeRequest<ArcadeSnapshot>({op:'start',game,requestId:createId.current,...(game==='quintzee'?{theme:classic?'classic':'modern'}:{})});if((game==='ship-cap-voyage'||game==='horses-blitz'||game==='357-drop'||game==='chucky-showdown'||game==='crib-lab'||game==='tri-towers'||game==='eleven-up'||game==='royal-flash'||game==='quintzee'||game==='boxdrop'||game==='trip-flip'||game==='take-two')&&!document.hidden)grantTriStart(run.id);navigate('/arcade/'+game+'/run/'+run.id);}
  catch(e){setError(e instanceof Error?e.message:'Unable to start.');}finally{setPending(false);}
 }
 return <main className={"arcade-page arcade-board theme-"+game}>
 <div className="scene-art" aria-hidden="true"><ArcadeLeaderboardArtwork game={game}/></div>
 <div className="arcade-board-content">
 <nav className="top-navigation" aria-label="Arcade navigation"><Link className="arcade-back" to="/arcade"><ArrowLeft size={18}/>Arcade Mode</Link><div><GameplaySoundButton/><NotificationBell/></div></nav>
 <header className="identity"><div className="identity-copy"><span className="eyebrow">{descriptor?.arcadeSection==='originals'?'P-TOWN ORIGINALS':'ARCADE'}</span><h1>{name}</h1><span className="leaderboard-label"><Trophy size={14} aria-hidden="true"/>Leaderboard</span></div></header>
 <div className="action-line">
 <ArcadeInfo game={game} name={name} ruleset={displayRuleset} triggerLabel="Rules & info">
  <p>Top 10 verified scores. Players may appear more than once. Equal scores share rank (1, 1, 3), with earlier completions appearing first. Only ten entries are shown. Last 30 Days uses games completed in that period; personal best shows All Time for the selected rules.</p>
  {!!board?.availableRulesets?.length&&(game!=='tri-towers'||board.availableRulesets.length>1)&&<label className="arcade-version">Leaderboard rules <select aria-label="Leaderboard rules" value={displayRuleset} onChange={e=>setRuleset(e.target.value)}>{board.availableRulesets.map(id=><option key={id} value={id}>{id==='357-drop/5'?'357 Drop':id==='357-drop/4'?'357 Drop · Partial carry playtest':id==='357-drop/3'?'357 Drop · Full carry playtest':id==='357-drop/2'?'357 Drop · Original':id}{id===board.currentRuleset?' · Current':' · Legacy'}</option>)}</select></label>}
  <p>Compatible rule versions share scores; other rules stay separate. New games use the current rules.</p>
  {!!board?.previousBests.length&&<details><summary>Personal bests under other rules</summary>{board.previousBests.map(item=><p key={item.ruleset}>{item.ruleset}: {item.score.toLocaleString()}</p>)}</details>}
 </ArcadeInfo>
 {board?.activeRun?<Link className="arcade-primary arcade-header-play" to={'/arcade/'+game+'/run/'+board.activeRun}><Play size={16}/>Resume</Link>:
 <button className="arcade-primary arcade-header-play" disabled={pending||!board} onClick={()=>void start()}>{board?.latestResult?<RotateCcw size={16}/>:<Play size={16}/>} {pending?'Starting…':board?.latestResult?'Play Again':'Play'}</button>}
 </div>
 {game==='357-drop'&&board&&<p className="arcade-rules-hint">{displayRuleset==='357-drop/5'?'Partial carry · 500-point ALL FILLED bonus':displayRuleset==='357-drop/4'?'Partial carry playtest · Separate leaderboard':displayRuleset==='357-drop/3'?'Full carry playtest · Separate leaderboard':'Original board leaderboard'}</p>}
 {game==='quintzee'&&<label className="quintzee-theme-choice">Classic Mode<Switch className="quintzee-theme-switch" checked={classic} onCheckedChange={setClassic} disabled={pending||!!board?.activeRun} aria-label="Classic Mode"/></label>}
 {board?.latestResult&&<div className="arcade-result" role="status"><span>{board.latestResult.status==='completed'?'Game Over':'Game Over · Unranked'}</span><strong>{board.latestResult.score.toLocaleString()}</strong>
 <p>{board.latestResult.status==='completed'&&board.latestResult.ruleset&&board.latestResult.ruleset!==board.ruleset&&!board.compatibleRulesets?.includes(board.latestResult.ruleset)?'Recorded under different rules. See info.':board.latestResult.status!=='completed'?'Not ranked':board.latestResult.rank!=null?'This game · #'+board.latestResult.rank.toLocaleString():'Score recorded'}</p></div>}
 <div className="arcade-summary"><div><span>Personal best · All Time</span><strong>{board?.personalBest?.toLocaleString()??'—'}</strong></div>
 <div><span>Your rank · {window==='30'?'Last 30 Days':'All Time'}</span><strong>{board?.self?'#'+board.self.rank:'—'}</strong></div></div>
 {board?.currentRuleset&&displayRuleset!==board.currentRuleset&&<p className="arcade-note">Legacy leaderboard</p>}
 <div className="arcade-tabs" role="tablist" aria-label="Leaderboard period">{(['30','all'] as const).map(value=><button key={value} id={'arcade-period-'+value} role="tab" aria-controls="arcade-ranking" tabIndex={window===value?0:-1} aria-selected={window===value} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'30':event.key==='End'?'all':value==='30'?'all':'30';setWindow(next);document.getElementById('arcade-period-'+next)?.focus();}}} onClick={()=>setWindow(value)}>{value==='30'?'Last 30 Days':'All Time'}</button>)}</div>
 {error&&<p role="alert">{error}</p>}
 <section id="arcade-ranking" role="tabpanel" aria-labelledby={'arcade-period-'+window} className="arcade-leaderboard">
 {!board?<p role="status">Loading scores…</p>:board.rows.length===0?<p>No qualifying games yet. Set the first score.</p>:
 <table className="arcade-score-table"><colgroup><col className="rank-col"/><col/><col className="date-col"/><col className="score-col"/></colgroup><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Achieved</th><th scope="col">Score</th></tr></thead><tbody>{board.rows.map(({rank:position,...row})=><tr key={row.runId} data-self={row.userId===board.self?.userId} data-rank={game==='run21'?position:undefined}><td>{game==='run21'?<span className="run21-rank">{position}</span>:position}</td><td className="leaderboard-player" title={row.name}><span>{row.name}</span></td><td className="leaderboard-achieved"><AchievementTime completedAt={row.completedAt} splitLines/></td><td>{row.score.toLocaleString()}</td></tr>)}</tbody></table>}
 {board?.self&&!board.rows.some(row=>row.runId===board.self?.runId)&&<p className="arcade-your-rank">You · #{board.self.rank.toLocaleString()} · {board.self.score.toLocaleString()}</p>}
 </section>
 {game==='chucky-showdown'&&<ShowdownHistory/>}
 </div>
 </main>;
}
function SoloRun({runId,userId}:{runId:string;userId:string}){
 useRun21Diagnostics(userId,'arcade',runId);
 const {snapshot,error,pending,placement,now,act,refresh,completedOnEntry,completionLive,passReceipt,audioEpoch:presentationEpoch}=useArcadeRun(runId),navigate=useNavigate();
 const [tab,setTab]=useState<ShellTabId>('cards'),[abandon,setAbandon]=useState(false),[celebration,setCelebration]=useState<ScoreCelebrationReceipt|null>(null);
 const [finalUntil,setFinalUntil]=useState<number|null>(null);
 const seen=useRef<string|null>(null),retire=useCallback(()=>setCelebration(null),[]);
 const view=snapshot?.view,intro=view?roundIntro(view,now):null;
 const medalEpoch=useRef<number|null>(null);
 useRun21PlacementAudio(userId,runId+':'+view?.roundId,snapshot?.events,presentationEpoch,!error&&tab==='cards',passReceipt);
 useRun21Bell(userId,intro?.key??null,intro?.remaining??0);
 useRun21ScoreAudio(userId,runId,view,now,!celebration&&(snapshot?.status==='active'||completionLive));
 useRun21FailureAudio(userId,runId,view,now,presentationEpoch,!error&&!celebration&&tab==='cards'&&!completedOnEntry&&(snapshot?.status==='active'||completionLive));
 const finalAt=view?.scorePresentation?.endsAt;
 const showFinal=snapshot?.status==='completed'&&completionLive&&finalUntil!==null&&performance.now()<finalUntil;
 useEffect(()=>setFinalUntil(null),[runId]);
 useEffect(()=>{
  if(snapshot?.status==='completed'&&completionLive&&finalAt!=null&&now>=finalAt&&finalUntil===null)
   setFinalUntil(performance.now()+2500);
 },[snapshot?.status,completionLive,finalAt,finalUntil,now]);
 useEffect(()=>{
  if(!snapshot)return;
  const result=view?.boards[userId]?.result,key=result?runId+':'+view?.roundId:null;
  if(medalEpoch.current!==presentationEpoch){medalEpoch.current=presentationEpoch;seen.current=key;setCelebration(null);return;}
  if(key&&seen.current!==key&&!completedOnEntry&&now-(result?.at??0)<1500&&result!.score>0&&(result!.aggregate===104||result!.aggregate===105))
   setCelebration({key,aggregate:result!.aggregate as 104|105,playerName:'You',durationMs:medalDuration(view!.config,result!.aggregate as 104|105),startedAt:performance.now()-(now-result!.at)});
  seen.current=key;
  if(view?.scorePresentation&&now>=view.scorePresentation.startedAt)setCelebration(null);
 },[snapshot,view,userId,runId,completedOnEntry,now,presentationEpoch]);
 useEffect(()=>{
  if(snapshot&&snapshot.status!=='active'&&(snapshot.status!=='completed'||!completionLive||!view?.scorePresentation||(finalUntil!==null&&performance.now()>=finalUntil)))
   navigate('/arcade/run21?result='+runId,{replace:true});
 },[snapshot,view,now,completionLive,finalUntil,navigate,runId]);
 const onIntent=(intent:{type:string;column?:number})=>{if(intent.type==='place')void act({type:'place',column:intent.column!});else if(intent.type==='pass'||intent.type==='collect')void act({type:intent.type});};
 return <div className="arcade-run" data-shell-presentation-mode="fullscreen">
 <FullscreenGameShell className="run21-space-theme" title="Run21" panelTitle="Rules" panelDescription="Scoring for this game." description={view?'Round '+view.roundNumber+' of 3':'Connecting…'} ready={!!view}
 activeTab={tab} setActiveTab={setTab} panel={view&&<Run21ScoringReference config={view.config} solo/>}
 endControl={snapshot?.status==='active'&&<ArcadeAbandonButton disabled={pending} onClick={()=>setAbandon(true)}/>}
 navigation={<nav aria-label="Arcade controls"><button onClick={()=>setTab('lobby')}>Rules</button></nav>}
 announcement={false}
 scores={<div className="arcade-run-score"><span>Total score</span><strong>{view?displayedScore(view,userId,now).toLocaleString():0}</strong></div>}
 actions={view&&<div className="run21-fullscreen-footer"><Run21FullscreenActions view={view} now={now} onIntent={onIntent} pending={pending}/></div>}>
 <Run21SpaceScene/>
 {error&&<div role="alert" className="arcade-error">{error} <button onClick={()=>void refresh()}>Reconnect</button></div>}
 {view?<Run21Felt solo layout="fullscreen" view={view} now={now} acceptedEvents={snapshot?.events} onIntent={onIntent} pending={pending} placement={placement} hideScoring={!!celebration}/>:<p role="status">Restoring your game…</p>}
 <AlertDialog open={abandon} onOpenChange={setAbandon}><AlertDialogContent><AlertDialogTitle>Abandon game?</AlertDialogTitle><AlertDialogDescription>Its score will not enter the leaderboard.</AlertDialogDescription><AlertDialogFooter><AlertDialogCancel>Keep Playing</AlertDialogCancel><AlertDialogAction disabled={pending} onClick={()=>void act({type:'abandon'})}>Abandon Game</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 </FullscreenGameShell>{showFinal&&<ArcadeCompletion score={snapshot.score} record={snapshot.completion}/>}{celebration&&!showFinal&&<Run21ScoreCelebration userId={userId} receipt={celebration} onRetire={retire}/>}</div>;
}

