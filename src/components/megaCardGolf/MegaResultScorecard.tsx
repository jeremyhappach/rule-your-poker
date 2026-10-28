import {GolfPencilScore} from '@/components/golf/GolfPencilScore';
import type {MegaView} from '@/lib/megaCardGolf/engine';
import {formatGolfScore} from '@/lib/megaCardGolf/presentation';

/** Reuse Golf's pencil strokes without changing its multiplayer formatter or schema. */
export function MegaPencilScore({value}:{value:number|null|undefined}){
 const label=formatGolfScore(value);
 return <span className="mega-pencil-value" role="img" aria-label={label}><span aria-hidden="true">
  {value!=null&&value>0&&<svg className="mega-pencil-plus" viewBox="0 0 15 27"><path pathLength="1" d="M2 13L12 12M7 7L6 19"/></svg>}
  <GolfPencilScore value={value!=null&&value>0?String(value):label}/>
 </span></span>;
}

/** Committed results only. Dynamic course length; future holes remain blank. */
export function MegaResultScorecard({view,writeHole}:{view:MegaView;writeHole?:number}){
 const groups=Array.from({length:Math.ceil(view.config.holes/9)},(_,group)=>Array.from({length:Math.min(9,view.config.holes-group*9)},(_,i)=>group*9+i+1));
 return <section className="mega-result-scorecard" aria-label="Course scorecard">
  <h3>{view.config.name}</h3>
  {groups.map((holes,i)=><table key={i}><caption className="sr-only">Holes {holes[0]} through {holes.at(-1)}</caption><thead><tr><th scope="col">Hole</th>{holes.map(h=><th scope="col" key={h}>{h}</th>)}</tr></thead>
   <tbody><tr><th scope="row">Score</th>{holes.map(h=>{const result=view.results.find(r=>r.hole===h);return <td key={h} data-mega-write={h===writeHole||undefined} aria-label={'Hole '+h+': '+(result?formatGolfScore(result.score):'not played')}>{result&&<MegaPencilScore value={result.score}/>}</td>;})}</tr></tbody></table>)}
  <p className="mega-result-total">Total <MegaPencilScore value={view.results.length?view.score:null}/></p>
 </section>;
}
