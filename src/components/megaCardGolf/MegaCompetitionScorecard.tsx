import {useId,useState,type ReactNode} from 'react';
import {megaStandings,type CompetitionResult} from '@/lib/megaCardGolf/competition';
import {formatGolfScore} from '@/lib/megaCardGolf/presentation';
import {MegaPencilScore} from './MegaResultScorecard';
import './competition.css';

export function MegaCompetitionScorecard({course,holes,hole,players,results,write,balance}:{course:string;holes:number;hole:number;players:readonly {id:string;name:string}[];results:readonly CompetitionResult[];balance?:(id:string)=>ReactNode;write?:{actor:string;hole:number}}){
 const [open,setOpen]=useState(false),id=useId(),rows=megaStandings(players,results,holes);
 return <div className="mega-competition-scorecard" data-canonical-felt-interaction-layer>
  <button className="mega-competition-summary" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>
   <span>{course} · Hole {Math.min(hole,holes)} / {holes}</span>
   <table><thead><tr><th>Place</th><th>Player</th><th>Score</th><th>THRU</th></tr></thead><tbody>{rows.map(row=><tr key={row.player.id}><td>{row.place}</td><th scope="row" title={row.player.name}>{row.player.name}{balance?.(row.player.id)}</th><td>{formatGolfScore(row.thru?row.total:null)}</td><td>{row.thru}</td></tr>)}</tbody></table>
   <small>{open?'Close scorecard':'Full scorecard'}</small>
  </button>
  {open&&<section id={id} className="mega-competition-expanded" aria-label="Hole-by-hole scores">
   <button onClick={()=>setOpen(false)} aria-label="Close scorecard">Close</button>
   {Array.from({length:Math.ceil(holes/9)},(_,group)=>{const start=group*9,count=Math.min(9,holes-start);return <table key={start}><caption>{holes>9?(group===0?'Front nine':'Back nine'):course}</caption><thead><tr><th>Player</th>{Array.from({length:count},(_,i)=><th key={i}>{start+i+1}</th>)}<th>Total</th></tr></thead><tbody>{rows.map(row=><tr key={row.player.id}><th scope="row" title={row.player.name}>{row.player.name}</th>{row.scores.slice(start,start+count).map((score,i)=><td key={i} data-mega-write={write?.actor===row.player.id&&write.hole===start+i+1||undefined}><MegaPencilScore value={score}/></td>)}<td><MegaPencilScore value={row.thru?row.total:null}/></td></tr>)}</tbody></table>;})}
   <p>Lowest total wins. Scores include completed holes only.</p>
  </section>}
 </div>;
}
