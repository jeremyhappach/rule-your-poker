import {ChessHistoryButton} from '@/components/chess/ChessHistory';
import {ChessTurn} from '@/components/delayed/ChessTurn';
import {GameplaySoundButton} from '@/components/GameplaySoundButton';
import {PlayingNow} from '@/components/delayed/PlayingNow';
import {AsyncSessionName} from '@/components/delayed/AsyncSessionName';
import {RealMoneyWarningDialog} from '@/components/RealMoneyWarningDialog';
import {AsyncGameHeader} from '@/components/delayed/AsyncGameHeader';
import {MatchInfo} from '@/components/delayed/MatchInfo';
import {isReviewedGame,orderedLobbyGames,lobbyGameGroup,matchLobbyStatus,localInvitationTime,matchGameMix} from '@/lib/delayed/lobbyPresentation';
import {AsyncTurnEntry} from '@/components/delayed/AsyncTurnEntry';
import {turnEntryHint} from '@/lib/delayed/notifications';
import {AsyncInvite} from '@/components/delayed/AsyncInvite';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useLocation,useNavigate,useParams,useSearchParams} from 'react-router-dom';
import {Clock} from 'lucide-react';
import {money,turnTime,mayViewFinale,needsChildReview} from '@/lib/delayed/reviews';
import {AsyncTurnStage} from '@/components/delayed/AsyncTurnStage';
import {ReviewGate,ChildResults,MatchFinale} from '@/components/delayed/ResultReview';
import {useAuthGuard} from '@/hooks/useAuthGuard';
import {supabase} from '@/integrations/supabase/client';
import {delayedRpc,gameName,signed,type Home} from '@/lib/delayed/client';
import {NotificationBell} from '@/components/delayed/NotificationBell';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import {WordsTurn} from '@/components/delayed/WordsTurn';
import '@/lib/delayed/delayed.css';
import '@/components/delayed/matchLobby.css';

