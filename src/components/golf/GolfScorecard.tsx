import {golfHoleCount,golfScorecardLabel} from '@/lib/golf/matchLength';
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
  const holes=Array.from({length:golfHoleCount(v.rules?.holes)},(_,i)=>v.holes.find(h=>h.hole===i+1)?.scores[player.id]);
  const completed=holes.filter((n):n is number=>n!==undefined);
  return {player,holes,thru:completed.length,total:completed.reduce((sum,n)=>sum+n,0)};
 });
}
export function GolfLeaderboard({snapshot,onOpen}:{snapshot:GolfSnapshot;onOpen:()=>void}){
 return <button className="golf-leaderboard" onClick={onOpen} aria-label={'Open '+golfScorecardLabel(snapshot.rules?.holes)}><table><thead><tr><th>Player</th><th>Score</th></tr></thead><tbody>{golfStandings(snapshot).map(({player,total,thru})=><tr key={player.id}><th scope="row" title={player.name}>{player.name}</th><td>{golfTotalLabel(total,thru)}</td></tr>)}</tbody></table><span className="golf-scorecard-hint">tap for all</span></button>;
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
 const count=golfHoleCount(snapshot.rules?.holes);
 const sections=Array.from({length:Math.ceil(count/9)},(_,i)=>({start:i*9,size:Math.min(9,count-i*9)}));
 const writingMs=Math.min(3000,Math.max(200,(snapshot.rules?.presentation?.resultsDurationMs??5000)-200));
 const standings=golfStandings(snapshot);
 return <div className={'golf-scorecard'+(count===18?' golf-scorecard-eighteen':'')} style={{'--golf-writing-duration':writingMs+'ms'} as CSSProperties} tabIndex={0} role="region" aria-label={golfScorecardLabel(count)}>
  {sections.map(({start,size})=><table key={start} className={count===18?(start===0?'golf-front-nine':'golf-back-nine'):undefined}>
   <caption>{count===18?(start===0?'Front Nine':'Back Nine'):<>Golf · {snapshot.phase==='complete'&&snapshot.holes.length===count?'Final scores':'Completed holes'}</>}</caption>
   <thead><tr><th scope="col">Player</th>{Array.from({length:size},(_,i)=><th scope="col" key={i} data-golf-hole={start+i+1}>{start+i+1}</th>)}
    <th scope="col" className={count===18?'golf-nine-subtotal':undefined}>{count===18?(start===0?'Out':'In'):'Total'}</th>
    {count===18&&start===9&&<th scope="col" className="golf-match-total">Total</th>}
   </tr></thead>
   <tbody>{standings.map(({player,holes,total,thru})=>{
    const done=written.identity===identity&&written.ids.includes(player.id);
    const withheld=writeHole!==undefined&&holes[writeHole-1]!==undefined&&!done;
    const sectionHoles=holes.slice(start,start+size);
    const sectionWithheld=withheld&&writeHole!>start&&writeHole!<=start+size;
    const sectionScores=sectionHoles.filter((score):score is number=>score!==undefined);
    const sectionTotal=sectionScores.reduce((sum,score)=>sum+score,0)-(sectionWithheld?holes[writeHole!-1]!:0);
    const matchTotal=total-(withheld?holes[writeHole!-1]!:0);
    return <tr key={player.id}><th scope="row" title={player.name}>{player.name}</th>
     {sectionHoles.map((score,index)=>{const i=start+index;return <td key={identity+':'+i} data-golf-hole={i+1} data-golf-write={writeHole===i+1||undefined} onAnimationEnd={e=>{if(writeHole===i+1&&e.animationName==='golf-write-score')finish(player.id);}}>{score===undefined?'':<GolfPencilScore value={golfScoreLabel(score)}/>}</td>;})}
     {count===18?<td className="golf-nine-subtotal" data-golf-subtotal={start===0?'out':'in'} data-golf-player={player.id} data-golf-total-updated={done&&writeHole!>start&&writeHole!<=start+size||undefined}><GolfPencilScore value={golfTotalLabel(sectionTotal,sectionScores.length-(sectionWithheld?1:0))}/></td>
      :<td data-golf-total={player.id} data-golf-total-updated={done||undefined}><GolfPencilScore value={golfTotalLabel(matchTotal,thru-(withheld?1:0))}/></td>}
     {count===18&&start===9&&<td className="golf-match-total" data-golf-total={player.id} data-golf-total-updated={done||undefined}><GolfPencilScore value={golfTotalLabel(matchTotal,thru-(withheld?1:0))}/></td>}
    </tr>;
   })}</tbody>
  </table>)}
 </div>;
}
