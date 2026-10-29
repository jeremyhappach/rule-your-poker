import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {delayedRpc} from '@/lib/delayed/client';
import {money} from '@/lib/delayed/reviews';
import {supabase} from '@/integrations/supabase/client';
import '@/lib/delayed/delayed.css';

type Entry={id:string;opponent:string;startedAt:string;completedAt:string;count:number;net:number;realMoney:boolean};
export function AsyncHistory({profileId,balance=false,viewerName}:{profileId?:string;balance?:boolean;viewerName?:string}){
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
  <div className="async-history-heading"><strong>{name} vs {r.opponent}</strong><span className="async-badge">Async</span></div>
  <span>{new Date(r.completedAt).toLocaleString()} · {r.count} games</span>
  {!balance&&<small>Started {new Date(r.startedAt).toLocaleString()}</small>}
  <b>{r.net>0?'W':r.net<0?'L':'Draw'} {money(r.net)}</b>{r.realMoney&&<small>Balances have been settled</small>}
  <Link className="async-see-results" to={'/delayed/'+r.id+'?finale=1'}>See Results</Link>
 </article>)}{pending&&<p role="status">Loading async history…</p>}{more&&<button disabled={pending} onClick={()=>void load(true)}>Load older async matches</button>}</section>;
}