export default function Delayed(){
 const {user,isReady}=useAuthGuard({pageLabel:'Delayed matches'}),{matchId,childId}=useParams(),[query]=useSearchParams();
 if(!isReady||!user)return <AsyncTurnEntry/>;
 if(childId&&matchId)return <ChildTurn key={childId} childId={childId} matchId={matchId} userId={user.id}/>;
 if(matchId&&query.has('review'))return <ChildResults key={matchId+':'+query.get('review')} childId={query.get('review')!} matchId={matchId} userId={user.id}/>;
 if(matchId&&query.has('finale'))return <MatchFinale key={user.id+':'+matchId} matchId={matchId} userId={user.id}/>;
 return <main className="delayed-page delayed-match-page"><header><Link to="/">Lobby</Link><h1>Async Matches</h1><GameplaySoundButton/><NotificationBell/></header>
  {matchId==='new'?<AsyncInvite key={user.id+':'+(query.get('runback')??'new')+':'+(query.get('draft')??'')} userId={user.id}/>:matchId?<MatchHome key={user.id+':'+matchId+':'+query.has('history')} id={matchId} userId={user.id}/>:<MatchList userId={user.id}/>}</main>;
}
function useUpdates(userId:string,refresh:()=>void,enabled=true){
 useEffect(()=>{if(!enabled)return;const channel=supabase.channel('delayed-home:'+userId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},()=>{refresh();})
  .subscribe(status=>{if(status==='SUBSCRIBED')refresh();});const focus=()=>{if(!document.hidden)refresh();};
  window.addEventListener('online',focus);document.addEventListener('visibilitychange',focus);
  return()=>{void supabase.removeChannel(channel);window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',focus);};
 },[userId,refresh,enabled]);
}
function MatchList({userId}:{userId:string}){
 const [rows,setRows]=useState<Home[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const [older,setOlder]=useState(true),[loadingOlder,setLoadingOlder]=useState(false);
 const [clock,setClock]=useState({serverAt:0,receivedAt:0}),[,refreshClock]=useState(0);
 const epoch=useRef(0);
 const refresh=useCallback(()=>{const generation=++epoch.current;void delayedRpc<Home[]>('delayed_list').then(v=>{
  if(generation!==epoch.current)return;
  setClock({serverAt:v[0]?.serverAt??Date.now(),receivedAt:performance.now()});setRows(v);setLoaded(true);setError('');
 }).catch(e=>{if(generation===epoch.current)setError(e.message);});},[]);
 useEffect(()=>{refresh();return()=>{epoch.current++;};},[refresh]);useUpdates(userId,refresh);
 const now=clock.serverAt+performance.now()-clock.receivedAt;
 const matches=rows.map(row=>matchLobbyStatus(row,userId,now))
  .filter(({home,results})=>home.status!=='settled'||results>0)
  .sort((a,b)=>Number(b.actionable)-Number(a.actionable));
 const nextDeadline=Math.min(...matches.map(match=>match.nextDeadline));
 useEffect(()=>{
  if(!Number.isFinite(nextDeadline))return;
  const timer=setTimeout(()=>refreshClock(value=>value+1),
   Math.max(0,Math.ceil(nextDeadline-clock.serverAt-performance.now()+clock.receivedAt)));
  return()=>clearTimeout(timer);
 },[clock,nextDeadline]);
 return <><Link className="delayed-primary" to="/delayed/new">New Async Match</Link>
  {error&&<p role="alert">{error} <button onClick={refresh}>Retry</button></p>}{!loaded&&!error&&<p role="status">Loading matches…</p>}
  {loaded&&!matches.length&&<p>No active async matches.</p>}
  <ul className="delayed-lineup">{matches.map(({home:row,opponent,own,other,results,invitation,accepts,actionable})=><li key={row.id} data-turn={actionable?'own':'opponent'}>
   <Link className="delayed-card-link" to={'/delayed/'+row.id}><strong><AsyncSessionName realMoney={row.realMoney}>vs. {opponent}</AsyncSessionName></strong>{!invitation&&<> <time>{new Date(row.acceptedAt??row.createdAt).toLocaleString()}</time></>}</Link>
   <p>{!invitation&&<>{row.status} · </>}{row.completed}/{row.lineup.length} complete · {row.realMoney?'Real money':'Play money'}</p>
   <p className="delayed-game-mix" aria-label="Match game mix">{matchGameMix(row.lineup)}</p>
   {invitation?<strong>Invited <time dateTime={row.createdAt}>{localInvitationTime(row.createdAt)}</time> - Pending {accepts?'Your':opponent+'’s'} Acceptance</strong>:
    row.status==='active'&&(row.held?<strong>On hold</strong>:<strong>Turns - You: {own}, {opponent}: {other}</strong>)}
   {results>0&&<p><strong>{results} {results===1?'result':'results'} to view</strong></p>}
   {row.acceptedAt&&<p>Current Net: {money(row.net)}</p>}</li>)}</ul>
  {rows.length>=30&&older&&<button disabled={loadingOlder} onClick={()=>{const last=rows.at(-1)!;setLoadingOlder(true);
   void delayedRpc<Home[]>('delayed_list',{p_before:last.createdAt,p_before_id:last.id}).then(v=>{
    setRows(old=>[...old,...v.filter(item=>!old.some(existing=>existing.id===item.id))]);setOlder(v.length===30);
   }).catch(e=>setError(e.message)).finally(()=>setLoadingOlder(false));}}>Load older matches</button>}<Link to="/?sessions=completed">Archived / Completed Sessions</Link></>;
}
function MatchHome({id,userId}:{id:string;userId:string}){
 const navigate=useNavigate();
 const notificationEvent=useLocation().state?.asyncPushEventId;
 const [query]=useSearchParams(),historical=query.has('history');
 const [home,setHome]=useState<Home|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[tick,setTick]=useState(Date.now());
 const [confirmOffer,setConfirmOffer]=useState<string|null>(null);
 const [expandedGame,setExpandedGame]=useState<string|null>(null);
 const offset=useRef(0),epoch=useRef(0),busy=useRef(false),request=useRef<{action:string;offerHash:string;id:string}|null>(null);
 const refresh=useCallback(()=>{const generation=++epoch.current;return delayedRpc<Home>(historical?'delayed_history_detail':'delayed_home',{p_match:id}).then(value=>{
  if(generation!==epoch.current)return;offset.current=value.serverAt-Date.now();setHome(old=>old&&old.revision>value.revision?old:value);setError('');
 }).catch(e=>{if(generation!==epoch.current)return;if(e.message==='delayed:invitation_cancelled'){navigate('/delayed',{replace:true});return;}setError(e.message);});},[id,historical,navigate]);
 useEffect(()=>{refresh();return()=>{epoch.current++;};},[refresh,notificationEvent]);useUpdates(userId,refresh);
 useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
 async function respond(action:string,confirmedOffer?:string){
  if(!home||busy.current||historical||home.status!=='invited')return;
  if(action==='accept'&&home.realMoney&&confirmedOffer!==home.offerHash)return;
  busy.current=true;setPending(true);setConfirmOffer(null);setError('');
  if(request.current?.action!==action||request.current?.offerHash!==home.offerHash)request.current={action,offerHash:home.offerHash,id:crypto.randomUUID()};
  try{const response=await delayedRpc<{deleted?:boolean}>('delayed_respond',{p_match:id,p_request:request.current.id,p_offer_hash:home.offerHash,p_action:action});if(response?.deleted){navigate('/delayed',{replace:true});return;}await refresh();}
  catch(e){setError(e instanceof Error?e.message:'Unable to respond.');}finally{busy.current=false;setPending(false);}}
 if(!home)return <p role={error?'alert':'status'}>{error||'Loading match…'}</p>;
 if(home.removedAt&&!historical)return <section className="delayed-match-home"><Link to="/delayed">← All matches</Link><h2>Match deleted</h2><p>The creator removed this play-money match for both players. Its history has been retained.</p></section>;
 const now=Math.max(home.serverAt,tick+offset.current);
 return <section className="delayed-match-home"><Link className="delayed-back" to="/delayed">← All matches</Link>
  <MatchInfo home={home} userId={userId} historical={historical}/>
  {mayViewFinale(home)?<Link className="delayed-primary" to={'/delayed/'+id+'?finale=1'}>{home.finaleViewed?'Replay match finale':'View match results'}</Link>:home.receipt&&!home.removedAt&&<p role="status">View the remaining game results below before the match finale.</p>}
  {home.held&&<p role="status">This match is on hold while a platform incident is reviewed.</p>}
  {error&&<p role="alert">{error} <button onClick={refresh}>Refresh</button></p>}
  <ul className="delayed-lineup" aria-label="Match games">{orderedLobbyGames(home,userId,now).map(c=>{const ours=c.actor===userId,remaining=Date.parse(c.expiresAt??'')-now;
   const reviewed=isReviewedGame(c,userId),expanded=expandedGame===c.id,panelId='completed-game-'+c.id;
   const scores=home.acceptedAt&&c.scores&&<div className="delayed-scoreboard" aria-label="Game scores">{home.players.map(p=><div key={p.id}><span>{p.name}{c.game!=='ptown-words'&&<small>{c.progress?.[p.id]??(c.terminal?'Complete':'')}</small>}</span><div className="async-score-value"><strong data-pending={c.scores?.[p.id]===null||undefined}>{c.scores?.[p.id]===null?'—':c.scores?.[p.id]?.toLocaleString()??'—'}</strong>{!!c.pendingResults?.[p.id]&&<em className="async-pending">Pending</em>}</div></div>)}</div>;
   return <li className="delayed-game-card" data-group={lobbyGameGroup(c,home,userId,now)} data-completed={reviewed||undefined} data-unviewed={needsChildReview(c,userId)||undefined} key={c.id}>
    {reviewed?<><AsyncGameHeader game={c.game} name={gameName(c.game)} disclosure={{expanded,controls:panelId,onToggle:()=>setExpandedGame(old=>old===c.id?null:c.id),summary:
     <span className={'async-completed-outcome '+(c.result&&c.result.delta>0?'delayed-win':c.result&&c.result.delta<0?'delayed-loss':'')}>
      {c.result?<>{c.result.delta>0?'W':c.result.delta<0?'L':'T'} {money(Math.abs(c.result.delta)).replace('+','')}</>:'Result unavailable'}
     </span>}}/>
     <div id={panelId} hidden={!expanded} className="async-completed-details">{scores}{c.game==='chess'&&<ChessHistoryButton mode="async" matchId={id} id={c.id}/>} {c.result?.reason==='timeout_forfeit'&&<p>Forfeit</p>}</div>
    </>:<><AsyncGameHeader game={c.game} name={gameName(c.game)} stake={c.stake}/>
    {scores}
    {needsChildReview(c,userId)&&!home.removedAt&&<Link to={'/delayed/'+id+'?review='+c.id}>View Results</Link>}
    {c.result?<p className={c.result.delta>0?'delayed-win':c.result.delta<0?'delayed-loss':''}><strong>{c.result.delta>0?'W':c.result.delta<0?'L':'T'}{c.result.reason==='timeout_forfeit'?' · Forfeit':''}</strong> · {money(c.result.delta)}</p>:c.terminal?null:
     home.status==='active'?<div className="delayed-turn-status" data-turn={!home.held&&remaining>0?(ours?'own':'opponent'):undefined}><p><strong>{home.held?'On hold':remaining<=0?'Deadline reached — awaiting server result':ours?'Your turn'+(now>=Date.parse(c.lastCallAt??'')?' · Last Call':''):"Opponent’s turn"}</strong>{!ours&&<PlayingNow matchId={id} childId={c.id} actor={c.actor} deadline={Date.parse(c.expiresAt??'')} enabled={!historical&&!home.held&&!home.removedAt&&remaining>0} refresh={refresh}/>}</p>
      <time><Clock size={15}/>{turnTime(c.expiresAt,now)}</time>
      {!ours&&c.game==='ptown-words'&&c.bagCount!==undefined&&<small>{c.bagCount} letters left in the bag</small>}
      {ours&&!home.held&&remaining>0&&<Link className="delayed-primary" state={turnEntryHint(home,c.id,userId)} to={'/delayed/'+id+'/play/'+c.id}>{c.startedAt?'Resume turn':'Take Turn'}</Link>}
      {!ours&&(c.game==='ptown-words'||c.game==='chess')&&!home.held&&<Link className="delayed-view-board" state={turnEntryHint(home,c.id,userId)} to={'/delayed/'+id+'/play/'+c.id}>View board</Link>}</div>:<p>Waiting for acceptance</p>}</>}
   </li>;})}</ul>
  {!historical&&home.status==='invited'&&<section className="delayed-accept-card" aria-label="Invitation response"><h3>{home.opponent===userId?'Ready to play?':'Invitation sent'}</h3>
   <p>The first player in each game is selected randomly.</p>
   <p>{home.opponent===userId?'Accept the lineup and stakes shown above to begin.':'Waiting for your opponent to accept this lineup and its stakes.'}</p><p className="delayed-match-policy">Expires {new Date(home.invitationExpiresAt).toLocaleString()}.</p>
   {home.opponent===userId?<div className="delayed-actions"><button className="delayed-primary" disabled={pending} onClick={()=>home.realMoney?setConfirmOffer(home.offerHash):void respond('accept')}>{pending?'Working…':'Accept lineup and stakes'}</button><button className="delayed-secondary" disabled={pending} onClick={()=>void respond('decline')}>Decline</button></div>:
    <button className="delayed-secondary" disabled={pending} onClick={()=>void respond('cancel')}>Cancel invitation</button>}</section>}
  <RealMoneyWarningDialog open={!historical&&home.status==='invited'&&home.opponent===userId&&home.realMoney&&confirmOffer===home.offerHash&&!pending} onCancel={()=>setConfirmOffer(null)} onConfirm={()=>void respond('accept',confirmOffer??undefined)}>
   <p><AsyncSessionName realMoney={home.realMoney}>{home.players.map(p=>p.name).join(' vs. ')}</AsyncSessionName></p>
   <p>{home.lineup.length} {home.lineup.length===1?'game':'games'} · Maximum loss per player: <strong>${home.exposure}</strong>. Per-game stakes are shown in the invitation.</p>
   <p>No funds are reserved. One net amount is posted to both players’ actual balances after all games finish.</p>
   <p>Last Call is at 24 hours. Missing a 36-hour turn deadline forfeits that game and its stake; other games continue.</p>
  </RealMoneyWarningDialog>
  {!historical&&!home.realMoney&&home.organizer===userId&&<RemoveMatch id={id} refresh={refresh}/>}
  {home.receipt&&home.realMoney&&<p>Balances have been settled</p>}</section>;
}
function RemoveMatch({id,refresh}:{id:string;refresh:()=>void}){
 const [confirm,setConfirm]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');const request=useRef<string|null>(null);
 async function remove(){if(pending)return;setPending(true);setError('');request.current??=crypto.randomUUID();try{await delayedRpc('delayed_remove',{p_match:id,p_request:request.current});refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to delete match.');}finally{setPending(false);}}
 return <section className="delayed-accept-card" aria-label="Delete play-money match">{confirm?<><h3>Delete this match for both players?</h3><p>This ends unfinished play and removes the match from both players’ lists. It does not create a payout or undo a completed result. History is retained.</p><div className="delayed-actions"><button className="delayed-secondary" disabled={pending} onClick={()=>setConfirm(false)}>Keep match</button><button className="delayed-danger" disabled={pending} onClick={()=>void remove()}>{pending?'Deleting…':'Delete for both players'}</button></div></>:<button className="delayed-secondary" onClick={()=>setConfirm(true)}>Delete play-money match</button>}{error&&<p role="alert">{error}</p>}</section>;
}

function ChildTurn({childId,matchId,userId}:{childId:string;matchId:string;userId:string}){
 const [home,setHome]=useState<Home|null>(null),[error,setError]=useState('');const navigate=useNavigate();
 const epoch=useRef(0);
 const refresh=useCallback(()=>{const generation=++epoch.current;void delayedRpc<Home>('delayed_home',{p_match:matchId}).then(v=>{if(generation!==epoch.current)return;if(v.removedAt){navigate('/delayed/'+matchId,{replace:true});return;}setHome(old=>old&&old.revision>v.revision?old:v);}).catch(e=>{if(generation===epoch.current)setError(e.message);});},[matchId,navigate]);
 useEffect(()=>{refresh();return()=>{epoch.current++;};},[refresh]);
 const child=home?.lineup.find(c=>c.id===childId);
 useUpdates(userId,refresh,child?.game!=='ptown-words');
 if(!child)return error?<AsyncTurnStage matchId={matchId} title={error}/>:<AsyncTurnEntry/>;
 return child.game==='chess'?<ChessTurn childId={childId} matchId={matchId} userId={userId}/>:child.game==='ptown-words'?<WordsTurn key={userId+':'+childId} childId={childId} matchId={matchId} userId={userId} sessionName={home!.players.map(p=>p.name).join(' vs. ')} realMoney={home!.realMoney}/>:<ReviewGate home={home!} childId={childId} matchId={matchId} userId={userId}>{()=> <DelayedTurn childId={childId} matchId={matchId} userId={userId} players={home!.players} realMoney={home!.realMoney} autoStart/>}</ReviewGate>;
}
