import {Heart} from 'lucide-react';
import {ChuckyLevelAvailability} from '@/components/arcade/ChuckyLevelAvailability';
import '@/components/arcade/chuckyShowdown.css';
import './chuckyRoundResult.css';

interface Props {
 name:string;
 round:number;
 lives:number;
 uses:number[];
 score:number;
}

/** Recorded values only. The Async review owner supplies the presented score. */
export function ChuckyRoundResult({name,round,lives,uses,score}:Props){
 return <section className="chucky-round-result" aria-label="Opponent round results">
  <header><h2>{name}</h2><p>Round {round} results</p></header>
  <div className="chucky-result-lives">
   <h3>Lives remaining</h3>
   <div className="cs-cracks" role="img" aria-label={`${lives} of 3 lives remaining`}>
    {[0,1,2].map(i=><Heart key={i} aria-hidden="true" data-active={i<lives}/>)}
   </div>
  </div>
  <div className="chucky-result-levels">
   <h3>Chuckies remaining</h3>
   <ChuckyLevelAvailability uses={uses}/>
  </div>
  <div className="chucky-result-score">
   <h3>Round score</h3>
   <output aria-label="Round score" aria-live="off">{score.toLocaleString()}</output>
  </div>
 </section>;
}
