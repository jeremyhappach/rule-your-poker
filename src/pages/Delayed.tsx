import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {useAuthGuard} from '@/hooks/useAuthGuard';
import {supabase} from '@/integrations/supabase/client';
import {delayedRpc,gameName,signed,type Home} from '@/lib/delayed/client';
import {NotificationBell} from '@/components/delayed/NotificationBell';
import {WordsTurn} from '@/components/delayed/WordsTurn';
import '@/lib/delayed/delayed.css';

export default function Delayed(){
 const {user,isReady}=useAuthGuard({pageLabel:'Delayed matches'}),{matchId,childId}=useParams();
 if(!isReady||!user)return <main className="delayed-page"><p role="status">Connecting…</p></main>;
 if(childId&&matchId)return <WordsTurn key={childId} childId={childId} matchId={matchId} userId={user.id}/>;
 return <main className="delayed-page"><header><Link to="/">Lobby</Link><h1>Async Words</h1><NotificationBell/></header>
  {matchId==='new'?<Builder/>:matchId?<MatchHome key={matchId} id={matchId} userId={user.id}/>:<MatchList userId={user.id}/>}</main>;
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
  <ul className="delayed-lineup">{rows.map(row=><li key={row.id}><Link to={'/delayed/'+row.id}><strong>vs. {row.players.find(p=>p.id!==userId)?.name}</strong></Link>
   <p>{row.status} · {row.completed}/{row.lineup.length} complete · {row.realMoney?'Real money':'Play money'}</p>
   <p>{row.receipt?'Final':'Provisional'}: {signed(row.net)}</p></li>)}</ul>
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
 const now=tick+offset.current,playable=home.lineup.filter(c=>!c.terminal&&c.actor===userId&&Date.parse(c.expiresAt??'')>now);
 return <><Link to="/delayed">All matches</Link><h2>{home.players.map(p=>p.name).join(' vs. ')}</h2>
  <p>{home.realMoney?'Real money':'Play money'} · {home.status} · {home.completed}/{home.lineup.length} complete</p>
  <p className="delayed-net">{home.receipt?'Final net':'Provisional match-to-date'}: <strong>{signed(home.net)}</strong></p>
  {!home.receipt&&<p>Play-money results settle once this game finishes. Real account balances are unaffected.</p>}
  <p>Maximum loss per player: {home.exposure}. Each turn has 36 hours; Last Call starts after 24 hours. A missed deadline forfeits that game only.</p>
  {home.held&&<p role="status">This match is on hold while a platform incident is reviewed.</p>}
  {home.status==='invited'&&<section><p>Invitation expires {new Date(home.invitationExpiresAt).toLocaleString()}.</p>
   {home.opponent===userId?<><button disabled={pending} onClick={()=>void respond('accept')}>Accept lineup and stakes</button><button disabled={pending} onClick={()=>void respond('decline')}>Decline</button></>:
    <button disabled={pending} onClick={()=>void respond('cancel')}>Cancel invitation</button>}</section>}
  {home.status==='active'&&!home.held&&playable.length>0&&<Link className="delayed-primary" to={'/delayed/'+id+'/play/'+playable[0].id}>Play turn</Link>}
  {error&&<p role="alert">{error} <button onClick={refresh}>Refresh</button></p>}
  <ol className="delayed-lineup">{home.lineup.map(c=>{const ours=c.actor===userId,remaining=Date.parse(c.expiresAt??'')-now;
   return <li key={c.id}><h3>{c.ordinal}. {gameName(c.game)} · Stake {c.stake}</h3>
    <p>Standard Words · ENABLE2K · Two humans</p>
    {c.scores&&<p>{home.players.map(p=>p.name+': '+(c.scores?.[p.id]??0)).join(' · ')}</p>}
    {c.result?<p><strong>{c.result.delta>0?'Won':c.result.delta<0?'Lost':'Draw'}{c.result.reason==='timeout_forfeit'?' by forfeit':''}</strong> · {signed(c.result.delta)}</p>:
     home.status==='active'?<><p>{home.held?'On hold':remaining<=0?'Deadline reached — awaiting server result':ours?'Your turn'+(now>=Date.parse(c.lastCallAt??'')?' · Last Call':''):"Opponent’s turn"}</p>
      <p>{remaining>0?Math.floor(Math.min(2160,Math.ceil(remaining/60000))/60)+'h '+Math.min(2160,Math.ceil(remaining/60000))%60+'m remaining':''}</p>
      {ours&&!home.held&&remaining>0&&<Link to={'/delayed/'+id+'/play/'+c.id}>{c.startedAt?'Resume turn':'Play turn'}</Link>}</>:<p>Waiting for acceptance</p>}</li>;})}</ol>
  {home.receipt&&<p>Settlement receipt: {home.receipt.match_id}. {home.net===0?'Net zero — no transfer.':'One net settlement recorded.'}</p>}</>;
}
function Builder(){
 const navigate=useNavigate(),[stake,setStake]=useState('5'),[review,setReview]=useState(false),[search,setSearch]=useState(''),[people,setPeople]=useState<{id:string;name:string}[]>([]),[opponent,setOpponent]=useState('');
 const [error,setError]=useState(''),[pending,setPending]=useState(false),[enabled,setEnabled]=useState(false);const request=useRef<string|null>(null),stakeEdited=useRef(false);
 useEffect(()=>{let alive=true;void delayedRpc<{enabled:boolean}>('delayed_capabilities').then(v=>{if(alive)setEnabled(v.enabled);}).catch(e=>{if(alive)setError(e.message);});void supabase.from('game_defaults').select('ante_amount').eq('game_type','ptown-words').maybeSingle().then(({data})=>{if(alive&&!stakeEdited.current)setStake(String(data?.ante_amount??5));});return()=>{alive=false;};},[]);
 async function invite(){if(pending||!opponent)return;setPending(true);setError('');request.current??=crypto.randomUUID();try{const id=await delayedRpc<string>('delayed_create',{p_request:request.current,p_opponent:opponent,p_real_money:false,p_lineup:[{game:'ptown-words',stake:Number(stake)}]});navigate('/delayed/'+id);}catch(e){setError(e instanceof Error?e.message:'Unable to invite.');}finally{setPending(false);}}
 return <><h2>Invite someone to Async Words</h2><p>One Words game · Two humans · Play money only</p>{!enabled&&<p role="status">New async matches are not available yet.</p>}
 <label>Stake<input type="number" min="1" max="9999" step="1" disabled={review||pending} value={stake} onChange={e=>{stakeEdited.current=true;setStake(e.target.value);}}/></label>
 <p>Maximum play-money loss per player: {stake}. No funds are reserved. Real account balances are unaffected.</p>
 <p>36 hours per turn. Last Call at hour 24. A missed turn forfeits this game at its agreed stake. No time banks, autoplay or player pauses. Invitations expire after 72 hours.</p>
 {!review?<button disabled={!enabled||!/^[1-9][0-9]{0,3}$/.test(stake)} onClick={()=>setReview(true)}>Review invitation</button>:<>
 <button disabled={pending} onClick={()=>{setReview(false);request.current=null;}}>Edit stake</button>
 <label>Find opponent<input value={search} maxLength={80} onChange={e=>setSearch(e.target.value)}/></label><button disabled={search.trim().length<2||pending} onClick={()=>{void delayedRpc<{id:string;name:string}[]>('delayed_opponents',{p_search:search}).then(setPeople).catch(e=>setError(e.message));}}>Search players</button>
 <label>Opponent<select aria-label="Opponent" value={opponent} disabled={pending} onChange={e=>{setOpponent(e.target.value);request.current=null;}}><option value="">Choose a player</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 <button disabled={!opponent||pending||!enabled} onClick={()=>void invite()}>{pending?'Sending…':'Send invitation'}</button></>}{error&&<p role="alert">{error}</p>}</>;
}
