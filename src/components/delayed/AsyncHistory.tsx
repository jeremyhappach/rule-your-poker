import {useEffect,useState} from 'react';
import {Link} from 'react-router-dom';
import {delayedRpc} from '@/lib/delayed/client';
import {money} from '@/lib/delayed/reviews';
type Entry={id:string;opponent:string;startedAt:string;completedAt:string;count:number;net:number;realMoney:boolean};
export function AsyncHistory({profileId,balance=false}:{profileId?:string;balance?:boolean}){
 const [rows,setRows]=useState<Entry[]>([]),[error,setError]=useState('');
 useEffect(()=>{let alive=true;void delayedRpc<Entry[]>('delayed_history',{p_profile:profileId??null}).then(v=>{if(alive)setRows(v);}).catch(()=>{if(alive)setError('Async match history unavailable.');});return()=>{alive=false;};},[profileId]);
 return <section aria-label="Async match history">{error&&<p role="alert">{error}</p>}{rows.map(r=><Link key={r.id} className="delayed-history-card" to={'/delayed/'+r.id+'?history=1'}>
  <strong>{balance?'Async Match Settlement':'Async Match'} · {r.opponent}</strong>
  <span>{new Date(r.completedAt).toLocaleString()} · {r.count} games</span>
  {!balance&&<small>Started {new Date(r.startedAt).toLocaleString()}</small>}
  <b>{r.net>0?'W':r.net<0?'L':'Draw'} {money(r.net)}</b><small>{r.realMoney?'Account settlement':'Play-money result · real balance unchanged'}</small>
 </Link>)}</section>;
}
