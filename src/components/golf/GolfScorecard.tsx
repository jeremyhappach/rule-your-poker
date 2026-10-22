import type {GolfSnapshot} from '@/lib/golf/model';
import {GolfPencilScore} from './GolfPencilScore';

export const golfTotalLabel=(total:number,completed:number)=>completed===0?'—':total===0?'E':String(total);
/** Results only. Never derive standings from tableau cards or pending draws. */
export function golfStandings(v:GolfSnapshot){
 return v.players.map(player=>{
  const holes=Array.from({length:9},(_,i)=>v.holes.find(h=>h.hole===i+1)?.scores[player.id]);
  const completed=holes.filter((n):n is number=>n!==undefined);
  return {player,holes,thru:completed.length,total:completed.reduce((sum,n)=>sum+n,0)};
 });
}
export function GolfLeaderboard({snapshot,onOpen}:{snapshot:GolfSnapshot;onOpen:()=>void}){
 return <button className="golf-leaderboard" onClick={onOpen} aria-label="Open nine-hole scorecard"><table><thead><tr><th>Player</th><th>Score</th></tr></thead><tbody>{golfStandings(snapshot).map(({player,total,thru})=><tr key={player.id}><th scope="row" title={player.name}>{player.name}</th><td>{golfTotalLabel(total,thru)}</td></tr>)}</tbody></table></button>;
}
export function GolfScorecard({snapshot}:{snapshot:GolfSnapshot}){
 return <div className="golf-scorecard" tabIndex={0} role="region" aria-label="Nine-hole scorecard"><table><caption>Golf · {snapshot.phase==='complete'?'Final scores':'Completed holes'}</caption><thead><tr><th scope="col">Player</th>{Array.from({length:9},(_,i)=><th scope="col" key={i}>{i+1}</th>)}<th scope="col">Total</th></tr></thead><tbody>{golfStandings(snapshot).map(({player,holes,total,thru})=><tr key={player.id}><th scope="row" title={player.name}>{player.name}</th>{holes.map((score,i)=><td key={i}>{score===undefined?'':<GolfPencilScore value={score}/>}</td>)}<td><GolfPencilScore value={golfTotalLabel(total,thru)}/></td></tr>)}</tbody></table></div>;
}
