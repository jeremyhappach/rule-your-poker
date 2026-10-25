import {golfScoreLabel} from '@/lib/golf/scoreLabel';
import type {GolfSnapshot} from '@/lib/golf/model';
import {GolfPencilScore} from './GolfPencilScore';
import type {CSSProperties} from 'react';
import {useEffect,useRef,useState} from 'react';

/** Hide the newly resolved hole on every summary surface until counting ends. */
export function golfPresentedScores(v:GolfSnapshot,released:boolean|readonly string[]):GolfSnapshot{
 if(released===true||!['hole_complete','complete'].includes(v.phase))return v;
 const ids=Array.isArray(released)?released:[];
 const holes=v.holes.flatMap(h=>h.roundId!==v.scope?[h]:ids.length?[{...h,scores:Object.fromEntries(Object.entries(h.scores).filter(([id])=>ids.includes(id)))}]:[]);
 return {...v,holes,scores:Object.fromEntries(v.players.map(p=>[p.id,holes.reduce((n,h)=>n+(h.scores[p.id]??0),0)]))};
}

export const golfTotalLabel=(total:number,completed:number)=>golfScoreLabel(completed===0?0:total);
/** Results only. Never derive standings from tableau cards or pending draws. */
export function golfStandings(v:GolfSnapshot){
 return v.players.map(player=>{
  const holes=Array.from({length:9},(_,i)=>v.holes.find(h=>h.hole===i+1)?.scores[player.id]);
  const completed=holes.filter((n):n is number=>n!==undefined);
  return {player,holes,thru:completed.length,total:completed.reduce((sum,n)=>sum+n,0)};
 });
}
export function GolfLeaderboard({snapshot,onOpen}:{snapshot:GolfSnapshot;onOpen:()=>void}){
 return <button className="golf-leaderboard" onClick={onOpen} aria-label="Open nine-hole scorecard"><table><thead><tr><th>Player</th><th>Score</th></tr></thead><tbody>{golfStandings(snapshot).map(({player,total,thru})=><tr key={player.id}><th scope="row" title={player.name}>{player.name}</th><td>{golfTotalLabel(total,thru)}</td></tr>)}</tbody></table><span className="golf-scorecard-hint">tap for all</span></button>;
}
export function GolfScorecard({snapshot,writeHole,onRowWritten}:{snapshot:GolfSnapshot;writeHole?:number;onRowWritten?:(playerId:string)=>void}){
 const identity=snapshot.id+':'+snapshot.scope+':'+writeHole;
 const [written,setWritten]=useState<{identity:string;ids:string[]}>({identity,ids:[]});
 const completed=useRef(new Set<string>());
 const notify=useRef(onRowWritten);notify.current=onRowWritten;
 const finish=(id:string)=>{
  const key=identity+':'+id;if(completed.current.has(key))return;completed.current.add(key);
  setWritten(old=>({identity,ids:[...(old.identity===identity?old.ids:[]),id]}));notify.current?.(id);
 };
 useEffect(()=>{
  const query=window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const complete=()=>{if(query?.matches&&writeHole)for(const p of snapshot.players)finish(p.id);};
  complete();query?.addEventListener('change',complete);return()=>query?.removeEventListener('change',complete);
 },[identity]);
 const writingMs=Math.min(3000,Math.max(200,(snapshot.rules?.presentation?.resultsDurationMs??5000)-200));
 return <div className="golf-scorecard" style={{'--golf-writing-duration':writingMs+'ms'} as CSSProperties} tabIndex={0} role="region" aria-label="Nine-hole scorecard"><table><caption>Golf · {snapshot.phase==='complete'&&snapshot.holes.length===9?'Final scores':'Completed holes'}</caption><thead><tr><th scope="col">Player</th>{Array.from({length:9},(_,i)=><th scope="col" key={i}>{i+1}</th>)}<th scope="col">Total</th></tr></thead><tbody>{golfStandings(snapshot).map(({player,holes,total,thru})=>{
  const done=written.identity===identity&&written.ids.includes(player.id);
  const withheld=writeHole!==undefined&&holes[writeHole-1]!==undefined&&!done;
  return <tr key={player.id}><th scope="row" title={player.name}>{player.name}</th>{holes.map((score,i)=><td key={identity+':'+i} data-golf-write={writeHole===i+1||undefined} onAnimationEnd={e=>{if(writeHole===i+1&&e.animationName==='golf-write-score')finish(player.id);}}>{score===undefined?'':<GolfPencilScore value={golfScoreLabel(score)}/>}</td>)}<td data-golf-total={player.id} data-golf-total-updated={done||undefined}><GolfPencilScore value={golfTotalLabel(total-(withheld?holes[writeHole!-1]!:0),thru-(withheld?1:0))}/></td></tr>;
 })}</tbody></table></div>;
}
