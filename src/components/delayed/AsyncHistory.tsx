import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {delayedRpc} from '@/lib/delayed/client';
import {money} from '@/lib/delayed/reviews';

type Entry={id:string;opponent:string;startedAt:string;completedAt:string;count:number;net:number;realMoney:boolean};
export function AsyncHistory({profileId,balance=false}:{profileId?:string;balance?:boolean}){
 const [rows,setRows]=useState<Entry[]>([]),[error,setError]=useState(''),[more,setMore]=useState(false),[pending,setPending]=useState(false),generation=useRef(0),busy=useRef(false);
 const load=async(older=false)=>{if(busy.current)return;busy.current=true;setPending(true);const epoch=++generation.current,last=older?rows.at(-1):undefined;
  try{const values=await delayedRpc<Entry[]>('delayed_history',{p_profile:profileId??null,p_before:last?.completedAt??null,p_before_id:last?.id??null});
   if(epoch!==generation.current)return;setRows(old=>older?[...old,...values.filter(v=>!old.some(r=>r.id===v.id))]:values);setMore(values.length===30);setError('');
  }catch{if(epoch===generation.current)setError('Async match history unavailable.');}finally{if(epoch===generation.current){busy.current=false;setPending(false);}}
 };
 useEffect(()=>{busy.current=false;setRows([]);setMore(false);void load();return()=>{generation.current++;};},[profileId]);
 return <section aria-label="Async match history">{error&&<p role="alert">{error}<button disabled={pending} onClick={()=>void load(rows.length>0)}>Retry</button></p>}{rows.map(r=><Link key={r.id} className="delayed-history-card" to={'/delayed/'+r.id+'?history=1'}>
  <strong>{balance?'Async Match Settlement':'Async Match'} · {r.opponent}</strong>
  <span>{new Date(r.completedAt).toLocaleString()} · {r.count} games</span>
  {!balance&&<small>Started {new Date(r.startedAt).toLocaleString()}</small>}
  <b>{r.net>0?'W':r.net<0?'L':'Draw'} {money(r.net)}</b><small>{r.realMoney?'Account settlement':'Play-money result · real balance unchanged'}</small>
 </Link>)}{pending&&<p role="status">Loading async history…</p>}{more&&<button disabled={pending} onClick={()=>void load(true)}>Load older async matches</button>}</section>;
}
