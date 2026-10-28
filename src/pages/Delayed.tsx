import {Pencil,Filter,ArrowDownAZ,History} from 'lucide-react';
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
 return <main className={"delayed-page"+(matchId&&matchId!=="new"?" delayed-match-page":"")}><header><Link to="/">Lobby</Link><h1>Async Words</h1><NotificationBell/></header>
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
 const now=tick+offset.current;
 return <section className="delayed-match-home"><Link className="delayed-back" to="/delayed">← All matches</Link><div className="delayed-match-heading"><small>HEAD-TO-HEAD</small><h2>{home.players.map(p=>p.name).join(' vs. ')}</h2>
  <p className="delayed-match-meta">{home.realMoney?'Real money':'Play money'} · {home.status} · {home.completed}/{home.lineup.length} complete</p></div>
  {home.acceptedAt&&<p className="delayed-net">{home.receipt?'Final net':'Provisional match-to-date'}: <strong>{signed(home.net)}</strong></p>}
  <div className="delayed-match-facts"><span>Maximum loss <strong>{home.exposure}</strong> per player</span><span><strong>36h</strong> per turn · Last Call <strong>24h</strong></span></div>
  <p className="delayed-match-policy">A missed deadline forfeits this game only. {home.realMoney?'One net settlement after all games finish.':'Play money settles once at the end; real balances are unaffected.'}</p>
  {home.held&&<p role="status">This match is on hold while a platform incident is reviewed.</p>}
  {home.status==='invited'&&<section><p>Invitation expires {new Date(home.invitationExpiresAt).toLocaleString()}.</p>
   {home.opponent===userId?<><button disabled={pending} onClick={()=>void respond('accept')}>Accept lineup and stakes</button><button disabled={pending} onClick={()=>void respond('decline')}>Decline</button></>:
    <button disabled={pending} onClick={()=>void respond('cancel')}>Cancel invitation</button>}</section>}
  {error&&<p role="alert">{error} <button onClick={refresh}>Refresh</button></p>}
  <ol className="delayed-lineup">{home.lineup.map(c=>{const ours=c.actor===userId,remaining=Date.parse(c.expiresAt??'')-now;
   return <li className="delayed-game-card" key={c.id}><div className="delayed-game-heading"><h3>{c.ordinal}. {gameName(c.game)}</h3><span>Stake <strong>{c.stake}</strong></span></div>
    {home.acceptedAt&&c.scores&&<div className="delayed-scoreboard" aria-label="Game scores">{home.players.map(p=><div key={p.id}><span>{p.id===userId?'You':p.name}</span><strong>{c.scores?.[p.id]??0}</strong></div>)}</div>}
    {c.result?<p><strong>{c.result.delta>0?'Won':c.result.delta<0?'Lost':'Draw'}{c.result.reason==='timeout_forfeit'?' by forfeit':''}</strong> · {signed(c.result.delta)}</p>:
     home.status==='active'?<div className="delayed-turn-status" data-turn={!home.held&&remaining>0?(ours?'own':'opponent'):undefined}><p><strong>{home.held?'On hold':remaining<=0?'Deadline reached — awaiting server result':ours?'Your turn'+(now>=Date.parse(c.lastCallAt??'')?' · Last Call':''):"Opponent’s turn"}</strong></p>
      <p>{remaining>0?Math.floor(Math.min(2160,Math.ceil(remaining/60000))/60)+'h '+Math.min(2160,Math.ceil(remaining/60000))%60+'m remaining':''}</p>
      {ours&&!home.held&&remaining>0&&<Link className="delayed-primary" to={'/delayed/'+id+'/play/'+c.id}>{c.startedAt?'Resume turn':'Play turn'}</Link>}</div>:<p>Waiting for acceptance</p>}</li>;})}</ol>
  {home.receipt&&<p>Settlement receipt: {home.receipt.match_id}. {home.net===0?'Net zero — no transfer.':'One net settlement recorded.'}</p>}</section>;
}
function Builder(){
 const navigate=useNavigate(),[stake,setStake]=useState('5'),[review,setReview]=useState(false),[search,setSearch]=useState(''),[people,setPeople]=useState<{id:string;name:string}[]>([]),[opponent,setOpponent]=useState('');
 const [sort,setSort]=useState<'username'|'recent'>('username'),[cursor,setCursor]=useState<any>(null),[more,setMore]=useState(false),[loading,setLoading]=useState(false),filterEpoch=useRef(0);
 const [error,setError]=useState(''),[pending,setPending]=useState(false),[enabled,setEnabled]=useState(false);const request=useRef<string|null>(null),stakeEdited=useRef(false);
 useEffect(()=>{let alive=true;void delayedRpc<{enabled:boolean}>('delayed_capabilities').then(v=>{if(alive)setEnabled(v.enabled);}).catch(e=>{if(alive)setError(e.message);});void supabase.from('game_defaults').select('ante_amount').eq('game_type','ptown-words').maybeSingle().then(({data})=>{if(alive&&!stakeEdited.current)setStake(String(data?.ante_amount??5));});return()=>{alive=false;};},[]);
 const loadPeople=useCallback((after:any=null)=>{const epoch=++filterEpoch.current;setLoading(true);void delayedRpc<{items:{id:string;name:string}[];next:any;hasMore:boolean}>('delayed_opponent_page',{p_search:search,p_sort:sort,p_after:after}).then(v=>{if(epoch!==filterEpoch.current)return;setPeople(old=>after?[...old,...v.items.filter(p=>!old.some(o=>o.id===p.id))]:v.items);setCursor(v.next);setMore(v.hasMore);setError('');}).catch(e=>{if(epoch===filterEpoch.current)setError(e.message);}).finally(()=>{if(epoch===filterEpoch.current)setLoading(false);});},[search,sort]);
 useEffect(()=>{setPeople([]);setCursor(null);setMore(false);loadPeople();return()=>{filterEpoch.current++;};},[loadPeople]);
 async function invite(){if(pending||!opponent)return;setPending(true);setError('');request.current??=crypto.randomUUID();try{const id=await delayedRpc<string>('delayed_create',{p_request:request.current,p_opponent:opponent,p_real_money:false,p_lineup:[{game:'ptown-words',stake:Number(stake)}]});navigate('/delayed/'+id);}catch(e){setError(e instanceof Error?e.message:'Unable to invite.');}finally{setPending(false);}}
 return <section className="delayed-invite"><h2>Invite to Async Words</h2><p>Two humans · Play money · 36-hour turns</p>{!enabled&&<p role="status">New async matches are unavailable.</p>}
 <div className="delayed-stake"><label>Stake <input aria-label="Stake" type="number" min="1" max="9999" step="1" disabled={review||pending} value={stake} onChange={e=>{stakeEdited.current=true;request.current=null;setStake(e.target.value);}}/></label><button aria-label="Edit stake" disabled={pending} onClick={()=>{setReview(false);request.current=null;}}><Pencil size={17}/></button></div>
 <div className="delayed-filter"><input aria-label="Filter opponents" placeholder="Filter players" value={search} maxLength={80} onChange={e=>setSearch(e.target.value)}/><Filter size={18} aria-hidden="true"/><button aria-label={sort==='username'?'Sort by recent opponents':'Sort by username'} title={sort==='username'?'Username order':'Recent opponents'} onClick={()=>setSort(s=>s==='username'?'recent':'username')}>{sort==='username'?<ArrowDownAZ size={19}/>:<History size={19}/>}</button></div>
 <label>Opponent<select aria-label="Opponent" value={opponent} disabled={pending} onChange={e=>{setOpponent(e.target.value);request.current=null;}}><option value="">Choose a player</option>{opponent&&!people.some(p=>p.id===opponent)&&<option value={opponent}>Selected opponent (outside current filter)</option>}{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
 {loading&&<small role="status">Loading players…</small>}{more&&<button disabled={loading} onClick={()=>loadPeople(cursor)}>Load more players</button>}{!loading&&!people.length&&<small>No matching active players.</small>}{more&&<small>More active players are available. Load more or filter by username.</small>}
 <p className="delayed-terms">Stake {stake} per player; no funds reserved. Last Call at 24 hours; missed deadline forfeits this game. No player pauses. Invitation expires in 72 hours.</p>
 {!review?<button disabled={!opponent||!enabled||!/^[1-9][0-9]{0,3}$/.test(stake)} onClick={()=>setReview(true)}>Review invitation</button>:<><p>Ready to invite for a {stake} play-money stake.</p><button disabled={!opponent||pending||!enabled} onClick={()=>void invite()}>{pending?'Sending…':'Send invitation'}</button></>}{error&&<p role="alert">{error}</p>}</section>;
}
