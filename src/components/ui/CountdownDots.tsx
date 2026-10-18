import {dotClock} from '@/lib/triTowers/polishPresentation';
import './countdownDots.css';

/** Visual fraction only. The calling game supplies its authoritative time. */
export function CountdownDots({remaining,duration}:{remaining:number;duration:number}){
 const dots=dotClock(remaining,duration);
 return <div aria-hidden="true" className="tri-dots" data-tone={dots.tone}>{Array.from({length:24},(_,i)=><i key={i} data-lit={i<dots.lit} data-zone={i<2?'red':i<4?'yellow':'green'}/>)}</div>;
}
