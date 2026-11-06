import {useRef,useState} from 'react';
import {arcadeRequest} from '@/lib/arcade/client';
import {AchievementTime} from './AchievementTime';

type Entry={runId:string;score:number;completedAt:string;ruleset:string};
export function ShowdownHistory(){
  const [rows,setRows]=useState<Entry[]>([]),[more,setMore]=useState(true);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const busy=useRef(false),loaded=useRef(false);
  async function load(){
    if(busy.current)return;
    busy.current=true;setLoading(true);setError('');
    try{
      const page=await arcadeRequest<Entry[]>({game:'chucky-showdown',op:'history',before:rows.at(-1)?.runId});
      setRows(prev=>[...prev,...page]);setMore(page.length===20);loaded.current=true;
    }catch(e){setError((e as Error).message);}
    finally{busy.current=false;setLoading(false);}
  }
  return <details className="arcade-leaderboard" onToggle={e=>{if(e.currentTarget.open&&!loaded.current)void load();}}>
    <summary>My score history</summary>
    <ol>{rows.map(r=><li key={r.runId}><AchievementTime completedAt={r.completedAt}/> · <strong>{r.score.toLocaleString()}</strong> · {r.ruleset}</li>)}</ol>
    {loading&&<p role="status">Loading scores…</p>}
    {error&&<p role="alert">{error}</p>}
    {!rows.length&&!more&&<p>No completed games yet.</p>}
    {more&&!loading&&(rows.length>0||error)&&<button onClick={()=>void load()}>{error?'Retry':'Older scores'}</button>}
  </details>;
}
