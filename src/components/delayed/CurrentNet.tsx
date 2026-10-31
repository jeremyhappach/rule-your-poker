import type {Home} from '@/lib/delayed/client';
import {money} from '@/lib/delayed/reviews';
import './currentNet.css';

/** Render only the caller's existing server projection, including hidden results. */
export function CurrentNet({home,userId}:{home:Pick<Home,'players'|'net'|'unsettled'|'lineup'>;userId:string}){
 const unsettled=home.unsettled??home.lineup.filter(c=>!c.terminal).reduce((sum,c)=>sum+c.stake,0);
 return <div className="async-current-net" role="region" aria-label="Current Net">
  <div className="async-current-net-heading"><span>Current Net</span><span>${unsettled.toLocaleString()} unsettled</span></div>
  {home.players.map(player=><div className="async-current-net-player" key={player.id}>
   <span title={player.name}>{player.name}</span><strong>{money(player.id===userId?home.net:-home.net)}</strong>
  </div>)}
 </div>;
}
