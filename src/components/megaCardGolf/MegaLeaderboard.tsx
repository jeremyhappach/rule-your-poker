import {useEffect,useState} from 'react';
import type {CourseId} from '@/lib/megaCardGolf/config';
import type {ScoreRow} from './CourseSelection';
type Board={rows:ScoreRow[];self:ScoreRow|null;personalBest:number|null};
export function MegaLeaderboard({course,request}:{course:CourseId;request:<T>(body:object)=>Promise<T>}){
 const [window,setWindow]=useState<'30'|'all'>('30'),[board,setBoard]=useState<Board|null>(null),[error,setError]=useState('');
 useEffect(()=>{let alive=true;setBoard(null);setError('');void request<Board>({op:'leaderboard',courseId:course,window}).then(value=>{if(alive)setBoard(value);}).catch(e=>{if(alive)setError(e instanceof Error?e.message:'Board unavailable');});return()=>{alive=false};},[course,window,request]);
 return <div><label>Scores from <select aria-label="Leaderboard period" value={window} onChange={e=>setWindow(e.target.value as '30'|'all')}><option value="30">Last 30 days</option><option value="all">All time</option></select></label>{error&&<p role="alert">{error}</p>}{!board&&!error&&<p role="status">Loading leaderboard…</p>}{board&&<><p>Personal best: <strong>{board.personalBest??'No completed course yet'}</strong></p>{board.rows.length?<table><thead><tr><th>Rank</th><th>Player</th><th>Score</th></tr></thead><tbody>{board.rows.map(row=><tr key={row.runId}><td>{row.rank}</td><td>{row.name}</td><td>{row.score}</td></tr>)}</tbody></table>:<p>No completed courses in this period.</p>}{board.self&&!board.rows.some(row=>row.runId===board.self!.runId)&&<p>Your rank: {board.self.rank} · {board.self.score}</p>}</>}</div>;
}
