import {AsyncInvite} from '@/components/delayed/AsyncInvite';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {useAuthGuard} from '@/hooks/useAuthGuard';
import {supabase} from '@/integrations/supabase/client';
import {delayedRpc,gameName,signed,type Home} from '@/lib/delayed/client';
import {NotificationBell} from '@/components/delayed/NotificationBell';
import {DelayedTurn} from '@/components/delayed/DelayedTurn';
import {WordsTurn} from '@/components/delayed/WordsTurn';
import '@/lib/delayed/delayed.css';

export default function Delayed(){
 const {user,isReady}=useAuthGuard({pageLabel:'Delayed matches'}),{matchId,childId}=useParams();
 if(!isReady||!user)return <main className="delayed-page"><p role="status">Connecting…</p></main>;
 if(childId&&matchId)return <ChildTurn key={childId} childId={childId} matchId={matchId} userId={user.id}/>;
 return <main className="delayed-page delayed-match-page"><header><Link to="/">Lobby</Link><h1>Async Matches</h1><NotificationBell/></header>
  {matchId==='new'?<AsyncInvite/>:matchId?<MatchHome key={matchId} id={matchId} userId={user.id}/>:<MatchList userId={user.id}/>}</main>;
}
function useUpdates(userId:string,refresh:()=>void){
 useEffect(()=>{const channel=supabase.channel('delayed-home:'+userId).on('postgres_changes',{event:'*',schema:'public',table:'delayed_match_updates',filter:'user_id=eq.'+userId},refresh)
  .subscribe(status=>{if(status==='SUBSCRIBED')refresh();});const focus=()=>{if(!document.hidden)refresh();};
  window.addEventListener('online',focus);document.addEventListener('visibilitychange',focus);
  return()=>{void supabase.removeChannel(channel);window.removeEventListener('online',focus);document.removeEventListener('visibilitychange',focus);};
 },[userId,refresh]);
}
function MatchList({userId}:{userId:string}){
 const [rows,setRows]=useState<Home[]>([]),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
 const [older,setOlder]=useState(true),[loadingOlder,setLoadingOlder]=useState(false);
 const refresh=useCallback(()=>{void delayedRpc<Home[]>('delayed_list').then(v=>{setRows(v);setLoaded(true);setError('');}).catch(e=>setError(e.message));},[]);
 useEffect(refresh,[refresh]);useUpdates(userId,refresh);
 return <><Link className="delayed-primary" to="/delayed/new">Set Up Asynchronous Match</Link>
  {error&&<p role="alert">{error}</p>}{!loaded&&!error&&<p role="status">Loading matches…</p>}
  {loaded&&rows.length===0&&<p>No delayed matches yet.</p>}
  <ul className="delayed-lineup">{rows.map(row=><li key={row.id} data-turn={row.status==='active'&&!row.held?(row.lineup.some(c=>!c.terminal&&c.actor===userId)?'own':'opponent'):undefined}><Link to={'/delayed/'+row.id}><strong>vs. {row.players.find(p=>p.id!==userId)?.name}</strong></Link>
   <p>{row.status} · {row.completed}/{row.lineup.length} complete · {row.realMoney?'Real money':'Play money'}</p>
   {row.status==='active'&&!row.held&&<strong>{row.lineup.some(c=>!c.terminal&&c.actor===userId)?'Your turn':(row.players.find(p=>p.id!==userId)?.name??'Opponent')+'’s turn'}</strong>}{row.acceptedAt&&<p>{row.receipt?'Final':'Provisional'}: {signed(row.net)}</p>}</li>)}</ul>
  {rows.length>=30&&older&&<button disabled={loadingOlder} onClick={()=>{const last=rows.at(-1)!;setLoadingOlder(true);
   void delayedRpc<Home[]>('delayed_list',{p_before:last.createdAt,p_before_id:last.id}).then(v=>{
    setRows(old=>[...old,...v.filter(item=>!old.some(existing=>existing.id===item.id))]);setOlder(v.length===30);
   }).catch(e=>setError(e.message)).finally(()=>setLoadingOlder(false));}}>Load older matches</button>}</>;
}
function MatchHome({id,userId}:{id:string;userId:string}){
 const [home,setHome]=useState<Home|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[tick,setTick]=useState(Date.now());
 const offset=useRef(0),epoch=useRef(0),request=useRef<{action:string;id:string}|null>(null);
 const refresh=useCallback(()=>{const generation=++epoch.current;void delayedRpc<Home>('delayed_home',{p_match:id}).then(value=>{
  if(generation!==epoch.current)return;offset.current=value.serverAt-Date.now();setHome(old=>old&&old.revision>value.revision?old:value);setError('');
 }).catch(e=>{if(generation===epoch.current)setError(e.message);});},[id]);
 useEffect(()=>{refresh();return()=>{epoch.current++;};},[refresh]);useUpdates(userId,refresh);
 useEffect(()=>{const timer=setInterval(()=>setTick(Date.now()),1000);return()=>clearInterval(timer);},[]);
 async function respond(action:string){if(!home||pending)return;setPending(true);setError('');
  if(request.current?.action!==action)request.current={action,id:crypto.randomUUID()};
  try{await delayedRpc('delayed_respond',{p_match:id,p_request:request.current.id,p_offer_hash:home.offerHash,p_action:action});request.current=null;refresh();}
  catch(e){setError(e instanceof Error?e.message:'Unable to respond.');}finally{setPending(false);}}
 if(!home)return <p role={error?'alert':'status'}>{error||'Loading match…'}</p>;
 if(home.removedAt)return <section className="delayed-match-home"><Link to="/delayed">← All matches</Link><h2>Match deleted</h2><p>The creator removed this play-money match for both players. Its history has been retained.</p></section>;
 const now=tick+offset.current;
 return <section className="delayed-match-home"><Link className="delayed-back" to="/delayed">← All matches</Link><div className="delayed-match-heading"><small>{home.status==='invited'?'MATCH INVITATION':'HEAD-TO-HEAD'}</small><h2>{home.players.map(p=>p.name).join(' vs. ')}</h2>
  <p className="delayed-match-meta">{home.realMoney?'Real money':'Play money'} · {home.status} · {home.completed}/{home.lineup.length} complete</p></div>
  {home.acceptedAt&&<p className="delayed-net">{home.receipt?'Final net':'Provisional match-to-date'}: <strong>{signed(home.net)}</strong></p>}
  <div className="delayed-match-facts"><span>Maximum loss <strong>{home.exposure}</strong> per player</span><span><strong>36h</strong> per turn · Last Call <strong>24h</strong></span></div>
  <p className="delayed-match-policy">A missed deadline forfeits this game only. {home.realMoney?'One net settlement after all games finish.':'Play money settles once at the end; real balances are unaffected.'}</p>
  {home.held&&<p role="status">This match is on hold while a platform incident is reviewed.</p>}
  {error&&<p role="alert">{error} <button onClick={refresh}>Refresh</button></p>}
  <ol className="delayed-lineup">{home.lineup.map(c=>{const ours=c.actor===userId,remaining=Date.parse(c.expiresAt??'')-now;
   return <li className="delayed-game-card" key={c.id}><div className="delayed-game-heading"><h3>{c.ordinal}. {gameName(c.game)}</h3><span>Stake <strong>{c.stake}</strong></span></div>
    {home.acceptedAt&&c.scores&&<div className="delayed-scoreboard" aria-label="Game scores">{home.players.map(p=><div key={p.id}><span>{p.id===userId?'You':p.name}</span><strong>{c.scores?.[p.id]??0}</strong></div>)}</div>}
    {c.result?<p><strong>{c.result.delta>0?'Won':c.result.delta<0?'Lost':'Draw'}{c.result.reason==='timeout_forfeit'?' by forfeit':''}</strong> · {signed(c.result.delta)}</p>:
     home.status==='active'?<div className="delayed-turn-status" data-turn={!home.held&&remaining>0?(ours?'own':'opponent'):undefined}><p><strong>{home.held?'On hold':remaining<=0?'Deadline reached — awaiting server result':ours?'Your turn'+(now>=Date.parse(c.lastCallAt??'')?' · Last Call':''):"Opponent’s turn"}</strong></p>
      <p>{remaining>0?Math.floor(Math.min(2160,Math.ceil(remaining/60000))/60)+'h '+Math.min(2160,Math.ceil(remaining/60000))%60+'m remaining':''}</p>
      {ours&&!home.held&&remaining>0&&<Link className="delayed-primary" to={'/delayed/'+id+'/play/'+c.id}>{c.startedAt?'Resume turn':'Play turn'}</Link>}</div>:<p>Waiting for acceptance</p>}</li>;})}</ol>
  {home.status==='invited'&&<section className="delayed-accept-card" aria-label="Invitation response"><h3>{home.opponent===userId?'Ready to play?':'Invitation sent'}</h3>
   <p>{home.opponent===userId?'Accept the lineup and stakes shown above to begin.':'Waiting for your opponent to accept this lineup and its stakes.'}</p><p className="delayed-match-policy">Expires {new Date(home.invitationExpiresAt).toLocaleString()}.</p>
   {home.opponent===userId?<div className="delayed-actions"><button className="delayed-primary" disabled={pending} onClick={()=>void respond('accept')}>{pending?'Working…':'Accept lineup and stakes'}</button><button className="delayed-secondary" disabled={pending} onClick={()=>void respond('decline')}>Decline</button></div>:
    <button className="delayed-secondary" disabled={pending} onClick={()=>void respond('cancel')}>Cancel invitation</button>}</section>}
  {!home.realMoney&&home.organizer===userId&&<RemoveMatch id={id} refresh={refresh}/>}
  {home.receipt&&<p>Settlement receipt: {home.receipt.match_id}. {home.net===0?'Net zero — no transfer.':'One net settlement recorded.'}</p>}</section>;
}
function RemoveMatch({id,refresh}:{id:string;refresh:()=>void}){
 const [confirm,setConfirm]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');const request=useRef<string|null>(null);
 async function remove(){if(pending)return;setPending(true);setError('');request.current??=crypto.randomUUID();try{await delayedRpc('delayed_remove',{p_match:id,p_request:request.current});refresh();}catch(e){setError(e instanceof Error?e.message:'Unable to delete match.');}finally{setPending(false);}}
 return <section className="delayed-accept-card" aria-label="Delete play-money match">{confirm?<><h3>Delete this match for both players?</h3><p>This ends unfinished play and removes the match from both players’ lists. It does not create a payout or undo a completed result. History is retained.</p><div className="delayed-actions"><button className="delayed-secondary" disabled={pending} onClick={()=>setConfirm(false)}>Keep match</button><button className="delayed-danger" disabled={pending} onClick={()=>void remove()}>{pending?'Deleting…':'Delete for both players'}</button></div></>:<button className="delayed-secondary" onClick={()=>setConfirm(true)}>Delete play-money match</button>}{error&&<p role="alert">{error}</p>}</section>;
}

function ChildTurn({childId,matchId,userId}:{childId:string;matchId:string;userId:string}){
 const [home,setHome]=useState<Home|null>(null),[error,setError]=useState('');const navigate=useNavigate();
 const refresh=useCallback(()=>{void delayedRpc<Home>('delayed_home',{p_match:matchId}).then(v=>{if(v.removedAt){navigate('/delayed/'+matchId,{replace:true});return;}setHome(v);}).catch(e=>setError(e.message));},[matchId,navigate]);
 useEffect(refresh,[refresh]);useUpdates(userId,refresh);
 const child=home?.lineup.find(c=>c.id===childId);
 if(!child)return <main className="delayed-page"><Link to={'/delayed/'+matchId}>Match Home</Link><p role={error?'alert':'status'}>{error||'Restoring turn…'}</p></main>;
 return child.game==='ptown-words'?<WordsTurn childId={childId} matchId={matchId} userId={userId}/>:<DelayedTurn childId={childId} matchId={matchId} userId={userId}/>;
}
