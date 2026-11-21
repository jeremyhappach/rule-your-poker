import {ChessHistoryButton} from '@/components/chess/ChessHistory';
import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {RunbackLink} from './RunbackLink';
import {delayedRpc,type Home} from '@/lib/delayed/client';
import {matchGameMix} from '@/lib/delayed/lobbyPresentation';
import {money} from '@/lib/delayed/reviews';
import {matchRecordPath} from '@/lib/delayed/matchRecord';
import {supabase} from '@/integrations/supabase/client';
import {AsyncSessionName} from './AsyncSessionName';
import '@/lib/delayed/delayed.css';

type Entry={id:string;opponent:string;startedAt:string;completedAt:string;count:number;net:number;realMoney:boolean};
// The existing archive summary omits game types. Read its participant-checked
// detail only for lobby cards; leave balance/history surfaces unchanged.
function HistoryGameMix({id}:{id:string}){
 const [mix,setMix]=useState(''),[failed,setFailed]=useState(false),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let alive=true;setFailed(false);setMix('');void delayedRpc<Home>('delayed_history_detail',{p_match:id}).then(home=>{if(alive)setMix(matchGameMix(home.lineup));}).catch(()=>{if(alive)setFailed(true);});return()=>{alive=false;};},[id,attempt]);
 return <p className="delayed-game-mix" aria-label="Match game mix">{mix|| (failed?<button onClick={()=>setAttempt(n=>n+1)}>Retry game types</button>:'Loading game types…')}</p>;
}
export function AsyncHistory({profileId,balance=false,viewerName,showGameMix=false}:{profileId?:string;balance?:boolean;viewerName?:string;showGameMix?:boolean}){
 const location=useLocation();
 const [name,setName]=useState(viewerName??'You');
 const [rows,setRows]=useState<Entry[]>([]),[error,setError]=useState(''),[more,setMore]=useState(false),[pending,setPending]=useState(false),generation=useRef(0),busy=useRef(false);
 const load=async(older=false)=>{if(busy.current)return;busy.current=true;setPending(true);const epoch=++generation.current,last=older?rows.at(-1):undefined;
  try{const values=await delayedRpc<Entry[]>('delayed_history',{p_profile:profileId??null,p_before:last?.completedAt??null,p_before_id:last?.id??null});
   if(epoch!==generation.current)return;setRows(old=>older?[...old,...values.filter(v=>!old.some(r=>r.id===v.id))]:values);setMore(values.length===30);setError('');
  }catch{if(epoch===generation.current)setError('Async match history unavailable.');}finally{if(epoch===generation.current){busy.current=false;setPending(false);}}
 };
 useEffect(()=>{busy.current=false;setRows([]);setMore(false);void load();return()=>{generation.current++;};},[profileId]);
 useEffect(()=>{if(viewerName){setName(viewerName);return;}if(!profileId)return;let alive=true;setName('You');void supabase.from('profiles').select('username').eq('id',profileId).maybeSingle().then(({data})=>{if(alive&&data?.username)setName(data.username);});return()=>{alive=false;};},[profileId,viewerName]);
 return <section aria-label="Async match history">{error&&<p role="alert">{error}<button disabled={pending} onClick={()=>void load(rows.length>0)}>Retry</button></p>}{rows.map(r=><article key={r.id} className="delayed-history-card">
  <div className="async-history-heading"><strong><AsyncSessionName realMoney={r.realMoney}>{name} vs {r.opponent}</AsyncSessionName></strong><span className="async-badge">Async</span></div>
  <span>{new Date(r.completedAt).toLocaleString()} · {r.count} games</span>
  {showGameMix&&<HistoryGameMix id={r.id}/>}
  {!balance&&!showGameMix&&<small>Started {new Date(r.startedAt).toLocaleString()}</small>}
  <b>{r.net>0?'W':r.net<0?'L':'Draw'} {money(r.net)}</b>{r.realMoney&&<small>Balances have been settled</small>}
  <Link className="async-see-results" to={matchRecordPath(r.id)}>See Results</Link>
  <ChessHistoryButton mode="async" matchId={r.id} label="Chess boards"/>
  {!balance&&<RunbackLink matchId={r.id} returnTo={location.pathname+location.search} label={'Run It Back against '+r.opponent+' · '+new Date(r.completedAt).toLocaleString()}/>}
 </article>)}{pending&&<p role="status">Loading async history…</p>}{more&&<button disabled={pending} onClick={()=>void load(true)}>Load older async matches</button>}</section>;
}
