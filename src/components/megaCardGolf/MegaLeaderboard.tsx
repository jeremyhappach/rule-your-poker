import {useEffect,useState} from 'react';
import type {CourseId} from '@/lib/megaCardGolf/config';
import type {MegaRequest,ScoreRow} from './CourseSelection';
type Board={rows:ScoreRow[];self:ScoreRow|null;personalBest:number|null};
export function MegaLeaderboard({course,boardId,request}:{course:CourseId;boardId:string;request:MegaRequest}){
 const [period,setPeriod]=useState<'30'|'all'>('30'),[board,setBoard]=useState<Board|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setBoard(null);setError('');void request<Board>({op:'leaderboard',courseId:course,boardId,window:period}).then(value=>{if(alive)setBoard(value);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Board unavailable');});return()=>{alive=false;};},[course,boardId,period,request]);
 return <section className="mega-leaderboard" aria-label="Course leaderboard"><div className="mega-leaderboard-heading"><h2>Top Ten</h2><span>Lowest score wins</span></div>
  <div className="mega-periods" role="group" aria-label="Leaderboard period">{(['30','all'] as const).map(value=><button key={value} aria-pressed={period===value} onClick={()=>setPeriod(value)}>{value==='30'?'Last 30 Days':'All Time'}</button>)}</div>
  {error&&<p role="alert">{error}</p>}{!board&&!error&&<p role="status">Loading leaderboard…</p>}
  {board&&<>{board.rows.length?<table><thead><tr><th scope="col">Rank</th><th scope="col">Player</th><th scope="col">Score</th></tr></thead><tbody>{board.rows.slice(0,10).map(row=><tr key={row.runId}><td>{row.rank}</td><td>{row.name}</td><td>{row.score}</td></tr>)}</tbody></table>:<p className="mega-empty">No completed courses in this period.</p>}
   <p className="mega-personal">Personal best: <strong>{board.personalBest??'No completed course yet'}</strong>{board.self&&!board.rows.slice(0,10).some(row=>row.runId===board.self!.runId)&&<span> · Your rank: {board.self.rank} · {board.self.score}</span>}</p>
  </>}
 </section>;
}
