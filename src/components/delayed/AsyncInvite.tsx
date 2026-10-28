import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {ArrowDownAZ,History} from 'lucide-react';
import {delayedRpc,gameName} from '@/lib/delayed/client';
type Entry={key:string;game:string;stake:string};
type Person={id:string;name:string;isHuman:boolean};
export function AsyncInvite(){
 const navigate=useNavigate(),[lineup,setLineup]=useState<Entry[]>([{key:crypto.randomUUID(),game:'ptown-words',stake:'5'}]);
 const [games,setGames]=useState<string[]>([]),[maxChildren,setMaxChildren]=useState(1),[enabled,setEnabled]=useState(false);
 const [review,setReview]=useState(false),[search,setSearch]=useState(''),[sort,setSort]=useState<'username'|'recent'>('username');
 const [people,setPeople]=useState<Person[]>([]),[opponent,setOpponent]=useState<Person|null>(null),[cursor,setCursor]=useState<unknown>(null),[more,setMore]=useState(false);
 const [loading,setLoading]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const edited=useRef(false),request=useRef<string|null>(null),epoch=useRef(0),defaults=useRef<Record<string,string>>({});
 const stake=lineup.reduce((sum,c)=>sum+(Number(c.stake)||0),0);
 const valid=lineup.length>0&&lineup.length<=maxChildren&&lineup.every(c=>games.includes(c.game)&&/^[1-9][0-9]{0,3}$/.test(c.stake));
 useEffect(()=>{let alive=true;void delayedRpc<{enabled:boolean;games:{id:string;stake?:number}[];max_children:number}>('delayed_capabilities').then(v=>{
  if(!alive)return;setEnabled(v.enabled);setGames(v.games.map(g=>g.id));setMaxChildren(v.max_children);
  defaults.current=Object.fromEntries(v.games.map(g=>[g.id,String(g.stake??5)]));if(!edited.current)setLineup(old=>old.map(c=>({...c,stake:defaults.current[c.game]??c.stake})));
 }).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[]);
 const loadPeople=useCallback((after:unknown=null)=>{const generation=++epoch.current;setLoading(true);
  void delayedRpc<{items:Person[];next:unknown;hasMore:boolean}>('delayed_opponent_page',{p_search:search,p_sort:sort,p_after:after}).then(v=>{
   if(generation!==epoch.current)return;const humans=v.items.filter(p=>p.isHuman===true);
   setPeople(old=>after?[...old,...humans.filter(p=>!old.some(o=>o.id===p.id))]:humans);setCursor(v.next);setMore(v.hasMore);setError('');
  }).catch(e=>{if(generation===epoch.current)setError(e.message);}).finally(()=>{if(generation===epoch.current)setLoading(false);});
 },[search,sort]);
 useEffect(()=>{setPeople([]);setCursor(null);setMore(false);loadPeople();return()=>{epoch.current++;};},[loadPeople]);
 function change(key:string,patch:Partial<Entry>){edited.current=true;request.current=null;setLineup(old=>old.map(c=>c.key===key?{...c,...patch}:c));}
 async function invite(){if(pending||!opponent||!valid)return;setPending(true);setError('');request.current??=crypto.randomUUID();
  try{const id=await delayedRpc<string>('delayed_create',{p_request:request.current,p_opponent:opponent.id,p_real_money:false,p_lineup:lineup.map(({game,stake})=>({game,stake:Number(stake)}))});navigate('/delayed/'+id);}
  catch(e){setError(e instanceof Error?e.message:'Unable to invite.');}finally{setPending(false);}}
 return <section className="delayed-invite"><Link className="delayed-back" to="/delayed">← All matches</Link>
  <div className="delayed-match-heading"><small>PLAY ON YOUR SCHEDULE</small><h2>{review?'Review your invitation':'Create a challenge'}</h2><p className="delayed-match-meta">Two humans · Play money · 36-hour turns</p></div>
  {!enabled&&<p role="status">New async matches are unavailable.</p>}
  <fieldset className="delayed-form-card" disabled={pending||review}><legend>Your lineup</legend><p>Every game has its own stake. Play any available turn after acceptance.</p>
   {lineup.map((c,index)=><div className="delayed-builder-child" key={c.key}>
    <label>Game {index+1}<select aria-label={'Game '+(index+1)} value={c.game} onChange={e=>change(c.key,{game:e.target.value,stake:defaults.current[e.target.value]??'5'})}>{games.map(g=><option key={g} value={g}>{gameName(g)}</option>)}</select></label>
    <label>Stake<input aria-label={'Stake '+(index+1)} type="number" min="1" max="9999" step="1" value={c.stake} onChange={e=>change(c.key,{stake:e.target.value})}/></label>
    <div className="delayed-actions"><button disabled={index===0||pending||review} aria-label={'Move game '+(index+1)+' up'} onClick={()=>{request.current=null;setLineup(old=>{const copy=[...old];[copy[index-1],copy[index]]=[copy[index],copy[index-1]];return copy;});}}>Move up</button>
     <button disabled={lineup.length===1||pending||review} aria-label={'Remove game '+(index+1)} onClick={()=>{request.current=null;setLineup(old=>old.filter(v=>v.key!==c.key));}}>Remove</button></div></div>)}
   <button disabled={lineup.length>=maxChildren||!games.length||pending||review} onClick={()=>{request.current=null;setLineup(old=>[...old,{key:crypto.randomUUID(),game:games[0],stake:defaults.current[games[0]]??'5'}]);}}>Add game</button>
   <small>{lineup.length} of {maxChildren} games · Repeats allowed</small>
  </fieldset>
  <fieldset className="delayed-form-card" disabled={pending||review}><legend>Your opponent</legend>
   <div className="delayed-filter"><input aria-label="Filter opponents" placeholder="Filter human players" value={search} maxLength={80} onChange={e=>setSearch(e.target.value)}/><button aria-label={sort==='username'?'Sort by recent opponents':'Sort by username'} onClick={()=>setSort(s=>s==='username'?'recent':'username')}>{sort==='username'?<ArrowDownAZ size={19}/>:<History size={19}/>}</button></div>
   <label>Opponent<select aria-label="Opponent" value={opponent?.id??''} onChange={e=>{setOpponent(people.find(p=>p.id===e.target.value)??null);request.current=null;}}><option value="">Choose a human player</option>{opponent&&!people.some(p=>p.id===opponent.id)&&<option value={opponent.id}>{opponent.name}</option>}{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   {loading&&<small role="status">Loading players…</small>}{more&&<button disabled={loading} onClick={()=>loadPeople(cursor)}>Load more players</button>}{!loading&&!people.length&&<small>No matching active human players.</small>}
  </fieldset>
  <div className="delayed-offer-summary"><span>Maximum loss per player</span><strong>{stake}</strong></div>
  <p className="delayed-terms">Last Call at 24 hours. A missed 36-hour deadline forfeits that game. No funds are reserved; real balances are unaffected. Invitations expire in 72 hours.</p>
  {!review?<button className="delayed-primary" disabled={!opponent||!enabled||!valid} onClick={()=>setReview(true)}>Review invitation</button>:<div className="delayed-review-card"><p>Invite <strong>{opponent?.name}</strong> for <strong>{lineup.length}</strong> games with a maximum play-money loss of <strong>{stake}</strong>.</p><div className="delayed-actions"><button className="delayed-primary" disabled={!opponent||pending||!enabled||!valid} onClick={()=>void invite()}>{pending?'Sending…':'Send invitation'}</button><button className="delayed-secondary" disabled={pending} onClick={()=>{setReview(false);request.current=null;}}>Edit invitation</button></div></div>}
  {error&&<p role="alert">{error}</p>}
 </section>;
}
